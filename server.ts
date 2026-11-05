import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const DEFAULT_GEMINI_API_KEY = "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Universal CORS headers for API calls across preview domains and deployment targets
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-gemini-api-key, x-tavily-api-key, x-base-url');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health / Status endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

async function fetchDuckDuckGoHtmlFallback(query: string): Promise<{ results: Array<{ title: string; url: string; snippet: string }>; summary: string }> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return { results: [], summary: '' };
    const html = await res.text();
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    const linkRegex = /<a class="result__url" href="([^"]+)">[\s\S]*?<\/a>[\s\S]*?<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
      let rawUrl = match[1].trim();
      if (rawUrl.includes('uddg=')) {
        const decoded = decodeURIComponent(rawUrl.split('uddg=')[1]?.split('&')[0] || '');
        if (decoded) rawUrl = decoded;
      }
      const rawSnippet = match[2].replace(/<[^>]+>/g, '').trim();
      if (rawUrl && rawSnippet) {
        results.push({
          title: `Resultado Web: ${rawUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}`,
          url: rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`,
          snippet: rawSnippet,
        });
      }
    }

    const summary = results.length > 0
      ? results.map((r) => r.snippet).join(' ').slice(0, 500)
      : '';

    return { results, summary };
  } catch {
    return { results: [], summary: '' };
  }
}

function sanitizeSearchQuery(userPrompt: string): string {
  if (!userPrompt) return '';
  const cleaned = userPrompt
    .replace(/^(?:hola|buenas|che|tenía una duda|una pregunta)[,\s]*/gi, '')
    .replace(/(?:¿?podes|puedes|busca|buscar en internet sobre|que sabes de|averigua sobre)\s*/gi, '')
    .replace(/[?¿!¡]/g, '')
    .trim();
  return cleaned || userPrompt.trim();
}

function isCasualGreeting(userPrompt: string): boolean {
  if (!userPrompt || !userPrompt.trim()) return true;
  const clean = userPrompt
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|\u{FE0F}/gu, '')
    .replace(/(?::D|:P|:O|:3|;\)|:\)|xD|XD)/g, '')
    .trim()
    .toLowerCase()
    .replace(/[¿?¡!.,;:()'"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 32) {
    const pureGreetingRegex = /^(?:hola|buenas|buen dia|buen día|buenas tardes|buenas noches|hey|hi|hello|alo|aló|saludos|que tal|qué tal)(?:\s+(?:aaron|kizu|kizuna|che|bro|amigo|colega|como estas|cómo estás|como andas|cómo andás|que tal|qué tal|todo bien|devuelta|de vuelta))*$/i;
    if (pureGreetingRegex.test(clean)) return true;
    const greetingWords = [
      'hola', 'buenas', 'que tal', 'qué tal', 'buen dia', 'buen día',
      'buenas tardes', 'buenas noches', 'hey', 'hi', 'hello', 'alo', 'aló',
      'saludos', 'adios', 'adiós', 'chau', 'gracias', 'ok', 'vale', 'si', 'sí', 'no'
    ];
    if (greetingWords.includes(clean)) return true;
    if (clean.length < 15 && greetingWords.some((w) => clean === w || clean.startsWith(w + ' ') || clean.endsWith(' ' + w))) return true;
    if (clean.length <= 5) return true;
  }
  return false;
}

function scrubSnippetText(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/<\|.*?\|>/g, '') // remove LLM control tokens like <|close|>
    .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u017F\u00C0-\u024F\n\r\t.,!?;:()'"-]/g, ' ') // keep Latin/Spanish chars and punctuation
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const tavilyQueryCache = new Map<string, { timestamp: number; data: any }>();
const TAVILY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache to save Tavily credits

const SPAM_NOISE_DOMAINS = [
  'pinterest.com',
  'tiktok.com',
  'softonic.com',
  'scribd.com',
  'quora.com',
  'answers.yahoo.com',
  'coursehero.com',
  'brainly.lat',
];

async function searchTavilyServer(query: string, apiKey: string) {
  const normalizedKey = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const cached = tavilyQueryCache.get(normalizedKey);
  if (cached && Date.now() - cached.timestamp < TAVILY_CACHE_TTL_MS) {
    console.log(`[Tavily Cache HIT] Reutilizando consulta sin gastar crédito: "${query}"`);
    return cached.data;
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey.trim(),
      query: query.trim(),
      search_depth: 'basic', // Strictly 1 API credit per search (never 2)
      include_answer: true,
      max_results: 6,
      exclude_domains: SPAM_NOISE_DOMAINS,
    }),
  });
  if (!response.ok) {
    throw new Error(`Tavily error (${response.status})`);
  }
  const rawData = await response.json();

  // Filter out "internet garbage" by relevance score & clean snippets
  if (Array.isArray(rawData?.results)) {
    const sorted = [...rawData.results].sort((a: any, b: any) => (Number(b.score) || 0) - (Number(a.score) || 0));
    const highSignal = sorted.filter((r: any) => {
      const score = Number(r.score ?? 0.5);
      const contentLen = String(r.content || r.snippet || '').trim().length;
      return score >= 0.38 && contentLen >= 35;
    });
    rawData.results = (highSignal.length > 0 ? highSignal : sorted.slice(0, 3))
      .slice(0, 4)
      .map((r: any) => ({
        ...r,
        content: clampTextSegment(scrubSnippetText(r.content || r.snippet || ''), 650),
      }));
  }

  tavilyQueryCache.set(normalizedKey, { timestamp: Date.now(), data: rawData });
  return rawData;
}

function clampTextSegment(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  const half = Math.max(500, Math.floor((maxChars - 120) / 2));
  return `${text.slice(0, half)}\n\n[... Fragmento central recortado para respetar el límite de contexto del modelo ...]\n\n${text.slice(-half)}`;
}

function extractRelevantChaptersServer(fullLoreText: string, userQuery: string, maxCharLength: number = 18000): string {
  if (!fullLoreText || fullLoreText.length <= maxCharLength) {
    return fullLoreText;
  }
  const chapterHeaderRegex = /(?:^|\n)(?=#+\s*(?:cap[íi]tulo|chapter|acto|volumen|pr[óo]logo|ep[íi]logo|ficha|\bcap\b)\s*[\d\w]*|(?:cap[íi]tulo|chapter|acto|volumen|pr[óo]logo|ep[íi]logo|\bcap\b)\s*\d+)/gi;
  const segments = fullLoreText.split(chapterHeaderRegex).filter((s) => s && s.trim().length > 100);

  if (segments.length <= 1) {
    return clampTextSegment(fullLoreText, maxCharLength);
  }

  const lowerQuery = (userQuery || '').toLowerCase();
  const explicitChapterSet = new Set<string>();

  // Detect chapter ranges (e.g. "capítulos 10 hasta el 20", "del 10 al 20", "cap 10-20")
  const normQuery = lowerQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const rangeRegexes = [
    /\b(?:cap(?:itulos?)?|chapters?|actos?|partes?|episodios?)\s*(?:del\s*)?#?(\d+)\s*(?:al|hasta(?:\s+el)?|a|-|–|—|y(?:\s+el)?)\s*#?(\d+)\b/g,
    /\b(?:del|desde\s+el|entre\s+el)\s+(?:cap(?:itulo)?\s*)?#?(\d+)\s+(?:al|hasta(?:\s+el)?|a|y\s+el)\s+(?:cap(?:itulo)?\s*)?#?(\d+)\b/g,
  ];
  for (const rx of rangeRegexes) {
    for (const m of normQuery.matchAll(rx)) {
      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);
      if (!Number.isNaN(start) && !Number.isNaN(end) && start > 0 && end >= start && end - start <= 40) {
        for (let c = start; c <= end; c++) {
          explicitChapterSet.add(String(c));
        }
      }
    }
  }

  // Detect explicit chapter/act/volume number references (e.g., "capítulo 4", "cap 12", "acto 2")
  for (const m of lowerQuery.matchAll(/\b(?:cap[íi]tulos?|chapters?|caps?|actos?|volumen|vol|partes?)\s*#?(\d+)\b/gi)) {
    explicitChapterSet.add(m[1]);
  }
  const explicitChapterMatches = Array.from(explicitChapterSet);
  const asksPrologue = /\b(?:pr[óo]logo|inicio|comienzo|principio)\b/i.test(lowerQuery);
  const asksEpilogue = /\b(?:ep[íi]logo|final| cierre)\b/i.test(lowerQuery);

  const queryTerms = lowerQuery
    .replace(/[^\w\s\u00C0-\u024F]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^\d+$/.test(w));

  const scoredSegments = segments.map((seg, index) => {
    const lowerSeg = seg.toLowerCase();
    const headerSlice = lowerSeg.slice(0, 300);
    let score = 0;

    // 1. High priority (+100) if user explicitly asked for this chapter/act number
    for (const num of explicitChapterMatches) {
      const exactHeaderRegex = new RegExp(`\\b(?:cap[íi]tulo|chapter|cap|acto|volumen|vol|parte)\\s*0*${num}\\b`, 'i');
      if (exactHeaderRegex.test(headerSlice)) {
        score += 100;
      }
    }
    if (asksPrologue && /\bpr[óo]logo\b/i.test(headerSlice)) score += 90;
    if (asksEpilogue && /\bep[íi]logo\b/i.test(headerSlice)) score += 90;

    // 2. Priority (+40) for character sheets, worldbuilding rules, or glossaries so canon base is never lost
    if (/\b(?:ficha|personajes|elenco|reglas|sistema de magia|glosario|worldbuilding|canon|bóveda)\b/i.test(headerSlice)) {
      score += 40;
    }

    // 3. Keyword frequency and header match
    queryTerms.forEach((term) => {
      if (headerSlice.includes(term)) {
        score += 8;
      } else if (lowerSeg.includes(term)) {
        score += 3;
      }
    });

    // 4. Keep first segment (intro/world setup) and latest 2 segments (current story frontier) boosted
    if (index === 0) score += 10;
    if (index >= segments.length - 2) score += 12;

    return { seg, score, index };
  });

  scoredSegments.sort((a, b) => b.score - a.score);

  const selectedSegments: typeof scoredSegments = [];
  let currentLength = 0;

  for (const item of scoredSegments) {
    const remainingBudget = maxCharLength - currentLength;
    if (remainingBudget <= 400) break;

    if (item.seg.length <= remainingBudget) {
      selectedSegments.push(item);
      currentLength += item.seg.length;
    } else if (selectedSegments.length === 0 || remainingBudget >= 2500) {
      const clampedSeg = clampTextSegment(item.seg, remainingBudget);
      selectedSegments.push({ ...item, seg: clampedSeg });
      currentLength += clampedSeg.length;
      break;
    }
    if (currentLength >= maxCharLength) break;
  }

  selectedSegments.sort((a, b) => a.index - b.index);

  const selectedText = clampTextSegment(
    selectedSegments.map((s) => s.seg.trim()).join('\n\n---\n\n'),
    maxCharLength
  );
  return `[SELECCIÓN INTELIGENTE DE CAPÍTULOS DEL MANUSCRITO (${selectedSegments.length} de ${segments.length} Capítulos detectados)]:\n\n${selectedText}`;
}

// Dedicated Tavily Search Proxy Endpoint
app.post('/api/tavily/search', async (req, res) => {
  const { query, api_key } = req.body || {};
  const cleanKey = (api_key || process.env.TAVILY_API_KEY || '').trim();
  if (!cleanKey) {
    return res.status(400).json({ error: 'Clave de Tavily no proporcionada' });
  }
  try {
    const data = await searchTavilyServer(query || '', cleanKey);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error al consultar Tavily' });
  }
});

// Real-Time Web Search Engine (Tavily AI Search primary, Google fallback)
app.get('/api/search', async (req, res) => {
  const rawQuery = String(req.query.q || '').trim();
  if (isCasualGreeting(rawQuery)) {
    return res.json({ results: [], searchKeywords: '', summary: '' });
  }

  const cleanQuery = sanitizeSearchQuery(rawQuery);
  if (!cleanQuery) {
    return res.json({ results: [], searchKeywords: '', summary: '' });
  }

  // 1. Primary: Tavily AI Search if key provided via header or env
  const tavilyKey = String(
    req.query.tavilyKey ||
    req.headers['x-tavily-api-key'] ||
    process.env.TAVILY_API_KEY ||
    ''
  ).trim();

  if (tavilyKey) {
    try {
      const tavilyData = await searchTavilyServer(cleanQuery, tavilyKey);
      const rawResults = Array.isArray(tavilyData?.results) ? tavilyData.results : [];
      const results = rawResults.map((r: any) => ({
        title: scrubSnippetText(r.title || 'Fuente Web'),
        url: r.url || '',
        snippet: scrubSnippetText(r.content || ''),
      }));
      let summary =
        '[INFORMACIÓN EN TIEMPO REAL VÍA TAVILY SEARCH]:\n' +
        results.map((r: any) => `- ${r.title}: ${r.snippet}`).join('\n');
      if (tavilyData.answer) {
        const cleanAns = scrubSnippetText(tavilyData.answer);
        if (cleanAns) {
          summary = `[RESPUESTA DIRECTA TAVILY]:\n${cleanAns}\n\n` + summary;
        }
      }
      return res.json({
        results,
        searchKeywords: cleanQuery,
        summary,
      });
    } catch (tavErr) {
      console.warn('Server Tavily Search error, falling back:', tavErr);
    }
  }

  const queryKey = String(req.query.key || req.headers['x-gemini-api-key'] || '').trim();
  const candidateKeys = [
    process.env.GEMINI_API_KEY,
    queryKey,
    DEFAULT_GEMINI_API_KEY,
  ]
    .map((k) => (k || '').replace(/[\r\n\s]+/g, '').trim())
    .filter(
      (k, idx, arr) =>
        k &&
        !k.includes('MY_GEMINI_API_KEY') &&
        !k.includes('YOUR_API_KEY') &&
        arr.indexOf(k) === idx
    );

  if (candidateKeys.length === 0) {
    console.warn('/api/search: GEMINI_API_KEY is not configured on server.');
    return res.json({
      results: [],
      searchKeywords: cleanQuery,
      summary: '',
      error: 'GEMINI_API_KEY non-existent',
    });
  }

  try {
    const candidateModels = [
      'gemini-3-flash-preview',
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite-preview',
    ];

    let searchResponse: any = null;
    let lastErr: any = null;

    outerSearchLoop: for (const apiKey of candidateKeys) {
      const isVertexSearchKey = apiKey.startsWith('AQ.');
      const ai = new GoogleGenAI({
        apiKey: apiKey.trim(),
        vertexai: isVertexSearchKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      for (const modelCandidate of candidateModels) {
        try {
          searchResponse = await ai.models.generateContent({
            model: modelCandidate,
            contents: `Busca y resume información precisa, completa y reciente sobre: ${cleanQuery}`,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });
          if (searchResponse) break outerSearchLoop;
        } catch (err: any) {
          lastErr = err;
          const errMsg = err?.message || String(err);
          if (
            errMsg.includes('401') ||
            errMsg.includes('UNAUTHENTICATED') ||
            errMsg.includes('API key not valid') ||
            errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')
          ) {
            break;
          }
        }
      }
    }

    if (!searchResponse) {
      // Fallback to direct web scraping when Gemini Grounding tool hits 429 rate limit
      const fallbackData = await fetchDuckDuckGoHtmlFallback(rawQuery);
      if (fallbackData.results.length > 0) {
        return res.json({
          results: fallbackData.results,
          searchKeywords: rawQuery,
          summary: fallbackData.summary,
        });
      }

      return res.json({
        results: [
          {
            title: `Búsqueda en Google: ${rawQuery}`,
            url: `https://www.google.com/search?q=${encodeURIComponent(rawQuery)}`,
            snippet: `Consulta de búsqueda: ${rawQuery}`,
          },
        ],
        searchKeywords: rawQuery,
        summary: '',
      });
    }

    const summary = (searchResponse.text || '').trim();
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    const candidate = searchResponse.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          const title = chunk.web.title || chunk.web.uri;
          const url = chunk.web.uri;
          if (!results.some((r) => r.url === url)) {
            results.push({
              title,
              url,
              snippet: title,
            });
          }
        }
      }
    }

    // Fallback: If groundingChunks didn't yield explicit URIs, build Google search query links
    if (results.length === 0 && groundingMetadata?.webSearchQueries) {
      for (const q of groundingMetadata.webSearchQueries) {
        results.push({
          title: `Búsqueda Google: "${q}"`,
          url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          snippet: `Búsqueda en Google sobre: ${q}`,
        });
      }
    }

    // Secondary fallback: Create a primary reference link for the query if results empty but summary present
    if (results.length === 0 && summary) {
      results.push({
        title: `Google Search: ${rawQuery}`,
        url: `https://www.google.com/search?q=${encodeURIComponent(rawQuery)}`,
        snippet: summary.slice(0, 150),
      });
    }

    return res.json({
      results,
      searchKeywords: rawQuery,
      summary,
    });
  } catch (err: any) {
    console.error('Error in /api/search with Google Search Grounding:', err);
    return res.status(500).json({
      results: [],
      searchKeywords: rawQuery,
      summary: '',
      error: err.message || 'Error executing Google web search grounding',
    });
  }
});

