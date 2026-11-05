import { SmartMemory, Message, AppSettings } from '../types';
import { executeDirectApiStream } from './directApiStream';
import { getGeminiApiKey, getNvidiaApiKey } from '../services/apiService';

/**
 * Detects patterns like:
 * - "recordá que..."
 * - "recuerda que..."
 * - "guarda en memoria..." / "guardá en memoria..."
 * - "save to memory: [x]"
 * - "remember that..."
 */
export function detectSmartMemory(text: string): string | null {
  if (!text) return null;

  const patterns = [
    /save\s+to\s+memory\s*:\s*(.+)/i,
    /guard[aá]\s+en\s+memoria\s*(?:que|:)?\s*(.+)/i,
    /record[aá]\s+que\s+(.+)/i,
    /recuerda\s+que\s+(.+)/i,
    /recu[eé]rdame\s+que\s+(.+)/i,
    /remember\s+that\s+(.+)/i,
    /keep\s+in\s+mind\s+that\s+(.+)/i,
    /nota\s+mental\s*:\s*(.+)/i,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted.length >= 3) {
        return extracted;
      }
    }
  }

  return null;
}

export function createMemoryObject(fact: string, source: 'auto' | 'manual' = 'auto'): SmartMemory {
  return {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: fact,
    timestamp: Date.now(),
    enabled: true,
    source,
  };
}

/**
 * Limpia saludos triviales, preguntas de cierre de cortesía y emojis para extraer
 * únicamente las oraciones sustantivas completas sin cortar jamás palabras a la mitad.
 */
