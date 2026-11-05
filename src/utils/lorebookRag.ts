import { LoreFile, Message } from '../types';
import { estimateTokenCount } from './documentParser';

export interface LoreRagItemStatus {
  file: LoreFile;
  isInjected: boolean;
  score: number;
  matchedTerms: string[];
  reason: string;
  estimatedTokens: number;
}

export interface LoreRagFilterResult {
  injectedFiles: LoreFile[];
  skippedFiles: LoreFile[];
  itemStatuses: LoreRagItemStatus[];
  totalSelectedTokens: number;
  injectedRawTokens: number;
  savedTokens: number;
  activeQueryTerms: string[];
  ragActive: boolean;
}

const SPANISH_STOPWORDS = new Set([
  'como', 'para', 'este', 'esta', 'estos', 'estas', 'entre', 'hasta', 'desde',
  'todos', 'todas', 'todo', 'toda', 'pero', 'porque', 'cuando', 'donde', 'quien',
  'cual', 'cuales', 'sobre', 'bajo', 'ante', 'contra', 'hacia', 'segun', 'durante',
  'mediante', 'tiene', 'tienen', 'habia', 'hacer', 'hace', 'hecho', 'puede', 'pueden',
  'quiero', 'queres', 'podes', 'decir', 'dice', 'dijo', 'mismo', 'misma', 'otros',
  'otras', 'algo', 'nada', 'mucho', 'poco', 'muy', 'mas', 'menos', 'solo', 'tambien',
  'ademas', 'entonces', 'luego', 'despues', 'antes', 'ahora', 'siempre', 'nunca',
  'escena', 'capitulo', 'capitulos', 'texto', 'parte', 'forma', 'manera', 'mundo',
  'historia', 'novela', 'personaje', 'personajes', 'momento', 'tiempo', 'lugar',
]);