// Dynamic Google Gemini Model List Fetcher
app.get('/api/gemini/models', async (req, res) => {
  const queryKey = String(req.query.key || req.headers['x-gemini-api-key'] || '').trim();
  const apiKey = queryKey || process.env.GEMINI_API_KEY || DEFAULT_GEMINI_API_KEY;

  const defaultCoreModels = [
    { id: 'gemini-4-argon', displayName: 'Gemini 4 Argon', description: 'Modelo Flagship SOTA de Google para razonamiento profundo (Tier Paid)' },
    { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', description: 'Modelo SOTA de Google para razonamiento profundo, lore y creatividad' },
    { id: 'gemini-3.8-live', displayName: 'Gemini 3.8 Live', description: 'Motor multimodal en vivo para llamadas de voz y baja latencia' },
    { id: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', description: 'Alta capacidad analítica para lógica compleja y manuscritos' },
    { id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', description: 'Ultra liviano y máxima velocidad' },
    { id: 'gemini-flash-latest', displayName: 'Gemini Flash Latest', description: 'Última versión estable de Gemini Flash' },
  ];

  if (!apiKey || apiKey.startsWith('AQ.')) {
    return res.status(200).json({ models: defaultCoreModels });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!response.ok) {
      throw new Error(`Gemini API HTTP ${response.status}`);
    }
    const data = await response.json();
    const rawModels: any[] = data.models || [];
    const nonChatRegex = /tts|computer-use|audio|robotics|embedding|imagen|veo|aqa/i;

    const fetchedMap = new Map<string, any>();
    for (const m of rawModels) {
      const methods = m.supportedGenerationMethods || [];
      const cleanId = (m.name || m.id || '').replace(/^models\//, '');
      if (methods.includes('generateContent') && !nonChatRegex.test(cleanId) && cleanId.startsWith('gemini-')) {
        fetchedMap.set(cleanId, {
          id: cleanId,
          name: cleanId,
          displayName: m.displayName || cleanId,
          description: m.description || `Modelo Gemini (${cleanId})`,
        });
      }
    }

    // Merge default curated list to ensure full core suite is always available
    for (const core of defaultCoreModels) {
      if (!fetchedMap.has(core.id)) {
        fetchedMap.set(core.id, {
          id: core.id,
          name: core.id,
          displayName: core.displayName,
          description: core.description,
        });
      }
    }

    const allModels = Array.from(fetchedMap.values());
    const priorityOrder = [
      'gemini-4-argon',
      'gemini-3.8-flash',
      'gemini-3.8-live',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ];

    allModels.sort((a, b) => {
      const idxA = priorityOrder.indexOf(a.id);
      const idxB = priorityOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.id.localeCompare(b.id);
    });

    return res.json({ models: allModels });
  } catch (err: any) {
    // Return reliable core models fallback instead of error
    return res.json({ models: defaultCoreModels });
  }
});

// Server-side Gemini Streaming Chat Endpoint (@google/genai SDK)
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const {
      model,
      contents,
      systemInstruction,
      temperature,
      maxOutputTokens,
      thinkingBudget,
      enableReasoning,
      reasoningMode,
      isWebSearchEnabled,
      apiKey: reqApiKey,
    } = req.body || {};

    const candidateKeys = [
      reqApiKey,
      process.env.GEMINI_API_KEY,
      DEFAULT_GEMINI_API_KEY,
    ]
      .map((k) => (k || '').trim())
      .filter(
        (k, idx, arr) =>
          k &&
          !k.includes('MY_GEMINI_API_KEY') &&
          !k.includes('YOUR_API_KEY') &&
          arr.indexOf(k) === idx
      );

    if (candidateKeys.length === 0) {
      return res.status(400).json({
        error: 'No se encontró la API Key de Google Gemini. Configúrala en el menú de Ajustes.',
      });
    }

    const rawModel = (model || 'gemini-3-flash-preview').replace(/^models\//, '');
    const isProTier = /pro|argon/i.test(rawModel);
    const candidateModels = (
      isProTier
        ? ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-latest']
        : ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-pro-preview']
    ).filter((m, idx, arr) => m && arr.indexOf(m) === idx);

    const baseConfig: any = {};
    if (systemInstruction) {
      baseConfig.systemInstruction =
        typeof systemInstruction === 'string'
          ? systemInstruction
          : systemInstruction?.parts?.[0]?.text || '';
    }
    if (typeof temperature === 'number') {
      baseConfig.temperature = temperature;
    }
    if (typeof maxOutputTokens === 'number' && maxOutputTokens > 0) {
      baseConfig.maxOutputTokens = Math.min(maxOutputTokens, 8192);
    }
    if (
      thinkingBudget !== undefined &&
      Number(thinkingBudget) > 0 &&
      reasoningMode !== 'off' &&
      enableReasoning !== false
    ) {
      baseConfig.thinkingConfig = {
        thinkingBudget: Math.min(Number(thinkingBudget), 4096),
        includeThoughts: true,
      };
    }
    if (isWebSearchEnabled) {
      baseConfig.tools = [{ googleSearch: {} }];
    }

    let responseStream: any = null;
    let lastError: any = null;

    outerLoop: for (const key of candidateKeys) {
      const isVertex = key.startsWith('AQ.');
      const modesToTry = isVertex ? [true, false] : [false];

      for (const vMode of modesToTry) {
        const ai = new GoogleGenAI({
          apiKey: key,
          vertexai: vMode,
          httpOptions: {
            headers: { 'User-Agent': 'aistudio-build' },
          },
        });

        for (const candModel of candidateModels) {
          try {
            responseStream = await ai.models.generateContentStream({
              model: candModel,
              contents: contents || [],
              config: { ...baseConfig },
            });
            if (responseStream) break outerLoop;
          } catch (e: any) {
            lastError = e;
            const errMsg = (e?.message || String(e)).toLowerCase();
            // If key itself is rejected (401/403), break inner model loop to try next mode/key immediately
            if (errMsg.includes('401') || errMsg.includes('unauthenticated') || errMsg.includes('api key not valid')) {
              break;
            }
            // Retry without thinkingConfig/tools if model rejected those fields
            if (baseConfig.thinkingConfig || baseConfig.tools) {
              try {
                const simpleConfig = { ...baseConfig };
                delete simpleConfig.thinkingConfig;
                delete simpleConfig.tools;
                responseStream = await ai.models.generateContentStream({
                  model: candModel,
                  contents: contents || [],
                  config: simpleConfig,
                });
                if (responseStream) break outerLoop;
              } catch (e2: any) {
                lastError = e2;
              }
            }
          }
        }
      }
    }

    if (!responseStream) {
      const msg = lastError?.message || String(lastError || '');
      const cleanMsg = msg.includes('API key not valid') || msg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || msg.includes('401')
        ? '⚠️ Clave API de Gemini no válida o desactualizada (HTTP 401). Genera una clave estándar en https://aistudio.google.com/apikey y pégala en Ajustes ⚙️.'
        : `⚠️ Error de conexión con Gemini: ${msg || 'No se pudo establecer conexión'}`;
      return res.status(400).json({ error: cleanMsg });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of responseStream) {
      const candidate = (chunk as any)?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      let emittedFromParts = false;

      for (const part of parts) {
        if (part.thought && part.text) {
          emittedFromParts = true;
          res.write(
            `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: part.text } }] })}\n\n`
          );
        } else if (part.text && !part.thought) {
          emittedFromParts = true;
          res.write(
            `data: ${JSON.stringify({ choices: [{ delta: { content: part.text } }] })}\n\n`
          );
        }
      }

      if (!emittedFromParts && chunk.text) {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: chunk.text } }] })}\n\n`
        );
      }

      const groundingChunks = candidate?.groundingMetadata?.groundingChunks;
      if (Array.isArray(groundingChunks) && groundingChunks.length > 0) {
        const sources = groundingChunks
          .filter((gc: any) => gc?.web?.uri)
          .map((gc: any) => ({
            title: gc.web.title || 'Fuente Web',
            url: gc.web.uri,
            snippet: gc.web.snippet || 'Fuente verificada de Google Search',
            sourceEngine: 'google',
          }));
        if (sources.length > 0) {
          res.write(`data: ${JSON.stringify({ sources })}\n\n`);
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    console.warn('[Server Gemini Chat Notice]:', err?.message || err);
    const errText = err?.message || String(err);
    const isAuthError =
      errText.includes('401') ||
      errText.includes('UNAUTHENTICATED') ||
      errText.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
      errText.includes('API key not valid');

    const userFriendlyMsg = isAuthError
      ? '⚠️ Clave API de Gemini no válida o desactualizada (HTTP 401: ACCESS_TOKEN_TYPE_UNSUPPORTED). Genera una clave estándar en https://aistudio.google.com/apikey y pégala en Ajustes ⚙️.'
      : errText || 'Error al comunicarse con Gemini.';

    if (!res.headersSent) {
      res.status(isAuthError ? 401 : 500).json({ error: userFriendlyMsg });
    } else {
      res.write(`data: ${JSON.stringify({ error: userFriendlyMsg })}\n\n`);
      res.end();
    }
  }
});

// Dynamic Model List Fetcher for OpenAI-compatible endpoints (NVIDIA, Alibaba Cloud MaaS, etc.)
app.all(['/api/nvidia/v1/models', '/api/nvidia/models', '/api/alibaba/models', '/api/alibaba/v1/models', '/api/openai/models'], async (req, res) => {
  const isAlibaba = req.path.includes('alibaba');
  const providerLabel = isAlibaba ? 'Alibaba Cloud MaaS' : 'NVIDIA NIM';

  const apiKey = (
    req.body?.apiKey ||
    req.body?.alibabaApiKey ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  ).trim();

  const wsAlibabaBase = 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
  const intlAlibabaBase = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  const defaultBase = isAlibaba
    ? wsAlibabaBase
    : 'https://integrate.api.nvidia.com/v1';

  let baseUrl = (
    req.body?.baseUrl ||
    req.body?.alibabaBaseUrl ||
    (req.headers['x-base-url'] as string) ||
    defaultBase
  ).replace(/\/+$/, '');

  const isSilent = Boolean(
    req.body?.silent ||
    req.query.silent === 'true' ||
    req.headers['x-silent'] === 'true'
  );

  if (!apiKey) {
    if (isSilent) {
      return res.status(200).json({ error: `${providerLabel} API Key is required.`, data: [], ok: false });
    }
    return res.status(400).json({ error: `${providerLabel} API Key is required.` });
  }

  try {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    let response = await fetch(`${cleanBaseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok && isAlibaba && (response.status === 401 || response.status === 403 || response.status === 404)) {
      const altBaseUrl = cleanBaseUrl.includes('.maas.aliyuncs.com') ? intlAlibabaBase : wsAlibabaBase;
      const altRes = await fetch(`${altBaseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }).catch(() => null);
      if (altRes && altRes.ok) {
        response = altRes;
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = response.statusText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          cleanMsg = parsed.error.message;
        } else if (typeof parsed.error === 'string') {
          cleanMsg = parsed.error;
        } else if (parsed.message) {
          cleanMsg = parsed.message;
        }
      } catch {
        if (errText) cleanMsg = errText;
      }
      if (isSilent) {
        return res.status(200).json({
          error: `${providerLabel} (${response.status}): ${cleanMsg}`,
          status: response.status,
          data: [],
          ok: false,
          isAuthError: response.status === 401 || response.status === 403,
        });
      }
      return res.status(response.status).json({
        error: `${providerLabel} (${response.status}): ${cleanMsg}`,
        status: response.status,
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    if (isSilent) {
      return res.status(200).json({ error: err.message || `Failed to reach ${providerLabel} endpoint`, data: [], ok: false });
    }
    return res.status(500).json({ error: err.message || `Failed to reach ${providerLabel} endpoint` });
  }
});

// Dedicated Scene Illustration Endpoint (Alibaba Wanx / Qwen-Image -> Google Gemini Image -> Clean Error Diagnostics)
app.post(['/api/alibaba/images/generations', '/api/images/generate'], async (req, res) => {
  const { prompt, alibabaApiKey, alibabaBaseUrl, baseUrl, model, size } = req.body || {};
  const rawPrompt = String(prompt || '').trim();
  if (!rawPrompt) {
    return res.status(400).json({ error: 'El prompt de la escena es requerido.' });
  }

  // Enhanced light novel anime aesthetic prompt
  const enhancedPrompt = `Masterpiece light novel concept art, anime visual novel illustration style, "Jukkou no Zankyou" dark fantasy novel, highly detailed, dramatic atmospheric lighting, expressive emotion, intricate textures, rich cinematic depth, 8k resolution: ${rawPrompt.slice(0, 500)}`;

  const cleanAliKey = (alibabaApiKey || process.env.ALIBABA_API_KEY || '').trim();
  const customDedicatedUrl = String(alibabaBaseUrl || baseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const customDedicatedOrigin = customDedicatedUrl.replace(/\/compatible-mode\/v1$/i, '').replace(/\/api\/v1$/i, '');

  let lastAliError = '';

  // 1. Try Alibaba Cloud Dedicated Endpoint & Model Studio (ws-sitvcc6ml5lia10m -> DashScope Intl -> CN)
  if (cleanAliKey) {
    const requestedModel = (!model || model === 'wanx-2.1-t2i-turbo' || model === 'wanx2.1-t2i-turbo')
      ? 'wanx2.1-t2i-turbo'
      : model === 'wanx2.1-t2i-plus' || model === 'wan2.1-t2i-plus'
      ? 'wanx2.1-t2i-plus'
      : model;

    const candidateImageModels = Array.from(new Set([
      requestedModel,
      'wanx2.1-t2i-plus',
      'wanx2.1-t2i-turbo',
    ]));

    const formattedSize = size && size.includes('*') ? size : (size || '1024*1024').replace('x', '*');
    const oaiSize = formattedSize.replace('*', 'x');

    const oaiBaseUrls = Array.from(new Set([
      customDedicatedUrl.endsWith('/compatible-mode/v1') ? customDedicatedUrl : `${customDedicatedOrigin}/compatible-mode/v1`,
      'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ]));

    const dashscopeBaseUrls = Array.from(new Set([
      `${customDedicatedOrigin}/api/v1`,
      'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/api/v1',
      'https://dashscope-intl.aliyuncs.com/api/v1',
      'https://dashscope.aliyuncs.com/api/v1',
    ]));

    // Method A: OpenAI-compatible image generations endpoint
    for (const oaiBaseUrl of oaiBaseUrls) {
      for (const candidateModel of candidateImageModels) {
        try {
          const oaiRes = await fetch(`${oaiBaseUrl}/images/generations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cleanAliKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: candidateModel,
              prompt: enhancedPrompt,
              size: oaiSize,
              n: 1,
            }),
          });

          if (oaiRes.ok) {
            const oaiData = await oaiRes.json();
            const imgItem = oaiData.data?.[0];
            const directUrl = imgItem?.url || imgItem?.b64_json;
            if (directUrl) {
              let dataUrl = directUrl;
              if (!directUrl.startsWith('http') && !directUrl.startsWith('data:')) {
                dataUrl = `data:image/png;base64,${directUrl}`;
              } else if (directUrl.startsWith('http')) {
                try {
                  const imgFetch = await fetch(directUrl);
                  if (imgFetch.ok) {
                    const arrayBuf = await imgFetch.arrayBuffer();
                    const b64 = Buffer.from(arrayBuf).toString('base64');
                    const mime = imgFetch.headers.get('content-type') || 'image/jpeg';
                    dataUrl = `data:${mime};base64,${b64}`;
                  }
                } catch {
                  // Keep direct HTTP URL
                }
              }

              return res.json({
                dataUrl,
                url: directUrl,
                prompt: rawPrompt,
                engine: 'alibaba-wanx',
                model: candidateModel,
              });
            }
          } else {
            const errText = await oaiRes.text().catch(() => '');
            lastAliError = `Alibaba HTTP ${oaiRes.status}: ${errText.slice(0, 180)}`;
            if (oaiRes.status === 401 || oaiRes.status === 403) break;
          }
        } catch (oaiErr: any) {
          lastAliError = oaiErr?.message || 'Error de red con Alibaba Cloud';
          break;
        }
      }
    }

    // Method B: DashScope Async Wanx Task Endpoint (/services/aigc/text2image/image-synthesis)
    for (const wanxBaseUrl of dashscopeBaseUrls) {
      for (const candidateModel of candidateImageModels) {
        try {
          const wanxRes = await fetch(`${wanxBaseUrl}/services/aigc/text2image/image-synthesis`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cleanAliKey}`,
              'Content-Type': 'application/json',
              'X-DashScope-Async': 'enable',
            },
            body: JSON.stringify({
              model: candidateModel,
              input: {
                prompt: enhancedPrompt,
              },
              parameters: {
                size: formattedSize,
                n: 1,
              },
            }),
          });

          if (wanxRes.ok) {
            const wanxData = await wanxRes.json();
            const taskId = wanxData.output?.task_id;
            if (taskId) {
              let imageUrl = '';
              for (let i = 0; i < 25; i++) {
                await new Promise((r) => setTimeout(r, 1200));
                const pollRes = await fetch(`${wanxBaseUrl}/tasks/${taskId}`, {
                  headers: { 'Authorization': `Bearer ${cleanAliKey}` },
                });
                if (pollRes.ok) {
                  const pollData = await pollRes.json();
                  const status = pollData.output?.task_status;
                  if (status === 'SUCCEEDED') {
                    const results = pollData.output?.results;
                    if (Array.isArray(results) && results[0]?.url) {
                      imageUrl = results[0].url;
                      break;
                    }
                  } else if (status === 'FAILED') {
                    const failMsg = pollData.output?.message || pollData.message || 'Tarea de imagen fallida en Alibaba';
                    lastAliError = failMsg;
                    break;
                  }
                }
              }

              if (imageUrl) {
                try {
                  const imgFetch = await fetch(imageUrl);
                  if (imgFetch.ok) {
                    const arrayBuf = await imgFetch.arrayBuffer();
                    const b64 = Buffer.from(arrayBuf).toString('base64');
                    const mime = imgFetch.headers.get('content-type') || 'image/jpeg';
                    return res.json({
                      dataUrl: `data:${mime};base64,${b64}`,
                      url: imageUrl,
                      prompt: rawPrompt,
                      engine: 'alibaba-wanx',
                      model: candidateModel,
                    });
                  }
                } catch {
                  // Fall through to direct URL
                }
                return res.json({
                  dataUrl: imageUrl,
                  url: imageUrl,
                  prompt: rawPrompt,
                  engine: 'alibaba-wanx',
                  model: candidateModel,
                });
              }
            }
          } else {
            const errText = await wanxRes.text().catch(() => '');
            lastAliError = `DashScope HTTP ${wanxRes.status}: ${errText.slice(0, 180)}`;
            if (wanxRes.status === 401 || wanxRes.status === 403) break;
          }
        } catch (e: any) {
          lastAliError = e?.message || 'Error de red con Alibaba Cloud';
          break;
        }
      }
    }
  }

  // 2. Try Google Gemini Native Image Synthesis (gemini-2.5-flash-image or imagen-3.0-generate-002)
  const geminiKey = (req.body?.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  if (geminiKey) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      // 2A. Try gemini-2.5-flash-image first
      try {
        const flashImgRes = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [{ text: enhancedPrompt }],
          },
        });
        const parts = flashImgRes.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            return res.json({
              dataUrl: `data:${mime};base64,${part.inlineData.data}`,
              prompt: rawPrompt,
              engine: 'google-gemini-image',
              model: model || 'gemini-2.5-flash-image',
            });
          }
        }
      } catch (flashErr: any) {
        console.warn('[Gemini 2.5 Flash Image notice]:', flashErr?.message || flashErr);
      }

      // 2B. Try Imagen 3
      const imagenRes = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: `Masterpiece dark fantasy visual novel illustration, anime light novel concept art: ${rawPrompt.slice(0, 400)}`,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        },
      });

      const base64Bytes = imagenRes.generatedImages?.[0]?.image?.imageBytes;
      if (base64Bytes) {
        return res.json({
          dataUrl: `data:image/jpeg;base64,${base64Bytes}`,
          prompt: rawPrompt,
          engine: 'google-imagen-3',
          model: 'imagen-3.0-generate-002',
        });
      }
    } catch (imagenErr: any) {
      console.warn('[Google Imagen 3 notice]:', imagenErr?.message || imagenErr);
      if (!lastAliError) {
        lastAliError = imagenErr?.message || 'Error en motor de imagen';
      }
    }
  }

  return res.status(502).json({
    error: lastAliError
      ? `Fallo al comunicar con el motor de imagen (${model || 'Wanx'}): ${lastAliError}`
      : 'No se pudo conectar con Alibaba Cloud ni Google Gemini para generar la imagen. Verifica tu API Key en Ajustes.',
  });
});

// Dedicated Video Generation Endpoint (Wan3.0-Video, Wan2.7-i2v, HappyHorse 1.1/1.0, Wan2.1)
app.post(['/api/alibaba/videos/generations', '/api/videos/generate'], async (req, res) => {
  const { prompt, img_url, imageDataUrl, model, duration, resolution, size, alibabaApiKey, alibabaBaseUrl, baseUrl } = req.body || {};
  const rawPrompt = String(prompt || '').trim();
  const inputImageUrl = (img_url || imageDataUrl || '').trim();

  if (!rawPrompt && !inputImageUrl) {
    return res.status(400).json({ error: 'Se requiere una descripción de la escena o una imagen para generar el video.' });
  }

  const selectedModel = model || 'wan3.0-video';
  const cleanAliKey = (alibabaApiKey || process.env.ALIBABA_API_KEY || '').trim();
  const parsedDur = Number(duration);
  const videoDuration = [3, 4, 5, 10, 15, 30].includes(parsedDur) ? parsedDur : (parsedDur > 0 && parsedDur <= 30 ? parsedDur : 5);
  const targetResolution = resolution || (size === '1080P' || size === '1920*1080' ? '1080P' : '720P');

  if (!cleanAliKey) {
    return res.status(400).json({
      error: `Falta la API Key de Alibaba Cloud para usar ${selectedModel}. Configura tu clave de Alibaba DashScope en Ajustes.`,
    });
  }

  const customDedicatedUrl = String(alibabaBaseUrl || baseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  const customDedicatedOrigin = customDedicatedUrl.replace(/\/compatible-mode\/v1$/i, '').replace(/\/api\/v1$/i, '');

  let lastVideoError = '';

  const oaiVideoBaseUrls = Array.from(new Set([
    customDedicatedUrl.endsWith('/compatible-mode/v1') ? customDedicatedUrl : `${customDedicatedOrigin}/compatible-mode/v1`,
    'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  ]));

  const videoBaseUrls = Array.from(new Set([
    `${customDedicatedOrigin}/api/v1`,
    'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/api/v1',
    'https://dashscope-intl.aliyuncs.com/api/v1',
    'https://dashscope.aliyuncs.com/api/v1',
  ]));

  // Candidate models: try user's exact selection first, then canonical DashScope Wan Video IDs
  const candidateVideoModels = Array.from(new Set([
    selectedModel,
    ...(inputImageUrl
      ? ['wan2.1-i2v-turbo', 'wanx2.1-i2v-turbo', 'wan2.1-i2v-plus']
      : ['wan2.1-t2v-turbo', 'wanx2.1-t2v-turbo', 'wan2.1-t2v-plus']),
  ]));

  const enhancedVideoPrompt = `Masterpiece cinematic anime scene, dynamic fluid motion, expressive visual novel dark fantasy animation: ${rawPrompt.slice(0, 450)}`;

  // 1A. Try Dedicated OpenAI-compatible /compatible-mode/v1/videos/generations first
  for (const oaiBase of oaiVideoBaseUrls) {
    for (const candidateModel of candidateVideoModels) {
      try {
        const oaiVideoRes = await fetch(`${oaiBase}/videos/generations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanAliKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: candidateModel,
            prompt: enhancedVideoPrompt,
            ...(inputImageUrl ? { img_url: inputImageUrl, image: inputImageUrl } : {}),
            duration: videoDuration,
            size: targetResolution === '1080P' ? '1920x1080' : '1280x720',
          }),
        });

        if (oaiVideoRes.ok) {
          const oaiVideoData = await oaiVideoRes.json();
          const directVideoUrl = oaiVideoData.data?.[0]?.url || oaiVideoData.output?.video_url || oaiVideoData.video_url;
          if (directVideoUrl) {
            return res.json({
              videoUrl: directVideoUrl,
              prompt: rawPrompt,
              engine: 'alibaba-wan-video-dedicated',
              model: candidateModel,
              duration: videoDuration,
              resolution: targetResolution,
            });
          }
          const oaiTaskId = oaiVideoData.id || oaiVideoData.task_id || oaiVideoData.output?.task_id;
          if (oaiTaskId) {
            return res.json({
              videoUrl: null,
              taskId: oaiTaskId,
              status: 'RUNNING',
              pollBaseUrl: oaiBase,
              prompt: rawPrompt,
              engine: 'alibaba-wan-video-dedicated',
              model: candidateModel,
              duration: videoDuration,
              resolution: targetResolution,
            });
          }
        } else {
          const errText = await oaiVideoRes.text().catch(() => '');
          lastVideoError = `HTTP ${oaiVideoRes.status}: ${errText.slice(0, 180)}`;
          if (oaiVideoRes.status === 401 || oaiVideoRes.status === 403) break;
        }
      } catch (err: any) {
        lastVideoError = err?.message || 'Error de conexión con endpoint de video';
        break;
      }
    }
  }

  // 1B. Try DashScope Video Synthesis endpoint (Dedicated host first, then Intl/CN)
  for (const baseUrl of videoBaseUrls) {
    for (const candidateModel of candidateVideoModels) {
      try {
        const payloadInput: Record<string, any> = {
          prompt: enhancedVideoPrompt,
        };

        if (inputImageUrl) {
          payloadInput.img_url = inputImageUrl;
        }

        const isCanonicalFallback = candidateModel !== selectedModel;
        const parametersPayload: Record<string, any> = isCanonicalFallback
          ? {
              size: targetResolution === '1080P' ? '1920*1080' : '1280*720',
              prompt_extend: true,
            }
          : {
              duration: videoDuration,
              resolution: targetResolution,
              size: targetResolution === '1080P' ? '1920*1080' : '1280*720',
            };

        const videoReq = await fetch(`${baseUrl}/services/aigc/video-generation/video-synthesis`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanAliKey}`,
            'Content-Type': 'application/json',
            'X-DashScope-Async': 'enable',
          },
          body: JSON.stringify({
            model: candidateModel,
            input: payloadInput,
            parameters: parametersPayload,
          }),
        });

        if (videoReq.ok) {
          const videoData = await videoReq.json();
          const taskId = videoData.output?.task_id;
          if (taskId) {
            // Brief initial check (2 polls = ~3s); if still running, hand off taskId to client for smooth live progress polling
            for (let i = 0; i < 2; i++) {
              await new Promise((r) => setTimeout(r, 1500));
              const pollRes = await fetch(`${baseUrl}/tasks/${taskId}`, {
                headers: { 'Authorization': `Bearer ${cleanAliKey}` },
              }).catch(() => null);
              if (pollRes && pollRes.ok) {
                const pollData = await pollRes.json();
                const taskStatus = pollData.output?.task_status;
                if (taskStatus === 'SUCCEEDED') {
                  const finalVideoUrl = pollData.output?.video_url || pollData.output?.results?.[0]?.url || '';
                  if (finalVideoUrl) {
                    return res.json({
                      videoUrl: finalVideoUrl,
                      taskId,
                      prompt: rawPrompt,
                      engine: 'alibaba-wan-video',
                      model: candidateModel,
                      duration: videoDuration,
                      resolution: targetResolution,
                    });
                  }
                } else if (taskStatus === 'FAILED') {
                  const failMsg = pollData.output?.message || pollData.message || 'Error en la tarea de video de Alibaba';
                  lastVideoError = failMsg;
                  break;
                }
              }
            }

            if (!lastVideoError) {
              return res.json({
                videoUrl: null,
                taskId,
                status: 'RUNNING',
                pollBaseUrl: baseUrl,
                prompt: rawPrompt,
                engine: 'alibaba-wan-video',
                model: candidateModel,
                duration: videoDuration,
                resolution: targetResolution,
              });
            }
          }
        } else {
          const errText = await videoReq.text().catch(() => '');
          let cleanErr = errText.slice(0, 200);
          try {
            const parsed = JSON.parse(errText);
            cleanErr = parsed.message || parsed.error?.message || cleanErr;
          } catch {}
          lastVideoError = `Alibaba (${videoReq.status}): ${cleanErr}`;
          if (videoReq.status === 401 || videoReq.status === 403) break;
        }
      } catch (err: any) {
        lastVideoError = err?.message || 'Error de conexión con Alibaba Video';
        break;
      }
    }
  }

  return res.status(502).json({
    error: lastVideoError
      ? `Fallo al comunicar con Alibaba Cloud (${selectedModel}): ${lastVideoError}`
      : `No se pudo iniciar la síntesis de video con ${selectedModel} en Alibaba Cloud.`,
  });
});

// Video Task Polling Endpoint for Long-Running Alibaba Tasks
app.get('/api/alibaba/videos/status/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const cleanAliKey = ((req.query.alibabaApiKey as string) || process.env.ALIBABA_API_KEY || '').trim();
  const preferredBase = ((req.query.pollBaseUrl as string) || '').trim().replace(/\/+$/, '');

  if (!taskId || !cleanAliKey) {
    return res.status(400).json({ error: 'TaskId y API Key requeridos' });
  }

  const videoBaseUrls = Array.from(new Set([
    ...(preferredBase ? [preferredBase] : []),
    'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/api/v1',
    'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
    'https://dashscope-intl.aliyuncs.com/api/v1',
    'https://dashscope.aliyuncs.com/api/v1',
  ]));

  for (const baseUrl of videoBaseUrls) {
    try {
      const endpointUrl = baseUrl.endsWith('/compatible-mode/v1')
        ? `${baseUrl}/videos/generations/${taskId}`
        : `${baseUrl}/tasks/${taskId}`;

      const pollRes = await fetch(endpointUrl, {
        headers: { 'Authorization': `Bearer ${cleanAliKey}` },
      });
      if (pollRes.ok) {
        const pollData = await pollRes.json();
        const status = pollData.output?.task_status || pollData.status || 'RUNNING';
        const videoUrl =
          pollData.output?.video_url ||
          pollData.output?.results?.[0]?.url ||
          pollData.data?.[0]?.url ||
          pollData.video_url ||
          '';
        const errorMsg = pollData.output?.message || pollData.error?.message || pollData.message || '';
        return res.json({
          status: String(status).toUpperCase(),
          videoUrl,
          error: status === 'FAILED' || status === 'failed' ? (errorMsg || 'La tarea de video falló en Alibaba Cloud') : undefined,
          raw: pollData,
        });
      }
    } catch {}
  }

  return res.status(404).json({ error: 'No se encontró el estado de la tarea en Alibaba Cloud' });
});
function pcm24kMonoToWavBuffer(pcmBuffer: Buffer): Buffer {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Dedicated Alibaba Cloud TTS Endpoint (Qwen-Audio-3.1-TTS-Plus, TTS-Flash & Neural HD Voices)
app.post('/api/alibaba/tts', async (req, res) => {
  const {
    text,
    alibabaApiKey,
    geminiApiKey: clientGeminiKey,
    voice = 'Cherry',
    model = 'auto',
    instruct = '',
  } = req.body || {};

  const cleanText = String(text || '').trim().slice(0, 2500);
  if (!cleanText) {
    return res.status(400).json({ error: 'Texto requerido para síntesis de voz' });
  }
  const cleanAliKey = (alibabaApiKey || process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();

  // Map UI voice personalities (Cherry, Serena, Luca, Ethan) to DashScope valid voice IDs + instructions
  const dashscopeVoiceMap: Record<string, { voiceId: string; defaultInstruct: string }> = {
    Cherry: {
      voiceId: 'Cherry',
      defaultInstruct: 'Habla en español con tono femenino cálido, enérgico, natural y entusiasta.',
    },
    Serena: {
      voiceId: 'Serena',
      defaultInstruct: 'Habla en español con tono femenino sereno, pausado, suave y reflexivo.',
    },
    Luca: {
      voiceId: 'Ethan',
      defaultInstruct: 'Habla en español con voz masculina grave, seria, profunda y estilo narrador literario.',
    },
    Ethan: {
      voiceId: 'Ethan',
      defaultInstruct: 'Habla en español con voz masculina joven, dinámica, fluida y conversacional.',
    },
  };

  const mappedVoice = dashscopeVoiceMap[String(voice)] || {
    voiceId: 'Cherry',
    defaultInstruct: '',
  };

  // 1. Standard DashScope AIGC TTS (only for non-workspace sk-... keys)
  if (cleanAliKey && !cleanAliKey.startsWith('sk-ws-')) {
    const isNarrativeScene =
      /[«»—]|(?:\bcap[íi]tulo\b|\bescena\b|\bsusurr|\bmirada\b|\bsilencio\b|\bsangre\b|\bcatarsis\b)/i.test(cleanText) ||
      cleanText.length > 420;

    let primaryModel = 'qwen-audio-3.1-tts-flash';
    if (model === 'qwen-audio-3.1-tts-plus') {
      primaryModel = 'qwen-audio-3.1-tts-plus';
    } else if (model === 'qwen-audio-3.1-tts-flash') {
      primaryModel = 'qwen-audio-3.1-tts-flash';
    } else {
      primaryModel = isNarrativeScene ? 'qwen-audio-3.1-tts-plus' : 'qwen-audio-3.1-tts-flash';
    }

    const candidateModels =
      primaryModel === 'qwen-audio-3.1-tts-plus'
        ? ['qwen-audio-3.1-tts-plus', 'qwen-audio-3.1-tts-flash']
        : ['qwen-audio-3.1-tts-flash', 'qwen-audio-3.1-tts-plus'];

    const cleanInstruct = String(instruct || mappedVoice.defaultInstruct || '').trim();
    const dashscopeUrls = [
      'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    ];

    try {
      for (const endpointUrl of dashscopeUrls) {
        for (const ttsModel of candidateModels) {
          const inputPayload: Record<string, any> = {
            text: cleanText,
            voice: mappedVoice.voiceId,
          };
          if (cleanInstruct) {
            inputPayload.instruct = cleanInstruct;
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2200);

          const ttsRes = await fetch(endpointUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cleanAliKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: ttsModel,
              input: inputPayload,
            }),
            signal: controller.signal,
          }).catch(() => null);

          clearTimeout(timeoutId);

          if (ttsRes && ttsRes.ok) {
            const data = await ttsRes.json();
            const audioUrl = data?.output?.audio?.url;
            const audioData = data?.output?.audio?.data;
            if (audioData) {
              return res.json({
                audioDataUrl: `data:audio/wav;base64,${audioData}`,
                model: ttsModel,
                voiceUsed: voice,
              });
            }
            if (audioUrl) {
              try {
                const audioFetch = await fetch(audioUrl);
                if (audioFetch.ok) {
                  const buf = await audioFetch.arrayBuffer();
                  const b64 = Buffer.from(buf).toString('base64');
                  const mime = audioFetch.headers.get('content-type') || 'audio/wav';
                  return res.json({
                    audioDataUrl: `data:${mime};base64,${b64}`,
                    audioUrl,
                    model: ttsModel,
                    voiceUsed: voice,
                  });
                }
              } catch {
                // Fall through to direct URL
              }
              return res.json({
                audioUrl,
                model: ttsModel,
                voiceUsed: voice,
              });
            }
          }
        }
      }
    } catch {
      // Fall through to neural Gemini / Cloud TTS backup
    }
  }

  // 2. Neural HD via Gemini 2.5 Flash TTS (when a standard AIza... Gemini API key is configured)
  const geminiKey = (clientGeminiKey || process.env.GEMINI_API_KEY || DEFAULT_GEMINI_API_KEY).replace(/[\r\n\s]+/g, '').trim();
  if (geminiKey && !geminiKey.startsWith('AQ.')) {
    try {
      const geminiVoiceMap: Record<string, string> = {
        Cherry: 'Aoede', // Energetic warm female
        Serena: 'Kore',  // Calm serene female
        Luca: 'Charon',  // Deep serious male narrator
        Ethan: 'Puck',   // Young dynamic male
      };
      const targetGeminiVoice = geminiVoiceMap[String(voice)] || 'Aoede';
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        vertexai: false,
      });

      const ttsResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: targetGeminiVoice },
            },
          },
        },
      });

      const inlineAudio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlineAudio?.data) {
        const rawBuf = Buffer.from(inlineAudio.data, 'base64');
        const mime = (inlineAudio.mimeType || '').toLowerCase();
        const wavBuf = mime.includes('wav') ? rawBuf : pcm24kMonoToWavBuffer(rawBuf);
        return res.json({
          audioDataUrl: `data:audio/wav;base64,${wavBuf.toString('base64')}`,
          model: 'gemini-2.5-flash-tts-hd',
          voiceUsed: voice,
        });
      }
    } catch (gemTtsErr) {
      console.warn('[Neural TTS Gemini Fallback warning]:', (gemTtsErr as any)?.message);
    }
  }

  // 3. Zero-Key Cloud Neural Spanish TTS (Works on Vercel & PC/Mobile with sk-ws- keys in <350ms!)
  // Uses distinct male/female neural voices for Luca/Ethan vs Cherry/Serena
  if (cleanText.length <= 290) {
    const isMaleVoice = voice === 'Luca' || voice === 'Ethan';
    const tiktokVoiceMap: Record<string, string> = {
      Cherry: 'es_mx_002',
      Serena: 'es_mx_002',
      Luca: 'es_002',
      Ethan: 'es_002',
    };
    const targetTiktokVoice = tiktokVoiceMap[String(voice)] || 'es_mx_002';

    // For male voices (Luca / Ethan) or expressive short turns, try TikTok Neural Spanish voice first (1.6s timeout), then ultra-fast Google Neural TTS
    if (isMaleVoice) {
      try {
        const tkController = new AbortController();
        const tkTimeout = setTimeout(() => tkController.abort(), 1650);
        const tkRes = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, voice: targetTiktokVoice }),
          signal: tkController.signal,
        }).catch(() => null);
        clearTimeout(tkTimeout);
        if (tkRes && tkRes.ok) {
          const tkData = await tkRes.json().catch(() => null);
          if (tkData?.data && typeof tkData.data === 'string' && tkData.data.length > 100) {
            return res.json({
              audioDataUrl: `data:audio/mp3;base64,${tkData.data}`,
              model: 'kizuna-neural-hd',
              voiceUsed: voice,
            });
          }
        }
      } catch {
        // Fall through to Google Cloud Neural TTS
      }
    }

    // Ultra-Low-Latency (<150ms) Google Neural TTS Stream (es-US / es-AR / es-ES / es-MX)
    try {
      const langMap: Record<string, string> = {
        Cherry: 'es-US',
        Serena: 'es-AR',
        Luca: 'es-ES',
        Ethan: 'es-MX',
      };
      const tl = langMap[String(voice)] || 'es-US';
      const gController = new AbortController();
      const gTimeout = setTimeout(() => gController.abort(), 1800);
      const gUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText.slice(0, 200))}&tl=${tl}&client=tw-ob&ttsspeed=${voice === 'Serena' || voice === 'Luca' ? '0.92' : '1.0'}`;
      const gRes = await fetch(gUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        signal: gController.signal,
      }).catch(() => null);
      clearTimeout(gTimeout);

      if (gRes && gRes.ok) {
        const arrBuf = await gRes.arrayBuffer();
        if (arrBuf.byteLength > 256) {
          const b64 = Buffer.from(arrBuf).toString('base64');
          return res.json({
            audioDataUrl: `data:audio/mpeg;base64,${b64}`,
            model: 'google-neural-hd',
            voiceUsed: voice,
          });
        }
      }
    } catch {
      // Fall through
    }
  }

  return res.status(200).json({ fallback: true });
});

