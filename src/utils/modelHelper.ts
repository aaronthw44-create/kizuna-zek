import { ApiErrorInfo, ErrorDiagnosticInfo } from '../types';

/**
 * Checks if a model ID corresponds to a Vision / Multimodal capable model.
 * Inspects keywords: "vision", "vl", "kimi", "glm", "pixtral", "omni", "gemini", etc.
 */
export function isVisionModel(modelId: string = ''): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  // Pure text Qwen models without -vl, -vision, -omni or -qvq are text-only
  if (lower.includes('qwen') && !lower.includes('vl') && !lower.includes('vision') && !lower.includes('qvq') && !lower.includes('omni')) {
    return false;
  }
  // DeepSeek V4.1 Flash is multimodal (vision + text)
  if (lower.includes('deepseek') && (lower.includes('flash') || lower.includes('v4.1') || lower.includes('4.1'))) {
    return true;
  }
  const visionKeywords = [
    'vision',
    'vl',
    'kimi',
    'glm-4v',
    'pixtral',
    'omni',
    'gemini',
    'llava',
    'internvl',
    'multimodal',
    'qvq',
    'paligemma',
    'florence',
  ];

  return visionKeywords.some((keyword) => lower.includes(keyword));
}

/**
 * Auto-clamps output tokens to safe ceilings based on active model to prevent 400 Bad Request errors.
 */
export function clampMaxTokensForModel(modelId: string = '', requestedTokens: number = 8192): number {
  const req = Number(requestedTokens) || 8192;
  const lower = modelId.toLowerCase();

  // Known strict 2048 token ceiling models
  if (
    lower.includes('nemotron-mini') ||
    lower.includes('phi-3-mini') ||
    lower.includes('tinyllama')
  ) {
    return Math.min(req, 2048);
  }

  // Known 4096 ceiling models (e.g., standard 7B/8B or earlier checkpoints)
  if (
    lower.includes('8b') ||
    lower.includes('7b') ||
    lower.includes('gemma-2-9b') ||
    lower.includes('mistral-7b')
  ) {
    return Math.min(req, 4096);
  }

  // Known 8192 output ceiling models (qwen-max, qwen-plus, qwen-turbo, standard gemini)
  if (/^qwen-(max|plus|turbo)(?!-vl)/i.test(lower) || lower.includes('gemini')) {
    return Math.min(req, 8192);
  }

  // Safe upper ceiling for large creative/reasoning models (Qwen 3.8, Kimi K3, DeepSeek)
  return Math.min(req, 16384);
}

/**
 * Returns dynamic troubleshooting advice based on error details.
 */
export function getTroubleshootingAdvice(info: ApiErrorInfo): string {
  const modelId = info.modelId || info.model || 'Desconocido';
  const isVision = info.isVisionModel ?? isVisionModel(modelId);
  const hadAttachments = info.hadAttachments ?? Boolean(info.hasImages || (info.attachmentsCount && info.attachmentsCount > 0));
  const statusStr = String(info.status || '');
  const errText = (info.rawError || info.message || info.error || '').toLowerCase();

  if (hadAttachments && !isVision) {
    return `⚠️ El modelo seleccionado (${modelId}) no admite análisis visual o multimodal. Cambia a Gemini 3.6 Flash, Qwen 3.8 o Kimi K3.`;
  }
  if (statusStr.includes('429') || errText.includes('rate limit') || errText.includes('quota') || errText.includes('resource_exhausted')) {
    return `⚠️ Se ha alcanzado el límite de cuota (Rate Limit). Espera un momento antes de reintentar.`;
  }
  if (statusStr.includes('503') || errText.includes('high demand') || errText.includes('unavailable') || errText.includes('overloaded')) {
    return `⚠️ Alta demanda en el servicio. Cambia a gemini-3.6-flash para respuesta inmediata.`;
  }
  if (errText.includes('payload too large') || errText.includes('request entity too large') || errText.includes('maximum context length') || errText.includes('range of input length')) {
    return `⚠️ La longitud de entrada superó el límite de contexto del modelo (${modelId}, máx. 30,720 tokens). Usa Qwen 3.8 / Kimi K3 / Gemini 3.6 Flash para manuscritos extensos.`;
  }
  if (statusStr.includes('401') || statusStr.includes('403') || errText.includes('api key') || errText.includes('unauthorized') || errText.includes('invalid key')) {
    return `⚠️ Revisa la clave API o la disponibilidad del servicio.`;
  }
  return `⚠️ Se produjo una falla inesperada durante la generación. Revisa la configuración del modelo o la conectividad.`;
}

/**
 * Generates an elegantly formatted diagnostic report for Google AI Studio.
 */
export function generateDiagnosticPrompt(info: ApiErrorInfo): string {
  const engine = (info.engine || (info.provider === 'alibaba' ? 'alibaba' : info.provider === 'custom' ? 'nvidia' : 'gemini')).toUpperCase();
  const modelId = info.modelId || info.model || 'Default';
  const isVision = info.isVisionModel ?? isVisionModel(modelId);
  const hadAttachments = info.hadAttachments ?? Boolean(info.hasImages || (info.attachmentsCount && info.attachmentsCount > 0));
  const attachmentTypes = info.attachmentTypes || (info.hasImages ? ['imagen'] : []);
  const timestamp = typeof info.timestamp === 'string' ? info.timestamp : new Date(info.timestamp).toLocaleTimeString();
  const status = info.status || 'Fallo de Ejecución';
  const message = info.message || info.error || 'Error de conexión o timeout con la API';
  const rawError = info.rawError || info.error || message;
  const advice = getTroubleshootingAdvice(info);

  return `### Reporte de Error - AI Studio Debug Export
- **Motor**: ${engine}
- **Modelo**: ${modelId} (Visión: ${isVision ? 'Sí' : 'No'})
- **Archivos adjuntos**: ${hadAttachments ? (attachmentTypes.length > 0 ? attachmentTypes.join(', ') : 'Sí') : 'Ninguno'}
- **Hora**: ${timestamp}
- **Estado**: ${status}
- **Mensaje**: ${message}

\`\`\`raw
${rawError}
\`\`\`

**Análisis y Causa Raíz Probable**:
${advice}`;
}
