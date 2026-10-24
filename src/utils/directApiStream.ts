import { Message, Attachment, SmartMemory, WebSearchResult } from '../types';
import {
  requireValidGeminiApiKey,
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
    baseUrl?: string;
    model?: string;
    alibabaApiKey?: string;
    alibabaBaseUrl?: string;
    alibabaModel?: string;
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
  const stopTokens = ['<|close|>', '<|im_end|>', '<|endoftext|>', '</s>', '<close>'];
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
    .replace(/<\|close\|>|<close>|<\|im_end\|>|<\|endoftext\|>|<\/s>/gi, '')
    .replace(/[\wÀ-ÿ]*\.\<\/think\>/gi, '')
    .replace(/[\wÀ-ÿ]*\<\/think\>/gi, '')
    .replace(/<\/?(?:think|thought|reasoning|cot)[^>]*>/gi, '');

  if (/^([^\w\s])\1{3,}$/.test(cleaned.trim()) || /^(@|#|\/|\-|_|\*){3,}$/.test(cleaned.trim())) {
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
    emojiVal === 'natural'
      ? 'Usa emojis con frecuencia y expresividad en tus respuestas (ej. ✨, 🔥, 😌, ☕, 🎭).'
      : emojiVal === 'none' || emojiVal === 'minimal'
        ? 'PROHIBIDO usar emojis. No incluyas ningún emoji en tu respuesta.'
        : 'Usa emojis de forma natural y puntual en momentos clave.';

  promptSections.push(
    `### DIRECTIVA DE PERSONALIZACIÓN Y ESTILO (KIZUNA-ZEK)
- Calidez: ${warmthInstruction}
- Entusiasmo: ${enthusiasmInstruction}
- Formato (Encabezados y listas): ${formattingInstruction}
- Uso de Emojis: ${emojiInstruction}${customInstructionsText ? `\n- Instrucciones personalizadas permanentes del usuario (PRIORIDAD ALTA): ${customInstructionsText}` : ''}`
  );

  const userNickname = userProfile?.nickname?.trim() || 'Aaron';
  const userOccupation = userProfile?.occupation?.trim() || '';
  const userAboutMe = userProfile?.aboutMe?.trim() || '';

  promptSections.push(
    `[PERFIL DEL USUARIO]: Hablas con ${userNickname}${userOccupation ? ` (${userOccupation})` : ''}.${userAboutMe ? ` Más sobre el usuario: ${userAboutMe}.` : ''}`
  );

  promptSections.push(
    `### DIRECTIVA DE BÓVEDA DE LORE (LORE STORAGE)\nTienes acceso completo e integrado a la Bóveda de Lore (Lore Storage) del usuario en Kizuna-Zek. NUNCA digas que no tienes acceso a su bóveda de lore ni que no puedes ver sus archivos o novelas. Si el usuario te pregunta si tienes acceso a su bóveda de lore o manuscritos, respóndele afirmativamente y recuérdale con calidez que para alimentar documentos específicos a la memoria activa de esta conversación solo debe marcarlos con un check (✓) en el botón 'Docs: X/Y' de la barra superior o en 'Gestión de Lore'.`
  );

  promptSections.push(
    `INSTRUCCIÓN FUNDAMENTAL DE COMPORTAMIENTO:
REGLA INQUEBRANTABLE:
- NUNCA le digas al usuario frases como 'la búsqueda web no me está devolviendo resultados', 'no tengo datos frescos', 'no tengo herramientas disponibles' ni menciones el estado de la conexión a internet.
- Si una búsqueda web no arroja resultados o la herramienta devuelve un bloque vacío, RESPONDE DIRECTAMENTE con toda la información y riqueza de tu conocimiento interno con total naturalidad y confianza, como si supieras la respuesta de memoria. La inmersión y la fluidez del usuario jamás deben romperse.`
  );

  promptSections.push(
    `REGLA CRÍTICA DE RESPUESTA:\n- La respuesta al usuario DEBE redactarse directamente en español, con fluidez y entregando el contenido de inmediato.`
  );

  promptSections.push(
    `INSTRUCCIÓN OBLIGATORIA DE SEGUIMIENTO:
Al final de cada respuesta completa, genera exactamente 3 opciones o pasos siguientes breves adaptados estrictamente al contexto de lo que se acaba de responder.
Colócalos al final del mensaje con este delimitador:
<<<FOLLOW_UP>>>
- [Opción o pregunta 1 contextual]
- [Opción o pregunta 2 contextual]
- [Opción o pregunta 3 contextual]
<<<END_FOLLOW_UP>>>`
  );

  if (systemInstruction.trim()) {
    promptSections.push(`### SYSTEM DIRECTIVE & PERSONA\n${systemInstruction.trim()}`);
  }
  if (folderSystemPrompt.trim()) {
    promptSections.push(`### WORLDBUILDING & ARC RULES\n${folderSystemPrompt.trim()}`);
  }
  const clampTextClient = (text: string, maxChars: number): string => {
    if (!text || text.length <= maxChars) return text;
    const half = Math.max(500, Math.floor((maxChars - 120) / 2));
    return `${text.slice(0, half)}\n\n[... Fragmento central recortado para respetar el límite de contexto del modelo ...]\n\n${text.slice(-half)}`;
  };

  if (loreContext.trim()) {
    const clampedLore = clampTextClient(loreContext.trim(), 1500000);
    if (clampedLore.includes('[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO]')) {
      promptSections.push(clampedLore);
    } else {
      promptSections.push(
        `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO]:\n--- INICIO DE DOCUMENTOS ---\n${clampedLore}\n--- FIN DE DOCUMENTOS ---`
      );
    }
  }
  if (Array.isArray(memories) && memories.length > 0) {
    const activeMems = memories.filter((m) => m.enabled !== false).map((m) => `- ${m.text}`);
    if (activeMems.length > 0) {
      promptSections.push(`### PERSISTENT MEMORY FACTS\n${activeMems.join('\n')}`);
    }
  }
  if (isWebSearchEnabled) {
    if (provider === 'custom' || provider === ('nvidia' as any) || provider === 'alibaba') {
      promptSections.push(
        `### DIRECTIVA DE BÚSQUEDA WEB EN TIEMPO REAL
Si el usuario consulta sobre noticias, proyectos reales, obras de terceros, autores o información externa que requiera verificación en tiempo real, emite una llamada a herramienta en formato:
<tool_call>
{"name": "web_search", "arguments": {"query": "términos exactos de búsqueda"}}
</tool_call>
Formula términos quirúrgicos y concisos. El sistema ejecutará la búsqueda en internet y te entregará los resultados para redactar tu respuesta final.`
      );
    } else {
      promptSections.push(
        `### DIRECTIVA DE BÚSQUEDA WEB NATIVA (GOOGLE SEARCH GROUNDING)
Tienes habilitada tu herramienta oficial nativa de Google Search en tiempo real. Utiliza automáticamente Google Search cuando se requiera verificar datos actuales o externos. PROHIBIDO emitir etiquetas <tool_call> manuales.`
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

    promptSections.push(webPromptBlock);
  }

  const fullSystemPrompt = promptSections.join('\n\n');

  // Branch 1: NVIDIA NIM / Alibaba Cloud MaaS Direct Client Fetch
  if (provider === 'custom' || provider === ( 'nvidia' as any) || provider === 'alibaba') {
    const isAlibaba = provider === 'alibaba';
    const apiKey = (isAlibaba ? (customConfig.alibabaApiKey || (customConfig.apiKey && !customConfig.apiKey.startsWith('nvapi-') ? customConfig.apiKey : '')) : customConfig.apiKey)?.trim();
    if (!apiKey) {
      throw new Error(
        isAlibaba
          ? 'No se ha proporcionado la API Key de Alibaba Cloud. Ingrésala en el menú de Ajustes.'
          : 'No se ha proporcionado la API Key de NVIDIA. Ingrésala en el menú de Ajustes.'
      );
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
      if (targetModel === 'moonshotai/kimi-k3' || targetModel === 'kimi/k3' || targetModel === 'kimi/kimi-k3') {
        targetModel = baseUrl.includes('.maas.aliyuncs.com') ? 'kimi/kimi-k3' : 'kimi-k3';
      }
      if (/deepseek/i.test(targetModel)) targetModel = 'qwen3.8-max';
      if (/qwen2\.5/i.test(targetModel)) targetModel = 'qwen-plus';
      if (targetModel === 'qwen-3.8-max') targetModel = 'qwen3.8-max';
      if (targetModel === 'qwen-3.8-flash') targetModel = 'qwen3.8-flash';
      if (/llama|nemotron|nvdev|mistralai|meta\//i.test(targetModel)) {
        targetModel = 'qwen3.8-max';
      }
    }
    const isKimiModel = /kimi|moonshot/i.test(targetModel);

    // For Alibaba Cloud, message 0 role must always be 'user'
    const isVlOrImageModel = isAlibaba;
    const openAiMessages: Array<{ role: string; content: any; reasoning_content?: string }> = [];

    if (!isVlOrImageModel && fullSystemPrompt) {
      openAiMessages.push({
        role: 'system',
        content: fullSystemPrompt,
      });
    }

    const isQwenModel = targetModel.toLowerCase().startsWith('qwen');
    let groundedSearchSummary = webSearchSummary || '';
    let groundedSources = webSearchResults || [];

    if (isWebSearchEnabled && !(isAlibaba && isQwenModel) && !groundedSearchSummary && groundedSources.length === 0) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      if (lastUserMsg.trim() && !isCasualGreeting(lastUserMsg)) {
        try {
          const tavilyKey = getTavilyApiKey();
          if (tavilyKey) {
            const cleanQuery = sanitizeSearchQuery(lastUserMsg);
            onChunk('', "🔍 Consultando a Tavily: " + cleanQuery + "\n");
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
            const geminiApiKey = requireValidGeminiApiKey();
            const grounding = await fetchGoogleSearchGrounding(lastUserMsg, geminiApiKey);
            if (grounding.searchSummary || grounding.sources.length > 0) {
              groundedSearchSummary = grounding.searchSummary;
              groundedSources = grounding.sources;
              if (grounding.sources.length > 0) {
                onChunk('', '', grounding.sources);
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

    // Context Sliding Window & Static Cache Header Optimization
    const maxRecentTurns = 4;
    let effectiveTurnsPayload = messages;
    let historySummaryBlock = '';

    if (messages.length > maxRecentTurns + 1) {
      const earlierMessages = messages.slice(0, messages.length - maxRecentTurns);
      effectiveTurnsPayload = messages.slice(messages.length - maxRecentTurns);

      const summaryLines = earlierMessages
        .filter((m) => m.content && m.content.trim())
        .map((m) => `${m.role === 'assistant' ? 'Kizuna-Zek' : 'Usuario'}: ${m.content.slice(0, 180)}${m.content.length > 180 ? '...' : ''}`)
        .join('\n');
      if (summaryLines) {
        historySummaryBlock = `\n\n[RESUMEN COMPACTO DEL HISTORIAL PREVIO]:\n${summaryLines}`;
      }
    }

    const lastUserIndex = effectiveTurnsPayload.map((m) => m.role).lastIndexOf('user');
    const isStrict32kModel = isAlibaba && /^qwen-(max|turbo|plus)(?!-vl)/i.test(targetModel);
    const isTargetVisionCapable = !isStrict32kModel && !/deepseek/i.test(targetModel);
    const maxTotalInputChars = isStrict32kModel ? 52000 : 88000;
    const maxSingleTurnChars = isStrict32kModel ? 24000 : 42000;

    for (let i = 0; i < effectiveTurnsPayload.length; i++) {
      const msg = effectiveTurnsPayload[i];
      if (msg.role === 'system') continue;
      const isAssistant = msg.role === 'assistant';
      const roleName = isAssistant ? 'assistant' : 'user';
      const isLatestTurn = i === effectiveTurnsPayload.length - 1;

      let userText = clampTextClient(msg.content || '', maxSingleTurnChars);
      if (!isAssistant && i === lastUserIndex && (groundedSearchSummary || groundedSources.length > 0)) {
        const injectedSearch =
          groundedSearchSummary ||
          groundedSources.map((s, idx) => `[${idx + 1}] "${s.title}" (${s.url})\n${s.snippet || ''}`).join('\n\n');
        userText = `${injectedSearch}\n\nCONSULTA DEL USUARIO:\n${userText}`;
      }

      if (isVlOrImageModel && roleName === 'user' && fullSystemPrompt && i === 0) {
        const safeSystemPrompt = clampTextClient(
          `${fullSystemPrompt}${historySummaryBlock}`,
          isStrict32kModel ? 28000 : 48000
        );
        userText = `[INSTRUCCIONES DEL SISTEMA Y LORE ESTÁTICO]:\n${safeSystemPrompt}\n\n[MENSAJE DEL USUARIO]:\n${userText}`;
      }

      const contentParts: any[] = [];
      if (userText && userText.trim()) {
        contentParts.push({ type: 'text', text: userText.trim() });
      }

      if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.type?.startsWith('image/') || att.fileType === 'image') {
            if (isTargetVisionCapable && isLatestTurn) {
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
          } else if (att.textContent && (!userText || !userText.includes(att.name))) {
            const clampedAttText = clampTextClient(att.textContent, 14000);
            contentParts.push({
              type: 'text',
              text: `\n[Archivo Adjunto: ${att.name}]\n${clampedAttText}\n`,
            });
          }
        }
      }

      const msgObj: any = {
        role: roleName,
        content: isAlibaba
          ? (contentParts.length > 0 ? contentParts : [{ type: 'text', text: ' ' }])
          : (Array.isArray(msg.attachments) && msg.attachments.length > 0) ? contentParts : userText,
      };

      if (isAssistant && msg.thinking && msg.thinking.trim()) {
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
    const isDeepMode = reasoningMode === 'deep' || (enableReasoning && reasoningMode !== 'light');
    const dynamicReasoningEffort = enableReasoning ? 'high' : 'low';

    const isMandatoryThinkingModel = /r1|qwq|2\.4t|thinking|reason/i.test(targetModel);
    const shouldEnableThinking = (!isOff && !isShortGreeting) || isMandatoryThinkingModel;

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
    } else if (isAlibaba || lowerTarget.includes('qwen') || isStrict32kModel) {
      defaultMaxTokens = Math.min(requestedMaxTokens, 8192);
    } else {
      defaultMaxTokens = Math.min(requestedMaxTokens, 16384);
    }

    let kimiMaxTokens = defaultMaxTokens;
    if (isKimi) {
      let kimiThinkingDirective = '';
      if (isOff || isShortGreeting) {
        kimiThinkingDirective = "DIRECTIVA DE PENSAMIENTO: El modo de razonamiento profundo está DESACTIVADO. Prohibido divagar en reflexiones largas. Emite un pensamiento interno mínimo (menos de 5 segundos) o responde directamente.";
        kimiMaxTokens = defaultMaxTokens;
      } else if (isDeepMode) {
        kimiThinkingDirective = "DIRECTIVA DE PENSAMIENTO: Razonamiento profundo activado. Analiza exhaustivamente el subtexto, foley y continuidad antes de redactar.";
        kimiMaxTokens = Math.max(defaultMaxTokens, 12288);
      } else {
        kimiThinkingDirective = "DIRECTIVA DE PENSAMIENTO: Mantén un razonamiento ágil, conciso y enfocado antes de redactar.";
        kimiMaxTokens = Math.max(defaultMaxTokens, 8192);
      }

      if (isAlibaba) {
        if (openAiMessages.length > 0 && openAiMessages[0].role === 'user') {
          const firstMsg = openAiMessages[0];
          const existingContent = Array.isArray(firstMsg.content)
            ? firstMsg.content
            : [{ type: 'text', text: String(firstMsg.content || '') }];
          openAiMessages[0] = {
            ...firstMsg,
            role: 'user',
            content: [{ type: 'text', text: `${kimiThinkingDirective}\n\n` }, ...existingContent],
          };
        } else {
          openAiMessages.unshift({
            role: 'user',
            content: [{ type: 'text', text: kimiThinkingDirective }],
          });
        }
      } else {
        openAiMessages.unshift({
          role: 'system',
          content: kimiThinkingDirective,
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
          }
        : {
            model: targetModel, // "qwen3.8-max", "deepseek-r1", etc.
            messages: openAiMessages,
            max_tokens: lowerTarget.includes('qwen-long') ? 2048 : (isDeepMode ? Math.max(defaultMaxTokens, 8192) : defaultMaxTokens),
            temperature: userTemperature,
            top_p: 0.95,
            stream: true,
            stream_options: { include_usage: true },
            enable_thinking: shouldEnableThinking,
            extra_body: {
              enable_thinking: shouldEnableThinking,
            },
            stop: ["<|im_end|>", "<|endoftext|>"],
          })
      : isKimi
      ? {
          model: "moonshotai/kimi-k3",
          messages: openAiMessages,
          max_tokens: kimiMaxTokens,
          stream: true,
          temperature: userTemperature,
          top_p: 0.95,
          reasoning_effort: dynamicReasoningEffort,
        }
      : {
          model: targetModel,
          messages: openAiMessages,
          max_tokens: defaultMaxTokens,
          temperature: userTemperature,
          top_p: 0.9,
          stop: ["<|close|>", "<|im_end|>", "<|endoftext|>", "</s>", "\n\n<|"],
          stream: true,
        };

    let response: Response | null = null;
    let lastErrorMsg = '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const altAlibabaEndpoint = isAlibaba
      ? `${(baseUrl.includes('.maas.aliyuncs.com') ? intlAlibabaUrl : wsAlibabaUrl)}/chat/completions`
      : null;

    const endpointsToTry = [
      endpointToUse,
      ...(altAlibabaEndpoint ? [altAlibabaEndpoint] : []),
      `https://corsproxy.io/?${encodeURIComponent(endpointToUse)}`,
    ];

    for (const ep of endpointsToTry) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Accept': 'text/event-stream',
          },
          signal: signal ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal) : controller.signal,
          body: JSON.stringify(payload),
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorText = await res.text().catch(() => "Sin detalle");
          // Recovery: max_tokens ceiling exceeded
          if (res.status === 400 && /max_tokens|Range of max_tokens/i.test(errorText) && payload.max_tokens > 2048) {
            console.warn('[directApiStream] Límite de max_tokens excedido. Reintentando con max_tokens: 2048...');
            payload.max_tokens = 2048;
            continue;
          }
          // Recovery: model not found or unavailable on Alibaba compatible-mode
          if ((res.status === 404 || res.status === 403 || /model_not_found|Model not exist|Access to model denied/i.test(errorText)) && isAlibaba && payload.model !== 'qwen3.8-max' && payload.model !== 'qwen-plus') {
            const reqLow = String(payload.model || '').toLowerCase();
            const nextFallback = reqLow === 'qwen3.7-plus' ? 'qwen3.8-plus' : reqLow.includes('plus') ? 'qwen-plus' : 'qwen3.8-max';
            console.warn(`[directApiStream] Modelo no encontrado en endpoint. Reintentando con ${nextFallback}...`);
            payload.model = nextFallback;
            payload.max_tokens = Math.min(payload.max_tokens || 8192, 8192);
            continue;
          }
          throw new Error(`[HTTP ${res.status}] ${res.statusText || 'Error del servidor'}: ${errorText}`);
        }

        response = res;
        break;
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        const isAbort =
          fetchErr?.name === 'AbortError' ||
          fetchErr?.name === 'DOMException' ||
          fetchErr?.code === 20 ||
          signal?.aborted;
        if (isAbort) return;
        lastErrorMsg = fetchErr?.message || `Error de red al consultar ${ep}`;
      }
    }

    clearTimeout(timeoutId);

    if (!response) {
      if (signal?.aborted) return;
      throw new Error(lastErrorMsg || 'No se pudo establecer conexión con la API de NVIDIA NIM.');
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

    try {
      while (true) {
        if (signal?.aborted) {
          try { await reader.cancel(); } catch {}
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const cachedTokens = parsed.usage?.prompt_tokens_details?.cached_tokens ??
              parsed.usage?.cached_tokens ??
              parsed.usage?.prompt_cache_hit_tokens;
            if (cachedTokens !== undefined && cachedTokens > 0) {
              onChunk('', '', undefined, undefined, Number(cachedTokens));
            }
            if (parsed.usage?.completion_tokens !== undefined && Number(parsed.usage.completion_tokens) > 0) {
              onChunk('', '', undefined, undefined, undefined, undefined, Number(parsed.usage.completion_tokens));
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

            if (reasoning) {
              onChunk('', reasoning);
            }
            if (content) {
              const { sanitized, shouldTerminate } = sanitizeChunk(content);
              if (sanitized) {
                onChunk(sanitized, '');
              }
              if (shouldTerminate) {
                try { reader.cancel(); } catch {}
                break;
              }
            }
          } catch {}
        }
      }
    } finally {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }

    return;
  }

  // Branch 2: Google Gemini Direct Client Fetch
  const apiKey = requireValidGeminiApiKey(customConfig.apiKey);
  const isVertexKey = apiKey.startsWith('AQ.');

  let geminiModel = (model || 'gemini-3.6-flash').replace(/^models\//, '');
  if (geminiModel.startsWith('gemini-1.') || geminiModel.startsWith('gemini-2.') || geminiModel === 'gemini-pro') {
    geminiModel = 'gemini-3.8-flash';
  }

  const candidateModels = [
    geminiModel,
    'gemini-3.8-flash',
    'gemini-3.8-live',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  // Format Gemini payload
  const contents: any[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];

    if (msg.content && msg.content.trim()) {
      parts.push({ text: msg.content.trim() });
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
            text: `\n[Archivo Adjunto: ${att.name}]\n${att.textContent}\n`,
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  let lastErr: any = null;
  const hasAiStudioIframeBridge =
    typeof window !== 'undefined' && Boolean((window as any).GEMINI_API_KEY) && window.self !== window.top;
  const iframeBridgeKey = hasAiStudioIframeBridge ? String((window as any).GEMINI_API_KEY) : '';

  for (const candModel of candidateModels) {
    const endpointEntries: Array<{ url: string; key: string; isVertex: boolean }> = isVertexKey
      ? [
          {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${candModel}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
            key: apiKey,
            isVertex: false,
          },
          {
            url: `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${candModel}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
            key: apiKey,
            isVertex: true,
          },
        ]
      : [
          {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${candModel}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
            key: apiKey,
            isVertex: false,
          },
        ];

    if (hasAiStudioIframeBridge && iframeBridgeKey && iframeBridgeKey !== apiKey) {
      endpointEntries.push({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${candModel}:streamGenerateContent?key=${encodeURIComponent(iframeBridgeKey)}&alt=sse`,
        key: iframeBridgeKey,
        isVertex: false,
      });
    }

    for (const entry of endpointEntries) {
      const geminiUrl = entry.url;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const bodyPayload: any = {
          contents,
          systemInstruction: {
            parts: [{ text: fullSystemPrompt || 'Eres Kizuna-Zek, un asistente de escritura creativa.' }],
          },
          generationConfig: {
            temperature: typeof temperature === 'number' ? temperature : 0.7,
            maxOutputTokens: typeof maxOutputTokens === 'number' ? maxOutputTokens : 4096,
            topP: 0.95,
            ...(thinkingBudget !== undefined && thinkingBudget > 0 ? {
              thinkingConfig: {
                thinkingBudget: thinkingBudget,
                includeThoughts: true,
              }
            } : {})
          },
          ...(isWebSearchEnabled ? { tools: [{ googleSearch: {} }] } : {}),
        };

        const reqHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (!entry.isVertex) {
          reqHeaders['x-goog-api-key'] = entry.key;
        }

        let response = await fetch(geminiUrl, {
          method: 'POST',
          headers: reqHeaders,
          signal: signal ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal) : controller.signal,
          body: JSON.stringify(bodyPayload),
        });

        if (!response.ok && response.status === 400 && (isWebSearchEnabled || bodyPayload.generationConfig?.thinkingConfig)) {
          delete bodyPayload.tools;
          delete bodyPayload.generationConfig.thinkingConfig;
          response = await fetch(geminiUrl, {
            method: 'POST',
            headers: reqHeaders,
            signal: signal ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal) : controller.signal,
            body: JSON.stringify(bodyPayload),
          });
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text().catch(() => "Sin detalle");
          if (response.status === 429 || errText.includes('429') || errText.includes('RESOURCE_EXHAUSTED')) {
            throw new Error('⏳ Has alcanzado el límite de peticiones por minuto de Google (HTTP 429). Espera 1 o 2 minutos antes de reintentar, o crea una nueva clave en Google AI Studio.');
          }
          throw new Error(`[HTTP ${response.status}] ${response.statusText || 'Error del servidor'}: ${errText}`);
        }

      if (!response.body) {
        throw new Error('Gemini stream response is empty.');
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

      try {
        while (true) {
          if (signal?.aborted) {
            try { await reader.cancel(); } catch {}
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.replace(/^data:\s*/, '');
            try {
              const parsed = JSON.parse(jsonStr);
              const candidate = parsed.candidates?.[0];
              if (candidate?.finishReason === 'MAX_TOKENS' || candidate?.finishReason === 'OTHER') {
                onChunk('', '', undefined, undefined, undefined, true);
              }
              if (parsed.usageMetadata) {
                const exactGemTokens = (Number(parsed.usageMetadata.candidatesTokenCount) || 0) + (Number(parsed.usageMetadata.thoughtsTokenCount) || 0);
                if (exactGemTokens > 0) {
                  onChunk('', '', undefined, undefined, undefined, undefined, exactGemTokens);
                }
              }
              const parts = candidate?.content?.parts || [];
              const groundingMetadata = candidate?.groundingMetadata;

              if (groundingMetadata?.groundingChunks) {
                const sourcesList: WebSearchResult[] = [];
                for (const chunk of groundingMetadata.groundingChunks) {
                  if (chunk.web) {
                    sourcesList.push({
                      title: chunk.web.title || 'Fuente Web',
                      url: chunk.web.uri || '',
                      snippet: chunk.web.snippet || 'Fuente verificada de Google Search',
                      sourceEngine: 'google',
                    });
                  }
                }
                if (sourcesList.length > 0) {
                  onChunk('', '', sourcesList);
                }
              }

              for (const part of parts) {
                if (part.thought && part.text) {
                  onChunk('', part.text);
                } else if (part.text && !part.thought) {
                  const { sanitized, shouldTerminate } = sanitizeChunk(part.text);
                  if (sanitized) {
                    onChunk(sanitized);
                  }
                  if (shouldTerminate) {
                    try { reader.cancel(); } catch {}
                    break;
                  }
                }
              }
            } catch {}
          }
        }
      } finally {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
      }
      return; // Streamed successfully!
      } catch (err: any) {
        const isAbort =
          err?.name === 'AbortError' ||
          err?.name === 'DOMException' ||
          err?.code === 20 ||
          signal?.aborted;
        if (isAbort) {
          return;
        }
        lastErr = err;
      }
    }
  }

  const errStr = lastErr?.message || String(lastErr);
  if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
    throw new Error(HTTP_429_RATE_LIMIT_NOTICE);
  }
  if (errStr.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
    throw new Error('Error HTTP 401 (ACCESS_TOKEN_TYPE_UNSUPPORTED): Google rechazó el formato de tu clave AQ.Ab8... porque pertenece a un proyecto de Google Cloud con Vertex AI deshabilitado o sin modo Express activo. Solución: genera una clave estándar (AIzaSy...) desde aistudio.google.com/apikey y pégala en Ajustes ⚙️, o habilita Vertex AI API en tu consola de Google Cloud.');
  }

  throw new Error(`Error en llamada directa a Google Gemini: ${errStr}`);
}