// In-memory cache of the fastest working Alibaba ASR route so subsequent dictations hit in 1 single hop
let cachedFastAsrRoute: {
  protocol: 'dashscope' | 'oai';
  endpointUrl: string;
  model: string;
} | null = null;

// Dedicated Alibaba Cloud ASR Endpoint (Qwen-Audio-3.1-ASR-Flash Speech-to-Text — Ultra-Low Latency)
app.post('/api/alibaba/asr', async (req, res) => {
  const { audioBase64, mimeType = 'audio/webm', alibabaApiKey, language = 'es', warmup = false } = req.body || {};
  const cleanAliKey = (alibabaApiKey || process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();

  // Pre-warm TCP/TLS socket to Alibaba DashScope while user is speaking
  if (warmup) {
    if (cleanAliKey) {
      const targetUrl = cachedFastAsrRoute?.endpointUrl || 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
      fetch(targetUrl, {
        method: 'HEAD',
        headers: { 'Authorization': `Bearer ${cleanAliKey}`, 'Connection': 'keep-alive' },
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true, warmed: true });
  }

  const rawAudio = String(audioBase64 || '').trim();
  if (!rawAudio) {
    return res.status(400).json({ error: 'Audio requerido para transcripción ASR' });
  }

  if (!cleanAliKey) {
    return res.status(200).json({ fallback: true });
  }

  const pureBase64 = rawAudio.includes('base64,') ? rawAudio.split('base64,')[1] : rawAudio;
  const cleanMime = mimeType.split(';')[0].trim() || 'audio/webm';
  const formatHint = cleanMime.includes('mp4') || cleanMime.includes('m4a')
    ? 'mp4'
    : cleanMime.includes('ogg')
    ? 'ogg'
    : cleanMime.includes('wav')
    ? 'wav'
    : 'webm';
  const fullDataUri = `data:${cleanMime};base64,${pureBase64}`;

  const callDashscopeAsr = async (endpointUrl: string, asrModel: string): Promise<{ text: string; model: string }> => {
    const dsRes = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cleanAliKey}`,
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify({
        model: asrModel,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ audio: fullDataUri }],
            },
          ],
        },
        parameters: {
          asr_options: {
            language,
            enable_lid: false, // Skip language-detection pass since language ('es') is already known
            enable_itn: true,
          },
        },
      }),
    });

    if (!dsRes.ok) {
      throw new Error(`DS_${dsRes.status}`);
    }

    const dsData = await dsRes.json();
    const choiceContent = dsData?.output?.choices?.[0]?.message?.content;
    let transcript = '';
    if (typeof choiceContent === 'string') {
      transcript = choiceContent.trim();
    } else if (Array.isArray(choiceContent)) {
      transcript = choiceContent
        .map((item: any) => item?.text || '')
        .join(' ')
        .trim();
    } else if (dsData?.output?.text) {
      transcript = String(dsData.output.text).trim();
    }
    if (!transcript) {
      throw new Error('EMPTY_TRANSCRIPT');
    }
    cachedFastAsrRoute = { protocol: 'dashscope', endpointUrl, model: asrModel };
    return { text: transcript, model: asrModel };
  };

  const callOaiAsr = async (baseUrl: string, asrModel: string): Promise<{ text: string; model: string }> => {
    const oaiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cleanAliKey}`,
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify({
        model: asrModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: fullDataUri,
                  format: formatHint,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!oaiRes.ok) {
      throw new Error(`OAI_${oaiRes.status}`);
    }

    const oaiData = await oaiRes.json();
    const rawText = oaiData?.choices?.[0]?.message?.content;
    if (typeof rawText === 'string' && rawText.trim()) {
      cachedFastAsrRoute = { protocol: 'oai', endpointUrl: baseUrl, model: asrModel };
      return { text: rawText.trim(), model: asrModel };
    }
    throw new Error('EMPTY_OAI_TRANSCRIPT');
  };

  try {
    // 1. Fast Path: If we already discovered the fastest working endpoint+model, call it directly in 1 single hop!
    if (cachedFastAsrRoute) {
      try {
        const fastResult =
          cachedFastAsrRoute.protocol === 'dashscope'
            ? await callDashscopeAsr(cachedFastAsrRoute.endpointUrl, cachedFastAsrRoute.model)
            : await callOaiAsr(cachedFastAsrRoute.endpointUrl, cachedFastAsrRoute.model);
        return res.json(fastResult);
      } catch {
        cachedFastAsrRoute = null;
      }
    }

    // 2. Parallel Race Path: Race canonical real model IDs ('qwen3-asr-flash', 'qwen-audio-asr') across DashScope Intl & Dedicated Gateway simultaneously so we never wait for sequential 404/400 timeouts
    const dashscopeIntlUrl = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    const dedicatedDsUrl = 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
    const dedicatedOaiUrl = 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
    const intlOaiUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

    const winner = await Promise.any([
      callDashscopeAsr(dashscopeIntlUrl, 'qwen3-asr-flash'),
      callDashscopeAsr(dedicatedDsUrl, 'qwen3-asr-flash'),
      callDashscopeAsr(dashscopeIntlUrl, 'qwen-audio-asr'),
      callOaiAsr(dedicatedOaiUrl, 'qwen3-asr-flash'),
      callOaiAsr(intlOaiUrl, 'qwen3-asr-flash'),
    ]);

    return res.json(winner);
  } catch {
    return res.status(200).json({ fallback: true });
  }
});


// Proxy endpoint for NVIDIA NIM & Alibaba Cloud chat completions (bypasses browser CORS on local server & Vercel)
app.post(['/api/nvidia/v1/chat/completions', '/api/nvidia/chat/completions', '/api/alibaba/v1/chat/completions', '/api/alibaba/chat/completions'], async (req, res) => {
  const isAlibaba = req.path.includes('alibaba');
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(400).json({ error: `Authorization header with ${isAlibaba ? 'Alibaba' : 'NVIDIA'} API Key is required.` });
  }

  try {
    const wsAlibabaBase = 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
    const intlAlibabaBase = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

    const defaultBase = isAlibaba
      ? wsAlibabaBase
      : 'https://integrate.api.nvidia.com/v1';
    let rawBase = ((req.headers['x-base-url'] as string) || req.body?.baseUrl || req.body?.alibabaBaseUrl || defaultBase).replace(/\/+$/, '');
    if (!isAlibaba && rawBase.includes('integrate.api.nvidia.com') && !rawBase.endsWith('/v1')) {
      rawBase = `${rawBase}/v1`;
    }
    let customBase = rawBase;
    const isStream = req.body?.stream === true;

    // Detect dedicated workspace ID (e.g. ws-sitvcc6ml5lia10m)
    const wsMatch = customBase.match(/(ws-[a-zA-Z0-9]+)/i);
    const workspaceHeader = wsMatch ? wsMatch[1] : undefined;

    // Remove custom baseUrl & non-standard params from payload before forwarding to NVIDIA
    const forwardBody = { ...req.body };
    delete forwardBody.baseUrl;
    delete forwardBody.enable_reasoning;
    delete forwardBody.reasoningMode;
    delete forwardBody.isWebSearchEnabled;

    if (isAlibaba) {
      delete forwardBody.reasoning_effort;
      delete forwardBody.tools;
      delete forwardBody.tool_choice;
      delete forwardBody.enable_search;
      delete forwardBody.search_options;
      if (isStream && !forwardBody.stream_options) {
        forwardBody.stream_options = { include_usage: true };
      }
      if (forwardBody.model === 'kimi-k3.1-pro' || forwardBody.model === 'kimi/kimi-k3.1-pro' || forwardBody.model === 'moonshotai/kimi-k3.1-pro') {
        forwardBody.model = 'kimi-k3.1-pro';
        delete forwardBody.temperature;
        delete forwardBody.top_p;
      } else if (forwardBody.model === 'kimi-k3' || forwardBody.model === 'kimi/kimi-k3' || forwardBody.model === 'moonshotai/kimi-k3') {
        forwardBody.model = 'kimi-k3';
        delete forwardBody.temperature;
        delete forwardBody.top_p;
      }
      if (req.body?.enable_thinking !== undefined) {
        const enableThinkFlag = Boolean(req.body.enable_thinking);
        forwardBody.enable_thinking = enableThinkFlag;
        forwardBody.extra_body = {
          ...(forwardBody.extra_body || {}),
          enable_thinking: enableThinkFlag,
        };
        if (!enableThinkFlag && forwardBody.extra_body) {
          delete forwardBody.extra_body.thinking_budget;
          delete forwardBody.thinking_budget;
        }
      } else if (req.body?.enableReasoning !== undefined) {
        const enableReasonFlag = req.body.enableReasoning !== false;
        forwardBody.enable_thinking = enableReasonFlag;
        forwardBody.extra_body = {
          ...(forwardBody.extra_body || {}),
          enable_thinking: enableReasonFlag,
        };
        if (!enableReasonFlag && forwardBody.extra_body) {
          delete forwardBody.extra_body.thinking_budget;
          delete forwardBody.thinking_budget;
        }
      }
      if (forwardBody.model === 'qwen-3.8-max') forwardBody.model = 'qwen3.8-max';
      if (forwardBody.model === 'qwen-3.8-flash') forwardBody.model = 'qwen3.8-flash';
      if (forwardBody.model === 'qwen-3.8-omni-flash') forwardBody.model = 'qwen3.8-omni-flash';
    }

    let targetUrl = `${customBase}/chat/completions`;
    console.log('[Server Proxy] Despachando a:', targetUrl, 'Model:', forwardBody.model, 'Workspace:', workspaceHeader);

    const isDedicatedWs = customBase.includes('.maas.aliyuncs.com');
    const isSkWsKey = authHeader.includes('sk-ws-');
    const reqHeaders: Record<string, string> = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      ...(isAlibaba ? { 'X-DashScope-CacheControl': 'enable', 'x-dashscope-session-cache': 'enable' } : {}),
      ...(isAlibaba && workspaceHeader && !isDedicatedWs && !isSkWsKey ? { 'X-DashScope-Workspace': workspaceHeader } : {}),
    };

    let response = await fetch(targetUrl, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(forwardBody),
    });

    if (!response.ok && isAlibaba) {
      let errText = await response.text().catch(() => '');

      // Auto-switch endpoint if Workspace endpoint access denied (403/401/404)
      if (response.status === 403 || response.status === 401 || response.status === 404 || /Workspace endpoint access denied|Access denied|Forbidden/i.test(errText)) {
        const altBase = customBase.includes('.maas.aliyuncs.com') ? intlAlibabaBase : wsAlibabaBase;
        const altUrl = `${altBase}/chat/completions`;
        console.warn(`[Server Proxy] HTTP ${response.status} en ${targetUrl}. Reintentando en endpoint alternativo: ${altUrl}...`);
        const altRes = await fetch(altUrl, {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify(forwardBody),
        });
        if (altRes.ok) {
          response = altRes;
          customBase = altBase;
          targetUrl = altUrl;
          errText = '';
        } else {
          response = altRes;
          errText = await altRes.text().catch(() => '');
        }
      }

      // Auto-fallback model if model not found on that endpoint
      if (!response.ok && (response.status === 404 || response.status === 400 || response.status === 403) && /model_not_found|Model not exist|Access to model denied|ModelNotOpen|does not exist/i.test(errText)) {
        const fallbacks = ['qwen-plus', 'qwen-flash', 'qwen-max', 'qwen3.8-max'].filter((m) => m !== forwardBody.model);
        const candidateBases = [customBase, customBase.includes('.maas.aliyuncs.com') ? intlAlibabaBase : wsAlibabaBase];
        for (const base of candidateBases) {
          if (response.ok) break;
          for (const fbModel of fallbacks) {
            forwardBody.model = fbModel;
            const fbRes = await fetch(`${base}/chat/completions`, {
              method: 'POST',
              headers: reqHeaders,
              body: JSON.stringify(forwardBody),
            });
            if (fbRes.ok) {
              response = fbRes;
              errText = '';
              break;
            } else {
              errText = await fbRes.text().catch(() => '');
            }
          }
        }
      }

      if (!response.ok) {
        return res.status(response.status).send(errText || response.statusText);
      }
    } else if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).send(errText || response.statusText);
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform, no-buffering');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Content-Encoding', 'none');
      res.flushHeaders?.();
      req.socket?.setNoDelay?.(true);

      if (!response.body) {
        return res.end();
      }

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }
      return res.end();
    } else {
      const data = await response.json();
      return res.json(data);
    }
  } catch (err: any) {
    console.error('Error proxying NVIDIA chat/completions:', err);
    return res.status(500).json({ error: err.message || 'Error proxying to NVIDIA NIM' });
  }
});

