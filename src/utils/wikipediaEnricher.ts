export interface WikiVisualMatch {
  query: string;
  title: string;
  description: string;
  extract: string;
  thumbnailUrl: string;
  originalImageUrl: string;
  pageUrl: string;
  domainLabel: string;
  lang: 'es' | 'en';
}

// Global in-memory + sessionStorage cache so each term is fetched at most once per session
const wikiCache = new Map<string, WikiVisualMatch | null>();
const inflightRequests = new Map<string, Promise<WikiVisualMatch | null>>();
const SESSION_CACHE_PREFIX = 'kizuna_wiki_summary_v7:';
const WIKI_HEADERS: HeadersInit = {
  Accept: 'application/json',
};

// Purge legacy sessionStorage keys from v2..v6
try {
  if (typeof sessionStorage !== 'undefined') {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (
        k &&
        (k.startsWith('kizuna_wiki_summary_v2:') ||
          k.startsWith('kizuna_wiki_summary_v3:') ||
          k.startsWith('kizuna_wiki_summary_v4:') ||
          k.startsWith('kizuna_wiki_summary_v5:') ||
          k.startsWith('kizuna_wiki_summary_v6:'))
      ) {
        sessionStorage.removeItem(k);
      }
    }
  }
} catch {
  // Ignore storage access errors
}

