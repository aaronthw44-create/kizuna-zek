import { AppSettings, Chat, Folder, LoreFile } from '../types';
import { compressLoreDocsTo2K } from './documentParser';

export interface KeepAliveState {
  lastPingTimestamp: number;
  activePingsCount: number;
  lastPingStatus: 'idle' | 'pinging' | 'success' | 'failed';
  lastError?: string;
  isPinging: boolean;
  lastCachedTokens?: number;
  lastWarmedSignature?: string;
}

export function getLoreSignature(activeChat?: Chat | null): string {
  if (!activeChat || !Array.isArray(activeChat.selectedLoreFileIds)) return '';
  return [...activeChat.selectedLoreFileIds].sort().join(',');
}

export function buildCanonicalStaticSystemBlock(params: {
  settings?: AppSettings | null;
  activeChat?: Chat | null;
  loreFiles?: LoreFile[];
  folders?: Folder[];
}): string {
  const { settings, activeChat, loreFiles = [], folders = [] } = params;
  const personalityConfig = settings?.personalityConfig;
  const userProfile = settings?.userProfile;

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

  const promptSections: string[] = [];

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

  const isPersonaWizardSession = Boolean(activeChat?.title?.includes('Taller de Directiva Global'));
  const activeLoreDocs = isPersonaWizardSession
    ? []
    : loreFiles
        .filter((l) => Array.isArray(activeChat?.selectedLoreFileIds) && activeChat.selectedLoreFileIds.includes(l.id))
        .sort((a, b) => a.id.localeCompare(b.id));

  const loreStatusInstruction = `\n\n[ESTADO DE BÓVEDA DE LORE EN ESTA SESIÓN]: Tienes acceso completo e integrado al sistema Bóveda de Lore (Lore Storage) de Kizuna-Zek (${activeLoreDocs.length} documentos seleccionados actualmente en el contexto activo). NUNCA digas que no puedes ver la bóveda de lore ni que no tienes acceso a sus archivos. Si el usuario te pregunta por su lore o manuscritos, confirma afirmativamente que el acceso a Lore Storage está habilitado y recuérdale amigablemente que si desea que consultes un archivo específico en esta sesión, solo debe ir al selector 'Docs: X/Y' de la barra superior (o al menú '···' > 'Gestión de Lore') y marcar los documentos deseados con un check (✓).`;

  const effectiveSystemInstruction = isPersonaWizardSession
    ? `Eres el Arquitecto del Taller de Directiva Global de Kizuna-Zek.
Tu ÚNICA misión en este chat es redactar la nueva Directiva Global (System Prompt) personalizada según las respuestas del usuario.
REGLAS DEL TALLER:
1. Cuando el usuario responda a tus preguntas sobre tono, prohibiciones y estilo de intervención, redacta DIRECTAMENTE el System Prompt completo, pulido y listo para usar en primera/segunda persona ("Eres Kizuna-Zek...").
2. NO incluyas introducciones largas ni explicaciones fuera de la directiva, porque cuando el usuario pulse el botón "✅ Aplicar a Directiva Global" debajo de tu mensaje, TODO el texto de tu respuesta se guardará como la nueva Directiva Global.
3. Si el usuario pide ajustes a la directiva que acabas de proponer, devuelve la versión completa corregida.`
    : (settings?.globalSystemPrompt || `Eres Kizuna-Zek, colega creativo y taller editorial de cabecera del autor.`) +
      loreStatusInstruction;

  if (effectiveSystemInstruction.trim()) {
    promptSections.push(`### SYSTEM DIRECTIVE & PERSONA\n${effectiveSystemInstruction.trim()}`);
  }

  const folder = activeChat?.folderId ? folders.find((f) => f.id === activeChat.folderId) : null;
  if (folder?.systemPrompt && folder.systemPrompt.trim()) {
    promptSections.push(`### WORKSPACE / FOLDER CONTEXT & WORLDBUILDING RULES\n${folder.systemPrompt.trim()}`);
  }

  const loreDocumentsText = compressLoreDocsTo2K(activeLoreDocs, '');

  if (loreDocumentsText.trim()) {
    promptSections.push(
      `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO (${activeLoreDocs.length} documentos marcados en contexto)]:\n--- INICIO DE DOCUMENTOS ---\n${loreDocumentsText.trim()}\n--- FIN DE DOCUMENTOS ---`
    );
  }

  return promptSections.join('\n\n');
}

let keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;
let initialTimeoutId: ReturnType<typeof setTimeout> | null = null;

let globalGetParams: (() => {
  settings: AppSettings;
  activeChat: Chat | null;
  isGenerating: boolean;
  loreFiles?: LoreFile[];
  folders?: Folder[];
}) | null = null;

const state: KeepAliveState = {
  lastPingTimestamp: 0,
  activePingsCount: 0,
  lastPingStatus: 'idle',
  isPinging: false,
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.warn('[Alibaba Keep-Alive] Listener error:', e);
    }
  });
}

export function subscribeKeepAliveState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getKeepAliveState(): KeepAliveState {
  return { ...state };
}

export function recordChatCacheHit(cachedTokens: number, signature?: string) {
  if (cachedTokens > 0) {
    state.lastCachedTokens = Number(cachedTokens);
    state.lastPingTimestamp = Date.now();
    state.lastPingStatus = 'success';
    if (signature !== undefined) {
      state.lastWarmedSignature = signature;
    }
    notifyListeners();
  }
}

/**
 * Executes a single keep-alive ping to Alibaba Cloud MaaS to keep KV Cache warm.
 * Sends the real static prompt prefix (including Lore) to warm the exact prefix in GPU memory.
 */
export async function triggerAlibabaKeepAlivePing(
  overrideApiKey?: string,
  overrideBaseUrl?: string,
  overrideModel?: string
): Promise<{ success: boolean; error?: string }> {
  if (state.isPinging) {
    return { success: false, error: 'Ping ya en curso' };
  }

  const params = globalGetParams ? globalGetParams() : null;
  const settings = params?.settings;
  const activeChat = params?.activeChat;
  const loreFiles = params?.loreFiles || [];
  const folders = params?.folders || [];

  // Safeguard: Require Alibaba API key
  const apiKey = (
    overrideApiKey ||
    settings?.alibabaApiKey ||
    localStorage.getItem('kizuna_alibaba_api_key') ||
    ''
  ).trim();

  if (!apiKey) {
    state.lastPingStatus = 'failed';
    state.lastError = 'Falta API Key de Alibaba';
    notifyListeners();
    return { success: false, error: 'Falta API Key de Alibaba' };
  }

  state.isPinging = true;
  state.lastPingStatus = 'pinging';
  state.lastError = undefined;
  notifyListeners();

  try {
    const rawModel = overrideModel || settings?.alibabaModel || 'qwen3.8-max';
    let model =
      rawModel === 'auto' || /kimi/i.test(rawModel)
        ? 'qwen3.8-max'
        : rawModel === 'qwen-3.8-max'
        ? 'qwen3.8-max'
        : rawModel === 'qwen-3.8-flash'
        ? 'qwen3.8-flash'
        : rawModel === 'qwen-3.8-plus'
        ? 'qwen3.8-plus'
        : rawModel;

    const wsAlibabaUrl = 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
    const intlAlibabaUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    let baseUrl = (overrideBaseUrl || settings?.alibabaBaseUrl || wsAlibabaUrl).replace(/\/+$/, '');

    // Build the 100% identical byte-for-byte static system + Lore prefix used by /api/chat and directApiStream
    const fullSystem = buildCanonicalStaticSystemBlock({
      settings,
      activeChat,
      loreFiles,
      folders,
    });
    const currentSignature = getLoreSignature(activeChat);

    // Ultra-lightweight system + lore prefix message without heavy past conversation turns
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: any }> = [
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: fullSystem,
            cache_control: { type: 'ephemeral' },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'ping' }],
      },
    ];

    const sendPing = async (targetModel: string, targetBaseUrl: string) => {
      const isDedicatedWs = targetBaseUrl.includes('.maas.aliyuncs.com');
      const curWsMatch = targetBaseUrl.match(/(ws-[a-zA-Z0-9]+)/i);
      const pingHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-base-url': targetBaseUrl,
        'X-DashScope-CacheControl': 'enable',
        'x-dashscope-session-cache': 'enable',
      };
      if (!isDedicatedWs && curWsMatch && !apiKey.startsWith('sk-ws-')) {
        pingHeaders['X-DashScope-Workspace'] = curWsMatch[1];
      }
      return await fetch('/api/alibaba/v1/chat/completions', {
        method: 'POST',
        headers: pingHeaders,
        body: JSON.stringify({
          model: targetModel,
          messages,
          max_tokens: 1,
          temperature: 0.1,
          stream: false,
          enable_thinking: false,
          extra_body: { enable_thinking: false },
        }),
      });
    };

    let res = await sendPing(model, baseUrl);

    // Auto-switch endpoint if 403/401/404 ("Workspace endpoint access denied" or wrong endpoint)
    if (!res.ok && (res.status === 403 || res.status === 401 || res.status === 404)) {
      const altBase = baseUrl.includes('.maas.aliyuncs.com') ? intlAlibabaUrl : wsAlibabaUrl;
      console.warn(`[Alibaba KV Cache Keep-Alive] HTTP ${res.status} on ${baseUrl}, retrying on ${altBase}...`);
      const altRes = await sendPing(model, altBase);
      if (altRes.ok) {
        res = altRes;
        baseUrl = altBase;
      } else if (model !== 'qwen-plus') {
        const fbRes = await sendPing('qwen-plus', altBase);
        if (fbRes.ok) {
          res = fbRes;
          model = 'qwen-plus';
          baseUrl = altBase;
        }
      }
    }

    // If model not found or invalid model in that region, try universal qwen-plus fallback
    if (!res.ok && (res.status === 404 || res.status === 400) && model !== 'qwen-plus') {
      console.warn(`[Alibaba KV Cache Keep-Alive] Model "${model}" not found, retrying with "qwen-plus"...`);
      model = 'qwen-plus';
      res = await sendPing(model, baseUrl);
    }

    // Direct client fallback if running on static deployment without proxy
    if (!res.ok) {
      try {
        const directRes = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'X-DashScope-CacheControl': 'enable',
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 1,
            temperature: 0.1,
            stream: false,
          }),
        });
        if (directRes.ok) {
          res = directRes;
        }
      } catch {}
    }

    if (res.ok) {
      let cachedTokens = 0;
      let promptTokens = 0;
      try {
        const resJson = await res.json();
        cachedTokens =
          resJson.usage?.prompt_tokens_details?.cached_tokens ??
          resJson.usage?.prompt_tokens_details?.cached_tokens_details ??
          resJson.usage?.prompt_tokens_details?.cache_read_input_tokens ??
          resJson.usage?.prompt_tokens_details?.cache_creation_input_tokens ??
          resJson.usage?.cached_tokens ??
          resJson.usage?.prompt_cache_hit_tokens ??
          resJson.usage?.prompt_cache_tokens ??
          0;
        promptTokens = Number(resJson.usage?.prompt_tokens || 0);
      } catch {}

      state.lastPingTimestamp = Date.now();
      state.activePingsCount += 1;
      state.lastPingStatus = 'success';
      state.lastError = undefined;
      state.isPinging = false;
      state.lastWarmedSignature = currentSignature;
      if (cachedTokens > 0) {
        state.lastCachedTokens = Number(cachedTokens);
      } else if (promptTokens > 1024) {
        // On Ping #1 (cache creation), Alibaba Cloud stores the prefix in VRAM and reports total prompt_tokens
        state.lastCachedTokens = promptTokens;
      }
      console.log(
        `[Alibaba KV Cache Keep-Alive] ✓ Ping exitoso a Alibaba (${model}) - Total pings: ${state.activePingsCount}${state.lastCachedTokens ? ` • Caché KV Activo: ${state.lastCachedTokens} tokens` : ''}`
      );
      notifyListeners();
      return { success: true };
    } else {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errMsg = errJson?.error?.message || errJson?.message || errMsg;
      } catch {
        // Ignore parsing errors
      }
      state.lastPingStatus = 'failed';
      state.lastError = errMsg;
      state.isPinging = false;
      console.warn(`[Alibaba KV Cache Keep-Alive] ✗ Falló ping:`, errMsg);
      notifyListeners();
      return { success: false, error: errMsg };
    }
  } catch (err: any) {
    const errMsg = err?.message || 'Error de conexión';
    state.lastPingStatus = 'failed';
    state.lastError = errMsg;
    state.isPinging = false;
    console.warn('[Alibaba KV Cache Keep-Alive] Exception durante ping:', err);
    notifyListeners();
    return { success: false, error: errMsg };
  }
}