export function normalizeRagText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function extractExplicitChapterNumbersFromNormalized(normalized: string): number[] {
  const chapterSet = new Set<number>();

  // 1. Rangos explícitos: "capitulos 10 hasta el 20", "del capitulo 10 al 20", "cap 10 a 20", "caps 10-20", "entre el 10 y el 20", "del 10 al 20"
  const rangePatterns = [
    /\b(?:cap(?:itulos?)?|chapters?|actos?|partes?|episodios?)\s*(?:del\s*)?#?(\d+)\s*(?:al|hasta(?:\s+el)?|a|-|–|—|y(?:\s+el)?)\s*#?(\d+)\b/g,
    /\b(?:del|desde\s+el|entre\s+el)\s+(?:cap(?:itulo)?\s*)?#?(\d+)\s+(?:al|hasta(?:\s+el)?|a|y\s+el)\s+(?:cap(?:itulo)?\s*)?#?(\d+)\b/g,
  ];

  for (const pattern of rangePatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      if (!Number.isNaN(start) && !Number.isNaN(end) && start > 0 && end >= start && end - start <= 40) {
        for (let c = start; c <= end; c++) {
          chapterSet.add(c);
        }
      }
    }
  }

  // 2. Listas tras la palabra capítulo(s): ej. "capitulos 4, 7 y 12"
  for (const listMatch of normalized.matchAll(/\b(?:cap(?:itulos?)?|chapters?|episodios?)\s+((?:#?\d+(?:\s*(?:,|y|e|o)\s*)?)+)/g)) {
    const numsBlock = listMatch[1] || '';
    for (const numMatch of numsBlock.matchAll(/\b(\d+)\b/g)) {
      const n = parseInt(numMatch[1], 10);
      if (!Number.isNaN(n) && n > 0 && n <= 500) {
        chapterSet.add(n);
      }
    }
  }

  // 3. Menciones individuales: "capitulo 10", "cap 15", "acto 2"
  for (const singleMatch of normalized.matchAll(/\b(?:cap(?:itulos?)?|chapters?|actos?|partes?|episodios?)\s*#?(\d+)\b/g)) {
    const n = parseInt(singleMatch[1], 10);
    if (!Number.isNaN(n) && n > 0 && n <= 500) {
      chapterSet.add(n);
    }
  }

  return Array.from(chapterSet).sort((a, b) => a - b);
}

/**
 * Extrae términos clave y etiquetas semánticas de la consulta actual y los últimos turnos.
 */
export function extractSceneQueryTerms(
  userQuery: string,
  recentMessages: Message[] = []
): {
  terms: string[];
  explicitChapters: number[];
  asksPrologue: boolean;
  asksEpilogue: boolean;
  isGlobalOverview: boolean;
  combinedSceneNormalized: string;
} {
  // Tomamos el input actual + los últimos 3 mensajes de la conversación para contexto de escena
  const recentSnippet = recentMessages
    .slice(-3)
    .map((m) => (m.content || '').slice(-600))
    .join(' ');

  const combinedRaw = `${userQuery || ''} ${recentSnippet}`.trim();
  const normalized = normalizeRagText(combinedRaw);
  const directQueryNormalized = normalizeRagText(userQuery || '');

  // Priorizar capítulos explícitos pedidos en el mensaje actual; si no hay, mirar el contexto inmediato
  const directChapters = extractExplicitChapterNumbersFromNormalized(directQueryNormalized);
  const explicitChapters =
    directChapters.length > 0
      ? directChapters
      : extractExplicitChapterNumbersFromNormalized(normalized);

  const asksPrologue = /\b(?:prologo|inicio|comienzo|apertura)\b/.test(normalized);
  const asksEpilogue = /\b(?:epilogo|final|cierre|desenlace)\b/.test(normalized);
  const isGlobalOverview =
    /\b(?:todos los capitulos|toda la novela|evolucion completa|principio a fin|resumen general|arco completo)\b/.test(
      normalized
    );

  // Priorizar palabras de la consulta directa del usuario, seguidas de entidades de la escena reciente
  const rawWords = normalized
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !SPANISH_STOPWORDS.has(w) && !/^\d+$/.test(w));

  const uniqueTerms: string[] = [];
  const seen = new Set<string>();
  for (const w of rawWords) {
    if (!seen.has(w)) {
      seen.add(w);
      uniqueTerms.push(w);
    }
    if (uniqueTerms.length >= 28) break;
  }

  return {
    terms: uniqueTerms,
    explicitChapters,
    asksPrologue,
    asksEpilogue,
    isGlobalOverview,
    combinedSceneNormalized: normalized,
  };
}

/**
 * Filtro Dinámico de Lorebook / RAG Ligero.
 * Compara por palabras clave, nombres propios, números de capítulo y etiquetas semánticas
 * para inyectar únicamente las fichas/documentos del Lorebook relevantes para la escena actual.
 */
export function filterLoreByDynamicRag(
  selectedLoreFiles: LoreFile[],
  userQuery: string,
  recentMessages: Message[] = [],
  enableRag: boolean = true,
  maxInjectedDocs: number = 8
): LoreRagFilterResult {
  const totalSelectedTokens = selectedLoreFiles.reduce(
    (sum, f) => sum + (f.estimatedTokens || estimateTokenCount(f.content)),
    0
  );

  // Si el filtro RAG está desactivado o hay 2 o menos documentos seleccionados, inyectar todos directamente
  if (!enableRag || selectedLoreFiles.length <= 2) {
    const statuses: LoreRagItemStatus[] = selectedLoreFiles.map((file) => ({
      file,
      isInjected: true,
      score: 100,
      matchedTerms: [],
      reason: !enableRag
        ? 'Inyección total activa (Filtro RAG desactivado)'
        : 'Documento base activo (<= 2 fichas en contexto)',
      estimatedTokens: file.estimatedTokens || estimateTokenCount(file.content),
    }));

    return {
      injectedFiles: selectedLoreFiles,
      skippedFiles: [],
      itemStatuses: statuses,
      totalSelectedTokens,
      injectedRawTokens: totalSelectedTokens,
      savedTokens: 0,
      activeQueryTerms: [],
      ragActive: Boolean(enableRag),
    };
  }

  const {
    terms,
    explicitChapters,
    asksPrologue,
    asksEpilogue,
    isGlobalOverview,
  } = extractSceneQueryTerms(userQuery, recentMessages);

  // Ordenar para identificar el último capítulo cronológico y fichas maestras
  const sortedByOrder = [...selectedLoreFiles].sort((a, b) => {
    const fnA = a.filename || a.title || '';
    const fnB = b.filename || b.title || '';
    const numA = parseInt(fnA.match(/^\d+/)?.[0] || a.title.match(/\b(\d+)\b/)?.[1] || '9999', 10);
    const numB = parseInt(fnB.match(/^\d+/)?.[0] || b.title.match(/\b(\d+)\b/)?.[1] || '9999', 10);
    if (numA !== numB) return numA - numB;
    return fnA.localeCompare(fnB);
  });

  const latestChronologicalId = sortedByOrder[sortedByOrder.length - 1]?.id;

  const scoredItems: LoreRagItemStatus[] = selectedLoreFiles.map((file) => {
    const estTokens = file.estimatedTokens || estimateTokenCount(file.content);
    const normTitle = normalizeRagText(file.title || '');
    const normFilename = normalizeRagText(file.filename || '');
    const normContent = normalizeRagText(file.content || '');

    let score = 0;
    const matchedTerms: string[] = [];
    const reasons: string[] = [];

    // 1. Imágenes de lore siempre se conservan si están marcadas
    if (file.fileType === 'image') {
      return {
        file,
        isInjected: true,
        score: 95,
        matchedTerms: ['imagen'],
        reason: 'Referencia visual activa',
        estimatedTokens: estTokens,
      };
    }

    // 2. Fichas maestras de canon / portada / reglas siempre tienen prioridad base
    const isCanonSheet =
      /\b(?:ficha|canon|biblia|reglas|sistema|personajes|glosario|portada|worldbuilding)\b/.test(
        normTitle
      ) && estTokens < 4500;
    if (isCanonSheet) {
      score += 45;
      reasons.push('Ficha canónica base');
    }

    // 3. Coincidencia explícita de número de capítulo
    const chapMatch =
      normTitle.match(/\b(?:cap(?:itulo)?|chapter|acto|parte)\s*#?(\d+)\b/) ||
      normFilename.match(/^(\d+)_/) ||
      normTitle.match(/\b(\d+)\b/);
    const fileChapNum = chapMatch ? parseInt(chapMatch[1], 10) : -1;

    if (fileChapNum !== -1 && explicitChapters.includes(fileChapNum)) {
      score += 150;
      matchedTerms.push(`Cap. ${fileChapNum}`);
      reasons.push(`Mención directa al Capítulo ${fileChapNum}`);
    }

    if (asksPrologue && /\bprologo\b/.test(normTitle)) {
      score += 130;
      matchedTerms.push('Prólogo');
      reasons.push('Mención directa al Prólogo');
    }

    if (asksEpilogue && /\bepilogo\b/.test(normTitle)) {
      score += 130;
      matchedTerms.push('Epílogo');
      reasons.push('Mención directa al Epílogo');
    }

    // 4. Coincidencia semántica y por palabras clave en Título y Contenido
    for (const term of terms) {
      let termMatched = false;
      if (normTitle.includes(term) || normFilename.includes(term)) {
        score += 35;
        termMatched = true;
      }
      // Búsqueda rápida de frecuencia en el cuerpo de la ficha
      const firstIdx = normContent.indexOf(term);
      if (firstIdx !== -1) {
        const occurrences = Math.min(6, normContent.split(term).length - 1);
        score += 8 + occurrences * 4;
        termMatched = true;
      }
      if (termMatched && matchedTerms.length < 5 && !matchedTerms.includes(term)) {
        matchedTerms.push(term);
      }
    }

    if (matchedTerms.length > 0 && reasons.length === 0) {
      reasons.push(`Coincidencia semántica (${matchedTerms.slice(0, 3).join(', ')})`);
    }

    // 5. Bonificación de continuidad al último capítulo cronológico
    if (file.id === latestChronologicalId) {
      score += 28;
      if (reasons.length === 0) {
        reasons.push('Último capítulo activo por continuidad');
      }
    }

    if (isGlobalOverview) {
      score += 25;
      if (reasons.length === 0) {
        reasons.push('Consulta de visión global');
      }
    }

    return {
      file,
      isInjected: false,
      score,
      matchedTerms,
      reason: reasons.join(' · ') || 'Sin coincidencia en la escena actual (En espera)',
      estimatedTokens: estTokens,
    };
  });

  // Ordenar de mayor a menor relevancia para seleccionar las fichas activas del turno
  const sortedByScore = [...scoredItems].sort((a, b) => b.score - a.score);
  const effectiveMaxDocs =
    explicitChapters.length > 0
      ? Math.max(maxInjectedDocs, Math.min(35, explicitChapters.length + 2))
      : maxInjectedDocs;

  const injectedIds = new Set<string>();
  for (const item of sortedByScore) {
    if (item.file.fileType === 'image') {
      injectedIds.add(item.file.id);
      continue;
    }
    if (injectedIds.size < effectiveMaxDocs && item.score >= 22) {
      injectedIds.add(item.file.id);
    }
  }

  // Fallback de seguridad: si ninguna ficha superó el umbral (ej. saludo breve o consulta abstracta),
  // inyectar las 2 fichas con mayor puntaje (ej. ficha canónica + último capítulo)
  if (injectedIds.size === 0 && sortedByScore.length > 0) {
    for (const item of sortedByScore.slice(0, Math.min(2, sortedByScore.length))) {
      injectedIds.add(item.file.id);
      item.reason = 'Ancla de continuidad por defecto';
    }
  }

  const finalStatuses: LoreRagItemStatus[] = scoredItems.map((item) => {
    const injected = injectedIds.has(item.file.id);
    return {
      ...item,
      isInjected: injected,
      reason: injected
        ? item.reason
        : 'Omitido en este turno por Filtro RAG (0 menciones en escena)',
    };
  });

  const injectedFiles = selectedLoreFiles.filter((f) => injectedIds.has(f.id));
  const skippedFiles = selectedLoreFiles.filter((f) => !injectedIds.has(f.id));

  const injectedRawTokens = injectedFiles.reduce(
    (sum, f) => sum + (f.estimatedTokens || estimateTokenCount(f.content)),
    0
  );
  const savedTokens = Math.max(0, totalSelectedTokens - injectedRawTokens);

  return {
    injectedFiles,
    skippedFiles,
    itemStatuses: finalStatuses,
    totalSelectedTokens,
    injectedRawTokens,
    savedTokens,
    activeQueryTerms: terms.slice(0, 10),
    ragActive: true,
  };
}