function extractSubstantiveTurnSummary(raw: string, role: Message['role'], maxChars: number): string {
  if (!raw) return '';

  let text = raw
    .replace(/\[DOCUMENTO ADJUNTO:[\s\S]*$/gi, '')
    .replace(/<<<FOLLOW_UP>>>[\s\S]*$/gi, '')
    .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}✨🔥☕👋]/gu, '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  // Descartar saludos sueltos de 1-3 palabras ("Hola", "Buenas", "Hola ¿qué tal?", etc.)
  const lowerClean = text.toLowerCase().replace(/[¡!¿?.,;:()'"-]/g, '').trim();
  const trivialPhrases = new Set([
    'hola',
    'buenas',
    'hola que tal',
    'hola qué tal',
    'buen dia',
    'buen día',
    'buenas tardes',
    'buenas noches',
    'hey',
    'dale',
    'ok',
    'listo',
    'gracias',
    'si',
    'sí',
  ]);
  if (trivialPhrases.has(lowerClean) || lowerClean.length <= 6) {
    return '';
  }

  // Dividir en oraciones completas respetando signos de cierre
  const rawSentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Filtrar oraciones de puro saludo inicial o preguntas de apertura genéricas de la IA
  const greetingOrFluffRegex =
    /^(?:¡?hola\b|¡?buenas\b|qué bueno tenerte|que bueno tenerte|ya estoy con el mate|con el mate listo|a ver,\s*estamos|¿?por dónde arrancamos|¿?qué te está haciendo ruido|¿?qué escena te pide cuerpo|¿?en qué nos metemos hoy|¿?cómo lo ves|¿?qué te parece si)/i;

  const substantiveSentences = rawSentences.filter((s) => {
    const cleanS = s.replace(/^[¡!¿?\s,-]+/, '').trim();
    if (!cleanS || cleanS.length < 6) return false;
    if (greetingOrFluffRegex.test(cleanS)) return false;
    // Si es asistente y termina en pregunta corta de cierre, omitirla del resumen de hechos
    if (role === 'assistant' && cleanS.endsWith('?') && cleanS.length < 95) return false;
    return true;
  });

  if (substantiveSentences.length === 0) {
    return '';
  }

  // Construir síntesis sumando oraciones completas hasta alcanzar el presupuesto sin cortar palabras
  let accumulated = '';
  for (const sentence of substantiveSentences) {
    if (!accumulated) {
      if (sentence.length <= maxChars) {
        accumulated = sentence;
      } else {
        // Si una única oración supera el límite, cortar limpiamente en el último espacio o coma
        const sub = sentence.slice(0, maxChars);
        const lastSpace = Math.max(sub.lastIndexOf(', '), sub.lastIndexOf(' '));
        const safeCut = lastSpace > maxChars * 0.6 ? sub.slice(0, lastSpace).trim() : sub.trim();
        accumulated = safeCut.replace(/[.,;:]+$/, '') + '.';
        break;
      }
    } else if (accumulated.length + 1 + sentence.length <= maxChars) {
      accumulated += ' ' + sentence;
    } else {
      break;
    }
  }

  return accumulated.trim();
}

/**
 * Construye o actualiza automáticamente el Resumen de Sesión local (0ms de latencia)
 * para los mensajes que salen de la ventana literal. Ignora saludos vacíos y extrae
 * únicamente oraciones sustantivas completas sin cortar palabras a la mitad.
 */
export function buildRollingSessionSummary(olderMessages: Message[]): string {
  if (!olderMessages || olderMessages.length === 0) return '';

  const entries: string[] = [];

  for (let i = 0; i < olderMessages.length; i++) {
    const msg = olderMessages[i];
    if (!msg || (!msg.content?.trim() && (!msg.attachments || msg.attachments.length === 0))) {
      continue;
    }
    const roleLabel = msg.role === 'user' ? 'Autor' : 'Kizuna-Zek';
    const maxChars = msg.role === 'user' ? 240 : 280;
    const summaryLine = extractSubstantiveTurnSummary(msg.content || '', msg.role, maxChars);
    const attNames =
      msg.attachments && msg.attachments.length > 0
        ? ` [Adjuntos: ${msg.attachments.map((a) => a.name).join(', ')}]`
        : '';

    if (summaryLine || attNames) {
      entries.push(`• Turno #${i + 1} (${roleLabel}): ${summaryLine}${attNames}`);
    }
  }

  if (entries.length === 0) return '';

  if (entries.length > 24) {
    const head = entries.slice(0, 8);
    const tail = entries.slice(-16);
    return [
      ...head,
      `• [${entries.length - 24} intervenciones intermedias consolidadas]`,
      ...tail,
    ].join('\n');
  }

  return entries.join('\n');
}

/**
 * Genera una síntesis ejecutiva real e inteligente usando el motor activo (Alibaba Qwen, Gemini o NVIDIA NIM).
 * Se ejecuta bajo demanda en Ajustes o en segundo plano DESPUÉS de responder (sin añadir latencia al turno).
 */
export async function synthesizeSessionSummaryWithAI(
  messagesToSummarize: Message[],
  settings: AppSettings,
  existingSummary?: string
): Promise<string> {
  const meaningfulMessages = (messagesToSummarize || []).filter((m) => {
    const extracted = extractSubstantiveTurnSummary(m.content || '', m.role, 500);
    return Boolean(extracted) || (m.attachments && m.attachments.length > 0);
  });

  if (meaningfulMessages.length === 0) {
    return '';
  }

  const transcriptLines = meaningfulMessages.slice(-24).map((m, idx) => {
    const speaker = m.role === 'user' ? 'Autor' : 'Kizuna-Zek';
    const cleanBody = (m.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 900);
    const attInfo =
      m.attachments && m.attachments.length > 0
        ? ` [Archivos: ${m.attachments.map((a) => a.name).join(', ')}]`
        : '';
    return `[#${idx + 1} ${speaker}]: ${cleanBody}${attInfo}`;
  });

  const synthesisPrompt = `Redacta un Resumen de Sesión sobrio, preciso y compacto sobre los siguientes intercambios de trabajo editorial.

${existingSummary ? `[RESUMEN PREVIO ACUMULADO]:\n${existingSummary}\n\n` : ''}[INTERCAMBIOS A SINTETIZAR]:
${transcriptLines.join('\n\n')}

REGLAS ESTRICTAS DE SÍNTESIS:
1. Escribe únicamente viñetas claras y directas (•) agrupando: temas/escenas tratadas, decisiones de canon o estructura acordadas, y el punto actual del trabajo.
2. PROHIBIDO usar emojis, saludos ("Hola Aaron"), preguntas de cierre o comentarios meta ("Aquí tienes el resumen").
3. PROHIBIDO cortar palabras u oraciones con "[...]". Cada punto debe ser una idea completa, coherente y redactada con precisión editorial en español (máximo 180 palabras en total).`;

  const sysInstruction =
    'Eres el sintetizador de memoria contextual de Kizuna-Zek. Tu única tarea es condensar el historial de conversación en apuntes ejecutivos sobrios, sin emojis, sin saludos y sin preámbulos.';

  const rawAlibabaModel = settings.alibabaModel || 'deepseek-v4.1-flash-1017';
  const alibabaFlashCandidate =
    settings.fetchedAlibabaModels?.find((m) => /deepseek.*(v4\.1.*flash|flash.*1017)/i.test(m.id))?.id ||
    'deepseek-v4.1-flash-1017';

  const cleanAlibabaModel = /llama|nemotron|nvdev|mistralai|meta\/|qwen-long/i.test(rawAlibabaModel)
    ? alibabaFlashCandidate
    : (rawAlibabaModel.includes('deepseek') || rawAlibabaModel.includes('flash') ? rawAlibabaModel : alibabaFlashCandidate);

  const targetModelId =
    settings.provider === 'alibaba'
      ? cleanAlibabaModel
      : settings.provider === 'custom'
        ? settings.customModel
        : settings.geminiModel;

  let accumulated = '';
  let serverFailed = false;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: `sum_${Date.now()}`, role: 'user', content: synthesisPrompt, timestamp: Date.now() }],
        systemInstruction: sysInstruction,
        folderSystemPrompt: '',
        loreContext: '',
        memories: [],
        provider: settings.provider,
        customConfig: {
          apiKey:
            settings.provider === 'gemini'
              ? settings.geminiApiKey || getGeminiApiKey()
              : settings.provider === 'alibaba'
                ? settings.alibabaApiKey || ''
                : settings.customApiKey || getNvidiaApiKey(),
          geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
          alibabaApiKey: settings.alibabaApiKey || '',
          alibabaBaseUrl: settings.alibabaBaseUrl,
          alibabaModel: cleanAlibabaModel,
          baseUrl:
            settings.provider === 'alibaba'
              ? settings.alibabaBaseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
              : settings.customBaseUrl,
          model: targetModelId,
        },
        maxOutputTokens: 512,
        temperature: 0.2,
        model: targetModelId,
        enableReasoning: false,
        reasoningMode: 'off',
        thinkingBudget: 0,
      }),
    });

    if (!response.ok || !response.body) {
      serverFailed = true;
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          try {
            const parsed = JSON.parse(trimmed.replace(/^data:\s*/, ''));
            if (parsed.text) accumulated += parsed.text;
            if (parsed.error && !accumulated) serverFailed = true;
          } catch {
            // ignore partial SSE line
          }
        }
      }
    }
  } catch {
    serverFailed = true;
  }

  if (serverFailed || !accumulated.trim()) {
    try {
      await executeDirectApiStream({
        messages: [{ id: `sum_${Date.now()}`, role: 'user', content: synthesisPrompt, timestamp: Date.now() }],
        systemInstruction: sysInstruction,
        folderSystemPrompt: '',
        loreContext: '',
        memories: [],
        provider: settings.provider,
        customConfig: {
          apiKey:
            settings.provider === 'gemini'
              ? settings.geminiApiKey || getGeminiApiKey()
              : settings.provider === 'alibaba'
                ? settings.alibabaApiKey || ''
                : settings.customApiKey || getNvidiaApiKey(),
          baseUrl:
            settings.provider === 'alibaba'
              ? settings.alibabaBaseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
              : settings.customBaseUrl,
          model: targetModelId,
        },
        maxOutputTokens: 512,
        temperature: 0.2,
        model: targetModelId,
        enableReasoning: false,
        reasoningMode: 'off',
        thinkingBudget: 0,
        onChunk: (txt) => {
          if (txt) accumulated += txt;
        },
      });
    } catch {
      // Fallback to local smart sentence extraction if network/API is unreachable
    }
  }

  const cleanedAI = accumulated
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<\/?(?:think|thought|reasoning|cot)[^>]*>/gi, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}✨🔥☕👋]/gu, '')
    .trim();

  if (cleanedAI.length >= 15) {
    return cleanedAI;
  }

  return buildRollingSessionSummary(messagesToSummarize);
}