function readSessionCache(key: string): { hit: boolean; value: WikiVisualMatch | null } {
  if (wikiCache.has(key)) {
    return { hit: true, value: wikiCache.get(key) ?? null };
  }
  try {
    const raw = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${key}`);
    if (raw !== null) {
      const parsed = JSON.parse(raw) as WikiVisualMatch | null;
      wikiCache.set(key, parsed);
      return { hit: true, value: parsed };
    }
  } catch {
    // Ignore sessionStorage quota or private-mode errors
  }
  return { hit: false, value: null };
}

function writeSessionCache(key: string, value: WikiVisualMatch | null): void {
  wikiCache.set(key, value);
  // Only persist non-null matches to sessionStorage so transient network glitches never permanently block a heading
  if (!value) return;
  try {
    sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore sessionStorage quota errors
  }
}

// Headings that are structural/conversational/creative-writing/editorial/somatic markers and should NEVER query Wikipedia on their own
const GENERIC_HEADING_STOPWORDS = new Set([
  'introduccion',
  'conclusion',
  'conclusiones',
  'resumen',
  'sintesis',
  'analisis',
  'contexto',
  'ejemplo',
  'ejemplos',
  'ej',
  'nota',
  'notas',
  'advertencia',
  'importante',
  'paso',
  'pasos',
  'etapa',
  'etapas',
  'fase',
  'fases',
  'escena',
  'escenas',
  'capitulo',
  'capitulos',
  'cap',
  'acto',
  'parte',
  'partes',
  'seccion',
  'opcion',
  'opciones',
  'alternativa',
  'alternativas',
  'ventaja',
  'ventajas',
  'desventaja',
  'desventajas',
  'pros',
  'contras',
  'caracteristica',
  'caracteristicas',
  'detalle',
  'detalles',
  'explicacion',
  'respuesta',
  'respuestas',
  'pregunta',
  'preguntas',
  'solucion',
  'soluciones',
  'codigo',
  'implementacion',
  'resultado',
  'resultados',
  'comparacion',
  'diferencia',
  'diferencias',
  'similitud',
  'similitudes',
  'recomendacion',
  'recomendaciones',
  'consejo',
  'consejos',
  'practico',
  'practica',
  'practicos',
  'practicas',
  'tips',
  'fuentes',
  'referencias',
  'bibliografia',
  'veredicto',
  'diagnostico',
  'objetivo',
  'objetivos',
  'estructura',
  'formato',
  'regla',
  'reglas',
  'instruccion',
  'instrucciones',
  'prompt',
  'personaje',
  'personajes',
  'protagonista',
  'protagonistas',
  'dialogo',
  'dialogos',
  'narrativa',
  'narrativo',
  'narrativos',
  'narrativas',
  'narrador',
  'borrador',
  'correccion',
  'continuacion',
  'epilogo',
  'prologo',
  'quien',
  'que',
  'como',
  'cuando',
  'donde',
  'porque',
  'critica',
  'criticas',
  'posible',
  'posibles',
  'riesgo',
  'riesgos',
  'error',
  'errores',
  'comun',
  'comunes',
  'clave',
  'claves',
  'acierto',
  'aciertos',
  'logro',
  'logros',
  'punto',
  'puntos',
  'fuerte',
  'fuertes',
  'debil',
  'debiles',
  'caracterizacion',
  'subtexto',
  'ritmo',
  'tono',
  'estilo',
  'trama',
  'arco',
  'climax',
  'desenlace',
  'apertura',
  'cierre',
  'lectura',
  'lector',
  'lectores',
  'novela',
  'novelas',
  'obra',
  'obras',
  'texto',
  'escenario',
  'tecnica',
  'tecnicas',
  'recurso',
  'recursos',
  'nivel',
  'niveles',
  'bloque',
  'bloques',
  'mea',
  'culpa',
  'somatico',
  'somatica',
  'somaticos',
  'somaticas',
  'sensorial',
  'sensoriales',
  'silencio',
  'silencios',
  'pausa',
  'pausas',
  'gesto',
  'gestos',
  'mirada',
  'miradas',
  'cuerpo',
  'cuerpos',
  'voz',
  'voces',
  'presencia',
  'contencion',
  'regulacion',
  'vulnerabilidad',
  'tension',
  'atmosfera',
  'inmersion',
  'verosimilitud',
  'cliche',
  'cliches',
  'tropo',
  'tropos',
  'impacto',
  'efecto',
  'peso',
  'economia',
  'arquitectura',
  'contraste',
  'uso',
  'funcion',
  'sentido',
  'valor',
  'fuerza',
  'herida',
  'cicatriz',
  'sombra',
  'mascara',
  'espejo',
  'umbral',
  'abismo',
  'vacio',
  'eco',
  'despertar',
  'caida',
  'redencion',
  'traicion',
  'lealtad',
  'soledad',
  'dolor',
  'miedo',
  'calma',
  'frio',
  'calor',
  'tunel',
  'puente',
  'maquina',
  'expendedora',
  'ciego',
  'ciega',
  'cotidiano',
  'cotidiana',
  'cotidianos',
  'cotidianas',
  'emocional',
  'emocionales',
  'psicologico',
  'psicologica',
  'literario',
  'literaria',
  'prosa',
  'escenografia',
  'simbolismo',
  'metafora',
]);

// Conversational / 2nd-person verbs & pronouns that disqualify a candidate phrase
const CONVERSATIONAL_CANDIDATE_TOKENS = new Set([
  'vos',
  'tu',
  'tus',
  'tuyo',
  'tuya',
  'tuyos',
  'tuyas',
  'contigo',
  'ustedes',
  'mi',
  'mis',
  'mio',
  'mia',
  'nuestro',
  'nuestra',
  'crees',
  'evitaste',
  'hiciste',
  'lograste',
  'escribiste',
  'pusiste',
  'dijiste',
  'pensas',
  'sentis',
  'sientes',
  'falso',
  'falsa',
  'reforzar',
  'mejorar',
  'evitar',
  'aplicar',
  'funciona',
  'importa',
  'significa',
]);

// Fictional canon entities from Monstereth so we don't query real-world Wikipedia for them
const FICTIONAL_LORE_STOPWORDS = new Set([
  'kolder',
  'zekshoyu',
  'hinistra',
  'zupsekia',
  'monstereth',
  'santusma',
  'tedriot',
  'teshuvana',
  'gurasha',
  'skarnita',
  'jukkou',
  'zankyou',
  'kizuna',
  'zek',
  'runico',
  'runica',
]);

const TOKEN_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en',
  'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia', 'hasta', 'desde', 'como',
  'que', 'quien', 'cual', 'cuando', 'donde', 'fue', 'fueron', 'era', 'son',
  'es', 'su', 'sus', 'mi', 'tu', 'se', 'lo', 'le', 'les', 'y', 'o', 'u', 'e', 'ni',
  'no', 'si', 'mas', 'pero', 'the', 'of', 'in', 'and', 'to', 'for', 'on', 'with',
]);

const LEADING_PREPOSITIONS = new Set([
  'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia', 'hasta', 'desde',
  'segun', 'contra', 'ante', 'bajo', 'tras', 'durante', 'mediante', 'como', 'cuando',
  'donde', 'porque', 'si', 'mas', 'pero', 'aunque',
]);

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasProperCapitalizationOrQuotes(phrase: string): boolean {
  if (/[«"“][^»"”]+[»"”]/.test(phrase)) return true;
  if (/\b\d{4}\b/.test(phrase)) return true;
  const words = phrase
    .replace(/^[\dIVXLCDM]+[\.\)\-:]\s*/i, '')
    .replace(/^[¿¡]+/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) {
    return /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{3,}$/.test(words[0]);
  }
  // Check if any word AFTER the first word starts with an uppercase letter (e.g. "Fiódor Dostoyevski", "Síndrome de Estocolmo", "Noche de los Bastones Largos")
  for (let i = 1; i < words.length; i++) {
    const cleanW = words[i].replace(/^[^A-Za-zÁÉÍÓÚáéíóúÑñÜü]+|[^A-Za-zÁÉÍÓÚáéíóúÑñÜü]+$/g, '');
    if (cleanW.length >= 2 && /^[A-ZÁÉÍÓÚÑÜ]/.test(cleanW)) {
      return true;
    }
  }
  return false;
}

function isCleanEncyclopedicPhrase(phrase: string): boolean {
  const norm = normalizeText(phrase);
  if (!norm) return false;
  const words = norm.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 7) return false;

  if (LEADING_PREPOSITIONS.has(words[0])) return false;
  if (words.some((w) => FICTIONAL_LORE_STOPWORDS.has(w))) return false;
  if (words.some((w) => CONVERSATIONAL_CANDIDATE_TOKENS.has(w))) return false;

  // If the first word is an editorial stopword (e.g. "Consejo práctico", "Posible crítica", "Riesgo real", "Error común"), reject
  if (GENERIC_HEADING_STOPWORDS.has(words[0])) return false;

  const meaningful = words.filter((w) => !TOKEN_STOPWORDS.has(w) && w.length >= 2);
  if (meaningful.length === 0) return false;

  // Reject if any meaningful word is a core critique/workshop/somatic rubric word
  if (meaningful.some((w) => GENERIC_HEADING_STOPWORDS.has(w))) return false;

  return true;
}

/**
 * Fallback extractor for mixed headings like:
 * - "2. El paralelo entre Kolder y Fiódor Dostoyevski" -> "Fiódor Dostoyevski"
 * - "3. Como en «Crimen y castigo» de Dostoyevski" -> "Crimen y castigo"
 * Never extracts initial sentence-case generic words or Monstereth lore names.
 */
function extractEmbeddedProperEntity(rawHeading: string): string | null {
  // 1. Check for explicitly quoted work titles ("...", “...”, «...»)
  const quoteMatch = rawHeading.match(/[«"“]([^»"”]{3,45})[»"”]/);
  if (quoteMatch && quoteMatch[1]) {
    const qCandidate = quoteMatch[1].trim();
    if (isCleanEncyclopedicPhrase(qCandidate)) {
      return qCandidate;
    }
  }

  // 2. Check for multi-word Capitalized Proper Names inside the heading (e.g. "Fiódor Dostoyevski", "Albert Camus", "Naoki Urasawa")
  const stripped = rawHeading
    .replace(/^[\dIVXLCDM]+[\.\)\-:]\s*/i, '')
    .replace(/[*_`~#¿?¡!()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const properSeqRegex = /\b([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{2,}(?:\s+[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{2,})+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = properSeqRegex.exec(stripped)) !== null) {
    const candidate = match[1].trim();
    if (isCleanEncyclopedicPhrase(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Extracts a clean encyclopedic search query from a Markdown heading if and only if
 * it looks like a concrete historical event, place, person, published work, or scientific concept.
 */
export function extractCandidateQueryFromHeading(rawHeading: string): string | null {
  if (!rawHeading || typeof rawHeading !== 'string') return null;

  // Strip leading numbering like "1.", "2)", "II.", "Paso 1:", emojis, or markdown markers
  let cleaned = rawHeading
    .replace(/^[\dIVXLCDM]+[\.\)\-:]\s*/i, '')
    .replace(/^[^\wÁÉÍÓÚáéíóúÑñÜü¿¡]+/, '')
    .replace(/[*_`~#]/g, '')
    .trim();

  if (!cleaned || cleaned.length < 3 || cleaned.length > 95) return null;

  // Handle question headings (e.g. "¿Quién fue Fiódor Dostoyevski?", "¿Qué es el Sistema Límbico?")
  // Reject rhetorical questions that have a trailing parenthetical like "¿Qué es la caracterización? (No es lo que crees)"
  if (cleaned.includes('¿') || cleaned.includes('?')) {
    if (!cleaned.endsWith('?')) {
      return extractEmbeddedProperEntity(cleaned);
    }
    const qMatch = cleaned
      .replace(/^[¿?]+|[¿?]+$/g, '')
      .trim()
      .match(/^(?:qu[ií]en\s+(?:fue|es|era)|qu[eé]\s+(?:fue|es|son|era))\s+(.+)$/i);
    if (qMatch && qMatch[1] && qMatch[1].trim().length >= 3) {
      cleaned = qMatch[1].trim();
    } else {
      return extractEmbeddedProperEntity(cleaned);
    }
  }

  // If there is a parenthetical that contains conversational/critique markers (like "(y por qué es falsa en tu caso)",
  // "(y cómo vos lo evitaste)", "(ej.: Capítulo 88, máquina expendedora)") AND there is no colon separating a real title,
  // check if the parenthetical itself marks this heading as an editorial rubric
  const parenMatches = cleaned.match(/\(([^)]*)\)/g);
  if (parenMatches) {
    for (const pm of parenMatches) {
      const pNorm = normalizeText(pm);
      const pWords = pNorm.split(' ').filter(Boolean);
      if (
        pWords.some(
          (w) =>
            CONVERSATIONAL_CANDIDATE_TOKENS.has(w) ||
            FICTIONAL_LORE_STOPWORDS.has(w) ||
            w === 'capitulo' ||
            w === 'ej' ||
            w === 'ejemplo' ||
            w === 'caso'
        )
      ) {
        const outside = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        if (!isCleanEncyclopedicPhrase(outside)) {
          return extractEmbeddedProperEntity(outside);
        }
      }
    }
  }

  // Strip parenthetical years or short disambiguations at the end, e.g. "La Noche de los Bastones Largos (1966)"
  const withoutParens = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const candidate = withoutParens.length >= 3 ? withoutParens : cleaned;

  // Handle colon or dash splits (e.g., "1. Fiódor Dostoyevski: Cómo construye el subtexto" OR "Ejemplo histórico: El Cordobazo")
  let finalQuery = candidate;
  if (candidate.includes(':') && !/^re:zero$/i.test(candidate.trim())) {
    const idx = candidate.indexOf(':');
    const left = candidate.slice(0, idx).trim();
    const right = candidate.slice(idx + 1).trim();
    if (/^re$/i.test(left) && /^zero\b/i.test(right)) {
      finalQuery = 'Re:Zero';
    } else if (isCleanEncyclopedicPhrase(left)) {
      finalQuery = left;
    } else if (isCleanEncyclopedicPhrase(right)) {
      finalQuery = right;
    } else {
      return extractEmbeddedProperEntity(candidate);
    }
  } else if (/\s+[—–-]\s+/.test(candidate)) {
    const [left, right] = candidate.split(/\s+[—–-]\s+/, 2).map((s) => s.trim());
    if (isCleanEncyclopedicPhrase(left)) {
      finalQuery = left;
    } else if (right && isCleanEncyclopedicPhrase(right)) {
      finalQuery = right;
    } else {
      return extractEmbeddedProperEntity(candidate);
    }
  }

  // Strip leading editorial prefixes like "Comparación con Fiódor Dostoyevski", "Análisis de El idiota", "Historia del Cordobazo"
  finalQuery = finalQuery
    .replace(
      /^(?:el\s+|la\s+|los\s+|las\s+|un\s+|una\s+)?(?:paralelo|comparaci[óo]n|diferencia|diferencias|similitud|similitudes|v[íi]nculo|conexi[óo]n|contraste|influencia|referencia|an[áa]lisis|contexto|resumen|s[íi]ntesis|historia|origen|or[íi]genes|biograf[íi]a|explicaci[óo]n|impacto|legado|estudio|perfil)\s+(?:hist[óo]rico\s+|literario\s+|narrativo\s+|pol[íi]tico\s+|filos[óo]fico\s+|cient[íi]fico\s+)?(?:con\s+|frente\s+a\s+|ante\s+|de\s+la\s+|de\s+los\s+|de\s+las\s+|del\s+|de\s+|sobre\s+el\s+|sobre\s+la\s+|sobre\s+)/i,
      ''
    )
    .trim();

  if (!isCleanEncyclopedicPhrase(finalQuery)) {
    return extractEmbeddedProperEntity(finalQuery);
  }

  return finalQuery;
}

function areTokensEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  // Allow minor transliteration difference (e.g. dostoievski vs dostoyevski) on longer words (>= 6 chars)
  if (a.length >= 6 && b.length >= 6 && Math.abs(a.length - b.length) <= 1) {
    if (a.slice(0, 4) === b.slice(0, 4) && a.slice(-3) === b.slice(-3)) {
      return true;
    }
  }
  return false;
}

function areTokensInSameOrder(source: string[], target: string[]): boolean {
  let targetIdx = 0;
  for (const s of source) {
    let found = false;
    while (targetIdx < target.length) {
      if (areTokensEquivalent(s, target[targetIdx])) {
        found = true;
        targetIdx++;
        break;
      }
      targetIdx++;
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Checks that the returned Wikipedia article title is genuinely about the heading query
 * while strictly blocking partial-overlap false positives, reversed token order ("El peso de la historia" vs "Historia del peso"),
 * and pop-culture film/song/series disambiguations on generic phrases.
 */
function isRelevantWikiMatch(
  query: string,
  wikiTitle: string,
  wikiDescription: string = '',
  wikiExtract: string = ''
): boolean {
  if (!query || !wikiTitle) return false;

  // Reject Wikipedia meta/list/disambiguation pages
  const lowerTitle = wikiTitle.toLowerCase();
  const lowerDesc = (wikiDescription || '').toLowerCase();
  const lowerExtract = (wikiExtract || '').toLowerCase();
  if (
    lowerTitle.startsWith('anexo:') ||
    lowerTitle.startsWith('wikipedia:') ||
    lowerTitle.startsWith('categoría:') ||
    lowerDesc.includes('desambiguación') ||
    lowerDesc.includes('disambiguation') ||
    lowerExtract.includes('puede referirse a:') ||
    lowerExtract.includes('hace referencia a varios artículos')
  ) {
    return false;
  }

  const queryHasProperNoun = hasProperCapitalizationOrQuotes(query);
  const titleParenMatch = wikiTitle.match(/\(([^)]+)\)/);
  const titleParenText = titleParenMatch ? titleParenMatch[1].toLowerCase() : '';

  // If the query is a generic sentence-case phrase (no non-initial proper noun or quotes),
  // NEVER match a movie, song, music album, TV series, episode, municipality, or biological species!
  if (!queryHasProperNoun) {
    const popOrGeoNoise =
      /\b(pel[ií]cula|serie de televisi[oó]n|canci[oó]n|[aá]lbum|episodio|videojuego| telenovela|banda|grupo musical|municipio|localidad|comuna|especie de|g[eé]nero de)\b/i;
    if (popOrGeoNoise.test(titleParenText) || popOrGeoNoise.test(lowerDesc) || popOrGeoNoise.test(lowerExtract.slice(0, 180))) {
      return false;
    }
  }

  // Strip parenthetical qualifier from Wikipedia title only when allowed (or when query has proper capitalization)
  const wikiBaseTitle = queryHasProperNoun
    ? wikiTitle.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
    : wikiTitle.trim();

  const qNorm = normalizeText(query);
  const tNorm = normalizeText(wikiBaseTitle);
  if (!qNorm || !tNorm) return false;

  const qWithoutLeadingArticle = qNorm.replace(/^(?:el|la|los|las|un|una)\s+/, '').trim();
  const tWithoutLeadingArticle = tNorm.replace(/^(?:el|la|los|las|un|una)\s+/, '').trim();

  // 1. Exact normalized title match (preserving exact word order)
  if (qNorm === tNorm || qWithoutLeadingArticle === tWithoutLeadingArticle) {
    return true;
  }

  // If the heading had no non-initial proper nouns (pure sentence-case common phrase),
  // require the exact normalized phrase match above — never do loose token subset matching!
  if (!queryHasProperNoun) {
    return false;
  }

  const qTokens = qNorm.split(' ').filter((w) => !TOKEN_STOPWORDS.has(w) && w.length >= 2);
  const tTokens = tNorm.split(' ').filter((w) => !TOKEN_STOPWORDS.has(w) && w.length >= 2);
  if (qTokens.length === 0 || tTokens.length === 0) return false;

  const allQueryInTitle = qTokens.every((qt) => tTokens.some((tt) => areTokensEquivalent(qt, tt)));
  const allTitleInQuery = tTokens.every((tt) => qTokens.some((qt) => areTokensEquivalent(qt, tt)));

  // 2. Exact token set equivalence IN THE SAME ORDER (prevents "El peso de la historia" matching "Historia del peso")
  if (allQueryInTitle && allTitleInQuery && areTokensInSameOrder(qTokens, tTokens)) {
    return true;
  }

  // 3. Contiguous multi-token Wikipedia title inside query (e.g. "Fiódor Dostoyevski y el subtexto" includes "Fiódor Dostoyevski")
  if (tTokens.length >= 2 && qNorm.includes(tNorm)) {
    return true;
  }

  // 4. Multi-token proper query where 100% of query tokens appear in the Wikipedia title IN THE SAME ORDER
  // (e.g. "Re:Zero" -> ['re', 'zero'] in "Re:Zero kara Hajimeru Isekai Seikatsu")
  if (qTokens.length >= 2 && allQueryInTitle && areTokensInSameOrder(qTokens, tTokens)) {
    return true;
  }

  // 5. Single-token Proper Name / Surname / Work Title where the token is in the Wikipedia title
  // (e.g. "Dostoyevski" -> "Fiódor Dostoyevski", "Kafka" -> "Franz Kafka", "Evangelion" -> "Neon Genesis Evangelion")
  if (
    qTokens.length === 1 &&
    qTokens[0].length >= 5 &&
    allQueryInTitle &&
    tTokens.length <= 4 &&
    !GENERIC_HEADING_STOPWORDS.has(qTokens[0])
  ) {
    return true;
  }

  // 6. Query includes both Work and Author (e.g. "El idiota de Dostoyevski"), where 100% of Wiki title ("El idiota")
  // is in the query AND the remaining query tokens ("dostoyevski") appear in the Wikipedia description/extract
  if (allTitleInQuery && qTokens.length > tTokens.length && areTokensInSameOrder(tTokens, qTokens)) {
    const descAndExtractNorm = normalizeText(`${wikiDescription} ${(wikiExtract || '').slice(0, 300)}`);
    const extraTokens = qTokens.filter((qt) => !tTokens.some((tt) => areTokensEquivalent(qt, tt)));
    if (extraTokens.every((et) => descAndExtractNorm.includes(et))) {
      return true;
    }
  }

  return false;
}

function parseSummaryPayload(
  query: string,
  summary: any,
  fallbackTitle: string,
  lang: 'es' | 'en'
): WikiVisualMatch | null {
  if (!summary || summary.type === 'disambiguation') return null;

  const thumbUrl: string = summary.thumbnail?.source || '';
  if (!thumbUrl) return null;

  // Filter out generic Wikimedia placeholder icons, flags, coats of arms, maps, or tiny icons
  const lowerThumb = thumbUrl.toLowerCase();
  if (
    lowerThumb.includes('disambig') ||
    lowerThumb.includes('question_book') ||
    lowerThumb.includes('ambox') ||
    lowerThumb.includes('commons-logo') ||
    lowerThumb.includes('wikidata-logo') ||
    lowerThumb.includes('coat_of_arms') ||
    lowerThumb.includes('escudo_de') ||
    (summary.thumbnail?.width && summary.thumbnail.width < 60)
  ) {
    return null;
  }

  const resolvedTitle = summary.title || fallbackTitle;
  if (!isRelevantWikiMatch(query, resolvedTitle, summary.description || '', summary.extract || '')) {
    return null;
  }

  return {
    query,
    title: resolvedTitle,
    description: summary.description || '',
    extract: summary.extract || '',
    thumbnailUrl: thumbUrl,
    originalImageUrl: summary.originalimage?.source || thumbUrl,
    pageUrl:
      summary.content_urls?.desktop?.page ||
      `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(resolvedTitle.replace(/ /g, '_'))}`,
    domainLabel: 'Wikipedia',
    lang,
  };
}

async function queryWikipediaByLang(query: string, lang: 'es' | 'en'): Promise<WikiVisualMatch | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    // Step 1: Try official REST v1 summary endpoint directly first
    const directSlug = encodeURIComponent(query.trim().replace(/\s+/g, '_'));
    const directSummaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${directSlug}`;
    const directRes = await fetch(directSummaryUrl, {
      headers: WIKI_HEADERS,
      signal: controller.signal,
    });

    if (directRes.ok) {
      const directSummary = await directRes.json();
      const parsedDirect = parseSummaryPayload(query, directSummary, query, lang);
      if (parsedDirect) return parsedDirect;
    }

    // Step 2: Fallback to MediaWiki search API for best canonical title match
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&srlimit=3&format=json&origin=*`;

    const searchRes = await fetch(searchUrl, {
      headers: WIKI_HEADERS,
      signal: controller.signal,
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData?.query?.search;
    if (!Array.isArray(results) || results.length === 0) return null;

    // Step 3: Check top search results until one yields a verified summary with a thumbnail
    for (const hit of results.slice(0, 3)) {
      const bestTitle = hit?.title;
      if (!bestTitle) continue;

      const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        bestTitle.replace(/ /g, '_')
      )}`;
      const sumRes = await fetch(summaryUrl, {
        headers: WIKI_HEADERS,
        signal: controller.signal,
      });
      if (!sumRes.ok) continue;

      const summary = await sumRes.json();
      const parsed = parseSummaryPayload(query, summary, bestTitle, lang);
      if (parsed) return parsed;
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches a verified Wikipedia thumbnail and source link for a heading query.
 * Uses in-memory + sessionStorage cache and never throws.
 */
export async function fetchWikipediaVisualForHeading(rawHeading: string): Promise<WikiVisualMatch | null> {
  const candidate = extractCandidateQueryFromHeading(rawHeading);
  if (!candidate) return null;

  const cacheKey = normalizeText(candidate);
  const cached = readSessionCache(cacheKey);
  if (cached.hit) {
    return cached.value;
  }

  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    const esMatch = await queryWikipediaByLang(candidate, 'es');
    if (esMatch) {
      writeSessionCache(cacheKey, esMatch);
      inflightRequests.delete(cacheKey);
      return esMatch;
    }

    const enMatch = await queryWikipediaByLang(candidate, 'en');
    writeSessionCache(cacheKey, enMatch);
    inflightRequests.delete(cacheKey);
    return enMatch;
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Extracts a clean, short site badge name from a URL (e.g., "https://www.argentina.gob.ar/..." -> "Argentina",
 * "https://www.coneau.gob.ar/..." -> "CONEAU", "https://es.wikipedia.org/..." -> "Wikipedia")
 */
export function getCleanDomainBadgeLabel(url: string, fallbackTitle?: string): {
  label: string;
  hostname: string;
  faviconUrl: string;
} {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./i, '');
    const parts = hostname.split('.');
    let core = parts[0] || hostname;
    if ((core === 'es' || core === 'en' || core === 'm') && parts.length > 1) {
      core = parts[1];
    }

    let label = core;
    if (core.length <= 6 && core !== 'wiki' && core !== 'bbc' && core !== 'cnn') {
      label = core.toUpperCase();
    } else {
      label = core.charAt(0).toUpperCase() + core.slice(1);
    }

    if (hostname.includes('wikipedia.org')) {
      label = 'Wikipedia';
    } else if (hostname.includes('argentina.gob.ar')) {
      label = 'Argentina';
    }

    return {
      label,
      hostname,
      faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`,
    };
  } catch {
    return {
      label: fallbackTitle ? fallbackTitle.slice(0, 14) : 'Fuente',
      hostname: 'wikipedia.org',
      faviconUrl: 'https://www.google.com/s2/favicons?domain=wikipedia.org&sz=32',
    };
  }
}
