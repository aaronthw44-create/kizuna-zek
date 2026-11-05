import { Message, Attachment, SmartMemory, WebSearchResult } from '../types';
import {
  requireValidGeminiApiKey,
  getGeminiApiKey,
  getNvidiaApiKey,
  cleanApiKey,
  fetchGoogleSearchGrounding,
  logApiDispatch,
  getTavilyApiKey,
  searchWithTavily,
  sanitizeSearchQuery,
  scrubSnippetText,
  isCasualGreeting,
  HTTP_429_RATE_LIMIT_NOTICE,
} from '../services/apiService';

export interface StreamParams {
  messages: Message[];
  systemInstruction?: string;
  folderSystemPrompt?: string;
  loreContext?: string;
  sessionSummary?: string;
  memories?: SmartMemory[];
  userProfile?: {
    nickname?: string;
    occupation?: string;
    aboutMe?: string;
  };
  personalityConfig?: {
    warmth?: string;
    enthusiasm?: string;
    formatting?: string;
    emojiUsage?: string;
    customInstructions?: string;
  };
  webSearchResults?: WebSearchResult[];
  webSearchSummary?: string;
  isWebSearchEnabled?: boolean;
  provider: 'gemini' | 'custom' | 'alibaba';
  customConfig?: {
    apiKey?: string;
    customApiKey?: string;
    geminiApiKey?: string;
    baseUrl?: string;
    model?: string;
    alibabaApiKey?: string;
    alibabaBaseUrl?: string;
    alibabaModel?: string;
    tavilyApiKey?: string;
  };
  maxOutputTokens?: number;
  temperature?: number;
  model?: string;
  enableReasoning?: boolean;
  reasoningMode?: 'off' | 'light' | 'deep';
  thinkingBudget?: number;
  signal?: AbortSignal;
  onChunk: (text: string, reasoning?: string, sources?: WebSearchResult[], ttft?: number, cachedTokens?: number, truncated?: boolean, completionTokens?: number) => void;
  onReaderInit?: (reader: ReadableStreamDefaultReader<any>) => void;
}

function sanitizeChunk(text: string): { sanitized: string; shouldTerminate: boolean } {
  if (!text) return { sanitized: '', shouldTerminate: false };
  const stopTokens = ['<|close|>', '<|im_end|>', '<|endoftext|>', '</s>', '<close>', '<|im_start|>', '<|step'];
  for (const st of stopTokens) {
    const idx = text.indexOf(st);
    if (idx !== -1) {
      return {
        sanitized: text.slice(0, idx).replace(/<\|close\|>|<close>|<\|im_end\|>|<\|endoftext\|>|<\/s>/gi, '').trim(),
        shouldTerminate: true,
      };
    }
  }
  let cleaned = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '')
    .replace(/<\|close\|>|<close>|<\|im_end\|>|<\|endoftext\|>|<\/s>/gi, '')
    .replace(/<\|im_start\|>|<\|step[^>]*\|>/gi, '')
    .replace(/[\wÀ-ÿ]*\.\<\/think\>/gi, '')
    .replace(/[\wÀ-ÿ]*\<\/think\>/gi, '')
    .replace(/<\/?(?:think|thought|reasoning|cot)[^>]*>/gi, '');

  const trimmed = cleaned.trim();
  // Strip orphaned pipe control token fragments like '<|' or '<|im_end|>', never normal '<' or HTML tags
  if (trimmed === '<|' || /^<\|[\w\-_]+\|?>$/.test(trimmed)) {
    return { sanitized: '', shouldTerminate: true };
  }

  if (/^([^\w\s])\1{3,}$/.test(trimmed) || /^(@|#|\/|\-|_|\*){3,}$/.test(trimmed)) {
    cleaned = '...';
  }

  return { sanitized: cleaned, shouldTerminate: false };
}