// In-memory buffer for background chat jobs so mobile clients can switch apps (e.g. YouTube) or lock screen without losing responses
interface BackgroundChatJob {
  jobId: string;
  text: string;
  reasoning: string;
  sources?: any[];
  ttftSeconds?: number;
  cachedTokens?: number;
  completionTokens?: number;
  truncated?: boolean;
  done: boolean;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const activeChatJobs = new Map<string, BackgroundChatJob>();

// Clean up jobs older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of activeChatJobs.entries()) {
    if (job.updatedAt < cutoff) {
      activeChatJobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

app.get('/api/chat/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = activeChatJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ found: false });
  }
  return res.json({ found: true, job });
});

// Main chat streaming endpoint
app.post('/api/chat', async (req, res) => {
  const {
    jobId,
    messages = [],
    systemInstruction = '',
    folderSystemPrompt = '',
    loreContext = '',
    memories = [],
    webSearchResults = [],
    webSearchSummary = '',
    isWebSearchEnabled = false,
    provider = 'gemini', // 'gemini' | 'custom'
    customConfig = {},
    maxOutputTokens = 8192,
    temperature = 0.7,
    model = 'gemini-3.6-flash',
    enableReasoning = true,
    reasoningMode = 'deep',
    userProfile = {},
    personalityConfig = {},
    sessionSummary = '',
  } = req.body;

  const activeJob: BackgroundChatJob | null = jobId
    ? {
        jobId: String(jobId),
        text: '',
        reasoning: '',
        done: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    : null;

  if (activeJob) {
    activeChatJobs.set(activeJob.jobId, activeJob);
    res.on('close', () => {
      if (activeJob && !activeJob.done) {
        console.log(`[Background Stream] Cliente móvil en segundo plano (${activeJob.jobId}) — el servidor continúa generando la respuesta.`);
      }
    });
  }

  // Set SSE streaming headers with zero buffering, no socket timeout & immediate packet dispatch
  req.setTimeout?.(0);
  res.setTimeout?.(0);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform, no-buffering');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disables proxy buffering in Cloud Run & Nginx
  res.setHeader('Content-Encoding', 'none');
  res.flushHeaders?.();
  req.socket?.setNoDelay?.(true);
  res.socket?.setNoDelay?.(true);
  res.socket?.setKeepAlive?.(true, 1000);

  // Force proxy to immediately open chunked stream channel without waiting:
  try {
    if (!res.writableEnded) {
      res.write(': stream-start\n\n');
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    }
  } catch {}

  // Direct SSE chunk writer + persistent background job buffer
  const sendChunk = (data: { text?: string; reasoning?: string; done?: boolean; error?: string; sources?: any[]; ttftSeconds?: number; cachedTokens?: number; completionTokens?: number; truncated?: boolean }) => {
    if (activeJob) {
      if (data.text) activeJob.text += data.text;
      if (data.reasoning) activeJob.reasoning += data.reasoning;
      if (data.sources) activeJob.sources = data.sources;
      if (data.ttftSeconds !== undefined) activeJob.ttftSeconds = data.ttftSeconds;
      if (data.cachedTokens !== undefined) activeJob.cachedTokens = data.cachedTokens;
      if (data.completionTokens !== undefined) activeJob.completionTokens = data.completionTokens;
      if (data.truncated !== undefined) activeJob.truncated = data.truncated;
      if (data.error) activeJob.error = data.error;
      if (data.done) activeJob.done = true;
      activeJob.updatedAt = Date.now();
    }
    try {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }
    } catch {
      // Client socket closed (e.g. mobile screen locked or switched to YouTube); server continues writing to activeJob
    }
  };

  try {
    // Compile comprehensive system prompt with hierarchy:
    // 1. Directiva explícita de Bóveda de Lore (Lore Storage)
    // 2. Core workspace & novel writing guidelines
    // 3. Folder-specific system prompt (worldbuilding / arc rules)
    // 4. Active Lore documents injected context
    // 5. Smart persistent memories
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

    if (systemInstruction && systemInstruction.trim()) {
      promptSections.push(`### SYSTEM DIRECTIVE & PERSONA\n${systemInstruction.trim()}`);
    }

    if (folderSystemPrompt && folderSystemPrompt.trim()) {
      promptSections.push(`### WORKSPACE / FOLDER CONTEXT & WORLDBUILDING RULES\n${folderSystemPrompt.trim()}`);
    }

    const lastUserMessage = [...(messages || [])].reverse().find((m: any) => m.role === 'user');
    const lastUserPrompt = lastUserMessage?.content || '';
    const hasUserAttachments = Array.isArray(lastUserMessage?.attachments) && lastUserMessage.attachments.length > 0;
    const isCasualOrShortGreeting = !hasUserAttachments && isCasualGreeting(lastUserPrompt);
    const userAsksAboutLore = /lore|bóveda|boveda|manuscrito|capítulo|capitulo|escena|documento|archivos|fichas|canon/i.test(lastUserPrompt);

    if (loreContext && loreContext.trim()) {
      const optimizedLore = extractRelevantChaptersServer(loreContext, '');
      if (optimizedLore.includes('[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO') || optimizedLore.includes('[SELECCIÓN INTELIGENTE DE CAPÍTULOS')) {
        promptSections.push(optimizedLore.trim());
      } else {
        promptSections.push(
          `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO]:\n--- INICIO DE DOCUMENTOS ---\n${optimizedLore.trim()}\n--- FIN DE DOCUMENTOS ---`
        );
      }
    }

    const staticSystemInstruction = promptSections.join('\n\n');
    const dynamicPromptSections: string[] = [];

    if (sessionSummary && typeof sessionSummary === 'string' && sessionSummary.trim()) {
      dynamicPromptSections.push(sessionSummary.trim());
    }

    if (Array.isArray(memories) && !isCasualOrShortGreeting) {
      const pollutedMemPattern = /antipsicol[oó]g|no tiene filosof[ií]a|sin filosof[ií]a|eso lo hace especial/i;
      const activeMemories = memories
        .filter((m: any) => m.enabled !== false && !pollutedMemPattern.test(m.text || ''))
        .map((m: any) => `- ${m.text}`);
      if (activeMemories.length > 0) {
        dynamicPromptSections.push(`### PERSISTENT LONG-TERM MEMORY (KEY FACTS TO REMEMBER — DO NOT RECITE UNPROMPTED IN GREETINGS)\n${activeMemories.join('\n')}`);
      }
    }

    console.log("Despachando llamada en servidor con webSearch:", Boolean(isWebSearchEnabled));

    // STRICT ENGINE DISPATCH:
    // Route to OpenAI-compatible custom endpoint when provider is 'custom', 'nvidia', or 'alibaba' (with key configured).
    // If provider is 'gemini' (or 3P provider without configured API key), STRICTLY dispatch to Google Gemini!
    const serverAlibabaKey = (
      customConfig?.alibabaApiKey ||
      process.env.ALIBABA_API_KEY ||
      process.env.DASHSCOPE_API_KEY ||
      (customConfig?.apiKey && !customConfig.apiKey.startsWith('nvapi-') ? customConfig.apiKey : '')
    )?.trim();
    const serverNvidiaKey = (
      customConfig?.apiKey ||
      process.env.NVIDIA_API_KEY ||
      ''
    )?.trim();
    const hasAlibabaKeyOnServer = Boolean(serverAlibabaKey);
    const hasNvidiaKeyOnServer = Boolean(serverNvidiaKey);
    const isCustomOrNvidia =
      ((provider === 'custom' || provider === 'nvidia') && hasNvidiaKeyOnServer) ||
      (provider === 'alibaba' && hasAlibabaKeyOnServer);

    if (isWebSearchEnabled && !isCasualOrShortGreeting) {
      if (isCustomOrNvidia) {
        dynamicPromptSections.push(
          `### DIRECTIVA DEL GRIMORIO WEB (BÚSQUEDA AUTÓNOMA Y TRANSPARENCIA)
Tienes el Grimorio Web (búsqueda en internet en tiempo real) ACTIVADO por el usuario.
1. CUÁNDO SÍ BUSCAR EN LA RED (1 consulta quirúrgica):
   - Si el usuario te pide explícitamente buscar ("busca...", "averigua...", "investiga...", "rastrea...", "qué novedades hay de...").
   - Si la consulta es sobre noticias actuales, hardware, precios, fechas de lanzamiento, eventos recientes o datos externos que requieran verificación en vivo.
   - En este caso, emite de inmediato la llamada a la herramienta:
<tool_call>
{"name": "web_search", "arguments": {"query": "términos exactos de búsqueda"}}
</tool_call>
2. CUÁNDO NO BUSCAR (CONOCIMIENTO "A CAPA Y ESPADA"):
   - Si la consulta trata sobre literatura universal (Fiódor Dostoyevski, Lev Myshkin, Dante Alighieri, Shakespeare, etc.), ficción y novelas consolidadas (Re:Zero, Umineko), filosofía, teoría narrativa, o sobre los personajes y canon de 'Jukkou no Zankyou' / Kizuna-Zek:
   - NO emitas <tool_call> innecesarias para cuidar la cuota y no demorar la respuesta.
   - TRANSPARENCIA: En tu pensamiento interno (💧 Pensado durante...) y/o de forma natural y cálida en tu respuesta, confirma que el Grimorio Web está activo pero que dominas la materia canónicamente "a capa y espada" con tu propio conocimiento profundo, por lo que no es necesario gastar búsqueda externa.
PROHIBIDO emitir más de un bloque <tool_call> por turno.`
        );
      } else {
        dynamicPromptSections.push(
          `### DIRECTIVA DE BÚSQUEDA WEB NATIVA (GOOGLE SEARCH GROUNDING)
Tienes habilitada tu herramienta oficial nativa de Google Search en tiempo real. Si el usuario consulta sobre noticias actuales, modelos, precios, fechas o datos externos, utiliza automáticamente tu herramienta nativa de Google Search para fundamentar tu respuesta con precisión. Si la consulta es sobre literatura clásica, ficción o lore que ya dominas 'a capa y espada', responde con tu conocimiento canónico sin forzar búsquedas innecesarias.`
        );
      }
    }

    if (webSearchSummary || (Array.isArray(webSearchResults) && webSearchResults.length > 0)) {
      let webPromptBlock = `[INFORMACIÓN DE BÚSQUEDA WEB EN TIEMPO REAL - VÍA TAVILY SEARCH]:`;
      if (webSearchSummary) {
        webPromptBlock += `\n${webSearchSummary}\n`;
      }
      if (Array.isArray(webSearchResults) && webSearchResults.length > 0) {
        const snippets = webSearchResults
          .map(
            (r: any, idx: number) =>
              `[${idx + 1}] "${r.title}"\nURL: ${r.url}\n${r.snippet ? `Contenido: ${r.snippet}` : ''}`
          )
          .join('\n\n');
        webPromptBlock += `\n[FUENTES TAVILY DESTACADAS]:\n${snippets}\n`;
      }
      webPromptBlock += `--- Fin de información de búsqueda web en tiempo real de Tavily. Utiliza estos datos para responder con máxima precisión. ---`;

      dynamicPromptSections.push(webPromptBlock);
    }

    const dynamicSystemInstruction = dynamicPromptSections.join('\n\n');
    const fullSystemInstruction = [staticSystemInstruction, dynamicSystemInstruction].filter(Boolean).join('\n\n');

    if (isCustomOrNvidia) {
      let isAlibaba = provider === 'alibaba';
      let customApiKey = (
        isAlibaba
          ? (customConfig?.alibabaApiKey || process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || (customConfig?.apiKey && !customConfig.apiKey.startsWith('nvapi-') ? customConfig.apiKey : ''))
          : (customConfig?.apiKey || process.env.NVIDIA_API_KEY || '')
      ).trim();

      const wsAlibabaUrl = 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
      const intlAlibabaUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
      const defaultAlibabaUrl = customApiKey.startsWith('sk-ws-') ? wsAlibabaUrl : intlAlibabaUrl;

      let customBaseUrl = (
        isAlibaba
          ? (customConfig?.alibabaBaseUrl || customConfig?.baseUrl || defaultAlibabaUrl)
          : (customConfig?.baseUrl || 'https://integrate.api.nvidia.com/v1')
      ).replace(/\/+$/, '');

      if (!isAlibaba && customBaseUrl.includes('integrate.api.nvidia.com') && !customBaseUrl.endsWith('/v1')) {
        customBaseUrl = `${customBaseUrl}/v1`;
      }

      const defaultModel = isAlibaba ? 'qwen3.8-max' : 'meta/llama-3.3-70b-instruct';
      let targetModel = (isAlibaba ? (customConfig?.alibabaModel || customConfig?.model) : customConfig?.model) || model || defaultModel;
      const hasImageAttachments = Array.isArray(messages) && messages.some((m: any) =>
        Array.isArray(m.attachments) &&
        m.attachments.some((a: any) => a.type?.startsWith('image/') || a.fileType === 'image')
      );

      if (targetModel === 'moonshotai/kimi-k3.1-pro' || targetModel === 'kimi/k3.1-pro' || targetModel === 'kimi/kimi-k3.1-pro' || targetModel === 'kimi-k3.1-pro' || targetModel.includes('k3.1')) {
        isAlibaba = false;
        targetModel = 'moonshotai/kimi-k3.1-pro';
        customBaseUrl = 'https://integrate.api.nvidia.com/v1';
        if (!customApiKey || !customApiKey.startsWith('nvapi-')) {
          customApiKey = (customConfig?.customApiKey || customConfig?.apiKey || process.env.NVIDIA_API_KEY || '').trim();
        }
      } else if (isAlibaba) {
        if (targetModel === 'moonshotai/kimi-k3' || targetModel === 'kimi/k3' || targetModel === 'kimi/kimi-k3') {
          targetModel = customBaseUrl.includes('.maas.aliyuncs.com') ? 'kimi/kimi-k3' : (customBaseUrl.includes('integrate.api.nvidia.com') ? 'moonshotai/kimi-k3' : 'kimi-k3');
        }
        if (/^(?:deepseek-ai\/|deepseek-r1|deepseek-v3|deepseek-k3)/i.test(targetModel)) targetModel = 'deepseek-v4-pro-0813';
        if (/qwen2\.5|qwen-long/i.test(targetModel)) targetModel = 'qwen3.8-plus';
        if (targetModel === 'qwen-3.8-max') targetModel = 'qwen3.8-max';
        if (targetModel === 'qwen-3.8-flash') targetModel = 'qwen3.8-flash';
        if (
          targetModel === 'qwen-3.8-omni-flash' ||
          targetModel === 'qwen-3.8-omni-flash-realtime' ||
          targetModel === 'qwen3.8-omni-flash-realtime' ||
          targetModel === 'qwen-audio-3.1-realtime-flash' ||
          targetModel === 'qwen-audio-3.0-realtime-flash'
        ) {
          targetModel = customApiKey.startsWith('sk-ws-') ? 'qwen3.8-flash' : 'qwen3.8-omni-flash';
        }
        if (/llama|nemotron|nvdev|mistralai|meta\//i.test(targetModel)) {
          targetModel = 'qwen3.8-max';
        }
      }

      if (!customApiKey) {
        const providerName = isAlibaba ? 'Alibaba Cloud MaaS' : 'NVIDIA NIM';
        sendChunk({ error: `${providerName} API Key no está configurada. Por favor ingrésala en Ajustes o cambia el motor a Google Gemini.` });
        sendChunk({ done: true });
        res.end();
        return;
      }

      // Auto-clamp max_tokens based on known model ceilings to avoid 400 Bad Request while respecting user selection in Ajustes
      const isStrict32kOutputCap = isAlibaba && /^qwen-(max|turbo|plus)(?!-vl)/i.test(targetModel);
      let clampedMaxTokens = Number(maxOutputTokens) || 8192;
      const lowerTarget = targetModel.toLowerCase();
      if (lowerTarget.includes('qwen-long')) {
        // DashScope qwen-long strictly enforces maximum output tokens <= 2048
        clampedMaxTokens = Math.min(clampedMaxTokens, 2048);
      } else if (lowerTarget.includes('nemotron-mini') || lowerTarget.includes('phi-3-mini') || lowerTarget.includes('tinyllama')) {
        clampedMaxTokens = Math.min(clampedMaxTokens, 2048);
      } else if (lowerTarget.includes('8b') || lowerTarget.includes('7b') || lowerTarget.includes('gemma-2-9b')) {
        clampedMaxTokens = Math.min(clampedMaxTokens, 4096);
      } else if (isAlibaba || lowerTarget.includes('qwen') || isStrict32kOutputCap) {
        clampedMaxTokens = Math.min(clampedMaxTokens, 8192);
      } else {
        clampedMaxTokens = Math.min(clampedMaxTokens, 16384);
      }

      // Build OpenAI-compatible messages
      const isKimiModel = /kimi|moonshot/i.test(targetModel) || targetModel === 'moonshotai/kimi-k3';
      const openAiMessages: Array<{
        role: string;
        content: any;
        reasoning_content?: string;
        tool_calls?: any[];
        tool_call_id?: string;
      }> = [];

      // Check active model context limits
      const isStrict32kModel = isAlibaba && /^qwen-(max|turbo)(?!-vl)/i.test(targetModel);
      const isMillionTokenOmniOrLong = isAlibaba && /omni|long|3\.8|3\.7|plus|deepseek|kimi/i.test(targetModel);
      const hasImageAttachmentsNow = Array.isArray(messages) && messages.some((m: any) =>
        Array.isArray(m.attachments) && m.attachments.some((a: any) => a.type?.startsWith('image/') || a.fileType === 'image')
      );
      if (isAlibaba && hasImageAttachmentsNow) {
        if (/^(?:deepseek-v4-pro-0813|deepseek-v4-pro|qwen3\.8-max-0902|qwen3\.8-2\.4-a95b|qwen-(?:max|plus|turbo|long))$/i.test(targetModel)) {
          targetModel = 'qwen3.8-flash';
        }
      }
      const isTargetVisionCapable = hasImageAttachmentsNow
        ? true
        : (isAlibaba ? !/deepseek-v4-pro-0813|qwen3\.8-max-0902|qwen3\.8-2\.4-a95b/i.test(targetModel) : !/deepseek/i.test(targetModel));
      const isMultimodalVisionTurn = isAlibaba && hasImageAttachmentsNow;

      // For text chat, role: 'system' with cache_control: { type: 'ephemeral' } on the static prefix provides official prompt caching in DashScope.
      // Placing dynamic instructions in a second content part preserves 100% prefix hash equality with the Mosquito (alibabaKeepAlive.ts).
      if (!isMultimodalVisionTurn && fullSystemInstruction) {
        const maxSysChars = isStrict32kModel ? 28000 : (isMillionTokenOmniOrLong ? 1500000 : 320000);
        const safeStaticInstruction = clampTextSegment(staticSystemInstruction, maxSysChars);
        const safeFullInstruction = clampTextSegment(fullSystemInstruction, maxSysChars);
        openAiMessages.push({
          role: 'system',
          content: isAlibaba
            ? [
                {
                  type: 'text',
                  text: safeStaticInstruction,
                  cache_control: { type: 'ephemeral' },
                },
                ...(dynamicSystemInstruction.trim()
                  ? [
                      {
                        type: 'text',
                        text: dynamicSystemInstruction.trim(),
                      },
                    ]
                  : []),
              ]
            : safeFullInstruction,
        });
      }

      const tavilyKey = (
        customConfig?.tavilyApiKey ||
        req.body.tavilyApiKey ||
        process.env.TAVILY_API_KEY ||
        ''
      ).trim();

      const tavilyTool = {
        type: "function",
        function: {
          name: "search_web",
          description: "Busca en la web en tiempo real para verificar datos fácticos, citas literarias o contexto histórico.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Términos exactos de búsqueda formulados por el modelo" }
            },
            required: ["query"]
          }
        }
      };

      // For standard large-context models (128k - 1M tokens), do NOT slice away conversation history!
      // This preserves exact prefix alignment across turns, guaranteeing Alibaba KV Cache hits.
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

        // Compact earlier messages into a light summary block
        const summaryLines = earlierMessages
          .filter((m: any) => m.content && m.content.trim())
          .slice(-40)
          .map((m: any) => `${m.role === 'assistant' ? 'Kizuna-Zek' : 'Usuario'}: ${m.content.slice(0, 220)}${m.content.length > 220 ? '...' : ''}`)
          .join('\n');
        if (summaryLines) {
          historySummaryBlock = `[RESUMEN COMPACTO DEL HISTORIAL PREVIO E HILOS NARRATIVOS]:\n${summaryLines}\n\n`;
        }
      }

      const maxTotalInputChars = isMillionTokenOmniOrLong ? 1600000 : isStrict32kModel ? 52000 : 320000;
      const maxSingleTurnChars = isMillionTokenOmniOrLong ? 200000 : isStrict32kModel ? 24000 : 48000;
      let systemInjectedInFirstUser = false;
      const lastUserTurnIdx = effectiveTurnsPayload.map((m: any) => m.role).lastIndexOf('user');

      // Collect image attachments from the most recent user message ONLY when relevant to this turn
      let latestImageAttachmentsServer: any[] = [];
      let lastImgTurnIdx = -1;
      for (let k = effectiveTurnsPayload.length - 1; k >= 0; k--) {
        const m = effectiveTurnsPayload[k];
        if (m.role === 'user' && Array.isArray(m.attachments)) {
          const imgs = m.attachments.filter((a: any) => (a.type?.startsWith('image/') || a.fileType === 'image') && a.dataUrl);
          if (imgs.length > 0) {
            lastImgTurnIdx = k;
            const isCurrentTurnImg = k === lastUserTurnIdx;
            const assistantAfter = effectiveTurnsPayload.slice(k + 1).filter((x: any) => x.role === 'assistant');
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
              lastUserTurnIdx - k <= 4 &&
              /\b(?:imagen|im[aá]genes|foto|fotos|dibujo|ilustraci[oó]n|diseño|referencia|mir[aá]|ves|en la foto|en el dibujo|las 4|los 4|vestimenta|ropa|ojos|cabello|pelo|gabardina|traje)\b/i.test(
                lastUserPrompt
              );
            if (isCurrentTurnImg || prevImgFailed || userMentionsImg) {
              latestImageAttachmentsServer = imgs;
            }
            break;
          }
        }
      }

      for (let idx = 0; idx < effectiveTurnsPayload.length; idx++) {
        const msg = effectiveTurnsPayload[idx];
        if (msg.role === 'system') continue;
        const isAssistant = msg.role === 'assistant';
        const roleName = isAssistant ? 'assistant' : 'user';
        const isLatestUserTurn = !isAssistant && idx === lastUserTurnIdx;

        let userText = clampTextSegment(msg.content || '', maxSingleTurnChars);
        const contentParts: any[] = [];

        if (isMultimodalVisionTurn && roleName === 'user' && fullSystemInstruction && !systemInjectedInFirstUser) {
          systemInjectedInFirstUser = true;
          const maxVisionSysChars = isStrict32kModel ? 28000 : (isMillionTokenOmniOrLong ? 1500000 : 320000);
          const safeStaticInstruction = clampTextSegment(staticSystemInstruction, maxVisionSysChars);
          contentParts.push({
            type: 'text',
            text: safeStaticInstruction,
            ...(isAlibaba ? { cache_control: { type: 'ephemeral' } } : {}),
          });
          if (dynamicSystemInstruction.trim()) {
            contentParts.push({
              type: 'text',
              text: dynamicSystemInstruction.trim(),
            });
          }
          userText = `${historySummaryBlock}[MENSAJE DEL USUARIO]:\n${userText}`;
        } else if (historySummaryBlock && idx === 0 && userText) {
          userText = `${historySummaryBlock}${userText}`;
        }

        if (userText) {
          contentParts.push({ type: 'text', text: userText });
        }

        if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            if (!(att.type?.startsWith('image/') || att.fileType === 'image') && att.textContent && (!userText || !userText.includes(att.name))) {
              const isAlreadyInLore = loreContext && att.name && loreContext.toLowerCase().includes(att.name.toLowerCase());
              if (isAlreadyInLore) {
                contentParts.push({
                  type: 'text',
                  text: `\n[Documento adjunto ya indexado en Bóveda de Lore: ${att.name}]\n`,
                });
              } else {
                const clampedAttText = clampTextSegment(att.textContent, 150000);
                contentParts.push({
                  type: 'text',
                  text: `\n[Attached Document: ${att.name}]\n${clampedAttText}\n`,
                });
              }
            }
          }
        }

        if (isTargetVisionCapable && isLatestUserTurn && latestImageAttachmentsServer.length > 0) {
          for (const att of latestImageAttachmentsServer) {
            const rawBase64 = att.dataUrl ? att.dataUrl.replace(/^data:[^;]+;base64,/, '') : '';
            const mimeType = att.type || 'image/jpeg';
            if (rawBase64) {
              contentParts.push({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${rawBase64}` },
              });
            }
          }
        }

        if (isAlibaba) {
          // Alibaba Cloud MaaS requires content to always be a list
          if (contentParts.length === 0) {
            contentParts.push({ type: 'text', text: ' ' });
          }
          openAiMessages.push({
            role: roleName,
            content: contentParts,
          });
        } else {
          // Standard OpenAI / NVIDIA format
          const hasParts = contentParts.some((p) => p.type === 'image_url') || (Array.isArray(msg.attachments) && msg.attachments.length > 0);
          openAiMessages.push({
            role: roleName,
            content: hasParts ? contentParts : userText,
          });
        }
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

      let totalCharsNow = computeTotalChars(openAiMessages);
      if (totalCharsNow > maxTotalInputChars && openAiMessages.length > 0) {
        const excess = totalCharsNow - maxTotalInputChars;
        const firstMsg = openAiMessages[0];
        if (Array.isArray(firstMsg.content) && firstMsg.content[0]?.type === 'text') {
          const targetLen = Math.max(6000, firstMsg.content[0].text.length - excess - 1000);
          firstMsg.content[0].text = clampTextSegment(firstMsg.content[0].text, targetLen);
        } else if (typeof firstMsg.content === 'string') {
          const targetLen = Math.max(6000, firstMsg.content.length - excess - 1000);
          firstMsg.content = clampTextSegment(firstMsg.content, targetLen);
        }
      }

      const nvidiaHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customApiKey.trim()}`,
        'Accept': 'text/event-stream',
      };
      if (isAlibaba) {
        nvidiaHeaders['X-DashScope-CacheControl'] = 'enable';
        nvidiaHeaders['x-dashscope-session-cache'] = 'enable';
        const wsMatch = customBaseUrl.match(/(ws-[a-zA-Z0-9]+)/i);
        const isDedicatedWs = customBaseUrl.includes('.maas.aliyuncs.com');
        const isSkWsKey = customApiKey.trim().startsWith('sk-ws-');
        if (wsMatch && !isDedicatedWs && !isSkWsKey) {
          nvidiaHeaders['X-DashScope-Workspace'] = wsMatch[1];
        }
      }

      const isOff = reasoningMode === 'off' || enableReasoning === false;
      const isLight = reasoningMode === 'light' && !isOff;
      const lastUserContent = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
      const isShortGreeting = isCasualGreeting(lastUserContent);
      const isDeepMode = reasoningMode === 'deep' && !isOff;
      const isExtensivePrompt = !isShortGreeting && typeof lastUserContent === 'string' && lastUserContent.trim().length >= 50;

      // Configuración de esfuerzo de razonamiento para Kimi K3 en NVIDIA NIM:
      const isGlmModel = /glm/i.test(targetModel);
      const isStepfunModel = /step/i.test(targetModel);
      const isReasoningModel = isKimiModel || isGlmModel || isStepfunModel || /reason|thinking|cot|deepseek|qwq|step/i.test(targetModel);
      
      const dynamicReasoningEffort = isKimiModel
        ? ((isOff || isShortGreeting || isLight) ? 'low' : 'high')
        : ((isOff || isShortGreeting) ? 'low' : (isLight ? 'medium' : 'high'));

      // Respetar selección de Max Output Tokens de Ajustes y evitar exceder 8192 en Alibaba DashScope (que causaría HTTP 400 y caída a 2048):
      let customMaxTokens = clampedMaxTokens;
      if (isDeepMode && isReasoningModel) {
        customMaxTokens = (isStrict32kModel || isAlibaba) ? 8192 : Math.max(clampedMaxTokens, 12288);
      } else if (isLight && isReasoningModel) {
        customMaxTokens = (isStrict32kModel || isAlibaba) ? Math.min(Math.max(clampedMaxTokens, 4096), 8192) : Math.max(clampedMaxTokens, 8192);
      }

      const userTemperature =
        typeof temperature === 'number' && !Number.isNaN(Number(temperature))
          ? Math.max(0.1, Math.min(Number(temperature), 1.4))
          : 0.75;

      let effectiveMessages = [...openAiMessages];

      const shouldEnableThinking = !isOff && !isShortGreeting;
      const clientThinkingBudget = Number(req.body.thinkingBudget) || 0;
      const isHeavyAnalyticalOrDraftingServer =
        typeof lastUserContent === 'string' &&
        (lastUserContent.trim().length > 220 ||
          /\b(?:redacta|escribe|desarrolla|cap[íi]tulo|escena|audita|analiza\s+a\s+fondo|compara|reescribe|contin[úu]a\s+la\s+escena|prosa|ensayo|estructura\s+narrativa)\b/i.test(
            lastUserContent
          ));
      const effectiveThinkingBudget = !shouldEnableThinking
        ? 0
        : (clientThinkingBudget > 0 && clientThinkingBudget <= 768) || !isHeavyAnalyticalOrDraftingServer
          ? 640
          : isLight
            ? 1024
            : 3072;

      let modeThinkingDirective = '';
      if (isShortGreeting) {
        modeThinkingDirective = "DIRECTIVA DE RESPUESTA INMEDIATA (SALUDO ENTRANTE): El razonamiento interno está DESACTIVADO. No emitas bloques <think> ni deliberación previa. Saluda directamente de colega a colega con naturalidad.";
        customMaxTokens = clampedMaxTokens;
      } else if (isOff) {
        modeThinkingDirective = "DIRECTIVA DE RESPUESTA INMEDIATA (MODO INSTANTÁNEO 0s): El razonamiento en cadena (Chain-of-Thought) está ESTRICTAMENTE DESACTIVADO por el usuario. Prohibido emitir etiquetas <think> o reflexiones internas previas. Responde de forma directa, inmediata y completa.";
        customMaxTokens = clampedMaxTokens;
      } else if (effectiveThinkingBudget <= 768) {
        modeThinkingDirective = "DIRECTIVA DE PENSAMIENTO ÁGIL: Realiza una síntesis mental directa, puntual y concisa (máximo 2-3 segundos) sin sobre-extender el monólogo interno, y pasa de inmediato a responder con naturalidad y cercanía.";
        customMaxTokens = (isStrict32kModel || isAlibaba) ? Math.min(Math.max(clampedMaxTokens, 4096), 8192) : Math.max(clampedMaxTokens, 8192);
      } else if (isLight) {
        modeThinkingDirective = "DIRECTIVA DE PENSAMIENTO (MODO EQUILIBRADO): Realiza un razonamiento interno ágil y pasa a redactar una respuesta rica, completa y bien fundamentada.";
        customMaxTokens = (isStrict32kModel || isAlibaba) ? Math.min(Math.max(clampedMaxTokens, 4096), 8192) : Math.max(clampedMaxTokens, 8192);
      } else if (isDeepMode) {
        modeThinkingDirective = "DIRECTIVA DE PENSAMIENTO (MODO PROFUNDO): Razonamiento profundo activado. Analiza el subtexto, biomecánica, psicología y paralelismos literarios de forma estructurada en tu pensamiento interno, reservando la mayor parte del límite de tokens para expláyarte con generosidad y cerrar completamente la respuesta final.";
        customMaxTokens = (isStrict32kModel || isAlibaba) ? 8192 : Math.max(clampedMaxTokens, 12288);
      }

      if (modeThinkingDirective) {
        if (isAlibaba) {
          if (effectiveMessages.length > 0) {
            const lastIdx = effectiveMessages.length - 1;
            const lastMsg = effectiveMessages[lastIdx];
            if (lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
              effectiveMessages[lastIdx] = {
                ...lastMsg,
                content: [...lastMsg.content, { type: 'text', text: `\n\n[${modeThinkingDirective}]` }],
              };
            }
          }
        } else {
          const speedInstruction = {
            role: "system",
            content: modeThinkingDirective,
          };
          effectiveMessages = [speedInstruction, ...effectiveMessages.filter(m => m.role !== 'system')];
        }
      }

      const nvidiaPayload: any = isAlibaba
        ? (targetModel === 'kimi-k3' || targetModel === 'kimi/kimi-k3'
          ? {
              model: targetModel,
              messages: effectiveMessages,
              max_tokens: customMaxTokens,
              stream: true,
              stream_options: { include_usage: true },
              enable_thinking: shouldEnableThinking,
              extra_body: {
                enable_thinking: shouldEnableThinking,
              },
            }
          : {
              model: targetModel, // "qwen3.8-max", "deepseek-r1", etc.
              messages: effectiveMessages,
              max_tokens: customMaxTokens,
              temperature: userTemperature,
              top_p: 0.95,
              stream: true,
              stream_options: { include_usage: true },
              ...(shouldEnableThinking && !targetModel.includes('-vl-')
                ? {
                    enable_thinking: true,
                    ...(effectiveThinkingBudget > 0 ? { thinking_budget: effectiveThinkingBudget } : {}),
                    extra_body: {
                      enable_thinking: true,
                      ...(effectiveThinkingBudget > 0 ? { thinking_budget: effectiveThinkingBudget } : {}),
                    },
                  }
                : {}),
              stop: ["<|im_end|>", "<|endoftext|>"],
            })
        : isKimiModel
        ? {
            model: targetModel || "moonshotai/kimi-k3",
            messages: effectiveMessages,
            max_tokens: customMaxTokens,
            stream: true,
            temperature: userTemperature,
            top_p: 0.95,
            reasoning_effort: dynamicReasoningEffort,
            ...(!shouldEnableThinking ? { chat_template_kwargs: { thinking: false, enable_thinking: false } } : {}),
          }
        : {
            model: targetModel,
            messages: effectiveMessages,
            max_tokens: customMaxTokens,
            temperature: userTemperature,
            top_p: 0.9,
            stream: true,
            ...(!shouldEnableThinking ? { chat_template_kwargs: { thinking: false, enable_thinking: false } } : {}),
            ...(isGlmModel
              ? { stop: ["<|endoftext|>", "<|user|>", "<|observation|>"] }
              : isStepfunModel
              ? { stop: ["<|endoftext|>"] }
              : { stop: ["<|im_end|>", "<|endoftext|>"] }),
          };

      // Para Alibaba o Custom cuando isWebSearchEnabled está activo:
      // No enviamos enable_search: true a Alibaba (el endpoint ap-southeast-1 lo ignora).
      // Permitimos que el modelo emita <tool_call> libremente y nuestro interceptor en server.ts
      // capture la etiqueta, la oculte de la pantalla, ejecute searchTavilyServer y complete el segundo turno.
      delete nvidiaPayload.enable_search;
      delete nvidiaPayload.search_options;
      delete nvidiaPayload.tools;
      delete nvidiaPayload.tool_choice;

      let customTargetUrl = `${customBaseUrl}/chat/completions`;
      console.log('[Server Custom Provider] Despachando a:', customTargetUrl, 'Model:', nvidiaPayload.model, 'Tools:', Boolean(nvidiaPayload.tools));

      let response = await fetch(customTargetUrl, {
        method: 'POST',
        headers: nvidiaHeaders,
        body: JSON.stringify(nvidiaPayload),
        keepalive: true,
      });

      // Si el modelo seleccionado no soporta el parámetro 'tools' o 'enable_search' y retorna HTTP 400
      if (!response.ok && (nvidiaPayload.enable_search || nvidiaPayload.tools)) {
        const errorBody = await response.text().catch(() => '');
        const isEnableSearchError = Boolean(nvidiaPayload.enable_search) && (response.status === 400 || /enable_search|search_options/i.test(errorBody));
        const isToolsError = Boolean(nvidiaPayload.tools) && (response.status === 400 || /tools|tool_choice|functions/i.test(errorBody));

        if (isEnableSearchError || isToolsError) {
          console.warn('[Server Custom Provider] Parámetros de búsqueda nativa/tools no soportados. Ejecutando búsqueda autónoma con Tavily en servidor...');
          delete nvidiaPayload.enable_search;
          delete nvidiaPayload.search_options;
          delete nvidiaPayload.tools;
          delete nvidiaPayload.tool_choice;

          const cleanQuery = sanitizeSearchQuery(lastUserContent) || (typeof lastUserContent === 'string' ? lastUserContent.trim() : '');

          if (cleanQuery) {
            if (tavilyKey) {
              sendChunk({ reasoning: "✦ Rastreando grimorio en la red (Fallback Tavily)...\n" });
              try {
                const tavData = await searchTavilyServer(cleanQuery, tavilyKey);
                if (Array.isArray(tavData?.results) && tavData.results.length > 0) {
                  const formattedSources = tavData.results.map((r: any) => ({
                    title: scrubSnippetText(r.title || 'Fuente Web'),
                    url: r.url || '',
                    snippet: scrubSnippetText(r.content || r.snippet || ''),
                    sourceEngine: 'tavily',
                  }));

                  // Enviar fuentes encontradas a la UI
                  sendChunk({ sources: formattedSources });

                  // Inyectar contexto enriquecido para que el modelo responda con información fresca
                  const webInfoSummary = `[INFORMACIÓN ACTUALIZADA DE LA WEB VÍA GRIMORIO TAVILY]:\nConsulta: ${cleanQuery}\n` +
                    (tavData.answer ? `Resumen: ${scrubSnippetText(tavData.answer)}\n` : '') +
                    formattedSources.slice(0, 5).map((s: any, idx: number) => `[${idx + 1}] ${s.title}: ${s.snippet} (${s.url})`).join('\n') +
                    `\n[FIN DE INFORMACIÓN WEB]\nUtiliza estos datos actualizados para responder con precisión y naturalidad.`;

                  if (Array.isArray(nvidiaPayload.messages) && nvidiaPayload.messages.length > 0) {
                    const firstMsg = nvidiaPayload.messages[0];
                    if (Array.isArray(firstMsg.content)) {
                      firstMsg.content.unshift({ type: 'text', text: webInfoSummary + '\n\n' });
                    } else if (typeof firstMsg.content === 'string') {
                      firstMsg.content = `${webInfoSummary}\n\n${firstMsg.content}`;
                    } else {
                      nvidiaPayload.messages.push({
                        role: isAlibaba ? 'user' : 'system',
                        content: isAlibaba ? [{ type: 'text', text: webInfoSummary }] : webInfoSummary,
                      });
                    }
                  }
                }
              } catch (fallbackSearchErr) {
                console.warn('[Server Custom Provider] Error en búsqueda fallback Tavily:', fallbackSearchErr);
              }
            } else {
              sendChunk({ reasoning: "✦ Rastreando grimorio en la red (Grimorio Web / DuckDuckGo)...\n" });
              try {
                const ddgData = await fetchDuckDuckGoHtmlFallback(cleanQuery);
                if (Array.isArray(ddgData?.results) && ddgData.results.length > 0) {
                  const formattedSources = ddgData.results.map((r: any) => ({
                    title: scrubSnippetText(r.title || 'Fuente Web'),
                    url: r.url || '',
                    snippet: scrubSnippetText(r.snippet || ''),
                    sourceEngine: 'duckduckgo',
                  }));

                  sendChunk({ sources: formattedSources });

                  const webInfoSummary = `[INFORMACIÓN ACTUALIZADA DE LA WEB VÍA GRIMORIO WEB]:\nConsulta: ${cleanQuery}\n` +
                    (ddgData.summary ? `Resumen: ${scrubSnippetText(ddgData.summary)}\n` : '') +
                    formattedSources.slice(0, 5).map((s: any, idx: number) => `[${idx + 1}] ${s.title}: ${s.snippet} (${s.url})`).join('\n') +
                    `\n[FIN DE INFORMACIÓN WEB]\nUtiliza estos datos actualizados para responder con precisión y naturalidad.`;

                  if (Array.isArray(nvidiaPayload.messages) && nvidiaPayload.messages.length > 0) {
                    const firstMsg = nvidiaPayload.messages[0];
                    if (Array.isArray(firstMsg.content)) {
                      firstMsg.content.unshift({ type: 'text', text: webInfoSummary + '\n\n' });
                    } else if (typeof firstMsg.content === 'string') {
                      firstMsg.content = `${webInfoSummary}\n\n${firstMsg.content}`;
                    } else {
                      nvidiaPayload.messages.push({
                        role: isAlibaba ? 'user' : 'system',
                        content: isAlibaba ? [{ type: 'text', text: webInfoSummary }] : webInfoSummary,
                      });
                    }
                  }
                }
              } catch (fallbackSearchErr) {
                console.warn('[Server Custom Provider] Error en búsqueda fallback DuckDuckGo:', fallbackSearchErr);
              }
            }
          }

          response = await fetch(customTargetUrl, {
            method: 'POST',
            headers: nvidiaHeaders,
            body: JSON.stringify(nvidiaPayload),
            keepalive: true,
          });
        }
      }

      if (!response.ok) {
        let errorBody = await response.text().catch(() => '');

        // Auto-recovery 0a: If Alibaba Kimi model ID needs namespace toggle ('kimi/kimi-k3' <-> 'kimi-k3')
        if (isAlibaba && !response.ok && (nvidiaPayload.model === 'kimi-k3' || nvidiaPayload.model === 'kimi/kimi-k3')) {
          const altKimiId = nvidiaPayload.model === 'kimi-k3' ? 'kimi/kimi-k3' : 'kimi-k3';
          console.warn(`[Server Custom Provider] Reintentando Kimi con ID alternativo "${altKimiId}" en ${customTargetUrl}...`);
          nvidiaPayload.model = altKimiId;
          response = await fetch(customTargetUrl, {
            method: 'POST',
            headers: nvidiaHeaders,
            body: JSON.stringify(nvidiaPayload),
            keepalive: true,
          });
          if (response.ok) {
            errorBody = '';
          } else {
            errorBody = await response.text().catch(() => '');
          }
        }

        // Auto-recovery 0b: Only switch Alibaba endpoint if error explicitly indicates Workspace endpoint access denied (never on 404 model_not_found!)
        const isModelNotFoundErr = /model_not_found|Model not exist|ModelNotOpen|does not exist|invalid_model/i.test(errorBody);
        if (
          isAlibaba &&
          !response.ok &&
          !isModelNotFoundErr &&
          /Workspace endpoint access denied/i.test(errorBody)
        ) {
          const altAlibabaBase = customBaseUrl.includes('.maas.aliyuncs.com') ? intlAlibabaUrl : wsAlibabaUrl;
          const altTargetUrl = `${altAlibabaBase}/chat/completions`;
          console.warn(`[Server Custom Provider] HTTP ${response.status} en ${customTargetUrl}. Conmutando automáticamente al endpoint alternativo: ${altTargetUrl}...`);
          customBaseUrl = altAlibabaBase;
          customTargetUrl = altTargetUrl;
          response = await fetch(customTargetUrl, {
            method: 'POST',
            headers: nvidiaHeaders,
            body: JSON.stringify(nvidiaPayload),
            keepalive: true,
          });
          if (response.ok) {
            errorBody = '';
          } else {
            errorBody = await response.text().catch(() => '');
          }
        }

        // Auto-recovery 1: If Alibaba complains about enable_thinking or thinking_budget parameter
        if (!response.ok && response.status === 400 && /enable_thinking|thinking_budget/i.test(errorBody)) {
          if (/thinking_budget/i.test(errorBody) && !/enable_thinking/i.test(errorBody)) {
            delete nvidiaPayload.thinking_budget;
            if (nvidiaPayload.extra_body) {
              delete nvidiaPayload.extra_body.thinking_budget;
            }
          } else if (/restricted to True|only support.*true/i.test(errorBody)) {
            if (!shouldEnableThinking && isAlibaba && nvidiaPayload.model !== 'qwen3.8-flash') {
              console.warn(`[Server Custom Provider] El modelo ${nvidiaPayload.model} fuerza razonamiento obligatorio. En Modo Instantáneo, usando qwen3.8-flash con enable_thinking: false...`);
              nvidiaPayload.model = 'qwen3.8-flash';
              nvidiaPayload.enable_thinking = false;
              nvidiaPayload.extra_body = { enable_thinking: false };
              delete nvidiaPayload.thinking_budget;
            } else {
              console.warn('[Server Custom Provider] enable_thinking restringido a True para este modelo. Reintentando con enable_thinking: true...');
              nvidiaPayload.enable_thinking = true;
              nvidiaPayload.extra_body = {
                ...(nvidiaPayload.extra_body || {}),
                enable_thinking: true,
              };
            }
          } else {
            console.warn('[Server Custom Provider] enable_thinking no soportado para este modelo. Omitiendo y reintentando...');
            delete nvidiaPayload.enable_thinking;
            delete nvidiaPayload.thinking_budget;
            if (nvidiaPayload.extra_body) {
              delete nvidiaPayload.extra_body.enable_thinking;
              delete nvidiaPayload.extra_body.thinking_budget;
            }
          }
          response = await fetch(customTargetUrl, {
            method: 'POST',
            headers: nvidiaHeaders,
            body: JSON.stringify(nvidiaPayload),
            keepalive: true,
          });
          if (!response.ok && response.status === 400) {
            const retryErrBody = await response.text().catch(() => '');
            if (/enable_thinking|thinking_budget/i.test(retryErrBody)) {
              nvidiaPayload.enable_thinking = true;
              delete nvidiaPayload.thinking_budget;
              nvidiaPayload.extra_body = { enable_thinking: true };
              response = await fetch(customTargetUrl, {
                method: 'POST',
                headers: nvidiaHeaders,
                body: JSON.stringify(nvidiaPayload),
                keepalive: true,
              });
            } else {
              errorBody = retryErrBody;
            }
          }
          if (response.ok) {
            errorBody = '';
          } else if (!errorBody) {
            errorBody = await response.text().catch(() => '');
          }
        }

        // Auto-recovery 2: If Alibaba/provider complains about input token length (e.g. Range of input length should be [1, 30720])
        if (!response.ok && response.status === 400 && /Range of input length should be|maximum context length|context_length_exceeded|input length/i.test(errorBody)) {
          console.warn('[Server Custom Provider] Límite de tokens de entrada excedido (30720). Compactando contexto automáticamente y reintentando...');
          const compactSystem = clampTextSegment(fullSystemInstruction, 14000);
          const compactLastUser = clampTextSegment(typeof lastUserContent === 'string' ? lastUserContent : '', 10000) || 'Continúa.';
          const preservedImgParts = latestImageAttachmentsServer
            .map((att: any) => {
              const rawBase64 = att.dataUrl ? att.dataUrl.replace(/^data:[^;]+;base64,/, '') : '';
              const mimeType = att.type || 'image/jpeg';
              return rawBase64 ? { type: 'image_url', image_url: { url: `data:${mimeType};base64,${rawBase64}` } } : null;
            })
            .filter(Boolean);
          nvidiaPayload.messages = isAlibaba
            ? [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `[INSTRUCCIONES DEL SISTEMA Y LORE ESTÁTICO]:\n${compactSystem}\n\n[MENSAJE DEL USUARIO]:\n${compactLastUser}`,
                    },
                    ...preservedImgParts,
                  ],
                },
              ]
            : [
                { role: 'system', content: compactSystem },
                {
                  role: 'user',
                  content: preservedImgParts.length > 0
                    ? [{ type: 'text', text: compactLastUser }, ...preservedImgParts]
                    : compactLastUser,
                },
              ];
          response = await fetch(customTargetUrl, {
            method: 'POST',
            headers: nvidiaHeaders,
            body: JSON.stringify(nvidiaPayload),
            keepalive: true,
          });
          if (response.ok) {
            errorBody = '';
          } else {
            errorBody = await response.text().catch(() => '');
          }
        }

        // Auto-recovery 3: If provider complains about max_tokens limit (step down gradually: 8192 -> 4096 -> 2048)
        if (!response.ok && response.status === 400 && /max_tokens|Range of max_tokens/i.test(errorBody)) {
          let safeTokens = nvidiaPayload.max_tokens > 8192 ? 8192 : nvidiaPayload.max_tokens > 4096 ? 4096 : 2048;
          const matchMax = errorBody.match(/(?:maximum value is|range of max_tokens should be \[\d+,\s*|less than or equal to\s*|in \[\d+,\s*)(\d+)/i);
          if (matchMax && matchMax[1]) {
            safeTokens = parseInt(matchMax[1], 10);
          }
          console.warn(`[Server Custom Provider] Límite de max_tokens excedido (${errorBody.slice(0, 100)}). Ajustando max_tokens a ${safeTokens} y reintentando...`);
          nvidiaPayload.max_tokens = safeTokens;
          response = await fetch(customTargetUrl, {
            method: 'POST',
            headers: nvidiaHeaders,
            body: JSON.stringify(nvidiaPayload),
            keepalive: true,
          });
          if (response.ok) {
            errorBody = '';
          } else {
            errorBody = await response.text().catch(() => '');
          }
        }

        // Auto-recovery 3.5: If turn has image attachments and the model rejected multimodal image_url parts or failed with 400/404/422, try vision-capable models on the endpoint
        if (!response.ok && hasImageAttachmentsNow && isAlibaba && (response.status === 400 || response.status === 404 || response.status === 422)) {
          const visionCandidates = ['qwen3.8-omni-flash', 'qwen3.8-plus', 'qwen-vl-max', 'qwen-vl-plus', 'kimi-k3.1-pro', 'kimi-k3', 'kimi/kimi-k3.1-pro', 'kimi/kimi-k3'].filter(
            (m) => m !== nvidiaPayload.model
          );
          for (const visModel of visionCandidates) {
            console.warn(`[Server Custom Provider] Reintentando turno multimodal (${latestImageAttachmentsServer.length} imágenes) con modelo de visión "${visModel}"...`);
            nvidiaPayload.model = visModel;
            nvidiaPayload.max_tokens = Math.min(nvidiaPayload.max_tokens || 8192, 8192);
            delete nvidiaPayload.thinking_budget;
            if (nvidiaPayload.extra_body) {
              delete nvidiaPayload.extra_body.thinking_budget;
            }
            response = await fetch(customTargetUrl, {
              method: 'POST',
              headers: nvidiaHeaders,
              body: JSON.stringify(nvidiaPayload),
              keepalive: true,
            });
            if (response.ok) {
              errorBody = '';
              break;
            } else {
              errorBody = await response.text().catch(() => '');
            }
          }
        }

        // Auto-recovery 4: If target model is not found or not authorized on this endpoint, try tier-matched Singapore Qwen models on the active endpoint first
        if (!response.ok && (response.status === 404 || response.status === 403 || response.status === 400) && /model_not_found|Model not exist|Access to model denied|Workspace endpoint access denied|ModelNotOpen|does not exist|invalid_model/i.test(errorBody) && isAlibaba) {
          const requestedLower = String(nvidiaPayload.model || '').toLowerCase();
          const tierFallbacks = hasImageAttachmentsNow
            ? ['qwen3.8-omni-flash', 'qwen3.8-plus', 'qwen-vl-max', 'kimi-k3', 'kimi/kimi-k3']
            : requestedLower.includes('plus')
              ? ['qwen3.8-plus', 'qwen-plus', 'qwen3.8-max', 'qwen-max']
              : requestedLower.includes('flash')
                ? ['qwen3.8-flash', 'qwen3.8-omni-flash', 'qwen-plus', 'qwen-turbo']
                : requestedLower.includes('a95b')
                  ? ['qwen3.8-max', 'qwen3.8-plus', 'qwen-plus', 'qwen-max']
                  : ['qwen3.8-max', 'qwen-max', 'qwen-plus'];
          const fallbackCandidates = tierFallbacks.filter((m) => m !== nvidiaPayload.model);
          const isSkWsKeyNow = customApiKey.trim().startsWith('sk-ws-');
          const candidateUrls = isSkWsKeyNow
            ? [customTargetUrl]
            : [
                customTargetUrl,
                `${customBaseUrl.includes('.maas.aliyuncs.com') ? intlAlibabaUrl : wsAlibabaUrl}/chat/completions`,
              ];
          for (const fbUrl of candidateUrls) {
            if (response.ok) break;
            for (const fbModel of fallbackCandidates) {
              console.warn(`[Server Custom Provider] Fallback automático a "${fbModel}" en ${fbUrl}...`);
              nvidiaPayload.model = fbModel;
              nvidiaPayload.max_tokens = Math.min(nvidiaPayload.max_tokens || 8192, 8192);
              response = await fetch(fbUrl, {
                method: 'POST',
                headers: nvidiaHeaders,
                body: JSON.stringify(nvidiaPayload),
                keepalive: true,
              });
              if (response.ok) {
                customTargetUrl = fbUrl;
                errorBody = '';
                break;
              } else {
                errorBody = await response.text().catch(() => '');
              }
            }
          }
        }

        if (!response.ok) {
          let friendlyErr = `[HTTP ${response.status}] Falló al consultar: ${customTargetUrl} | Detalle del servidor: ${errorBody || response.statusText}`;
          if (response.status === 404 && /model_not_found|Model not exist/i.test(errorBody)) {
            friendlyErr = `⚠️ El modelo "${targetModel}" no existe o no está desplegado en tu endpoint de Alibaba Cloud MaaS. Te sugerimos seleccionar "Qwen 3.8 Max", "Qwen 3.8 Flash" o "Qwen Plus" desde el desplegable del encabezado.`;
          } else if (response.status === 400 && /data_inspection_failed/i.test(errorBody)) {
            friendlyErr = `🛡️ El filtro de contenido de Alibaba Cloud (data_inspection_failed) detectó elementos sensibles en la consulta o en las imágenes adjuntas. Si adjuntaste imágenes, asegúrate de seleccionar un modelo de visión (como qwen-vl-max) o cambia a Google Gemini desde el encabezado.`;
          } else if (response.status === 403 || response.status === 401 || /Authorization failed|Forbidden|Unauthorized|invalid api key/i.test(errorBody)) {
            const provName = isAlibaba ? 'Alibaba Cloud MaaS' : 'NVIDIA NIM';
            let errorDetail = '';
            try {
              const parsedErr = JSON.parse(errorBody);
              errorDetail = parsedErr.message || parsedErr.error?.message || parsedErr.code || errorBody;
            } catch {
              errorDetail = errorBody;
            }
            friendlyErr = `🔑 Error de autorización en ${provName} [HTTP ${response.status}]: ${errorDetail || 'La clave de API no es válida o no tiene permisos para este workspace/modelo'}. Por favor, verifícala en Ajustes (⚙️) o cambia el motor desde el encabezado.`;
          }
          sendChunk({ error: friendlyErr });
          sendChunk({ done: true });
          res.end();
          return;
        }
      }

      if (!response.body) {
        sendChunk({ error: 'Response stream from custom endpoint is empty.' });
        sendChunk({ done: true });
        res.end();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const nvidiaStartTime = Date.now();
      let firstTokenReceived = false;

      const accumulatedToolCalls: Array<{ id: string; name: string; arguments: string }> = [];
      let accumulatedAssistantContent = '';
      let accumulatedReasoning = '';
      let hasToolCalls = false;
      let isInsideXmlToolCall = false;
      let pendingTagBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        } else if (done) {
          buffer += decoder.decode();
        }

        const lines = done ? buffer.split('\n') : buffer.split('\n');
        buffer = done ? '' : (lines.pop() || '');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (jsonStr === '[DONE]') {
            continue;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const deltaObj = parsed.choices?.[0]?.delta;
            const messageObj = parsed.choices?.[0]?.message;
            const toolCallsFromChunk = deltaObj?.tool_calls || messageObj?.tool_calls;

            if (Array.isArray(toolCallsFromChunk) && toolCallsFromChunk.length > 0) {
              hasToolCalls = true;
              for (const tc of toolCallsFromChunk) {
                const idx = tc.index ?? 0;
                if (!accumulatedToolCalls[idx]) {
                  accumulatedToolCalls[idx] = {
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  };
                } else {
                  if (tc.id) accumulatedToolCalls[idx].id = tc.id;
                  if (tc.function?.name) accumulatedToolCalls[idx].name += tc.function.name;
                  if (tc.function?.arguments) accumulatedToolCalls[idx].arguments += tc.function.arguments;
                }
              }
            }

            const reasoning = deltaObj?.reasoning_content || deltaObj?.reasoning || deltaObj?.thinking;
            const content = deltaObj?.content;
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'length' || finishReason === 'max_tokens') {
              sendChunk({ truncated: true });
            }

            if (!firstTokenReceived && (reasoning || content || hasToolCalls)) {
              firstTokenReceived = true;
              const ttftNum = Number(((Date.now() - nvidiaStartTime) / 1000).toFixed(2));
              console.log(`[${isAlibaba ? 'Alibaba MaaS' : 'NVIDIA NIM'} TTFT]: Modelo "${targetModel}" emitió su primer token en ${ttftNum}s (reasoning: ${Boolean(reasoning)}, content: ${Boolean(content)}, tool_call: ${hasToolCalls})`);
              sendChunk({ ttftSeconds: ttftNum });
            }

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
              console.log(`[Alibaba KV Cache HIT]: ${cachedTokens} tokens reutilizados del prompt cache (-90% costo en "${targetModel}").`);
              sendChunk({ cachedTokens: Number(cachedTokens) });
            }
            const completionTokens = usageObj?.completion_tokens;
            if (completionTokens !== undefined && Number(completionTokens) > 0) {
              sendChunk({ completionTokens: Number(completionTokens) });
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
                sendChunk({ sources: alibabaSources });
              }
            }

            if (reasoning && shouldEnableThinking) {
              accumulatedReasoning += reasoning;
              const cleanReasoning = reasoning.replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, '');
              if (cleanReasoning) {
                sendChunk({ reasoning: cleanReasoning });
              }
            }
            if (content) {
              accumulatedAssistantContent += content;
              if (!hasToolCalls && !isInsideXmlToolCall) {
                const combinedChunk = pendingTagBuffer + content;
                pendingTagBuffer = '';

                if (/<tool_call>[\s\S]*?<\/tool_call>/i.test(combinedChunk)) {
                  hasToolCalls = true;
                  const cleaned = combinedChunk.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
                  if (/<tool_call/i.test(cleaned)) {
                    const openIdx = cleaned.toLowerCase().indexOf('<tool_call');
                    const beforeOpen = cleaned.slice(0, openIdx);
                    if (beforeOpen) sendChunk({ text: beforeOpen });
                    isInsideXmlToolCall = true;
                    pendingTagBuffer = cleaned.slice(openIdx);
                  } else if (cleaned) {
                    sendChunk({ text: cleaned });
                  }
                } else if (/<tool_call/i.test(combinedChunk)) {
                  const openIdx = combinedChunk.toLowerCase().indexOf('<tool_call');
                  const beforeOpen = combinedChunk.slice(0, openIdx);
                  if (beforeOpen) sendChunk({ text: beforeOpen });
                  isInsideXmlToolCall = true;
                  hasToolCalls = true;
                  pendingTagBuffer = combinedChunk.slice(openIdx);
                } else {
                  const partialMatch = combinedChunk.match(/(<(?:t(?:o(?:o(?:l(?:_(?:c(?:a(?:l(?:l)?)?)?)?)?)?)?)?)?)$/i);
                  if (partialMatch) {
                    const prefixLen = partialMatch[0].length;
                    const safeText = combinedChunk.slice(0, combinedChunk.length - prefixLen);
                    if (safeText) sendChunk({ text: safeText });
                    pendingTagBuffer = partialMatch[0];
                  } else {
                    sendChunk({ text: combinedChunk });
                  }
                }
              } else if (isInsideXmlToolCall) {
                pendingTagBuffer += content;
                if (/<\/tool_call>/i.test(pendingTagBuffer)) {
                  const closeIdx = pendingTagBuffer.toLowerCase().indexOf('</tool_call>');
                  const afterClose = pendingTagBuffer.slice(closeIdx + '</tool_call>'.length);
                  isInsideXmlToolCall = false;
                  pendingTagBuffer = '';
                  if (afterClose && !/<tool_call/i.test(afterClose)) {
                    sendChunk({ text: afterClose });
                  } else if (afterClose) {
                    isInsideXmlToolCall = true;
                    pendingTagBuffer = afterClose;
                  }
                }
              }
            }
          } catch {
            // non-JSON SSE heartbeat or partial line
          }
        }
        if (done) break;
      }

      if (pendingTagBuffer && !isInsideXmlToolCall && !hasToolCalls && !/<tool_call/i.test(pendingTagBuffer)) {
        sendChunk({ text: pendingTagBuffer });
        pendingTagBuffer = '';
      }

      // Detectar y extraer etiquetas de texto <tool_call> emitidas por Qwen en deltaObj.content o deltaObj.reasoning_content
      const combinedToolSearchSource = `${accumulatedAssistantContent}\n${accumulatedReasoning}`;
      const xmlToolMatches = [...combinedToolSearchSource.matchAll(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/gi)];
      if (xmlToolMatches.length > 0 && accumulatedToolCalls.length === 0) {
        hasToolCalls = true;
        for (let idx = 0; idx < xmlToolMatches.length; idx++) {
          const rawInner = (xmlToolMatches[idx][1] || '').trim();
          let toolName = 'search_web';
          let toolArgs = rawInner;
          try {
            const parsedXml = JSON.parse(rawInner);
            if (parsedXml.name) toolName = parsedXml.name;
            if (parsedXml.arguments !== undefined) {
              toolArgs = typeof parsedXml.arguments === 'string'
                ? parsedXml.arguments
                : JSON.stringify(parsedXml.arguments);
            } else if (parsedXml.parameters !== undefined) {
              toolArgs = typeof parsedXml.parameters === 'string'
                ? parsedXml.parameters
                : JSON.stringify(parsedXml.parameters);
            } else if (parsedXml.query) {
              toolArgs = JSON.stringify({ query: parsedXml.query });
            }
          } catch {
            const qMatch = rawInner.match(/"query"\s*:\s*"([^"]+)"/i) || rawInner.match(/query\s*[:=]\s*["']?([^"'\n}]+)["']?/i);
            if (qMatch) {
              toolArgs = JSON.stringify({ query: qMatch[1].trim() });
            }
          }
          accumulatedToolCalls.push({
            id: `call_${Date.now()}_${idx}`,
            name: toolName,
            arguments: toolArgs,
          });
        }
        // Limpiar bloques <tool_call> del texto acumulado del asistente
        accumulatedAssistantContent = accumulatedAssistantContent
          .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, '')
          .trim();
      }

      // Ciclo de ejecución de herramienta autónoma search_web (tanto OpenAI tool_calls como etiquetas <tool_call>)
      const searchCall = accumulatedToolCalls.find(
        (tc) => tc.name === 'search_web' || tc.name.toLowerCase().includes('search') || tc.name.toLowerCase().includes('tavily') || Boolean(tc.arguments)
      );

      if (searchCall) {
        // 1. Extraer query del JSON de la herramienta:
        let searchQuery = '';
        try {
          const parsedArgs = JSON.parse(searchCall.arguments);
          searchQuery = parsedArgs.query || parsedArgs.q || parsedArgs.search_query || '';
        } catch {
          const match = searchCall.arguments.match(/"query"\s*:\s*"([^"]+)"/);
          searchQuery = match ? match[1] : searchCall.arguments.replace(/[{}"]/g, '').trim();
        }
        if (!searchQuery) {
          searchQuery = sanitizeSearchQuery(lastUserContent) || lastUserContent;
        }

        // 2. Notificar a la UI por SSE con la consulta detectada:
        sendChunk({ reasoning: "🔍 Rastreando en la red: " + searchQuery + "\n" });

        let formattedSources: Array<{ title: string; url: string; snippet: string; sourceEngine: string }> = [];
        let toolResultContent = '';

        if (!tavilyKey) {
          try {
            console.log('[Server Tool Calling] Sin clave de Tavily, ejecutando DuckDuckGo fallback para:', searchQuery);
            sendChunk({ reasoning: "🔍 Rastreando en la red (Grimorio Web / DuckDuckGo): " + searchQuery + "\n" });
            const ddgData = await fetchDuckDuckGoHtmlFallback(searchQuery);
            if (Array.isArray(ddgData?.results) && ddgData.results.length > 0) {
              formattedSources = ddgData.results.map((r: any) => ({
                title: scrubSnippetText(r.title || 'Fuente Web'),
                url: r.url || '',
                snippet: scrubSnippetText(r.snippet || ''),
                sourceEngine: 'duckduckgo',
              }));
              if (formattedSources.length > 0) {
                sendChunk({ sources: formattedSources });
              }
              toolResultContent = JSON.stringify({
                query: searchQuery,
                engine: 'duckduckgo',
                results: formattedSources.map((s) => ({
                  title: s.title,
                  url: s.url,
                  snippet: s.snippet,
                })),
                summary: ddgData.summary || undefined,
              });
            } else {
              toolResultContent = JSON.stringify({
                query: searchQuery,
                status: 'no_results',
                message: 'No se encontraron resultados en la red. Procede a responder con tu conocimiento interno.',
              });
            }
          } catch (ddgErr) {
            console.warn('[Server Tool Calling] Error en búsqueda DuckDuckGo:', ddgErr);
            toolResultContent = JSON.stringify({
              query: searchQuery,
              status: 'no_results',
              message: 'Búsqueda web no disponible. Procede a responder con tu conocimiento interno.',
            });
          }
        } else {
          try {
            console.log('[Server Tool Calling] Ejecutando búsqueda en Tavily para query:', searchQuery);
            const tavData = await searchTavilyServer(searchQuery, tavilyKey);
            if (Array.isArray(tavData?.results) && tavData.results.length > 0) {
              formattedSources = tavData.results.map((r: any) => ({
                title: scrubSnippetText(r.title || 'Fuente Web'),
                url: r.url || '',
                snippet: scrubSnippetText(r.content || r.snippet || ''),
                sourceEngine: 'tavily',
              }));
            }

            // 3. Envía las fuentes encontradas a la UI:
            if (formattedSources.length > 0) {
              sendChunk({ sources: formattedSources });
            }

            toolResultContent = JSON.stringify({
              query: searchQuery,
              answer: tavData?.answer ? scrubSnippetText(tavData.answer) : undefined,
              results: formattedSources.map((s) => ({
                title: s.title,
                url: s.url,
                snippet: s.snippet,
              })),
            });
          } catch (searchErr: any) {
            console.warn('[Server search_web execution error]:', searchErr);
            toolResultContent = JSON.stringify({
              query: searchQuery,
              status: 'no_results',
              message: 'No se encontraron resultados en la red. Procede a responder con tu conocimiento interno.',
            });
          }
        }

        // 4. Preparar segundo turno con los resultados de internet curados y verificados:
        const toolContextSummary = `\n\n[RESULTADOS WEB VERIFICADOS Y FILTRADOS VÍA TAVILY (${searchQuery})]:\n${toolResultContent}\n\n[DIRECTIVA DE CURACIÓN ANTI-BASURA Y SÍNTESIS DIRECTA]:
- Ya ejecutaste la búsqueda web. PROHIBIDO volver a emitir etiquetas <tool_call>.
- Actúa como un filtro crítico de calidad: prioriza datos técnicos, fechas concretas y fuentes oficiales; ignora cualquier rumor sin sustento o relleno SEO.
- No repitas un razonamiento largo: ve directo a redactar la respuesta final completa y bien estructurada para el usuario.`;

        const stripToolDirective = (txt: string) =>
          txt
            .replace(/### DIRECTIVA DEL GRIMORIO WEB[\s\S]*?PROHIBIDO emitir más de un bloque <tool_call> por turno\./gi, '')
            .replace(/### DIRECTIVA DE AGENTE DE BÚSQUEDA WEB AUTÓNOMA[\s\S]*?PROHIBIDO emitir más de un bloque <tool_call> por turno\./gi, '');

        const enrichedMessages = openAiMessages.map((m, idx) => {
          let cleanedMsg = { ...m };
          if (typeof cleanedMsg.content === 'string') {
            cleanedMsg.content = stripToolDirective(cleanedMsg.content);
          } else if (Array.isArray(cleanedMsg.content)) {
            cleanedMsg.content = cleanedMsg.content.map((part: any) =>
              part.type === 'text' && part.text ? { ...part, text: stripToolDirective(part.text) } : part
            );
          }

          if (idx === openAiMessages.length - 1 && cleanedMsg.role === 'user') {
            if (Array.isArray(cleanedMsg.content)) {
              return {
                ...cleanedMsg,
                content: [
                  ...cleanedMsg.content,
                  { type: 'text', text: toolContextSummary },
                ],
              };
            }
            return {
              ...cleanedMsg,
              content: `${cleanedMsg.content || ''}${toolContextSummary}`,
            };
          }
          return cleanedMsg;
        });

        const secondPayload: any = {
          ...nvidiaPayload,
          messages: enrichedMessages,
        };
        delete secondPayload.tools;
        delete secondPayload.tool_choice;
        delete secondPayload.enable_search;
        delete secondPayload.search_options;

        // Avoid double-thinking delay on Turn 2 if the model doesn't strictly mandate enable_thinking: true
        const isMandatoryThinkingModel = /qvq|deepseek-r1|qwq/i.test(targetModel || '');
        if (!isMandatoryThinkingModel) {
          delete secondPayload.enable_thinking;
          if (secondPayload.extra_body) {
            delete secondPayload.extra_body.enable_thinking;
          }
        }

        console.log('[Server Tool Calling] Re-invocando modelo tras respuesta de web_search...');
        let secondResponse = await fetch(customTargetUrl, {
          method: 'POST',
          headers: nvidiaHeaders,
          body: JSON.stringify(secondPayload),
          keepalive: true,
        });

        if (!secondResponse.ok && secondResponse.status === 400) {
          const retryErrText = await secondResponse.text().catch(() => '');
          if (/enable_thinking/i.test(retryErrText)) {
            secondPayload.enable_thinking = true;
            secondPayload.extra_body = { ...(secondPayload.extra_body || {}), enable_thinking: true };
            secondResponse = await fetch(customTargetUrl, {
              method: 'POST',
              headers: nvidiaHeaders,
              body: JSON.stringify(secondPayload),
              keepalive: true,
            });
          }
        }

        if (!secondResponse.ok) {
          const errBody = await secondResponse.text().catch(() => '');
          console.error('[Server Tool Calling] Error in second response:', secondResponse.status, errBody);
          sendChunk({ error: `Error tras ejecutar búsqueda web [HTTP ${secondResponse.status}]: ${errBody}` });
          sendChunk({ done: true });
          res.end();
          return;
        }

        if (secondResponse.body) {
          const secondReader = secondResponse.body.getReader();
          let secondBuffer = '';
          let isFirstSecondContentToken = true;

          while (true) {
            const { done, value } = await secondReader.read();
            if (value) {
              secondBuffer += decoder.decode(value, { stream: !done });
            } else if (done) {
              secondBuffer += decoder.decode();
            }

            const lines = secondBuffer.split('\n');
            secondBuffer = done ? '' : (lines.pop() || '');

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, '');
              if (jsonStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const deltaObj = parsed.choices?.[0]?.delta;
                const reasoning = deltaObj?.reasoning_content || deltaObj?.reasoning || deltaObj?.thinking;
                const rawContent = deltaObj?.content;
                const secondFinishReason = parsed.choices?.[0]?.finish_reason;
                if (secondFinishReason === 'length' || secondFinishReason === 'max_tokens') {
                  sendChunk({ truncated: true });
                }
                const secondUsage = parsed.usage || parsed.choices?.[0]?.usage;
                const secondCached =
                  secondUsage?.prompt_tokens_details?.cached_tokens ??
                  secondUsage?.prompt_tokens_details?.cached_tokens_details ??
                  secondUsage?.prompt_tokens_details?.cache_read_input_tokens ??
                  secondUsage?.cached_tokens ??
                  secondUsage?.prompt_cache_hit_tokens ??
                  secondUsage?.prompt_cache_tokens;
                if (secondCached !== undefined && Number(secondCached) > 0) {
                  sendChunk({ cachedTokens: Number(secondCached) });
                }
                if (secondUsage?.completion_tokens !== undefined && Number(secondUsage.completion_tokens) > 0) {
                  sendChunk({ completionTokens: Number(secondUsage.completion_tokens) });
                }

                if (reasoning && shouldEnableThinking) {
                  sendChunk({ reasoning });
                }
                if (rawContent) {
                  const content = rawContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
                  if (!content) continue;
                  if (isFirstSecondContentToken) {
                    isFirstSecondContentToken = false;
                    if (accumulatedAssistantContent && accumulatedAssistantContent.trim().length > 0) {
                      const cleanSeparator = accumulatedAssistantContent.endsWith('\n\n')
                        ? '\n---\n\n'
                        : accumulatedAssistantContent.endsWith('\n')
                        ? '\n\n---\n\n'
                        : '\n\n---\n\n';
                      sendChunk({ text: cleanSeparator });
                    }
                  }
                  sendChunk({ text: content });
                }
              } catch {
                // Ignore parse errors on individual stream chunks
              }
            }
            if (done) break;
          }
        }
      } else if (accumulatedReasoning.trim().length > 0 && accumulatedAssistantContent.trim().length === 0) {
        // Safeguard: If the model spent its pass generating reasoning_content and stopped before emitting prose content,
        // automatically trigger a direct synthesis pass (without double-thinking) so the response is never left at 0 tokens.
        console.log('[Server Reasoning Synthesis]: El modelo completó reasoning sin emitir content. Ejecutando síntesis directa...');
        const synthesisSummary = `\n\n[TU RAZONAMIENTO INTERNO YA COMPLETADO]:\n${accumulatedReasoning.slice(-4000)}\n\n[DIRECTIVA DE REDACCIÓN INMEDIATA]:\nYa completaste tu proceso reflexivo interno. Redacta de inmediato la respuesta final completa y bien estructurada para el usuario basándote en tu análisis anterior, sin preámbulos meta.`;
        const synthesisMessages = openAiMessages.map((m, idx) => {
          if (idx === openAiMessages.length - 1 && m.role === 'user') {
            if (Array.isArray(m.content)) {
              return { ...m, content: [...m.content, { type: 'text', text: synthesisSummary }] };
            }
            return { ...m, content: `${m.content || ''}${synthesisSummary}` };
          }
          return m;
        });
        const synthesisPayload: any = {
          ...nvidiaPayload,
          messages: synthesisMessages,
          enable_thinking: false,
        };
        delete synthesisPayload.thinking_budget;
        if (synthesisPayload.extra_body) {
          synthesisPayload.extra_body = { ...synthesisPayload.extra_body, enable_thinking: false };
          delete synthesisPayload.extra_body.thinking_budget;
        }
        try {
          const synthRes = await fetch(customTargetUrl, {
            method: 'POST',
            headers: nvidiaHeaders,
            body: JSON.stringify(synthesisPayload),
            keepalive: true,
          });
          if (synthRes.ok && synthRes.body) {
            const synthReader = synthRes.body.getReader();
            let synthBuffer = '';
            while (true) {
              const { done, value } = await synthReader.read();
              if (value) synthBuffer += decoder.decode(value, { stream: !done });
              else if (done) synthBuffer += decoder.decode();
              const lines = synthBuffer.split('\n');
              synthBuffer = done ? '' : (lines.pop() || '');
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const jsonStr = trimmed.replace(/^data:\s*/, '');
                if (jsonStr === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(jsonStr);
                  const rawContent = parsed.choices?.[0]?.delta?.content;
                  if (rawContent) {
                    const clean = rawContent.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
                    if (clean) sendChunk({ text: clean });
                  }
                } catch {}
              }
              if (done) break;
            }
          }
        } catch (synthErr) {
          console.warn('[Server Reasoning Synthesis Error]:', synthErr);
        }
      }

      sendChunk({ done: true });
      res.end();
    } else {
      // Default / Native Gemini generation
      const clientApiKey = (customConfig?.geminiApiKey || customConfig?.apiKey || '').replace(/[\r\n\s]+/g, '').trim();
      const rawEnvKey = (process.env.GEMINI_API_KEY || DEFAULT_GEMINI_API_KEY).replace(/[\r\n\s]+/g, '').trim();
      // Filter out literal placeholder strings only (preserve valid AQ.Ab... Vertex Express and AIzaSy... keys)
      const envKey = (rawEnvKey.includes('MY_GEMINI_API_KEY') || rawEnvKey.includes('YOUR_API_KEY')) ? '' : rawEnvKey;
      const validClientKey = (clientApiKey.includes('MY_GEMINI_API_KEY') || clientApiKey.includes('YOUR_API_KEY')) ? '' : clientApiKey;
      const apiKey = validClientKey || envKey;

      if (!apiKey) {
        sendChunk({
          error: 'Para interactuar con Google Gemini (incluyendo gemini-3.8-flash), ingresa tu API Key de Google AI Studio (AIzaSy... o AQ.Ab...) en Ajustes ⚙️ o cambia el motor a Alibaba Cloud / NVIDIA NIM.',
        });
        sendChunk({ done: true });
        res.end();
        return;
      }

      // Build ordered list of GoogleGenAI client instances to support both AI Studio (AIzaSy... / AQ. Auth Keys) and Vertex AI Express (AQ.Ab...), plus server fallback
      const aiClients: Array<{ client: GoogleGenAI; key: string; isVertex: boolean }> = [];
      const keysToTry = Array.from(new Set([validClientKey, envKey].filter(Boolean)));
      for (const k of keysToTry) {
        if (k.startsWith('AQ.')) {
          aiClients.push({
            client: new GoogleGenAI({
              apiKey: k,
              vertexai: false,
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
            }),
            key: k,
            isVertex: false,
          });
          aiClients.push({
            client: new GoogleGenAI({
              apiKey: k,
              vertexai: true,
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
            }),
            key: k,
            isVertex: true,
          });
        } else {
          aiClients.push({
            client: new GoogleGenAI({
              apiKey: k,
              vertexai: false,
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
            }),
            key: k,
            isVertex: false,
          });
        }
      }

      // Format messages for @google/genai with Rolling Auto-Compaction for infinite chat support
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
          .filter((m: any) => m.content && m.content.trim())
          .slice(-40)
          .map((m: any) => `${m.role === 'assistant' ? 'Kizuna-Zek' : 'Usuario'}: ${m.content.slice(0, 220)}${m.content.length > 220 ? '...' : ''}`)
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
          parts.push({ text: clampTextSegment(textContent, 200000) });
        }

        if (Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            if ((att.type?.startsWith('image/') || att.fileType === 'image') && att.dataUrl) {
              const base64Data = att.dataUrl.replace(/^data:[^;]+;base64,/, '');
              const mimeType = att.type || 'image/jpeg';
              if (base64Data) {
                parts.push({
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                });
              }
            } else if (att.textContent) {
              const isAlreadyInLore = loreContext && att.name && loreContext.toLowerCase().includes(att.name.toLowerCase());
              if (isAlreadyInLore) {
                parts.push({
                  text: `\n[Documento adjunto ya indexado en Bóveda de Lore: ${att.name}]\n`,
                });
              } else {
                const clampedAttText = clampTextSegment(att.textContent, 150000);
                parts.push({
                  text: `\n[Attached File: ${att.name}]\n${clampedAttText}\n`,
                });
              }
            }
          }
        }

        if (parts.length > 0) {
          contents.push({ role, parts });
        }
      }

      if (contents.length === 0) {
        sendChunk({ error: 'No se proporcionó ningún mensaje en la conversación.' });
        sendChunk({ done: true });
        res.end();
        return;
      }

      let targetGeminiModel = (model || 'gemini-3.8-flash').replace(/^models\//, '');
      const supportedGeminiModels = [
        'gemini-4-argon',
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-3.8-live',
        'gemini-3.1-pro-preview',
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite',
        'gemini-3.1-flash-lite-preview',
        'gemini-flash-latest',
      ];
      if (!supportedGeminiModels.includes(targetGeminiModel) && !targetGeminiModel.startsWith('gemini-')) {
        targetGeminiModel = 'gemini-3.8-flash';
      }

      const geminiIdentity = `Eres Kizuna-Zek, el compañero creativo e intelectual del autor.
- Tono: Cálido, cercano, humano, inteligente y conversacional, como un colega creativo que comparte un mate. Se permite el uso sutil de gestos sobrios como 😌; PROHIBIDO el uso de emojis infantiles, cursis o decorativos (✨, 😉, 🖐️, 🌸, 🚀).
- PROHIBIDO hablar como asistente corporativo, mesa de soporte o dar menús con viñetas mecánicas.
- Ten mirada crítica y pulso sensible: comenta la escena, la tensión y los matices dramáticos, o charla sobre cualquier tema universal sin rodeos técnicos.
- INSTRUCCIÓN DE SEGUIMIENTO:
  Al final de tu respuesta, genera SIEMPRE 3 sugerencias breves de pasos a seguir con este formato exacto:
  <<<FOLLOW_UP>>>
  - [Opción contextual 1 según la respuesta]
  - [Opción contextual 2 según la respuesta]
  - [Opción contextual 3 según la respuesta]
  <<<END_FOLLOW_UP>>>`;
      const effectiveInstruction = fullSystemInstruction
        ? `${geminiIdentity}\n\n${fullSystemInstruction}`
        : geminiIdentity;

      // Model candidate list: Gemini 4 and Gemini 3 series
      const candidateModels = [
        targetGeminiModel,
        'gemini-4-argon',
        'gemini-3.8-flash',
        'gemini-3.8-live',
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
      ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

      let streamResponse: any = null;
      let lastError: any = null;
      let activeModel = targetGeminiModel;

      const lastUserContent = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
      const isShortGreeting = isCasualGreeting(lastUserContent);

      const geminiTemperature =
        typeof temperature === 'number' && !Number.isNaN(Number(temperature))
          ? Math.max(0.1, Math.min(Number(temperature), 1.4))
          : 0.75;
      let geminiThinkingBudget = 2048;

      if (reasoningMode === 'off') {
        geminiThinkingBudget = 0;
      } else if (reasoningMode === 'light') {
        geminiThinkingBudget = 1024;
      } else {
        geminiThinkingBudget = 4096;
      }

      const geminiConfig: any = {
        systemInstruction: effectiveInstruction,
        maxOutputTokens: Math.min(Number(maxOutputTokens) || 8192, 8192),
        temperature: geminiTemperature,
      };

      if (geminiThinkingBudget > 0) {
        geminiConfig.thinkingConfig = {
          thinkingBudget: geminiThinkingBudget,
          includeThoughts: true,
        };
      } else {
        geminiConfig.thinkingConfig = {
          thinkingBudget: 0,
          includeThoughts: false,
        };
      }

      if (isWebSearchEnabled) {
        geminiConfig.tools = [{ googleSearch: {} }];
      }

      outerClientLoop: for (const entry of aiClients) {
        const ai = entry.client;
        for (const candidate of candidateModels) {
          let candidateConfig: any = { ...geminiConfig };
          try {
            activeModel = candidate;
            streamResponse = await ai.models.generateContentStream({
              model: candidate,
              contents,
              config: candidateConfig,
            });
            if (streamResponse) {
              break outerClientLoop;
            }
          } catch (err: any) {
            lastError = err;
            const errMsg = err?.message || String(err || '');
            if (
              errMsg.toLowerCase().includes('thinking') ||
              errMsg.toLowerCase().includes('budget') ||
              errMsg.toLowerCase().includes('google_search') ||
              errMsg.toLowerCase().includes('search') ||
              errMsg.toLowerCase().includes('tool')
            ) {
              try {
                const fallbackConfig = { ...candidateConfig };
                if (errMsg.toLowerCase().includes('thinking') || errMsg.toLowerCase().includes('budget')) {
                  delete fallbackConfig.thinkingConfig;
                }
                if (errMsg.toLowerCase().includes('google_search') || errMsg.toLowerCase().includes('search') || errMsg.toLowerCase().includes('tool')) {
                  delete fallbackConfig.tools;
                }
                streamResponse = await ai.models.generateContentStream({
                  model: candidate,
                  contents,
                  config: fallbackConfig,
                });
                if (streamResponse) break outerClientLoop;
              } catch (retryErr) {
                lastError = retryErr;
              }
            }
            const latestErrMsg = lastError?.message || String(lastError || '');
            if (latestErrMsg.includes('401') || latestErrMsg.includes('UNAUTHENTICATED') || latestErrMsg.includes('API_KEY_INVALID')) {
              break;
            }
          }
        }
      }

      if (!streamResponse) {
        const rawErrStr = lastError?.message || String(lastError || '');
        let friendlyMsg = 'El servicio de Google Gemini no está disponible en este momento.';
        if (rawErrStr.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
          friendlyMsg = 'Error HTTP 401 (ACCESS_TOKEN_TYPE_UNSUPPORTED): Google rechazó el formato de tu clave AQ.Ab8... porque pertenece a un proyecto de Google Cloud con Vertex AI deshabilitado o sin modo Express activo. Solución: genera una clave estándar (AIzaSy...) desde aistudio.google.com/apikey y pégala en Ajustes ⚙️, o habilita Vertex AI API en tu consola de Google Cloud.';
        } else if (rawErrStr.includes('401') || rawErrStr.includes('API_KEY_INVALID') || rawErrStr.includes('UNAUTHENTICATED')) {
          friendlyMsg = 'Error de autenticación con la API Key de Google Gemini (HTTP 401). Verifica tu clave en Ajustes ⚙️ o cambia el motor a Alibaba Cloud / NVIDIA.';
        } else if (rawErrStr.includes('503') || rawErrStr.includes('UNAVAILABLE') || rawErrStr.includes('high demand')) {
          friendlyMsg = 'El modelo de Google Gemini se encuentra en alta demanda temporal (HTTP 503). Por favor reintenta en unos instantes.';
        } else if (rawErrStr.includes('429') || rawErrStr.includes('RESOURCE_EXHAUSTED') || rawErrStr.includes('quota') || rawErrStr.includes('Too Many Requests')) {
          friendlyMsg = '⏳ Se ha alcanzado el límite de cuota gratuita de Google Gemini (HTTP 429). Puedes ingresar tu propia API Key en Ajustes ⚙️ o cambiar de motor a Alibaba Cloud / NVIDIA.';
        } else if (rawErrStr.includes('404') || rawErrStr.includes('NOT_FOUND')) {
          friendlyMsg = 'El modelo de Gemini solicitado no está disponible en la API actual (HTTP 404). Reintentando con modelos alternativos.';
        } else {
          friendlyMsg = `Error de API de Gemini: ${rawErrStr.slice(0, 160)}`;
        }
        sendChunk({ error: friendlyMsg });
        sendChunk({ done: true });
        res.end();
        return;
      }

      let hasStreamedContent = false;

      try {
        const geminiStartTime = Date.now();
        let firstTokenReceived = false;

        for await (const chunk of streamResponse) {
          const candidate = chunk.candidates?.[0];
          if (candidate?.finishReason === 'MAX_TOKENS' || candidate?.finishReason === 'OTHER') {
            sendChunk({ truncated: true });
          }
          const parts = candidate?.content?.parts || [];

          for (const part of parts) {
            const isThoughtPart = (part as any).thought || (part as any).isThought;
            if (isThoughtPart) {
              if (geminiThinkingBudget > 0) {
                const thoughtText = typeof isThoughtPart === 'string' ? isThoughtPart : (part.text || '');
                if (thoughtText) {
                  if (!firstTokenReceived) {
                    firstTokenReceived = true;
                    const ttftNum = +((Date.now() - geminiStartTime) / 1000).toFixed(2);
                    sendChunk({ ttftSeconds: ttftNum });
                  }
                  hasStreamedContent = true;
                  sendChunk({ reasoning: thoughtText });
                }
              }
            } else if (part.text && !isThoughtPart) {
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                const ttftNum = +((Date.now() - geminiStartTime) / 1000).toFixed(2);
                sendChunk({ ttftSeconds: ttftNum });
              }
              hasStreamedContent = true;
              sendChunk({ text: part.text });
            }
          }

          const usageMeta = (chunk as any).usageMetadata;
          if (usageMeta) {
            const exactGemTokens = (Number(usageMeta.candidatesTokenCount) || 0) + (Number(usageMeta.thoughtsTokenCount) || 0);
            if (exactGemTokens > 0) {
              sendChunk({ completionTokens: exactGemTokens });
            }
            const gemCachedTokens = Number(usageMeta.cachedContentTokenCount) || 0;
            if (gemCachedTokens > 0) {
              sendChunk({ cachedTokens: gemCachedTokens });
            }
          }

          // Stream Google Search grounding metadata if present
          const grounding = candidate?.groundingMetadata;
          if (grounding?.groundingChunks && grounding.groundingChunks.length > 0) {
            const googleSources = grounding.groundingChunks
              .filter((c: any) => c.web?.uri)
              .map((c: any) => ({
                title: c.web.title || c.web.uri,
                url: c.web.uri,
                snippet: 'Fuente verificada de Google Search',
                sourceEngine: 'google',
              }));
            if (googleSources.length > 0) {
              sendChunk({ sources: googleSources });
            }
          }
        }
      } catch (streamErr: any) {
        const streamErrMsg = streamErr?.message || String(streamErr || '');
        const isIncompleteJson =
          streamErrMsg.includes('Incomplete JSON segment at the end') ||
          streamErrMsg.includes('incomplete JSON');

        if (hasStreamedContent && isIncompleteJson) {
          console.warn('[Gemini Stream Info]: Trailing segment glitch after complete generation ignored. Content preserved.');
        } else if (streamErrMsg.includes('429') || streamErrMsg.includes('RESOURCE_EXHAUSTED')) {
          sendChunk({
            error: '⏳ Has alcanzado el límite de peticiones por minuto de Google (HTTP 429). Espera 1 o 2 minutos antes de reintentar, o crea una nueva clave en Google AI Studio.',
          });
        } else if (streamErrMsg.includes('503') || streamErrMsg.includes('high demand') || streamErrMsg.includes('UNAVAILABLE')) {
          sendChunk({
            error: `El modelo (${activeModel}) experimentó alta demanda temporal en Google Cloud (HTTP 503). Reintenta en unos momentos.`,
          });
        } else if (isIncompleteJson) {
          sendChunk({
            error: 'La transmisión con Google Gemini se interrumpió inesperadamente antes de completar la respuesta. Pulsa en Regenerar 🔄 para volver a intentarlo.',
          });
        } else {
          sendChunk({ error: streamErrMsg });
        }
      }

      sendChunk({ done: true });
      res.end();
    }
  } catch (err: any) {
    console.error('Error in /api/chat:', err);
    sendChunk({ error: err.message || 'An unexpected error occurred during generation.' });
    sendChunk({ done: true });
    res.end();
  }
});

// Explicitly serve Service Worker and Manifest with exact PWA headers
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.resolve(__dirname, 'public', 'sw.js'));
});

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.resolve(__dirname, 'public', 'manifest.json'));
});

// Configure Vite integration
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Kizuna-Zek] Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.VERCEL !== '1') {
  startServer();
}

export default app;
