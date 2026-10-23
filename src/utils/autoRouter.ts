import { AppSettings, Attachment } from '../types';
import { isCasualGreeting } from '../services/apiService';

export interface AutoRouteDecision {
  provider: 'alibaba' | 'custom' | 'gemini';
  modelId: string;
  modelLabel: string;
  reason: string;
  recommendedReasoningMode: 'off' | 'light' | 'deep';
}

/**
 * Resolves the exact model ID available in the user's Alibaba Cloud workspace
 * if fetched models are cached, or returns the canonical model ID.
 */
function resolveAlibabaModelId(
  settings: AppSettings,
  targetKey: 'max-0902' | 'kimi-k3' | 'flash' | '3.7-plus'
): string {
  const fetched = Array.isArray(settings.fetchedAlibabaModels)
    ? settings.fetchedAlibabaModels.map((m) => m.id)
    : [];

  if (targetKey === 'max-0902') {
    const exact0902 = fetched.find((id) => /3\.8.*max.*0902|max.*0902/i.test(id));
    if (exact0902) return exact0902;
    const any38Max = fetched.find((id) => /qwen3\.8-max/i.test(id));
    if (any38Max) return any38Max;
    return 'qwen3.8-max-0902';
  }

  if (targetKey === 'kimi-k3') {
    const exactKimi = fetched.find((id) => /^kimi-k3$|^kimi\/kimi-k3$/i.test(id));
    if (exactKimi) return exactKimi;
    return 'kimi-k3';
  }

  if (targetKey === 'flash') {
    const exactFlash = fetched.find((id) => /^qwen3\.8-flash$/i.test(id));
    if (exactFlash) return exactFlash;
    return 'qwen3.8-flash';
  }

  if (targetKey === '3.7-plus') {
    const exact37Plus = fetched.find((id) => /3\.7.*plus/i.test(id));
    if (exact37Plus) return exact37Plus;
    const anyPlus = fetched.find((id) => /qwen3\.8-plus|qwen-plus/i.test(id));
    if (anyPlus) return anyPlus;
    return 'qwen3.7-plus';
  }

  return 'qwen3.8-max-0902';
}

/**
 * Analyzes the user's message and attachments to automatically route the turn
 * between Qwen3.8-Max 0902, Kimi K3, Qwen3.8-Flash, and Qwen3.7-Plus.
 */
export function resolveAutoRoutedModel(
  userContent: string,
  attachments: Attachment[] = [],
  settings: AppSettings,
  isContinuationTurn: boolean = false
): AutoRouteDecision {
  const cleanText = (userContent || '').trim();
  const lower = cleanText.toLowerCase();
  const charLen = cleanText.length;
  const wordCount = cleanText ? cleanText.split(/\s+/).length : 0;

  const hasImages = attachments.some(
    (a) => a.type?.startsWith('image/') || a.fileType === 'image'
  );
  const hasDocuments = attachments.some(
    (a) => a.fileType && a.fileType !== 'image'
  );

  const hasAlibabaKey = Boolean(
    (settings.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim()
  );
  const hasNvidiaKey = Boolean(
    (settings.customApiKey || localStorage.getItem('kizuna_custom_api_key') || '').trim()
  );

  const defaultProvider: 'alibaba' | 'custom' | 'gemini' = hasAlibabaKey
    ? 'alibaba'
    : hasNvidiaKey
      ? 'custom'
      : settings.provider;

  // 1. Continuation of a literary scene or chapter -> Qwen3.8-Max 0902
  if (isContinuationTurn) {
    return {
      provider: defaultProvider === 'custom' ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'max-0902'),
      modelLabel: 'Qwen 3.8 Max 0902',
      reason: 'Modo Automático: Continuación narrativa de escena asignada a Qwen 3.8 Max 0902.',
      recommendedReasoningMode: 'light',
    };
  }

  // 2. Multimodal Image Analysis or Deep Analytical / Logical / Code / Audit Task -> Kimi K3
  const analyticalPattern =
    /\b(analiza|audita|auditoría|auditoria|inconsistencia|contradicción|contradiccion|lógica|logica|por qué|por que|evalúa|evalua|estructura argumental|subtexto|psicología|psicologia|código|codigo|bug|función|funcion|typescript|react|algoritmo|arquitectura|compara|comparación|estrategia|deduce|demuestra|calcula|matemática|critica|crítica|revisa a fondo)\b/i;

  if (hasImages || analyticalPattern.test(lower)) {
    const useAlibabaForKimi = hasAlibabaKey || settings.provider === 'alibaba';
    return {
      provider: useAlibabaForKimi ? 'alibaba' : hasNvidiaKey ? 'custom' : defaultProvider,
      modelId: useAlibabaForKimi ? resolveAlibabaModelId(settings, 'kimi-k3') : 'moonshotai/kimi-k3',
      modelLabel: 'Kimi K3',
      reason: hasImages
        ? 'Modo Automático: Imagen detectada en contexto; enrutado a Kimi K3 (Visión + CoT).'
        : 'Modo Automático: Consulta de análisis profundo, lógica o auditoría asignada a Kimi K3.',
      recommendedReasoningMode: 'deep',
    };
  }

  // 3. Creative Writing, Novel Chapters, Lore & Worldbuilding -> Qwen3.8-Max 0902
  const creativeLorePattern =
    /\b(escribe|redacta|narra|capítulo|capitulo|escena|diálogo|dialogo|prosa|novela|manuscrito|reescribe|continúa|continua|lore|bóveda|boveda|canon|kolder|hinistra|tedriot|teshuvana|monstereth|jukkou|zankyou|catarsis|skarnita|gurasha|personaje|ambientación|ambientacion|monólogo|monologo|relato)\b/i;

  if (creativeLorePattern.test(lower) || hasDocuments || charLen > 360 || wordCount > 65) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'max-0902'),
      modelLabel: 'Qwen 3.8 Max 0902',
      reason:
        charLen > 360 || hasDocuments
          ? 'Modo Automático: Prompt extenso o con documento en contexto asignado a Qwen 3.8 Max 0902.'
          : 'Modo Automático: Escritura literaria, escena o consulta de Lore asignada a Qwen 3.8 Max 0902.',
      recommendedReasoningMode: 'deep',
    };
  }

  // 4. Fast / Short / Casual / Direct Queries -> Qwen3.8-Flash
  const fastQueryPattern =
    /\b(rápido|rapido|en corto|breve|dime rápido|hola|buenas|hey|gracias|ok|vale|listo|qué tal|que tal|cómo estás|como estas|buen día|buenas noches)\b/i;

  if (
    isCasualGreeting(cleanText) ||
    (charLen <= 65 && wordCount <= 12 && !/\b(explica|detalla|desarrolla|esquema|resumen)\b/i.test(lower)) ||
    (fastQueryPattern.test(lower) && charLen < 120)
  ) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'flash'),
      modelLabel: 'Qwen 3.8 Flash',
      reason: 'Modo Automático: Mensaje breve o conversacional asignado a Qwen 3.8 Flash para respuesta instantánea.',
      recommendedReasoningMode: 'off',
    };
  }

  // 5. Intermediate / Balanced Tasks (Brainstorming, Summaries, Outlines, Medium Prompts) -> Qwen3.7-Plus
  return {
    provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
    modelId: resolveAlibabaModelId(settings, '3.7-plus'),
    modelLabel: 'Qwen 3.7 Plus',
    reason: 'Modo Automático: Consulta de complejidad media o estructuración asignada a Qwen 3.7 Plus.',
    recommendedReasoningMode: 'light',
  };
}