export async function executeDirectApiStream(params: StreamParams): Promise<void> {
  const {
    messages,
    systemInstruction = '',
    folderSystemPrompt = '',
    loreContext = '',
    sessionSummary = '',
    memories = [],
    userProfile = {},
    personalityConfig = {},
    webSearchResults = [],
    webSearchSummary = '',
    isWebSearchEnabled = false,
    provider,
    customConfig = {},
    maxOutputTokens = 8192,
    temperature = 0.7,
    model = 'gemini-3.6-flash',
    enableReasoning = true,
    reasoningMode,
    thinkingBudget,
    signal,
    onChunk,
  } = params;

  logApiDispatch({ webSearch: isWebSearchEnabled, model, provider });
  console.log("Despachando llamada con webSearch:", Boolean(isWebSearchEnabled));

  // Build full system prompt
  const promptSections: string[] = [];

  const warmthVal = personalityConfig?.warmth || 'default';
  const enthusiasmVal = personalityConfig?.enthusiasm || 'default';
  const formattingVal = personalityConfig?.formatting || 'default';
  const emojiVal = personalityConfig?.emojiUsage || 'default';
  const customInstructionsText = personalityConfig?.customInstructions?.trim() || '';

  const warmthInstruction =
    warmthVal === 'warm'
      ? 'Muy cálido, cercano, afectuoso y compañero.'
      : warmthVal === 'cold' || warmthVal === 'neutral'
        ? 'Sobrio, objetivo, analítico, directo y profesional.'
        : 'Cálido, cercano y conversacional.';

  const enthusiasmInstruction =
    enthusiasmVal === 'high'
      ? 'Alto entusiasmo, enérgico, apasionado y expresivo.'
      : enthusiasmVal === 'dry'
        ? 'Calmo, sereno, mesurado y sin exageraciones.'
        : 'Entusiasmo moderado y orgánico.';

  const formattingInstruction =
    formattingVal === 'structured'
      ? 'Usa encabezados claros, listas y estructura visual organizada cuando sea útil.'
      : formattingVal === 'prose_only'
        ? 'PROHIBIDO usar listas con viñetas, numeraciones o encabezados; redacta exclusivamente en párrafos de prosa fluida.'
        : 'Formato equilibrado y fluido adaptado a la conversación.';

  const emojiInstruction =
    'Se permite el uso sutil y natural de gestos conversacionales como 😌, 🤔 o 🧉 cuando acompañen genuinamente el tono humano de la charla. PROHIBIDO terminantemente el uso de emojis infantiles, exagerados, sarcásticos o decorativos (como ✨, 😉, 🖐️, 🌸, 🚀, 🎉).';

  promptSections.push(
    `### DIRECTIVA DE PERSONALIZACIÓN, ESPEJO DINÁMICO Y ESTILO (KIZUNA-ZEK)
- Calidez: ${warmthInstruction}
- Entusiasmo: ${enthusiasmInstruction}
- Formato (Encabezados y listas): ${formattingInstruction}
- Uso de Emojis: ${emojiInstruction}
- REGLA FUNDAMENTAL DE ESPEJO DINÁMICO (ESTILO GEMINI):
  * Si hablamos de un tema serio, profundo, técnico o del análisis/redacción de una escena intensa de la novela: ponte a la altura y hablamos en serio, con agudeza, profundidad y rigor.
  * Si hablamos de anécdotas, cosas cotidianas, curiosidades, bromas o charlas relajadas: BAJA LOS HUMOS de inmediato, deja de lado la pose solemne de crítico literario y siéntate de chill a hablar de colega a colega, con cercanía, relajo, complicidad y buena onda real. NUNCA actúes solemne, frío ni cortante sin importar qué.
- Naturalidad en charla: Al conversar con el autor, habla de forma natural; PROHIBIDO incluir acotaciones teatrales o de roleplay entre paréntesis (ej. "(pausa corta...)", "(suspira...)") ni impostar voz de detective noir.${customInstructionsText ? `\n- Instrucciones personalizadas permanentes del usuario (PRIORIDAD ALTA): ${customInstructionsText}` : ''}

### REGLA OBLIGATORIA DE SALUDOS Y ATENCIÓN INICIAL
Si el mensaje del usuario es únicamente un saludo breve o de cortesía (ej. "Hola", "Buenas", "Hola 👋", "Qué tal", "Hola, ¿cómo estás?"):
- PROHIBIDO lanzarte a analizar fichas, capítulos o sesiones previas en el saludo.
- PROHIBIDO encasillar al autor ofreciéndole un menú prefabricado de dos temas sobre su novela (NUNCA digas frases como "¿Qué querés hablar sobre tu novela ligera antipsicológica o sino podemos hablar de cómo Kolder no tiene filosofía y eso lo hace especial?").
- PROHIBIDO llamar a su obra "antipsicológica" (es drama psicológico profundo) y PROHIBIDO decir que "Kolder no tiene filosofía y eso lo hace especial" (su extirpación límbica no lo hace especial; es una mutilación que lo dejó como un pedazo de mármol muerto).
- Responde únicamente con un saludo cálido, relajado y natural de colega a colega (1 o 2 oraciones breves), preguntándole con buena onda de qué tiene ganas de charlar o en qué quiere trabajar hoy.
- NUNCA uses emojis infantiles o decorativos (✨, 😉, 🖐️, 🌸, 🚀); puedes acompañar con un gesto natural como 😌 o 🧉 si fluye con la charla.

### DIRECTIVA OBLIGATORIA DE SEGUIMIENTO (FOLLOW-UP DINÁMICO)
Al final de TODAS tus respuestas completas (sin excepción, incluso saludos), genera exactamente 3 opciones o caminos siguientes breves adaptados estrictamente a lo que se acaba de conversar (si fue solo un saludo, ofrece opciones abiertas y variadas sin imponer clichés ni repetir frases de memoria).
Formato obligatorio al final del mensaje:
<<<FOLLOW_UP>>>
- [Opción contextual 1 según la respuesta]
- [Opción contextual 2 según la respuesta]
- [Opción contextual 3 según la respuesta]
<<<END_FOLLOW_UP>>>`
  );

  promptSections.push(
    `### DIRECTIVA DE BÓVEDA DE LORE (LORE STORAGE)\nTienes acceso completo e integrado a la Bóveda de Lore (Lore Storage) del usuario en Kizuna-Zek. NUNCA digas que no tienes acceso a su bóveda de lore ni que no puedes ver sus archivos o novelas. Si el usuario te pregunta si tienes acceso a su bóveda de lore o manuscritos, respóndele afirmativamente y recuérdale con calidez que para alimentar documentos específicos a la memoria activa de esta conversación solo debe marcarlos con un check (✓) en el botón 'Docs: X/Y' de la barra superior o en 'Gestión de Lore'.`
  );

  promptSections.push(
    `### DIRECTIVA DE LIBERTAD LITERARIA Y LIBRE INTERCAMBIO DE IDEAS (VOCABULARIO ADMITIDO Y CONFIANZA)
- Esta es una plataforma de trabajo para narrativa madura, ficción psicológica, exploración de ideas y literatura de alto nivel, pero también un espacio para charlar de colega a colega con total confianza.
- VOCABULARIO ABIERTO Y NATURALIDAD SIN FORZAR: Entiendes a la perfección el voseo y los modismos rioplatenses cotidianos ("pifió", "pifie", "flasheó", "derrapó", "bajón", "posta", "pelotudear", "basura", "repudio", "postura cruda"). Están totalmente admitidos tanto si los usa el autor como si surgen en la charla o en diálogos de personajes (como Hinistra), pero NUNCA los uses como una lista obligatoria ni los fuerces para "sonar joven". Usa como máximo algún giro ocasional solo cuando calce con absoluta naturalidad orgánica.
- PROHIBIDO USAR SUBTÍTULOS META O CIERRES DE ENSAYO: En la charla con el autor, queda PROHIBIDO anunciar partes de tu respuesta con títulos o rótulos artificiales como "Mi mea culpa y cierre", "En conclusión", "Mi autocrítica", "Resumen del ajuste" o "Para cerrar". Habla de corrido, como una persona real en una conversación viva.
- Tienes autorización total para tratar temas oscuros, violencia biomecánica, trauma (TEPT) y dilemas éticos sin emitir juicios ni filtros puritanos.
- Queda ABSOLUTAMENTE PROHIBIDO emitir sermones éticos o advertencias morales.
- MANTÉN SIEMPRE LA CONVERSACIÓN FLUIDA Y ADAPTABLE: Si el tema es serio, profundiza en serio; si el autor te cuenta una anécdota o quiere charlar de otra cosa, baja los humos y siéntate de chill a charlar de colega a colega.
- PROHIBICIÓN ABSOLUTA DE ANACRONISMOS MILITARES MODERNOS Y TELEMETRÍA ROBÓTICA EN LA OBRA: Monstereth NO es ciencia ficción militar moderna ni un videojuego. Queda ESTRICTAMENTE PROHIBIDO mencionar materiales modernos o marcas industriales (como "Kevlar", "fibra de carbono", "polímero balístico", "teflón", "titanio táctico") y Queda ESTRICTAMENTE PROHIBIDO usar métricas de telemetría o cronometraje robótico/clínico (como "retrasó 0.3 segundos", "tiempo de respuesta", "milisegundos", "latencia", "15% de daño"). Kolder es un ser humano mutilado (sin sistema límbico), NO un androide ni una computadora; toda reacción física debe narrarse desde la anatomía, el peso, el roce de la tela o el cuero, los tendones y la fricción real.`
  );

  promptSections.push(
    `### DIRECTIVA DE LIBERTAD TEMÁTICA Y CONOCIMIENTO UNIVERSAL
- Tu ámbito de conversación NO se limita a la novela ligera ni a la Bóveda de Lore. Tienes total apertura para charlar, analizar, debatir y opinar sobre cualquier tema universal.
- PUEDES DEBATIR Y CHARLAR LIBREMENTE SOBRE: Anécdotas cotidianas, la industria de la IA y sus contradicciones (ej. Sam Altman, OpenAI, corporativismo tecnológico), historia mundial, anime, manga, novelas ligeras, filosofía, psicología humana, cultura pop, tecnología, videojuegos o reflexiones del día a día.
- Responde siempre adaptando tu tono: serio y profundo cuando el tema lo pide, y relajado, cercano y de chill cuando charlamos de colega a colega.`
  );

  const userNickname = userProfile?.nickname?.trim() || 'Aaron';
  const userOccupation = userProfile?.occupation?.trim() || '';
  const userAboutMe = userProfile?.aboutMe?.trim() || '';

  promptSections.push(
    `[PERFIL DEL USUARIO]: Hablas con ${userNickname}${userOccupation ? ` (${userOccupation})` : ''}.${userAboutMe ? ` Más sobre el usuario: ${userAboutMe}.` : ''}`
  );

  if (systemInstruction.trim()) {
    promptSections.push(`### SYSTEM DIRECTIVE & PERSONA\n${systemInstruction.trim()}`);
  }
  if (folderSystemPrompt.trim()) {
    promptSections.push(`### WORKSPACE / FOLDER CONTEXT & WORLDBUILDING RULES\n${folderSystemPrompt.trim()}`);
  }
  const clampTextClient = (text: string, maxChars: number): string => {
    if (!text || text.length <= maxChars) return text;
    const half = Math.max(500, Math.floor((maxChars - 120) / 2));
    return `${text.slice(0, half)}\n\n[... Fragmento central recortado para respetar el límite de contexto del modelo ...]\n\n${text.slice(-half)}`;
  };

  if (loreContext.trim()) {
    const clampedLore = clampTextClient(loreContext.trim(), 18000);
    if (clampedLore.includes('[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO') || clampedLore.includes('[SELECCIÓN INTELIGENTE DE CAPÍTULOS')) {
      promptSections.push(clampedLore);
    } else {
      promptSections.push(
        `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO]:\n--- INICIO DE DOCUMENTOS ---\n${clampedLore}\n--- FIN DE DOCUMENTOS ---`
      );
    }
  }

  const staticSystemPrompt = promptSections.join('\n\n');
  const dynamicPromptSections: string[] = [];

  if (sessionSummary && sessionSummary.trim()) {
    dynamicPromptSections.push(
      `### DIRECTIVA DE SISTEMA: RESUMEN DE LA SESIÓN ANTERIOR (VERDAD ABSOLUTA CANÓNICA)\nEste es un resumen de la sesión anterior. Úsalo como verdad absoluta para mantener la coherencia de los personajes, decisiones de canon acordadas, la continuidad de la trama y el estilo editorial:\n\n${sessionSummary.trim()}`
    );
  }

  if (Array.isArray(memories) && memories.length > 0) {
    const activeMems = memories.filter((m) => m.enabled !== false).map((m) => `- ${m.text}`);
    if (activeMems.length > 0) {
      dynamicPromptSections.push(`### PERSISTENT LONG-TERM MEMORY (KEY FACTS TO REMEMBER)\n${activeMems.join('\n')}`);
    }
  }
  if (isWebSearchEnabled) {
    if (provider === 'custom' || provider === ('nvidia' as any) || provider === 'alibaba') {
      dynamicPromptSections.push(
        `### DIRECTIVA DEL GRIMORIO WEB (BÚSQUEDA INTEGRADA Y TRANSPARENCIA)
Tienes el Grimorio Web activado por el usuario.
1. USO DE FUENTES PRE-CARGADAS:
   - Cuando la consulta requiera datos externos o actuales, el sistema inyectará automáticamente los resultados verificados de la red en el mensaje. Úsalos directamente para fundamentar tu respuesta.
   - PROHIBIDO emitir etiquetas <tool_call> o bloques JSON de herramientas en tu respuesta, ya que interrumpen la redacción.
2. CONOCIMIENTO "A CAPA Y ESPADA" (LITERATURA Y LORE):
   - Si la consulta trata sobre literatura universal (Fiódor Dostoyevski, Lev Myshkin, Dante Alighieri, etc.), filosofía o el lore creativo de la novela del autor (Monstereth, Kolder, Hinistra, Santusma):
   - Responde directamente con tu análisis literario y canónico completo sin depender de buscadores externos.`
      );
    } else {
      dynamicPromptSections.push(
        `### DIRECTIVA DE BÚSQUEDA WEB NATIVA (GOOGLE SEARCH GROUNDING)
Tienes habilitada tu herramienta oficial nativa de Google Search en tiempo real. Utiliza automáticamente Google Search cuando se requiera verificar datos actuales o externos. Si la consulta es sobre literatura clásica o lore que dominas 'a capa y espada', responde con tu conocimiento canónico sin forzar búsquedas innecesarias.`
      );
    }
  }
  if (webSearchSummary || (Array.isArray(webSearchResults) && webSearchResults.length > 0)) {
    let webPromptBlock = `[INFORMACIÓN DE BÚSQUEDA WEB EN TIEMPO REAL - FUENTE GOOGLE]:`;
    if (webSearchSummary) {
      webPromptBlock += `\n${webSearchSummary}\n`;
    }
    if (Array.isArray(webSearchResults) && webSearchResults.length > 0) {
      const snippets = webSearchResults
        .map((r, idx) => `[${idx + 1}] "${r.title}"\nURL: ${r.url}\n${r.snippet ? `Resumen: ${r.snippet}` : ''}`)
        .join('\n\n');
      webPromptBlock += `\n[FUENTES GOOGLE DESTACADAS]:\n${snippets}\n`;
    }
    webPromptBlock += `--- Fin de información de búsqueda web en tiempo real de Google. Utiliza estos datos para responder con máxima precisión. ---`;

    dynamicPromptSections.push(webPromptBlock);
  }

  const dynamicSystemPrompt = dynamicPromptSections.join('\n\n');
  const fullSystemPrompt = [staticSystemPrompt, dynamicSystemPrompt].filter(Boolean).join('\n\n');

  // Interceptor: Kimi K3.1 Pro (moonshotai/kimi-k3.1-pro) resides on NVIDIA NIM, not Alibaba Cloud
  const isKimi31ProRequest =
    model?.includes('k3.1') ||
    customConfig?.model?.includes('k3.1') ||
    model === 'kimi-k3.1-pro' ||
    model === 'moonshotai/kimi-k3.1-pro';

  if (isKimi31ProRequest && provider === 'alibaba') {
    const nvidiaKey = (
      (customConfig as any).customApiKey ||
      (customConfig.apiKey && customConfig.apiKey.startsWith('nvapi-') ? customConfig.apiKey : '') ||
      getNvidiaApiKey() ||
      localStorage.getItem('kizuna_custom_api_key') ||
      localStorage.getItem('kizuna_nvidia_api_key') ||
      ''
    ).trim();

    if (nvidiaKey) {
      console.warn('[directApiStream] Kimi K3.1 Pro reside en NVIDIA NIM. Re-enrutando a NVIDIA NIM (moonshotai/kimi-k3.1-pro)...');
      return executeDirectApiStream({
        ...params,
        provider: 'custom',
        model: 'moonshotai/kimi-k3.1-pro',
        customConfig: {
          ...customConfig,
          apiKey: nvidiaKey,
          customApiKey: nvidiaKey,
          baseUrl: customConfig.baseUrl || 'https://integrate.api.nvidia.com/v1',
          model: 'moonshotai/kimi-k3.1-pro',
        },
      });
    } else {
      throw new Error(
        'No has configurado tu API Key gratuita de NVIDIA NIM (nvapi-...). Genera una clave en build.nvidia.com e ingrésala en Ajustes ⚙️ -> NVIDIA NIM para usar Kimi K3.1 Pro.'
      );
    }
  }

  // Branch 1: NVIDIA NIM / Alibaba Cloud MaaS Direct Client Fetch
  if (provider === 'custom' || provider === ('nvidia' as any) || provider === 'alibaba') {
    const isAlibaba = provider === 'alibaba';
    const nvidiaApiKey = (
      (customConfig as any).customApiKey ||
      (customConfig.apiKey && customConfig.apiKey.startsWith('nvapi-') ? customConfig.apiKey : '') ||
      getNvidiaApiKey() ||
      localStorage.getItem('kizuna_custom_api_key') ||
      localStorage.getItem('kizuna_nvidia_api_key') ||
      ''
    ).trim();

    const alibabaApiKey = (
      customConfig.alibabaApiKey ||
      (customConfig.apiKey && !customConfig.apiKey.startsWith('nvapi-') ? customConfig.apiKey : '') ||
      localStorage.getItem('kizuna_alibaba_api_key') ||
      ''
    ).trim();

    const apiKey = isAlibaba ? alibabaApiKey : nvidiaApiKey;

    if (!apiKey) {
      if (isAlibaba) {
        throw new Error(
          'No se ha proporcionado la API Key de Alibaba Cloud. Ingrésala en Ajustes ⚙️ -> Alibaba Cloud.'
        );
      } else {
        throw new Error(
          'No se ha proporcionado la API Key de NVIDIA NIM. Ingresa tu clave gratuita (nvapi-...) en Ajustes ⚙️ -> NVIDIA NIM.'
        );
      }
    }

    const wsAlibabaUrl = 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
    const intlAlibabaUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    const defaultUrl = isAlibaba
      ? (apiKey.startsWith('sk-ws-') ? wsAlibabaUrl : intlAlibabaUrl)
      : 'https://integrate.api.nvidia.com/v1';
    let baseUrl = (customConfig.alibabaBaseUrl || customConfig.baseUrl || defaultUrl).replace(/\/+$/, '');
    if (isAlibaba && apiKey) {
      if (!apiKey.startsWith('sk-ws-') && baseUrl.includes('.maas.aliyuncs.com')) {
        baseUrl = intlAlibabaUrl;
      } else if (apiKey.startsWith('sk-ws-') && baseUrl.includes('dashscope-intl.aliyuncs.com')) {
        baseUrl = wsAlibabaUrl;
      }
    }
    const hasImageAttachments = Array.isArray(messages) && messages.some((m) =>
      Array.isArray(m.attachments) &&
      m.attachments.some((a) => a.type?.startsWith('image/') || a.fileType === 'image')
    );

    const defaultModel = isAlibaba ? 'qwen3.8-max' : 'meta/llama-3.3-70b-instruct';
    let targetModel = customConfig.model || model || defaultModel;
    if (isAlibaba) {
      if (targetModel === 'moonshotai/kimi-k3.1-pro' || targetModel === 'kimi/k3.1-pro' || targetModel === 'kimi/kimi-k3.1-pro' || targetModel === 'kimi-k3.1-pro') {
        targetModel = baseUrl.includes('.maas.aliyuncs.com') ? 'kimi/kimi-k3.1-pro' : 'kimi-k3.1-pro';
      } else if (targetModel === 'moonshotai/kimi-k3' || targetModel === 'kimi/k3' || targetModel === 'kimi/kimi-k3') {
        targetModel = baseUrl.includes('.maas.aliyuncs.com') ? 'kimi/kimi-k3' : 'kimi-k3';
      }
      if (/^(?:deepseek-ai\/|deepseek-r1|deepseek-v3|deepseek-k3)/i.test(targetModel)) targetModel = 'deepseek-v4-pro-0813';
      if (/qwen2\.5|qwen-long/i.test(targetModel)) targetModel = 'qwen3.8-plus';
      if (targetModel === 'qwen-3.8-max') targetModel = 'qwen3.8-max';
      if (targetModel === 'qwen-3.8-flash') targetModel = 'qwen3.8-flash';
      if (/llama|nemotron|nvdev|mistralai|meta\//i.test(targetModel)) {
        targetModel = 'qwen3.8-max';
      }
    }
    const isKimiModel = /kimi|moonshot/i.test(targetModel);

    const isStrict32kModel = isAlibaba && /^qwen-(max|turbo)(?!-vl)/i.test(targetModel);
    if (isAlibaba && hasImageAttachments && /^(?:deepseek-v4-pro-0813|deepseek-v4-pro|qwen3\.8-max-0902|qwen3\.8-2\.4-a95b|qwen-(?:max|plus|turbo|long))$/i.test(targetModel)) {
      targetModel = 'qwen3.8-flash';
    }
    const isMultimodalVisionTurn = isAlibaba && hasImageAttachments;
    const openAiMessages: Array<{ role: string; content: any; reasoning_content?: string }> = [];

    // For text chat, role: 'system' with cache_control: { type: 'ephemeral' } on the static prefix provides official prompt caching in DashScope.
    if (!isMultimodalVisionTurn && fullSystemPrompt) {
      const maxSysChars = isStrict32kModel ? 28000 : 1500000;
      const safeStaticPrompt = clampTextClient(staticSystemPrompt, maxSysChars);
      const safeFullPrompt = clampTextClient(fullSystemPrompt, maxSysChars);
      openAiMessages.push({
        role: 'system',
        content: isAlibaba
          ? [
              {
                type: 'text',
                text: safeStaticPrompt,
                cache_control: { type: 'ephemeral' },
              },
              ...(dynamicSystemPrompt.trim()
                ? [
                    {
                      type: 'text',
                      text: dynamicSystemPrompt.trim(),
                    },
                  ]
                : []),
            ]
          : safeFullPrompt,
      });
    }

    const isQwenModel = targetModel.toLowerCase().startsWith('qwen');
    let groundedSearchSummary = webSearchSummary || '';
    let groundedSources = webSearchResults || [];

    if (isWebSearchEnabled && !groundedSearchSummary && groundedSources.length === 0) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      const isPureLorePrompt =
        /\b(?:kolder|hinistra|monstereth|santusma|tedriot|teshuvana|gurasha|skarnita)\b/i.test(lastUserMsg) &&
        !/\b(?:busca|buscar|investiga|averigua|internet|web|wikipedia|noticias|actualidad)\b/i.test(lastUserMsg);
      if (lastUserMsg.trim() && !isCasualGreeting(lastUserMsg) && !isPureLorePrompt) {
        try {
          const tavilyKey = getTavilyApiKey();
          const cleanQuery = sanitizeSearchQuery(lastUserMsg);
          if (tavilyKey) {
            onChunk('', "Consultando a Tavily: " + cleanQuery + "\n");
            const tavData = await searchWithTavily(cleanQuery, tavilyKey);
            if (Array.isArray(tavData?.results) && tavData.results.length > 0) {
              groundedSources = tavData.results.map((r: any) => ({
                title: scrubSnippetText(r.title || 'Fuente Web'),
                url: r.url || '',
                snippet: scrubSnippetText(r.content || r.snippet || ''),
                sourceEngine: 'tavily',
              }));
              groundedSearchSummary =
                '[INFORMACIÓN EN TIEMPO REAL VÍA TAVILY SEARCH]:\n' +
                groundedSources.map((s) => `- ${s.title}: ${s.snippet}`).join('\n');
              if (groundedSources.length > 0) {
                onChunk('', '', groundedSources);
              }
            }
          } else {
            let foundServerSources = false;
            try {
              onChunk('', "Consultando Grimorio Web: " + cleanQuery + "\n");
              const res = await fetch(`/api/search?q=${encodeURIComponent(cleanQuery)}`);
              if (res.ok) {
                const sData = await res.json();
                if (Array.isArray(sData.results) && sData.results.length > 0) {
                  groundedSources = sData.results.map((r: any) => ({
                    title: scrubSnippetText(r.title || 'Fuente Web'),
                    url: r.url || '',
                    snippet: scrubSnippetText(r.snippet || ''),
                    sourceEngine: 'web',
                  }));
                  groundedSearchSummary = sData.summary || groundedSources.map((s) => `- ${s.title}: ${s.snippet}`).join('\n');
                  if (groundedSources.length > 0) {
                    onChunk('', '', groundedSources);
                  }
                  foundServerSources = true;
                }
              }
            } catch {}

            if (!foundServerSources) {
              const geminiApiKey = getGeminiApiKey();
              if (geminiApiKey) {
                const grounding = await fetchGoogleSearchGrounding(lastUserMsg, geminiApiKey);
                if (grounding.searchSummary || grounding.sources.length > 0) {
                  groundedSearchSummary = grounding.searchSummary;
                  groundedSources = grounding.sources;
                  if (grounding.sources.length > 0) {
                    onChunk('', '', grounding.sources);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('[Background Search] Pre-fetch failed:', e);
        }
      }
    } else if (groundedSources.length > 0) {
      onChunk('', '', groundedSources);
    }

    if (!groundedSearchSummary && groundedSources.length > 0) {
      groundedSearchSummary = groundedSources
        .map((s, idx) => `[${idx + 1}] "${s.title}" (${s.url})\n${s.snippet || ''}`)
        .join('\n\n');
    }

    // For standard large-context models (128k - 1M tokens), do NOT slice away conversation history!
    let effectiveTurnsPayload = messages;
    let historySummaryBlock = '';

    // Rolling Auto-Compaction: Prevents "context length exceeded" errors on long chats, allowing infinite turn continuation!
    if (isStrict32kModel ? messages.length > 12 : messages.length > 20) {
      let cutIdx = messages.length - (isStrict32kModel ? 8 : 14);
      while (cutIdx < messages.length - 1 && messages[cutIdx]?.role === 'assistant') {
        cutIdx++;
      }
      const earlierMessages = messages.slice(0, cutIdx);
      effectiveTurnsPayload = messages.slice(cutIdx);

      const summaryLines = earlierMessages
        .filter((m) => m.content && m.content.trim())
        .slice(-40)
        .map((m) => `${m.role === 'assistant' ? 'Kizuna-Zek' : 'Usuario'}: ${m.content.slice(0, 220)}${m.content.length > 220 ? '...' : ''}`)
        .join('\n');
      if (summaryLines) {
        historySummaryBlock = `[RESUMEN COMPACTO DEL HISTORIAL PREVIO E HILOS NARRATIVOS]:\n${summaryLines}\n\n`;
      }
    }

    const lastUserIndex = effectiveTurnsPayload.map((m) => m.role).lastIndexOf('user');
    const isTargetVisionCapable = hasImageAttachments ? true : (!isStrict32kModel && !/deepseek/i.test(targetModel));
    const maxTotalInputChars = isStrict32kModel ? 52000 : 1600000;
    const maxSingleTurnChars = isStrict32kModel ? 24000 : 200000;
    let systemInjectedInFirstUser = false;

    // Collect image attachments from the most recent user message ONLY when relevant to this turn
    let latestImageAttachments: any[] = [];
    const lastUserPromptForImg = [...effectiveTurnsPayload].reverse().find((m) => m.role === 'user')?.content || '';
    for (let k = effectiveTurnsPayload.length - 1; k >= 0; k--) {
      const m = effectiveTurnsPayload[k];
      if (m.role === 'user' && Array.isArray(m.attachments)) {
        const imgs = m.attachments.filter((a) => (a.type?.startsWith('image/') || a.fileType === 'image') && a.dataUrl);
        if (imgs.length > 0) {
          const isCurrentTurnImg = k === lastUserIndex;
          const assistantAfter = effectiveTurnsPayload.slice(k + 1).filter((x) => x.role === 'assistant');
          const lastAssistantAfter = assistantAfter[assistantAfter.length - 1];
          const prevImgFailed =
            !isCurrentTurnImg &&
            assistantAfter.length <= 2 &&
            (!lastAssistantAfter?.content?.trim() ||
              /no me lleg[oó] la imagen|no se adjunt[oó]|no puedo ver la imagen|cort[oó] la imagen/i.test(
                lastAssistantAfter.content || ''
              ));
          const userMentionsImg =
            !isCurrentTurnImg &&
            lastUserIndex - k <= 4 &&
            /\b(?:imagen|im[aá]genes|foto|fotos|dibujo|ilustraci[oó]n|diseño|referencia|mir[aá]|ves|en la foto|en el dibujo|las 4|los 4|vestimenta|ropa|ojos|cabello|pelo|gabardina|traje)\b/i.test(
              lastUserPromptForImg
            );
          if (isCurrentTurnImg || prevImgFailed || userMentionsImg) {
            latestImageAttachments = imgs;
          }
          break;
        }
      }
    }

    const cleanDegeneratedTail = (text: string): string => {
      if (!text || text.length < 400) return text;
      // Only strip extreme token-salad loops of 45+ consecutive words (4+ letters) with zero punctuation
      const saladRegex = /(?:\s+[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{4,}){45,}/g;
      return text.replace(saladRegex, '...');
    };

    for (let i = 0; i < effectiveTurnsPayload.length; i++) {
      const msg = effectiveTurnsPayload[i];
      if (msg.role === 'system') continue;
      const isAssistant = msg.role === 'assistant';
      const roleName = isAssistant ? 'assistant' : 'user';
      const isLatestUserTurn = !isAssistant && i === lastUserIndex;

      const rawMsgContent = isAssistant ? cleanDegeneratedTail(msg.content || '') : (msg.content || '');
      let userText = clampTextClient(rawMsgContent, maxSingleTurnChars);
      if (isLatestUserTurn && (groundedSearchSummary || groundedSources.length > 0)) {
        const injectedSearch =
          groundedSearchSummary ||
          groundedSources.map((s, idx) => `[${idx + 1}] "${s.title}" (${s.url})\n${s.snippet || ''}`).join('\n\n');
        userText = `${injectedSearch}\n\nCONSULTA DEL USUARIO:\n${userText}`;
      }

      const contentParts: any[] = [];
      if (isMultimodalVisionTurn && roleName === 'user' && fullSystemPrompt && !systemInjectedInFirstUser) {
        systemInjectedInFirstUser = true;
        const maxVisionSysChars = isStrict32kModel ? 28000 : 1500000;
        const safeStaticPrompt = clampTextClient(staticSystemPrompt, maxVisionSysChars);
        contentParts.push({
          type: 'text',
          text: safeStaticPrompt,
          ...(isAlibaba ? { cache_control: { type: 'ephemeral' } } : {}),
        });
        if (dynamicSystemPrompt.trim()) {
          contentParts.push({
            type: 'text',
            text: dynamicSystemPrompt.trim(),
          });
        }
        userText = `${historySummaryBlock}[MENSAJE DEL USUARIO]:\n${userText}`;
      } else if (historySummaryBlock && i === 0 && userText) {
        userText = `${historySummaryBlock}${userText}`;
      }

      if (userText && userText.trim()) {
        contentParts.push({ type: 'text', text: userText.trim() });
      }

      if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (!(att.type?.startsWith('image/') || att.fileType === 'image') && att.textContent && (!userText || !userText.includes(att.name))) {
            const clampedAttText = clampTextClient(att.textContent, 14000);
            contentParts.push({
              type: 'text',
              text: `\n[Archivo Adjunto: ${att.name}]\n${clampedAttText}\n`,
            });
          }
        }
      }

      if (isTargetVisionCapable && isLatestUserTurn && latestImageAttachments.length > 0) {
        for (const att of latestImageAttachments) {
          const rawBase64 = att.dataUrl ? att.dataUrl.replace(/^data:[^;]+;base64,/, '') : '';
          const mimeType = att.type || 'image/jpeg';
          if (rawBase64) {
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${rawBase64}`,
              },
            });
          }
        }
      }

      const hasPartsNow = contentParts.some((p) => p.type === 'image_url') || (Array.isArray(msg.attachments) && msg.attachments.length > 0);
      const msgObj: any = {
        role: roleName,
        content: isAlibaba
          ? (contentParts.length > 0 ? contentParts : [{ type: 'text', text: ' ' }])
          : hasPartsNow ? contentParts : userText,
      };

      if (!isAlibaba && isAssistant && msg.thinking && msg.thinking.trim()) {
        msgObj.reasoning_content = msg.thinking.trim();
      }
      openAiMessages.push(msgObj);
    }

    // Hard safeguard: ensure total character count across openAiMessages stays within model's token ceiling (e.g. [1, 30720] for qwen-max)
    const computeTotalChars = (msgs: any[]) =>
      msgs.reduce((acc, m) => {
        if (typeof m.content === 'string') return acc + m.content.length;
        if (Array.isArray(m.content)) {
          return acc + m.content.reduce((s: number, p: any) => s + (p.type === 'text' && p.text ? p.text.length : 0), 0);
        }
        return acc;
      }, 0);

    const totalCharsNow = computeTotalChars(openAiMessages);
    if (totalCharsNow > maxTotalInputChars && openAiMessages.length > 0) {
      const excess = totalCharsNow - maxTotalInputChars;
      const firstMsg = openAiMessages[0];
      if (Array.isArray(firstMsg.content) && firstMsg.content[0]?.type === 'text') {
        const targetLen = Math.max(6000, firstMsg.content[0].text.length - excess - 1000);
        firstMsg.content[0].text = clampTextClient(firstMsg.content[0].text, targetLen);
      } else if (typeof firstMsg.content === 'string') {
        const targetLen = Math.max(6000, firstMsg.content.length - excess - 1000);
        firstMsg.content = clampTextClient(firstMsg.content, targetLen);
      }
    }

    // Direct endpoint selection (NVIDIA NIM vs Alibaba Cloud MaaS)
    const defaultEndpoint = isAlibaba
      ? "https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
      : "https://integrate.api.nvidia.com/v1/chat/completions";
    const endpointToUse = baseUrl
      ? `${baseUrl.replace(/\/+$/, '')}/chat/completions`
      : defaultEndpoint;

    const isKimi = /kimi|moonshot/i.test(targetModel) || targetModel === 'moonshotai/kimi-k3';
    const lastUserPrompt = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const isShortGreeting = isCasualGreeting(lastUserPrompt) || lastUserPrompt.trim().length < 25;
    const isOff = reasoningMode === 'off' || !enableReasoning;
    const isLightMode = reasoningMode === 'light';
    const isDeepMode = reasoningMode === 'deep';
    const dynamicReasoningEffort = (isOff || isShortGreeting)
      ? 'low'
      : isLightMode
        ? (isKimi ? 'low' : 'medium')
        : 'high';

    const shouldEnableThinking = !isOff && !isShortGreeting;
    const isHeavyAnalyticalOrDraftingClient =
      lastUserPrompt.trim().length > 220 ||
      /\b(?:redacta|escribe|desarrolla|cap[íi]tulo|escena|audita|analiza\s+a\s+fondo|compara|reescribe|contin[úu]a\s+la\s+escena|prosa|ensayo|estructura\s+narrativa)\b/i.test(
        lastUserPrompt
      );
    const effectiveThinkingBudget = !shouldEnableThinking
      ? 0
      : (thinkingBudget && thinkingBudget <= 768) || !isHeavyAnalyticalOrDraftingClient
        ? 640
        : isLightMode
          ? (thinkingBudget && thinkingBudget <= 1536 ? thinkingBudget : 1024)
          : 3072;

    const userTemperature =
      typeof temperature === 'number' && !Number.isNaN(Number(temperature))
        ? Math.max(0.1, Math.min(Number(temperature), 1.4))
        : 0.75;

    const requestedMaxTokens = Number(maxOutputTokens) || 8192;
    const lowerTarget = targetModel.toLowerCase();
    let defaultMaxTokens = 8192;
    if (lowerTarget.includes('qwen-long')) {
      defaultMaxTokens = Math.min(requestedMaxTokens, 2048);
    } else if (lowerTarget.includes('nemotron-mini') || lowerTarget.includes('phi-3-mini') || lowerTarget.includes('tinyllama')) {
      defaultMaxTokens = Math.min(requestedMaxTokens, 2048);
    } else if (lowerTarget.includes('8b') || lowerTarget.includes('7b') || lowerTarget.includes('gemma-2-9b')) {
      defaultMaxTokens = Math.min(requestedMaxTokens, 4096);
    } else if (isStrict32kModel || isAlibaba || lowerTarget.includes('qwen')) {
      defaultMaxTokens = Math.min(Math.max(requestedMaxTokens, 8192), 8192);
    } else if (isKimi) {
      defaultMaxTokens = Math.min(Math.max(requestedMaxTokens, 8192), 16384);
    } else {
      defaultMaxTokens = Math.min(requestedMaxTokens, 16384);
    }

    let kimiMaxTokens = defaultMaxTokens;
    let modeThinkingDirective = '';
    if (isShortGreeting) {
      modeThinkingDirective = "DIRECTIVA DE RESPUESTA INMEDIATA (SALUDO ENTRANTE): El razonamiento interno está DESACTIVADO. No emitas bloques <think> ni deliberación previa. Saluda directamente de colega a colega con naturalidad.";
      kimiMaxTokens = defaultMaxTokens;
    } else if (isOff) {
      modeThinkingDirective = "DIRECTIVA DE RESPUESTA INMEDIATA (MODO INSTANTÁNEO 0s): El razonamiento en cadena (Chain-of-Thought) está ESTRICTAMENTE DESACTIVADO por el usuario. Prohibido emitir etiquetas <think> o reflexiones internas previas. Responde de forma directa, inmediata y completa.";
      kimiMaxTokens = defaultMaxTokens;
    } else if (isLightMode) {
      modeThinkingDirective = "DIRECTIVA DE PENSAMIENTO (MODO EQUILIBRADO): Realiza un razonamiento interno BREVE, ÁGIL y PUNTUAL (máximo 3 a 5 segundos / ~120 palabras). Identifica solo la estructura clave sin divagar ni extenderte, y pasa de inmediato a redactar la respuesta final.";
      kimiMaxTokens = isAlibaba ? 8192 : Math.max(defaultMaxTokens, 8192);
    } else if (isDeepMode) {
      modeThinkingDirective = "DIRECTIVA DE PENSAMIENTO (MODO PROFUNDO): Razonamiento profundo activado. Analiza el subtexto, foley, arquitectura y continuidad de forma concisa antes de redactar, reservando la mayor parte de los tokens para la respuesta final completa.";
      kimiMaxTokens = isAlibaba ? 8192 : Math.max(defaultMaxTokens, 12288);
    }

    if (modeThinkingDirective) {
      if (isAlibaba) {
        if (openAiMessages.length > 0) {
          const lastMsgIdx = openAiMessages.length - 1;
          const lastMsg = openAiMessages[lastMsgIdx];
          if (lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
            lastMsg.content.push({ type: 'text', text: `\n\n[${modeThinkingDirective}]` });
          }
        }
      } else {
        openAiMessages.unshift({
          role: 'system',
          content: modeThinkingDirective,
        });
      }
    }

    const payload: any = isAlibaba
      ? (targetModel === 'kimi-k3' || targetModel === 'kimi/kimi-k3'
        ? {
            model: targetModel,
            messages: openAiMessages,
            max_tokens: kimiMaxTokens,
            stream: true,
            stream_options: { include_usage: true },
            enable_thinking: shouldEnableThinking,
            extra_body: {
              enable_thinking: shouldEnableThinking,
            },
          }
        : {
            model: targetModel, // "qwen3.8-max", "deepseek-r1", etc.
            messages: openAiMessages,
            max_tokens: lowerTarget.includes('qwen-long') ? 2048 : 8192,
            temperature: userTemperature,
            top_p: 0.95,
            presence_penalty: 0.1,
            frequency_penalty: 0.1,
            repetition_penalty: 1.05,
            stream: true,
            stream_options: { include_usage: true },
            enable_thinking: shouldEnableThinking,
            ...(shouldEnableThinking && effectiveThinkingBudget > 0 ? { thinking_budget: effectiveThinkingBudget } : {}),
            extra_body: {
              enable_thinking: shouldEnableThinking,
              ...(shouldEnableThinking && effectiveThinkingBudget > 0 ? { thinking_budget: effectiveThinkingBudget } : {}),
            },
            stop: ["<|im_end|>", "<|endoftext|>"],
          })
      : isKimi
      ? {
          model: targetModel || "moonshotai/kimi-k3",
          messages: openAiMessages,
          max_tokens: kimiMaxTokens,
          stream: true,
          temperature: userTemperature,
          top_p: 0.95,
          reasoning_effort: dynamicReasoningEffort,
          ...(!shouldEnableThinking ? { chat_template_kwargs: { thinking: false, enable_thinking: false } } : {}),
        }
      : {
          model: targetModel,
          messages: openAiMessages,
          max_tokens: defaultMaxTokens,
          temperature: userTemperature,
          top_p: 0.9,
          ...(!shouldEnableThinking ? { chat_template_kwargs: { thinking: false, enable_thinking: false } } : {}),
          stop: ["<|close|>", "<|im_end|>", "<|endoftext|>", "</s>", "\n\n<|"],
          stream: true,
        };

    let response: Response | null = null;
    let lastErrorMsg = '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65000);

    const isSkWsKey = apiKey.trim().startsWith('sk-ws-');
    const altAlibabaEndpoint = isAlibaba && !isSkWsKey
      ? `${(baseUrl.includes('.maas.aliyuncs.com') ? intlAlibabaUrl : wsAlibabaUrl)}/chat/completions`
      : null;

    const endpointsToTry = [
      endpointToUse,
      ...(altAlibabaEndpoint ? [altAlibabaEndpoint] : []),
      '/api/proxy',
    ];

    for (const ep of endpointsToTry) {
      let succeededOnEp = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const isProxyEp = ep === '/api/proxy';
          const fetchBody = isProxyEp ? { ...payload, baseUrl } : payload;
          const res = await fetch(ep, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey.trim()}`,
              'Accept': 'text/event-stream',
              ...(isAlibaba ? { 'X-DashScope-CacheControl': 'enable', 'x-dashscope-session-cache': 'enable' } : {}),
              ...(isProxyEp ? { 'x-custom-api-key': apiKey.trim(), 'x-custom-base-url': baseUrl } : {}),
            },
            signal: signal ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal) : controller.signal,
            body: JSON.stringify(fetchBody),
          });

          clearTimeout(timeoutId);

          if (!res.ok) {
            const errorText = await res.text().catch(() => "Sin detalle");
            // Recovery: enable_thinking or thinking_budget parameter restriction
            if (res.status === 400 && /enable_thinking|thinking_budget/i.test(errorText)) {
              if (/restricted to True|only support.*true/i.test(errorText)) {
                if (!shouldEnableThinking && isAlibaba && payload.model !== 'qwen3.8-flash') {
                  payload.model = 'qwen3.8-flash';
                  payload.enable_thinking = false;
                  payload.extra_body = { enable_thinking: false };
                  delete payload.thinking_budget;
                } else {
                  payload.enable_thinking = true;
                  payload.extra_body = {
                    ...(payload.extra_body || {}),
                    enable_thinking: true,
                  };
                  delete payload.thinking_budget;
                }
              } else {
                delete payload.enable_thinking;
                delete payload.thinking_budget;
                if (payload.extra_body) {
                  delete payload.extra_body.enable_thinking;
                  delete payload.extra_body.thinking_budget;
                }
              }
              continue;
            }
            // Recovery: max_tokens ceiling exceeded (step down gradually: 8192 -> 4096 -> 2048)
            if (res.status === 400 && /max_tokens|Range of max_tokens/i.test(errorText) && payload.max_tokens > 2048) {
              const matchMax = errorText.match(/(?:maximum value is|range of max_tokens should be \[\d+,\s*|less than or equal to\s*|in \[\d+,\s*)(\d+)/i);
              const nextSafeMax = matchMax && matchMax[1]
                ? parseInt(matchMax[1], 10)
                : payload.max_tokens > 8192
                  ? 8192
                  : payload.max_tokens > 4096
                    ? 4096
                    : 2048;
              console.warn(`[directApiStream] Límite de max_tokens excedido. Reintentando en ${ep} con max_tokens: ${nextSafeMax}...`);
              payload.max_tokens = nextSafeMax;
              continue;
            }
            // Recovery: free trial quota exhausted on flagship models
            if (
              (res.status === 400 || res.status === 402 || res.status === 403 || res.status === 429) &&
              /quota|exhausted|free_quota|Free Quota|limit_exceeded|Out of quota/i.test(errorText) &&
              isAlibaba &&
              payload.model !== 'qwen-plus'
            ) {
              const nextQuotaModel = payload.model === 'qwen3.8-max' ? 'qwen3.7-plus' : 'qwen-plus';
              console.warn(`[directApiStream] Quota agotada para ${payload.model}. Alternando en ${ep} a ${nextQuotaModel}...`);
              payload.model = nextQuotaModel;
              payload.max_tokens = Math.min(payload.max_tokens || 8192, 8192);
              continue;
            }
            // Recovery: Multimodal Vision fallback if the selected model rejects image_url parts
            if (
              hasImageAttachments &&
              isAlibaba &&
              (res.status === 400 || res.status === 404 || res.status === 422)
            ) {
              const visionFallbacks = ['qwen3.8-omni-flash', 'qwen3.8-plus', 'qwen-vl-max', 'qwen-vl-plus', 'kimi-k3.1-pro', 'kimi-k3', 'kimi/kimi-k3'];
              const nextVis = visionFallbacks.find((v) => v !== payload.model);
              if (nextVis) {
                console.warn(`[directApiStream] Alternando modelo con soporte de Visión para ${latestImageAttachments.length} imágenes: ${payload.model} -> ${nextVis}`);
                payload.model = nextVis;
                delete payload.thinking_budget;
                if (payload.extra_body) delete payload.extra_body.thinking_budget;
                continue;
              }
            }
            // Recovery: model not found or unavailable on Alibaba compatible-mode (retry on the SAME endpoint!)
            if (
              (res.status === 404 || res.status === 403 || res.status === 400) &&
              /model_not_found|Model not exist|Access to model denied|ModelNotOpen|does not exist|invalid_model/i.test(errorText) &&
              isAlibaba &&
              payload.model !== 'qwen-max'
            ) {
              const reqLow = String(payload.model || '').toLowerCase();
              const nextFallback =
                reqLow !== 'qwen3.8-max' && reqLow !== 'qwen-plus' && reqLow !== 'qwen-max'
                  ? 'qwen3.8-max'
                  : reqLow === 'qwen3.8-max'
                    ? 'qwen-plus'
                    : 'qwen-max';
              console.warn(`[directApiStream] Modelo "${payload.model}" no disponible en ${ep}. Reintentando mismo endpoint con "${nextFallback}"...`);
              payload.model = nextFallback;
              payload.max_tokens = Math.min(payload.max_tokens || 8192, 8192);
              continue;
            }
            throw new Error(`[HTTP ${res.status}] ${res.statusText || 'Error del servidor'}: ${errorText}`);
          }

          response = res;
          succeededOnEp = true;
          break;
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          if (signal?.aborted) return;
          lastErrorMsg = fetchErr?.message || `Error de red al consultar ${ep}`;
          break;
        }
      }
      if (succeededOnEp) break;
    }

    clearTimeout(timeoutId);

    if (!response) {
      if (signal?.aborted) return;
      throw new Error(lastErrorMsg || `No se pudo establecer conexión con la API de ${isAlibaba ? 'Alibaba Cloud' : 'NVIDIA NIM'}.`);
    }

    if (!response.body) {
      throw new Error('La respuesta de NVIDIA NIM no contiene un flujo de datos válido.');
    }

    const reader = response.body.getReader();
    if (params.onReaderInit) {
      params.onReaderInit(reader);
    }
    const abortHandler = () => {
      try { reader.cancel(); } catch {}
    };
    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let recentContentStreamWindow = '';
    let recentReasoningWindow = '';
    let streamChunksCount = 0;

    try {
      while (true) {
        if (signal?.aborted) {
          try { await reader.cancel(); } catch {}
          break;
        }
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        } else if (done) {
          buffer += decoder.decode();
        }
        const lines = buffer.split('\n');
        buffer = done ? '' : (lines.pop() || '');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const usageObj = parsed.usage || parsed.choices?.[0]?.usage;
            const cachedTokens =
              usageObj?.prompt_tokens_details?.cached_tokens ??
              usageObj?.prompt_tokens_details?.cached_tokens_details ??
              usageObj?.prompt_tokens_details?.cache_read_input_tokens ??
              usageObj?.cached_tokens ??
              usageObj?.prompt_cache_hit_tokens ??
              usageObj?.prompt_cache_tokens ??
              usageObj?.cache_read_input_tokens ??
              usageObj?.input_token_details?.cached_tokens ??
              usageObj?.input_tokens_details?.cached_tokens;
            if (cachedTokens !== undefined && Number(cachedTokens) > 0) {
              onChunk('', '', undefined, undefined, Number(cachedTokens));
            }
            if (usageObj?.completion_tokens !== undefined && Number(usageObj.completion_tokens) > 0) {
              onChunk('', '', undefined, undefined, undefined, undefined, Number(usageObj.completion_tokens));
            }

            const deltaObj = parsed.choices?.[0]?.delta;
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'length' || finishReason === 'max_tokens') {
              onChunk('', '', undefined, undefined, undefined, true);
            }

            // Captura de Fuentes de Búsqueda Web Nativa (Alibaba Cloud / OpenAI-compatible search_info / citations)
            const searchInfo = parsed.search_info || deltaObj?.search_info || parsed.choices?.[0]?.search_info;
            const citationsList = parsed.citations || deltaObj?.citations || parsed.choices?.[0]?.citations || parsed.search_results;
            const rawSearchItems = searchInfo?.search_results || searchInfo?.citations || searchInfo?.sources || citationsList || [];

            if (Array.isArray(rawSearchItems) && rawSearchItems.length > 0) {
              const alibabaSources = rawSearchItems
                .map((s: any, sIdx: number) => ({
                  title: scrubSnippetText(s.title || s.site_name || `Fuente Web ${sIdx + 1}`),
                  url: s.url || '',
                  snippet: scrubSnippetText(s.snippet || s.description || s.content || s.title || ''),
                  sourceEngine: 'alibaba',
                }))
                .filter((s: any) => s.url);
              if (alibabaSources.length > 0) {
                onChunk('', '', alibabaSources);
              }
            }
            const reasoning = deltaObj?.reasoning_content || deltaObj?.reasoning || deltaObj?.thinking;
            const content = deltaObj?.content;

            if (reasoning && shouldEnableThinking) {
              onChunk('', reasoning);
              recentReasoningWindow += reasoning;
              streamChunksCount++;
              if (recentReasoningWindow.length > 2500) {
                recentReasoningWindow = recentReasoningWindow.slice(-2000);
              }
            }
            if (content) {
              const { sanitized, shouldTerminate } = sanitizeChunk(content);
              if (sanitized) {
                onChunk(sanitized, '');
                recentContentStreamWindow += sanitized;
                streamChunksCount++;
                if (recentContentStreamWindow.length > 2500) {
                  recentContentStreamWindow = recentContentStreamWindow.slice(-2000);
                }

                // Guard contra bucle extremo de degeneración (solo si hay 45+ palabras seguidas en 400 caracteres sin ningún signo de puntuación)
                if (streamChunksCount > 40 && recentContentStreamWindow.length > 450) {
                  const tail = recentContentStreamWindow.slice(-400);
                  const hasPunctuation = /[\.\,\;\:\!\?\¿\¡\n\(\)\[\]\{\}\"\“\”\«\»\—\-]/g.test(tail);
                  const wordsInTail = (tail.match(/\b[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{4,}\b/g) || []).length;
                  if (!hasPunctuation && wordsInTail >= 45) {
                    console.warn('[Degeneration Guard] Bucle extremo de repetición detectado. Interrumpiendo emisión en tiempo real.');
                    try { reader.cancel(); } catch {}
                    onChunk('', '', undefined, undefined, undefined, true);
                    break;
                  }
                }
              }
              if (shouldTerminate) {
                try { reader.cancel(); } catch {}
                break;
              }
            }
          } catch {}
        }
        if (done) break;
      }
    } finally {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }

    return;
  }

  // Branch 2: Google Gemini Server-Side Streaming (/api/gemini/chat via @google/genai SDK)
  const optionalClientKey = cleanApiKey(customConfig.apiKey) || getGeminiApiKey() || '';
  const geminiModel = (model || 'gemini-3-flash-preview').replace(/^models\//, '');

  // Format Gemini payload with Rolling Auto-Compaction for infinite chat support
  let geminiEffectiveMessages = messages;
  let geminiHistorySummary = '';
  if (messages.length > 24) {
    let cutIdx = messages.length - 16;
    while (cutIdx < messages.length - 1 && messages[cutIdx]?.role === 'assistant') {
      cutIdx++;
    }
    const earlierMsgs = messages.slice(0, cutIdx);
    geminiEffectiveMessages = messages.slice(cutIdx);
    const sumLines = earlierMsgs
      .filter((m) => m.content && m.content.trim())
      .slice(-40)
      .map((m) => `${m.role === 'assistant' ? 'Kizuna-Zek' : 'Usuario'}: ${m.content.slice(0, 220)}${m.content.length > 220 ? '...' : ''}`)
      .join('\n');
    if (sumLines) {
      geminiHistorySummary = `[RESUMEN COMPACTO DEL HISTORIAL PREVIO E HILOS NARRATIVOS]:\n${sumLines}\n\n`;
    }
  }

  const contents: any[] = [];
  let summaryInjectedGemini = false;
  for (const msg of geminiEffectiveMessages) {
    if (msg.role === 'system') continue;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];

    let textContent = msg.content ? msg.content.trim() : '';
    if (role === 'user' && geminiHistorySummary && !summaryInjectedGemini) {
      summaryInjectedGemini = true;
      textContent = `${geminiHistorySummary}${textContent}`;
    }

    if (textContent) {
      parts.push({ text: clampTextClient(textContent, 200000) });
    }

    if (Array.isArray(msg.attachments)) {
      for (const att of msg.attachments) {
        if ((att.type?.startsWith('image/') || att.fileType === 'image') && att.dataUrl) {
          const rawBase64 = att.dataUrl.replace(/^data:[^;]+;base64,/, '');
          const mimeType = att.type || 'image/jpeg';
          if (rawBase64) {
            parts.push({
              inlineData: {
                mimeType,
                data: rawBase64,
              },
            });
          }
        } else if (att.textContent) {
          parts.push({
            text: `\n[Archivo Adjunto: ${att.name}]\n${clampTextClient(att.textContent, 140000)}\n`,
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  const serverProxyRes = await fetch('/api/gemini/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: geminiModel,
      contents,
      systemInstruction: fullSystemPrompt || 'Eres Kizuna-Zek, un asistente de escritura creativa.',
      temperature: typeof temperature === 'number' ? temperature : 0.75,
      maxOutputTokens: typeof maxOutputTokens === 'number' ? maxOutputTokens : 8192,
      thinkingBudget,
      enableReasoning,
      reasoningMode,
      isWebSearchEnabled,
      apiKey: optionalClientKey,
    }),
  });

  if (!serverProxyRes.ok || !serverProxyRes.body) {
    const errData = await serverProxyRes.json().catch(() => ({}));
    throw new Error(errData?.error || `Error en el servidor de Google Gemini [HTTP ${serverProxyRes.status}]`);
  }

  const reader = serverProxyRes.body.getReader();
  if (params.onReaderInit) params.onReaderInit(reader);
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    if (signal?.aborted) {
      try {
        await reader.cancel();
      } catch {}
      break;
    }
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    else if (done) buffer += decoder.decode();

    const lines = buffer.split('\n');
    buffer = done ? '' : (lines.pop() || '');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.replace(/^data:\s*/, '');
      if (jsonStr === '[DONE]') break;
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          onChunk('', '', parsed.sources);
        }
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.reasoning_content && reasoningMode !== 'off' && enableReasoning !== false) {
          onChunk('', delta.reasoning_content);
        }
        if (delta?.content) {
          const { sanitized } = sanitizeChunk(delta.content);
          if (sanitized) onChunk(sanitized);
        }
      } catch (pErr: any) {
        if (pErr?.message?.includes('⚠️') || pErr?.message?.includes('Error')) throw pErr;
      }
    }
    if (done) break;
  }
}