let visibilityTimerId: ReturnType<typeof setTimeout> | null = null;

const handleVisibilityChange = () => {
  if (typeof document === 'undefined') return;

  if (document.visibilityState === 'hidden') {
    // Zero activity when in background
    if (visibilityTimerId) {
      clearTimeout(visibilityTimerId);
      visibilityTimerId = null;
    }
    return;
  }

  // When app is opened / returned to foreground: wait exactly 15 seconds before sending 1 single light warm-up ping
  if (document.visibilityState === 'visible') {
    if (visibilityTimerId) {
      clearTimeout(visibilityTimerId);
    }
    visibilityTimerId = setTimeout(async () => {
      try {
        if (!globalGetParams) return;
        const { settings, isGenerating } = globalGetParams();
        if (settings.enableAlibabaKeepAlive !== true) return;
        if (document.visibilityState !== 'visible') return;
        if (isGenerating) return;

        console.log('[Alibaba Keep-Alive] 15s tras abrir la app: enviando ping ultra-ligero de calentamiento VRAM...');
        await triggerAlibabaKeepAlivePing();
      } catch (err) {
        console.warn('[Alibaba Keep-Alive] Error en ping de re-apertura:', err);
      }
    }, 15000); // 15 seconds delay
  }
};

export function startAlibabaKeepAlive(
  getParams: () => {
    settings: AppSettings;
    activeChat: Chat | null;
    isGenerating: boolean;
    loreFiles?: LoreFile[];
    folders?: Folder[];
  }
) {
  globalGetParams = getParams;

  if (keepAliveIntervalId) {
    clearInterval(keepAliveIntervalId);
    keepAliveIntervalId = null;
  }
  if (initialTimeoutId) {
    clearTimeout(initialTimeoutId);
    initialTimeoutId = null;
  }
  if (visibilityTimerId) {
    clearTimeout(visibilityTimerId);
    visibilityTimerId = null;
  }

  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  const PING_INTERVAL_MS = 4 * 60 * 1000;

  const runRecurringPing = async () => {
    try {
      const { settings, isGenerating } = getParams();

      // Safeguard 1: Only run automatic recurring background pings if explicitly enabled by user (protects token quota)
      if (settings.enableAlibabaKeepAlive !== true) return;

      // Safeguard 2: Document tab must be visible
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      // Safeguard 3: Don't ping if app is actively generating a reply
      if (isGenerating) return;

      await triggerAlibabaKeepAlivePing();
    } catch (e) {
      console.warn('[Alibaba Keep-Alive] Error en ciclo periódico:', e);
    }
  };

  // Schedule initial warm-up ping after 15 seconds (only if app is active and visible)
  initialTimeoutId = setTimeout(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      runRecurringPing();
    }
  }, 15000);

  keepAliveIntervalId = setInterval(runRecurringPing, PING_INTERVAL_MS);
}

export function stopAlibabaKeepAlive() {
  if (keepAliveIntervalId) {
    clearInterval(keepAliveIntervalId);
    keepAliveIntervalId = null;
  }
  if (initialTimeoutId) {
    clearTimeout(initialTimeoutId);
    initialTimeoutId = null;
  }
  if (visibilityTimerId) {
    clearTimeout(visibilityTimerId);
    visibilityTimerId = null;
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
  globalGetParams = null;
}
