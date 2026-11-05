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
  targetKey: 'max-0902' | '2.4-a95b' | 'kimi-k3' | 'flash' | '3.8-plus' | '3.7-plus' | 'deepseek-pro-0813' | 'deepseek-flash'
): string {
  const fetched = Array.isArray(settings.fetchedAlibabaModels)
    ? settings.fetchedAlibabaModels.map((m) => m.id)
    : [];

  if (targetKey === 'deepseek-pro-0813') {
    const exact0813 = fetched.find((id) => /deepseek.*(v4.*pro.*0813|pro.*0813|v4-pro-0813)/i.test(id));
    if (exact0813) return exact0813;
    const anyPro = fetched.find((id) => /deepseek.*v4.*pro/i.test(id));
    if (anyPro) return anyPro;
    return 'deepseek-v4-pro-0813';
  }

  if (targetKey === 'deepseek-flash') {
    const exactFlash = fetched.find((id) => /deepseek.*(v4\.1.*flash.*1017|flash.*1017|v4\.1-flash)/i.test(id));
    if (exactFlash) return exactFlash;
    const anyFlash = fetched.find((id) => /deepseek.*(v4.*flash|flash)/i.test(id));
    if (anyFlash) return anyFlash;
    return 'deepseek-v4.1-flash-1017';
  }

  if (targetKey === 'max-0902') {
    const exact0902 = fetched.find((id) => /3\.8.*max.*0902|max.*0902/i.test(id));
    if (exact0902) return exact0902;
    const any38Max = fetched.find((id) => /qwen3\.8-max/i.test(id));
    if (any38Max) return any38Max;
    return 'qwen3.8-max-0902';
  }

  if (targetKey === '2.4-a95b') {
    const exactA95b = fetched.find((id) => /a95b|2\.4-a95b/i.test(id));
    if (exactA95b) return exactA95b;
    return 'qwen3.8-2.4-a95b';
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

  if (targetKey === '3.8-plus') {
    const exact38Plus = fetched.find((id) => /^qwen3\.8-plus$/i.test(id));
    if (exact38Plus) return exact38Plus;
    return 'qwen3.8-plus';
  }

  if (targetKey === '3.7-plus') {
    const exact37Plus = fetched.find((id) => /3\.7.*plus/i.test(id));
    if (exact37Plus) return exact37Plus;
    return 'qwen3.7-plus';
  }

  return 'deepseek-v4-pro-0813';
}

/**
 * Analyzes the user's message and attachments to automatically route the turn
 * between Qwen3.8-Max 0902, Qwen3.8-2.4-A95b, Kimi K3, Qwen3.8-Plus, Qwen3.8-Flash, and Qwen3.7-Plus.
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
    (settings.alibabaApiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('kizuna_alibaba_api_key') : '') || '').trim()
  );
  const hasNvidiaKey = Boolean(
    (settings.customApiKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('kizuna_nvidia_key') || localStorage.getItem('kizuna_custom_api_key')) : '') || '').trim()
  );

  const isInstantMode = settings.reasoningMode === 'off' || settings.enableReasoning === false;

  // Seamless Gemini Fallback: If no Alibaba API key is configured, route exclusively within Google Gemini (or custom if active)
  if (!hasAlibabaKey) {
    if (hasNvidiaKey && settings.provider === 'custom') {
      const customTarget = settings.customModel?.trim() || 'stepfun-ai/step-5-preview';
      return {
        provider: 'custom',
        modelId: customTarget,
        modelLabel: settings.customModel?.split('/').pop() || 'Custom Model',
        reason: 'Modo Automático: Enrutado a tu proveedor personalizado activo.',
        recommendedReasoningMode: isInstantMode ? 'off' : 'light',
      };
    }

    if (hasImages) {
      return {
        provider: 'gemini',
        modelId: 'gemini-3.8-flash',
        modelLabel: 'Gemini 3.8 Flash (Visión)',
        reason: 'Modo Automático: Imagen detectada; enrutado a Gemini 3.8 Flash multimodal de Google.',
        recommendedReasoningMode: 'deep',
      };
    }

    if (isInstantMode || isCasualGreeting(cleanText) || charLen < 90) {
      return {
        provider: 'gemini',
        modelId: 'gemini-3.8-flash',
        modelLabel: 'Gemini 3.8 Flash (Instantáneo)',
        reason: 'Modo Automático: Respuesta rápida y ágil con Gemini Flash.',
        recommendedReasoningMode: 'off',
      };
    }

    const isComplexQuery =
      /\b(audita|inconsistencia|contradicci|coherencia|arqui|facciones|worldbuilding|redacta|escribe|cap[íi]tulo)\b/i.test(lower) ||
      charLen > 380;

    if (isComplexQuery) {
      return {
        provider: 'gemini',
        modelId: 'gemini-3.1-pro-preview',
        modelLabel: 'Gemini 3.1 Pro (Razonamiento)',
        reason: 'Modo Automático: Tarea creativa o analítica compleja asignada a Gemini 3.1 Pro.',
        recommendedReasoningMode: 'deep',
      };
    }

    return {
      provider: 'gemini',
      modelId: settings.geminiModel || 'gemini-3.8-flash',
      modelLabel: 'Gemini 3.8 Flash',
      reason: 'Modo Automático: Consulta asignada a Google Gemini.',
      recommendedReasoningMode: 'light',
    };
  }

  const defaultProvider: 'alibaba' | 'custom' =
    settings.provider === 'custom' && hasNvidiaKey ? 'custom' : 'alibaba';

  // 0. Explicit Instant Mode (0s) -> Route directly to Qwen 3.8 Flash / Plus without CoT delay
  if (isInstantMode && !hasImages) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, hasDocuments || charLen > 320 ? '3.8-plus' : 'flash'),
      modelLabel: hasDocuments || charLen > 320 ? 'Qwen 3.8 Plus (Instantáneo)' : 'Qwen 3.8 Flash (Instantáneo)',
      reason: 'Modo Instantáneo (0s): Respuesta directa de baja latencia sin cadena de pensamiento.',
      recommendedReasoningMode: 'off',
    };
  }

  // 1. Continuation of a literary scene or chapter -> Qwen3.8-Max 0902
  if (isContinuationTurn) {
    return {
      provider: defaultProvider === 'custom' ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'max-0902'),
      modelLabel: 'Qwen 3.8 Max 0902',
      reason: 'Modo Automático: Continuación narrativa de escena asignada a Qwen 3.8 Max 0902.',
      recommendedReasoningMode: isInstantMode ? 'off' : 'light',
    };
  }

  // 2. Multimodal Image Analysis -> Kimi K3 / StepFun (Visión)
  if (hasImages) {
    const useAlibabaForKimi = hasAlibabaKey || settings.provider === 'alibaba';
    const customTarget = settings.customModel?.trim() || 'stepfun-ai/step-5-preview';
    const customLabel = settings.customModel?.trim() ? (settings.customModel.split('/').pop() || 'StepFun 5') : 'Step 5 Preview (Visión)';
    return {
      provider: useAlibabaForKimi ? 'alibaba' : hasNvidiaKey ? 'custom' : defaultProvider,
      modelId: useAlibabaForKimi ? resolveAlibabaModelId(settings, 'kimi-k3') : customTarget,
      modelLabel: useAlibabaForKimi ? 'Kimi K3 (Visión)' : customLabel,
      reason: 'Modo Automático: Imagen detectada en contexto; enrutado a modelo multimodal con CoT.',
      recommendedReasoningMode: 'deep',
    };
  }

  // 3. Auditoría de Lore, Canon, Inconsistencias y Coherencia Lógica -> DeepSeek V4 Pro 0813 (1.6T MoE, $0.66/1M)
  const loreAuditPattern =
    /\b(audita|auditoría|auditoria|inconsistencia|contradicción|contradiccion|revisa el canon|coherencia|revisión crítica|revision critica|fallo de trama|agujero de guion|agujero de guión|error de continuidad|evalúa la lógica|evalua la logica|auditor)\b/i;

  if (loreAuditPattern.test(lower)) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'deepseek-pro-0813'),
      modelLabel: 'DeepSeek V4 Pro 0813',
      reason: 'Modo Automático: Auditoría de canon, coherencia e inconsistencias asignada a DeepSeek V4 Pro 0813 (1.6T MoE, $0.66/1M).',
      recommendedReasoningMode: 'deep',
    };
  }

  // 4. Instrucción Narrativa, Escaleta, Arcos Dramáticos & Arquitectura de Novela -> DeepSeek V4 Pro 0813
  const narrativeInstructionPattern =
    /\b(instrucción narrativa|instruccion narrativa|escaleta|arco dramático|arco dramatico|estructura del capítulo|estructura del capitulo|arquitectura de deseos|catarsis|diseño de escena|beat sheet|puntos de giro|clímax|climax|planificación del arco|planificacion del arco|guía narrativa|guia narrativa)\b/i;

  if (narrativeInstructionPattern.test(lower)) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'deepseek-pro-0813'),
      modelLabel: 'DeepSeek V4 Pro 0813',
      reason: 'Modo Automático: Instrucción y arquitectura narrativa asignada a DeepSeek V4 Pro 0813 (1.6T MoE, titán editorial).',
      recommendedReasoningMode: 'deep',
    };
  }

  // 5. Diálogos con Subtexto, Tensión Psicológica y Voces de Personajes -> DeepSeek V4 Pro 0813
  const dialogueSubtextPattern =
    /\b(subtexto|diálogo|dialogo|diálogos|dialogos|discusión|discusion|conversación entre|conversacion entre|tensión entre|tension entre|interacción psicológica|interaccion psicologica|voz de kolder|voz de hinistra|voz de jukkou|voz de zankyou|voz de gurasha|monólogo interior|monologo interior|enfrentamiento verbal)\b/i;

  if (dialogueSubtextPattern.test(lower) && !/\b(resumen|ficha|hola)\b/i.test(lower)) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'deepseek-pro-0813'),
      modelLabel: 'DeepSeek V4 Pro 0813',
      reason: 'Modo Automático: Diálogo con subtexto y tensión psicológica asignado a DeepSeek V4 Pro 0813 (1.6T MoE).',
      recommendedReasoningMode: 'deep',
    };
  }

  // 6. Deep Analytical / Code / Math / Complex Deduction -> Kimi K3
  const deepAnalyticalPattern =
    /\b(código|codigo|bug|función|funcion|typescript|react|algoritmo|arquitectura de software|compara|comparación|deduce|demuestra|calcula|matemática|por qué exactamente|por que exactamente)\b/i;

  if (deepAnalyticalPattern.test(lower)) {
    const useAlibabaForKimi = hasAlibabaKey || settings.provider === 'alibaba';
    const customTarget = settings.customModel?.trim() || 'stepfun-ai/step-5-preview';
    const customLabel = settings.customModel?.trim() ? (settings.customModel.split('/').pop() || 'StepFun 5') : 'Step 5 Preview (NVIDIA)';
    return {
      provider: useAlibabaForKimi ? 'alibaba' : hasNvidiaKey ? 'custom' : defaultProvider,
      modelId: useAlibabaForKimi ? resolveAlibabaModelId(settings, 'kimi-k3') : customTarget,
      modelLabel: useAlibabaForKimi ? 'Kimi K3' : customLabel,
      reason: 'Modo Automático: Razonamiento técnico o deducción matemática.',
      recommendedReasoningMode: 'deep',
    };
  }

  // 7. Complex Worldbuilding Mechanics, Factions, Multi-Character Dynamics & Dense Lore Systems -> Qwen3.8-2.4-A95B
  const moeArchitecturePattern =
    /\b(a95b|sistema de magia|mecánica|mecanica|jerarquía|jerarquia|facciones|facción|faccion|política|politica|geopolítica|cronología|cronologia|línea temporal|linea temporal|árbol genealógico|batalla|combate|táctica|tactica|coreografía|coreografia|múltiples personajes|varios personajes|construcción de mundo|worldbuilding|skarnita|red de relaciones|ecosistema|mitología|mitologia)\b/i;

  if (moeArchitecturePattern.test(lower) || (charLen > 240 && /\b(lore|canon|bóveda|boveda|monstereth|teshuvana|tedriot)\b/i.test(lower) && !/\b(escribe el capítulo|redacta la escena)\b/i.test(lower))) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, '2.4-a95b'),
      modelLabel: 'Qwen 3.8 2.4-A95B',
      reason: 'Modo Automático: Arquitectura de Lore, sistemas o dinámica compleja asignada a Qwen 3.8 2.4-A95B (MoE).',
      recommendedReasoningMode: 'deep',
    };
  }

  // 7.5. Opinion, Feedback, Casual Question or Critique ABOUT the Novel -> DeepSeek V4.1 Flash / Qwen 3.8 Flash
  const opinionFeedbackPattern =
    /\b(qué opinas|que opinas|qué te parece|que te parece|está buena|esta buena|está bueno|esta bueno|te gusta|dame tu opinión|dame tu opinion|dame feedback|feedback|crítica|critica|te llama la atención|te llama la atencion|cómo la ves|como la ves|qué piensas|que piensas|es buen título|es buen titulo|opinión sobre|opinion sobre)\b/i;

  if (opinionFeedbackPattern.test(lower)) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'deepseek-flash'),
      modelLabel: 'DeepSeek V4.1 Flash 1017',
      reason: 'Modo Automático: Consulta de opinión o feedback sobre tu obra asignada a DeepSeek V4.1 Flash (ágil y económico).',
      recommendedReasoningMode: 'light',
    };
  }

  // 8. Creative Writing, Full Novel Chapters, Dense Literary Prose -> Qwen3.8-Max 0902
  const explicitGenerationPattern =
    /\b(escribe|redacta|narra|reescribe|continúa|continua|crea un capítulo|crea un capitulo|desarrolla la escena|redactar|escribir)\b/i;

  if (
    (explicitGenerationPattern.test(lower) && !opinionFeedbackPattern.test(lower)) ||
    (charLen > 520 || wordCount > 95)
  ) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'max-0902'),
      modelLabel: 'Qwen 3.8 Max 0902',
      reason:
        charLen > 520
          ? 'Modo Automático: Prompt literario extenso asignado a Qwen 3.8 Max 0902.'
          : 'Modo Automático: Redacción de escena o prosa principal asignada a Qwen 3.8 Max 0902.',
      recommendedReasoningMode: 'deep',
    };
  }

  // 9. Co-agente Ágil para Novela Ligera (Borradores rápidos, lluvia de ideas, esquema veloz en ráfaga junto a Flash) -> DeepSeek V4.1 Flash (552B MoE, $0.15/1M)
  const coAgentDraftPattern =
    /\b(borrador rápido|borrador rapido|ayúdame a pensar|ayudame a pensar|ideas rápidas|ideas rapidas|brainstorm|tirame ideas|tírame ideas|qué se te ocurre|que se te ocurre|co-agente|coagente|agente de novela|esquema rápido|esquema rapido|sugerencias rápidas|sugerencias rapidas|propón alternativas|propon alternativas)\b/i;

  if (coAgentDraftPattern.test(lower)) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, 'deepseek-flash'),
      modelLabel: 'DeepSeek V4.1 Flash 1017',
      reason: 'Modo Automático: Co-agente ágil para novela ligera asignado a DeepSeek V4.1 Flash (552B MoE, $0.15/1M).',
      recommendedReasoningMode: 'light',
    };
  }

  // 10. Long Context Synthesis, Attached Documents, Character Sheets -> Qwen3.8-Plus
  const plusSynthesisPattern =
    /\b(ficha|perfil|resumen detallado|sintetiza|síntesis|sintesis|desglose|documentación|documentacion|contexto completo|explica en detalle|desarrolla)\b/i;

  if (hasDocuments || plusSynthesisPattern.test(lower) || (charLen > 180 && charLen <= 420)) {
    return {
      provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
      modelId: resolveAlibabaModelId(settings, '3.8-plus'),
      modelLabel: 'Qwen 3.8 Plus',
      reason: hasDocuments
        ? 'Modo Automático: Documento adjunto en contexto (1M) asignado a Qwen 3.8 Plus.'
        : 'Modo Automático: Síntesis estructurada o desarrollo de contexto asignado a Qwen 3.8 Plus.',
      recommendedReasoningMode: 'light',
    };
  }

  // 11. Fast / Short / Casual / Direct Queries -> Qwen3.8-Flash
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

  // 12. Intermediate / Balanced Tasks -> Qwen3.7-Plus
  return {
    provider: defaultProvider === 'custom' && hasAlibabaKey ? 'alibaba' : defaultProvider,
    modelId: resolveAlibabaModelId(settings, '3.7-plus'),
    modelLabel: 'Qwen 3.7 Plus',
    reason: 'Modo Automático: Consulta balanceada o desarrollo equilibrado asignado a Qwen 3.7 Plus.',
    recommendedReasoningMode: 'light',
  };
}
