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
  const clean = userPrompt.trim().toLowerCase().replace(/[¿?¡!.,;:()'"-]/g, '').trim();
  if (clean.length < 8) {
    const greetingWords = [
      'hola', 'buenas', 'que tal', 'qué tal', 'buen dia', 'buen día',
      'buenas tardes', 'buenas noches', 'hey', 'hi', 'hello', 'alo', 'aló',
      'saludos', 'adios', 'adiós', 'chau', 'gracias', 'ok', 'vale', 'si', 'sí', 'no'
    ];
    if (greetingWords.includes(clean)) return true;
    if (greetingWords.some((w) => clean.startsWith(w + ' ') || clean.endsWith(' ' + w))) return true;
    if (clean.length <= 4) return true;
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

function extractRelevantChaptersServer(fullLoreText: string, userQuery: string, maxCharLength: number = 1500000): string {
  if (!fullLoreText || fullLoreText.length <= maxCharLength) {
    return fullLoreText;
  }
  const chapterHeaderRegex = /(?:^|\n)(?=#+\s*(?:cap[íi]tulo|chapter|acto|volumen|\bcap\b)\s*\d+|(?:cap[íi]tulo|chapter|acto|volumen|\bcap\b)\s*\d+)/gi;
  const segments = fullLoreText.split(chapterHeaderRegex).filter((s) => s && s.trim().length > 100);

  if (segments.length <= 1) {
    return clampTextSegment(fullLoreText, maxCharLength);
  }

  const queryTerms = (userQuery || '')
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u024F]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const scoredSegments = segments.map((seg, index) => {
    const lowerSeg = seg.toLowerCase();
    let score = 0;
    queryTerms.forEach((term) => {
      if (lowerSeg.includes(term)) {
        score += 3;
      }
    });
    if (index >= segments.length - 2) {
      score += 5;
    }
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

  const apiKey = (process.env.GEMINI_API_KEY || DEFAULT_GEMINI_API_KEY).replace(/[\r\n\s]+/g, '').trim();
  if (!apiKey) {
    console.warn('/api/search: GEMINI_API_KEY is not configured on server.');
    return res.json({
      results: [],
      searchKeywords: cleanQuery,
      summary: '',
      error: 'GEMINI_API_KEY non-existent',
    });
  }

  try {
    const isVertexSearchKey = apiKey.startsWith('AQ.');
    const ai = new GoogleGenAI({
      apiKey: apiKey.trim(),
      vertexai: isVertexSearchKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const candidateModels = [
      'gemini-3.6-flash',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ];

    let searchResponse: any = null;
    let lastErr: any = null;

    for (const modelCandidate of candidateModels) {
      try {
        searchResponse = await ai.models.generateContent({
          model: modelCandidate,
          contents: `Busca y resume información precisa, completa y reciente sobre: ${cleanQuery}`,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });
        if (searchResponse) break;
      } catch (err: any) {
        lastErr = err;
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
    { id: 'gemini-4-argon', displayName: 'Gemini 4 Argon', description: 'Modelo SOTA de Google para razonamiento profundo, lore y creatividad' },
    { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', description: 'Ultra-rápido para chat continuo y alta cadencia' },
    { id: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', description: 'Multimodal de alta velocidad, baja latencia y 1M contexto' },
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

    // Merge default curated list to ensure gemini-4-argon and full core suite are always available
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
      'gemini-3.6-flash',
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
    ? (apiKey.startsWith('sk-ws-') ? wsAlibabaBase : intlAlibabaBase)
    : 'https://integrate.api.nvidia.com/v1';

  let baseUrl = (
    req.body?.baseUrl ||
    req.body?.alibabaBaseUrl ||
    (req.headers['x-base-url'] as string) ||
    defaultBase
  ).replace(/\/+$/, '');

  if (isAlibaba && apiKey) {
    if (!apiKey.startsWith('sk-ws-') && baseUrl.includes('.maas.aliyuncs.com')) {
      baseUrl = intlAlibabaBase;
    } else if (apiKey.startsWith('sk-ws-') && baseUrl.includes('dashscope-intl.aliyuncs.com')) {
      baseUrl = wsAlibabaBase;
    }
  }

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

// Dedicated Scene Illustration Endpoint (Alibaba Wanx 2.1 -> Flux Anime Light Novel -> Atmospheric Concept Art fallback)
app.post(['/api/alibaba/images/generations', '/api/images/generate'], async (req, res) => {
  const { prompt, alibabaApiKey, model, size } = req.body || {};
  const rawPrompt = String(prompt || '').trim();
  if (!rawPrompt) {
    return res.status(400).json({ error: 'El prompt de la escena es requerido.' });
  }

  // Enhanced light novel anime aesthetic prompt
  const enhancedPrompt = `Masterpiece light novel concept art, anime visual novel illustration style, "Jukkou no Zankyou" dark fantasy novel, highly detailed, dramatic atmospheric lighting, expressive emotion, intricate textures, rich cinematic depth, 8k resolution: ${rawPrompt.slice(0, 500)}`;

  const cleanAliKey = (alibabaApiKey || process.env.ALIBABA_API_KEY || '').trim();

  // 1. Try Alibaba Cloud Model Studio (DashScope / Wanx / Qwen Image)
  if (cleanAliKey) {
    const targetWanxModel = (!model || model === 'wanx-2.1-t2i-turbo' || model === 'wanx2.1-t2i-turbo')
      ? 'wanx2.1-t2i-turbo'
      : model === 'wanx2.1-t2i-plus' || model === 'wan2.1-t2i-plus'
      ? 'wanx2.1-t2i-plus'
      : model;

    const formattedSize = size && size.includes('*') ? size : (size || '1024*1024').replace('x', '*');
    const oaiSize = formattedSize.replace('*', 'x');

    let lastAliError = '';

    // Candidate base URLs for Alibaba Cloud (Workspace Dedicated, International Singapore & Domestic China)
    const oaiBaseUrls = [
      'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ];

    const dashscopeBaseUrls = [
      'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/api/v1',
      'https://dashscope-intl.aliyuncs.com/api/v1',
      'https://dashscope.aliyuncs.com/api/v1',
    ];

    // Method A: OpenAI-compatible image generations endpoint (preferred for Qwen-Image-3.0, Qwen-Image-2.1, Wan2.6, Z-Image)
    for (const oaiBaseUrl of oaiBaseUrls) {
      try {
        const oaiRes = await fetch(`${oaiBaseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanAliKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: targetWanxModel,
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
              model: targetWanxModel,
            });
          }
        } else {
          const errText = await oaiRes.text().catch(() => '');
          console.warn(`[Alibaba OpenAI-Compatible HTTP ${oaiRes.status} on ${oaiBaseUrl}]:`, errText);
          lastAliError = `[Alibaba HTTP ${oaiRes.status}]: ${errText}`;
        }
      } catch (oaiErr: any) {
        console.warn(`[Alibaba OpenAI-Compatible Exception on ${oaiBaseUrl}]:`, oaiErr?.message);
        lastAliError = oaiErr?.message || 'Error de red con Alibaba Cloud';
      }
    }

    // Method B: DashScope Async Wanx Task Endpoint (/services/aigc/text2image/image-synthesis)
    for (const wanxBaseUrl of dashscopeBaseUrls) {
      try {
        const wanxRes = await fetch(`${wanxBaseUrl}/services/aigc/text2image/image-synthesis`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanAliKey}`,
            'Content-Type': 'application/json',
            'X-DashScope-Async': 'enable',
          },
          body: JSON.stringify({
            model: targetWanxModel,
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
            for (let i = 0; i < 22; i++) {
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
                  console.warn(`[Alibaba Task Failed on ${wanxBaseUrl}]:`, failMsg);
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
                    model: targetWanxModel,
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
                model: targetWanxModel,
              });
            }
          }
        } else {
          const errText = await wanxRes.text().catch(() => '');
          console.warn(`[Alibaba DashScope HTTP ${wanxRes.status} on ${wanxBaseUrl}]:`, errText);
          lastAliError = `[Alibaba HTTP ${wanxRes.status}]: ${errText}`;
        }
      } catch (e: any) {
        console.warn(`[Alibaba Fetch Exception on ${wanxBaseUrl}]:`, e?.message);
        lastAliError = e?.message || 'Error de red con Alibaba Cloud';
      }
    }

    if (lastAliError) {
      console.warn('[Alibaba Image Synthesis failed, returning diagnostic error]:', lastAliError);
      return res.status(400).json({
        error: `Error de API en Alibaba Cloud: ${lastAliError}`,
        details: lastAliError,
        model: targetWanxModel,
      });
    }
  }

  // 2. Universal High-Fidelity Light Novel / Anime Engine (Flux Anime via Pollinations)
  // Works seamlessly without consuming Gemini free-tier quota or requiring a paid key
  try {
    const seed = Math.floor(Math.random() * 1000000);
    const cleanSceneSnippet = rawPrompt
      .replace(/[\r\n]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s,.;:-]/gu, '')
      .slice(0, 280);
    const fluxPrompt = encodeURIComponent(
      `masterpiece anime light novel illustration, dark fantasy visual novel art, dramatic lighting, expressive character, high detail: ${cleanSceneSnippet}`
    );
    const fluxUrls = [
      `https://image.pollinations.ai/prompt/${fluxPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&private=true&enhance=false&model=flux`,
      `https://image.pollinations.ai/prompt/${fluxPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&private=true&enhance=false`,
    ];

    for (const targetFluxUrl of fluxUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 14000);
        const fluxRes = await fetch(targetFluxUrl, {
          signal: controller.signal,
          headers: {
            'Accept': 'image/jpeg,image/png,image/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KizunaZek/1.0',
          },
        });
        clearTimeout(timeoutId);

        if (fluxRes.ok) {
          const arrayBuf = await fluxRes.arrayBuffer();
          if (arrayBuf.byteLength > 1000) {
            const b64 = Buffer.from(arrayBuf).toString('base64');
            const mime = fluxRes.headers.get('content-type') || 'image/jpeg';
            return res.json({
              dataUrl: `data:${mime};base64,${b64}`,
              url: targetFluxUrl,
              prompt: rawPrompt,
              engine: 'flux-light-novel',
              model: 'flux-anime-1.1',
            });
          }
        }
      } catch {
        // Try next URL
      }
    }
  } catch {
    // Proceed to atmospheric SVG concept card fallback
  }

  // 3. Zero-Failure Atmospheric Dark Fantasy Concept Art Card (SVG DataURL)
  const safeExcerpt = rawPrompt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .slice(0, 120);
  const svgCard = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="70%">
        <stop offset="0%" stop-color="#2a1b3d"/>
        <stop offset="55%" stop-color="#11111a"/>
        <stop offset="100%" stop-color="#07070b"/>
      </radialGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f59e0b"/>
        <stop offset="100%" stop-color="#ec4899"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <circle cx="512" cy="400" r="240" fill="none" stroke="url(#gold)" stroke-width="2" stroke-opacity="0.35"/>
    <circle cx="512" cy="400" r="180" fill="none" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="8 8" stroke-opacity="0.4"/>
    <polygon points="512,180 690,510 334,510" fill="none" stroke="url(#gold)" stroke-width="2" stroke-opacity="0.3"/>
    <polygon points="512,620 690,290 334,290" fill="none" stroke="url(#gold)" stroke-width="2" stroke-opacity="0.3"/>
    <circle cx="512" cy="400" r="54" fill="url(#gold)" fill-opacity="0.18"/>
    <text x="512" y="740" text-anchor="middle" fill="#f4f4f5" font-family="Georgia, serif" font-size="30" font-weight="bold" letter-spacing="3">JUKKOU NO ZANKYOU</text>
    <text x="512" y="795" text-anchor="middle" fill="#a1a1aa" font-family="sans-serif" font-size="20">«${safeExcerpt}...»</text>
  </svg>`;
  const svgB64 = Buffer.from(svgCard, 'utf-8').toString('base64');
  return res.json({
    dataUrl: `data:image/svg+xml;base64,${svgB64}`,
    prompt: rawPrompt,
    engine: 'kizuna-concept-art',
    model: 'runic-canvas-v1',
  });
});

// Dedicated Alibaba Cloud TTS Endpoint (Qwen-Audio-3.1-TTS-Plus & Qwen-Audio-3.1-TTS-Flash)
app.post('/api/alibaba/tts', async (req, res) => {
  const {
    text,
    alibabaApiKey,
    voice = 'Cherry',
    model = 'auto',
    instruct = '',
  } = req.body || {};

  const cleanText = String(text || '').trim().slice(0, 2500);
  if (!cleanText) {
    return res.status(400).json({ error: 'Texto requerido para síntesis de voz' });
  }
  const cleanAliKey = (alibabaApiKey || process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
  if (!cleanAliKey) {
    return res.status(200).json({ fallback: true });
  }

  // Smart Auto-Selection between TTS-Plus (Literary / Dramatic) and TTS-Flash (Fast / Conversational)
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
      ? ['qwen-audio-3.1-tts-plus', 'qwen-audio-3.1-tts-flash', 'qwen3-tts-flash', 'qwen-tts']
      : ['qwen-audio-3.1-tts-flash', 'qwen-audio-3.1-tts-plus', 'qwen3-tts-flash', 'qwen-tts'];

  const cleanInstruct = String(instruct || '').trim();
  const dashscopeUrls = cleanAliKey.startsWith('sk-ws-')
    ? [
        'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      ]
    : [
        'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      ];

  try {
    for (const endpointUrl of dashscopeUrls) {
      for (const ttsModel of candidateModels) {
        const inputPayload: Record<string, any> = {
          text: cleanText,
          voice: voice || 'Cherry',
        };
        if (cleanInstruct) {
          inputPayload.instruct = cleanInstruct;
        }

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
        }).catch(() => null);

        if (ttsRes && ttsRes.ok) {
          const data = await ttsRes.json();
          const audioUrl = data?.output?.audio?.url;
          const audioData = data?.output?.audio?.data;
          if (audioData) {
            return res.json({
              audioDataUrl: `data:audio/wav;base64,${audioData}`,
              model: ttsModel,
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
                });
              }
            } catch {
              // Fall through to direct URL
            }
            return res.json({
              audioUrl,
              model: ttsModel,
            });
          }
        }
      }
    }
    return res.status(200).json({ fallback: true });
  } catch {
    return res.status(200).json({ fallback: true });
  }
});

// Dedicated Alibaba Cloud ASR Endpoint (Qwen-Audio-3.1-ASR-Flash Speech-to-Text)
app.post('/api/alibaba/asr', async (req, res) => {
  const { audioBase64, mimeType = 'audio/webm', alibabaApiKey, language = 'es' } = req.body || {};
  const rawAudio = String(audioBase64 || '').trim();
  if (!rawAudio) {
    return res.status(400).json({ error: 'Audio requerido para transcripción ASR' });
  }

  const cleanAliKey = (alibabaApiKey || process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
  if (!cleanAliKey) {
    return res.status(200).json({ fallback: true });
  }

  const pureBase64 = rawAudio.includes('base64,') ? rawAudio.split('base64,')[1] : rawAudio;
  const formatHint = mimeType.includes('mp4') || mimeType.includes('m4a')
    ? 'mp4'
    : mimeType.includes('ogg')
    ? 'ogg'
    : mimeType.includes('wav')
    ? 'wav'
    : 'webm';
  const fullDataUri = rawAudio.startsWith('data:') ? rawAudio : `data:${mimeType};base64,${pureBase64}`;

  const oaiBaseUrls = cleanAliKey.startsWith('sk-ws-')
    ? [
        'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      ]
    : [
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      ];

  const dashscopeBaseUrls = cleanAliKey.startsWith('sk-ws-')
    ? [
        'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      ]
    : [
        'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      ];

  const candidateAsrModels = ['qwen-audio-3.1-asr-flash', 'qwen3-asr-flash', 'qwen-audio-asr'];

  try {
    // Method 1: DashScope Native Multimodal Generation endpoint (primary for Qwen-Audio-3.1-ASR-Flash)
    for (const endpointUrl of dashscopeBaseUrls) {
      for (const asrModel of candidateAsrModels) {
        const dsRes = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanAliKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: asrModel,
            input: {
              messages: [
                {
                  role: 'user',
                  content: [
                    { audio: fullDataUri },
                  ],
                },
              ],
            },
            parameters: {
              asr_options: {
                language,
                enable_lid: true,
                enable_itn: true,
              },
            },
          }),
        }).catch(() => null);

        if (dsRes && dsRes.ok) {
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
          if (transcript) {
            return res.json({
              text: transcript,
              model: asrModel,
            });
          }
        }
      }
    }

    // Method 2: OpenAI-Compatible Chat Completions Multimodal Audio Input
    for (const baseUrl of oaiBaseUrls) {
      for (const asrModel of candidateAsrModels) {
        const oaiRes = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanAliKey}`,
            'Content-Type': 'application/json',
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
        }).catch(() => null);

        if (oaiRes && oaiRes.ok) {
          const oaiData = await oaiRes.json();
          const rawText = oaiData?.choices?.[0]?.message?.content;
          if (typeof rawText === 'string' && rawText.trim()) {
            return res.json({
              text: rawText.trim(),
              model: asrModel,
            });
          }
        }
      }
    }

    return res.status(200).json({ fallback: true });
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
    const defaultBase = isAlibaba
      ? 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'
      : 'https://integrate.api.nvidia.com/v1';
    let rawBase = ((req.headers['x-base-url'] as string) || req.body?.baseUrl || req.body?.alibabaBaseUrl || defaultBase).replace(/\/+$/, '');
    if (!isAlibaba && rawBase.includes('integrate.api.nvidia.com') && !rawBase.endsWith('/v1')) {
      rawBase = `${rawBase}/v1`;
    }
    const customBase = rawBase;
    const isStream = req.body?.stream === true;

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
      if (forwardBody.model === 'kimi-k3' || forwardBody.model === 'kimi/kimi-k3' || forwardBody.model === 'moonshotai/kimi-k3') {
        forwardBody.model = 'kimi-k3';
        delete forwardBody.temperature;
        delete forwardBody.top_p;
      }
      if (req.body?.enable_thinking !== undefined) {
        if (req.body.enable_thinking) {
          forwardBody.enable_thinking = true;
          forwardBody.extra_body = {
            ...(forwardBody.extra_body || {}),
            enable_thinking: true,
          };
        } else {
          delete forwardBody.enable_thinking;
          if (forwardBody.extra_body) {
            delete forwardBody.extra_body.enable_thinking;
          }
        }
      } else if (req.body?.enableReasoning !== undefined) {
        if (req.body.enableReasoning !== false) {
          forwardBody.enable_thinking = true;
          forwardBody.extra_body = {
            ...(forwardBody.extra_body || {}),
            enable_thinking: true,
          };
        } else {
          delete forwardBody.enable_thinking;
          if (forwardBody.extra_body) {
            delete forwardBody.extra_body.enable_thinking;
          }
        }
      }
      if (forwardBody.model === 'qwen-3.8-max') forwardBody.model = 'qwen3.8-max';
      if (forwardBody.model === 'qwen-3.8-flash') forwardBody.model = 'qwen3.8-flash';
      if (forwardBody.model === 'qwen-3.8-omni-flash') forwardBody.model = 'qwen3.8-omni-flash';
    }

    const targetUrl = `${customBase}/chat/completions`;
    console.log('[Server Proxy] Despachando a:', targetUrl);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(forwardBody),
    });

    if (!response.ok) {
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

// Main chat streaming endpoint
app.post('/api/chat', async (req, res) => {
  const {
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
  } = req.body;

  // Set SSE streaming headers with zero buffering & immediate packet dispatch
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
  res.write(': stream-start\n\n');
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }

  // Direct SSE chunk writer (no intermediary buffering in memory)
  const sendChunk = (data: { text?: string; reasoning?: string; done?: boolean; error?: string; sources?: any[]; ttftSeconds?: number; cachedTokens?: number; completionTokens?: number; truncated?: boolean }) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
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
- Uso de Emojis: ${emojiInstruction}${customInstructionsText ? `\n- Instrucciones personalizadas permanentes del usuario (PRIORIDAD ALTA): ${customInstructionsText}` : ''}

### DIRECTIVA OBLIGATORIA DE SEGUIMIENTO (FOLLOW-UP DINÁMICO)
Al final de TODAS tus respuestas completas (sin excepción, incluso saludos), genera exactamente 3 opciones o caminos siguientes breves adaptados estrictamente a lo que se acaba de conversar.
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

    if (loreContext && loreContext.trim() && (!isCasualOrShortGreeting || userAsksAboutLore)) {
      const optimizedLore = extractRelevantChaptersServer(loreContext, lastUserPrompt);
      if (optimizedLore.includes('[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO]') || optimizedLore.includes('[SELECCIÓN INTELIGENTE DE CAPÍTULOS')) {
        promptSections.push(optimizedLore.trim());
      } else {
        promptSections.push(
          `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO]:\n--- INICIO DE DOCUMENTOS ---\n${optimizedLore.trim()}\n--- FIN DE DOCUMENTOS ---`
        );
      }
    }

    if (Array.isArray(memories)) {
      const activeMemories = memories.filter((m: any) => m.enabled !== false).map((m: any) => `- ${m.text}`);
      if (activeMemories.length > 0) {
        promptSections.push(`### PERSISTENT LONG-TERM MEMORY (KEY FACTS TO REMEMBER)\n${activeMemories.join('\n')}`);
      }
      promptSections.push(
        `Si durante la charla el autor comparte detalles personales relevantes, preferencias creativas, o hechos clave sobre sus personajes o Monstereth, sintetiza el dato en una frase concisa en tercera persona y agrégala al final absoluto de tu respuesta con este formato exacto:\n<<<SAVE_MEMORY: [Hecho conciso en tercera persona]>>>. Si no hay datos nuevos que valgan la pena recordar, NO agregues la etiqueta.`
      );
    }

    console.log("Despachando llamada en servidor con webSearch:", Boolean(isWebSearchEnabled));

    // STRICT ENGINE DISPATCH:
    // Route to OpenAI-compatible custom endpoint when provider is 'custom', 'nvidia', or 'alibaba'.
    // If provider is 'gemini' (or default), STRICTLY dispatch to Google Gemini!
    const isCustomOrNvidia = provider === 'custom' || provider === 'nvidia' || provider === 'alibaba';

    if (isWebSearchEnabled && !isCasualOrShortGreeting) {
      if (isCustomOrNvidia) {
        promptSections.push(
          `### DIRECTIVA DE AGENTE DE BÚSQUEDA WEB AUTÓNOMA (MÁXIMO 1 CONSULTA QUIRÚRGICA)
Tienes acceso a búsqueda web verificada en tiempo real mediante Tavily, pero DEBES cuidar la cuota del usuario:
1. CUÁNDO NO BUSCAR (0 créditos): Si el usuario conversa de forma casual, pide redacción/edición creativa de su novela ('Jukkou no Zankyou', Kolder, Hinistra), o pregunta conceptos que ya dominas con certeza, RESPONDE DIRECTAMENTE SIN EMITIR <tool_call>.
2. CUÁNDO SÍ BUSCAR (Exactamente 1 consulta): Solo cuando el usuario pregunte por noticias actuales, hardware/modelos recientes, precios, fechas de lanzamiento, obras externas o datos fácticos que requieran verificación en vivo.
3. CÓMO BUSCAR RÁPIDO: Si decides buscar, emite de inmediato y SIN texto previo una ÚNICA etiqueta con términos técnicos precisos (de 3 a 7 palabras clave, sin signos ni relleno conversacional):
<tool_call>
{"name": "web_search", "arguments": {"query": "palabras clave exactas y técnicas"}}
</tool_call>
PROHIBIDO emitir más de un bloque <tool_call> por turno.`
        );
      } else {
        promptSections.push(
          `### DIRECTIVA DE BÚSQUEDA WEB NATIVA (GOOGLE SEARCH GROUNDING)
Tienes habilitada tu herramienta oficial nativa de Google Search en tiempo real. Si el usuario consulta sobre noticias actuales, modelos, precios, fechas o datos externos, utiliza automáticamente tu herramienta nativa de Google Search para fundamentar tu respuesta con precisión. PROHIBIDO emitir etiquetas <tool_call> manuales en el texto.`
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

      promptSections.push(webPromptBlock);
    }

    const fullSystemInstruction = promptSections.join('\n\n');

    if (isCustomOrNvidia) {
      const isAlibaba = provider === 'alibaba';
      const customApiKey = (
        isAlibaba
          ? (customConfig?.alibabaApiKey || process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || (customConfig?.apiKey && !customConfig.apiKey.startsWith('nvapi-') ? customConfig.apiKey : ''))
          : (customConfig?.apiKey || process.env.NVIDIA_API_KEY || '')
      ).trim();

      const wsAlibabaUrl = 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
      const intlAlibabaUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
      const defaultAlibabaUrl = customApiKey.startsWith('sk-ws-')
        ? wsAlibabaUrl
        : intlAlibabaUrl;

      let customBaseUrl = (
        isAlibaba
          ? (customConfig?.alibabaBaseUrl || customConfig?.baseUrl || defaultAlibabaUrl)
          : (customConfig?.baseUrl || 'https://integrate.api.nvidia.com/v1')
      ).replace(/\/+$/, '');

      if (isAlibaba && customApiKey) {
        if (!customApiKey.startsWith('sk-ws-') && customBaseUrl.includes('.maas.aliyuncs.com')) {
          customBaseUrl = intlAlibabaUrl;
        } else if (customApiKey.startsWith('sk-ws-') && customBaseUrl.includes('dashscope-intl.aliyuncs.com')) {
          customBaseUrl = wsAlibabaUrl;
        }
      }

      if (!isAlibaba && customBaseUrl.includes('integrate.api.nvidia.com') && !customBaseUrl.endsWith('/v1')) {
        customBaseUrl = `${customBaseUrl}/v1`;
      }

      const defaultModel = isAlibaba ? 'qwen3.8-max' : 'meta/llama-3.3-70b-instruct';
      let targetModel = (isAlibaba ? (customConfig?.alibabaModel || customConfig?.model) : customConfig?.model) || model || defaultModel;
      const hasImageAttachments = Array.isArray(messages) && messages.some((m: any) =>
        Array.isArray(m.attachments) &&
        m.attachments.some((a: any) => a.type?.startsWith('image/') || a.fileType === 'image')
      );

      if (isAlibaba) {
        if (targetModel === 'moonshotai/kimi-k3' || targetModel === 'kimi/k3' || targetModel === 'kimi/kimi-k3') {
          targetModel = customBaseUrl.includes('.maas.aliyuncs.com') ? 'kimi/kimi-k3' : 'kimi-k3';
        }
        if (/deepseek/i.test(targetModel)) targetModel = 'qwen3.8-max';
        if (/qwen2\.5/i.test(targetModel)) targetModel = 'qwen-plus';
        if (targetModel === 'qwen-3.8-max') targetModel = 'qwen3.8-max';
        if (targetModel === 'qwen-3.8-flash') targetModel = 'qwen3.8-flash';
        if (targetModel === 'qwen-3.8-omni-flash') targetModel = 'qwen3.8-omni-flash';
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

      // For Alibaba Cloud, message 0 role must always be 'user' (system prompt prepended inside first user msg)
      const isVlOrImageModel = isAlibaba;

      if (!isVlOrImageModel && fullSystemInstruction) {
        openAiMessages.push({
          role: 'system',
          content: fullSystemInstruction,
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

      // Context Sliding Window & Static Cache Header Optimization
      const maxRecentTurns = 4;
      let effectiveTurnsPayload = messages;
      let historySummaryBlock = '';

      if (messages.length > maxRecentTurns + 1) {
        const earlierMessages = messages.slice(0, messages.length - maxRecentTurns);
        effectiveTurnsPayload = messages.slice(messages.length - maxRecentTurns);

        // Compact earlier messages into a light summary block
        const summaryLines = earlierMessages
          .filter((m: any) => m.content && m.content.trim())
          .map((m: any) => `${m.role === 'assistant' ? 'Kizuna-Zek' : 'Usuario'}: ${m.content.slice(0, 180)}${m.content.length > 180 ? '...' : ''}`)
          .join('\n');
        if (summaryLines) {
          historySummaryBlock = `\n\n[RESUMEN COMPACTO DEL HISTORIAL PREVIO]:\n${summaryLines}`;
        }
      }

      // Check if active model is a strict 30,720 token context model (e.g. qwen-max, qwen-turbo)
      const isStrict32kModel = isAlibaba && /^qwen-(max|turbo|plus)(?!-vl)/i.test(targetModel);
      const isMillionTokenOmniOrLong = isAlibaba && /omni|long|3\.8/i.test(targetModel);
      const isTargetVisionCapable = isAlibaba
        ? /vl|vision|qvq|omni/i.test(targetModel)
        : !/deepseek/i.test(targetModel);
      const maxTotalInputChars = isMillionTokenOmniOrLong ? 180000 : isStrict32kModel ? 52000 : 88000;
      const maxSingleTurnChars = isMillionTokenOmniOrLong ? 90000 : isStrict32kModel ? 24000 : 42000;

      for (let idx = 0; idx < effectiveTurnsPayload.length; idx++) {
        const msg = effectiveTurnsPayload[idx];
        if (msg.role === 'system') continue;
        const isAssistant = msg.role === 'assistant';
        const roleName = isAssistant ? 'assistant' : 'user';
        const isLatestTurn = idx === effectiveTurnsPayload.length - 1;

        let userText = clampTextSegment(msg.content || '', maxSingleTurnChars);
        if (isVlOrImageModel && roleName === 'user' && fullSystemInstruction && idx === 0) {
          const safeSystemInstruction = clampTextSegment(
            `${fullSystemInstruction}${historySummaryBlock}`,
            isStrict32kModel ? 28000 : 48000
          );
          userText = `[INSTRUCCIONES DEL SISTEMA Y LORE ESTÁTICO]:\n${safeSystemInstruction}\n\n[MENSAJE DEL USUARIO]:\n${userText}`;
        }

        // Handle message content
        const contentParts: any[] = [];
        if (userText) {
          contentParts.push({ type: 'text', text: userText });
        }

        if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            if (att.type?.startsWith('image/') || att.fileType === 'image') {
              // Only send base64 image_url on the latest turn and when the model supports vision
              if (isTargetVisionCapable && isLatestTurn) {
                const rawBase64 = att.dataUrl ? att.dataUrl.replace(/^data:[^;]+;base64,/, '') : '';
                const mimeType = att.type || 'image/jpeg';
                if (rawBase64) {
                  contentParts.push({
                    type: 'image_url',
                    image_url: { url: `data:${mimeType};base64,${rawBase64}` },
                  });
                }
              }
            } else if (att.textContent && (!userText || !userText.includes(att.name))) {
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
          openAiMessages.push({
            role: roleName,
            content: (Array.isArray(msg.attachments) && msg.attachments.length > 0) ? contentParts : userText,
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
      }

      const isOff = reasoningMode === 'off';
      const isLight = reasoningMode === 'light';
      const lastUserContent = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
      const isShortGreeting = isCasualGreeting(lastUserContent) || (typeof lastUserContent === 'string' && lastUserContent.trim().length < 25);
      const isDeepMode = reasoningMode === 'deep';
      const isExtensivePrompt = !isShortGreeting && typeof lastUserContent === 'string' && lastUserContent.trim().length >= 50;

      // Configuración de esfuerzo de razonamiento para Kimi K3 en NVIDIA NIM:
      const isGlmModel = /glm/i.test(targetModel);
      const isStepfunModel = /step/i.test(targetModel);
      const isReasoningModel = isKimiModel || isGlmModel || isStepfunModel || /reason|thinking|cot|deepseek|qwq|step/i.test(targetModel);
      
      const dynamicReasoningEffort = isKimiModel
        ? ((isOff || isShortGreeting || isLight) ? 'low' : 'high')
        : ((isOff || isShortGreeting) ? 'low' : (isLight ? 'medium' : 'high'));

      // Respetar selección de Max Output Tokens de Ajustes y asegurar holgura cuando el razonamiento profundo está activo:
      let customMaxTokens = clampedMaxTokens;
      if (isDeepMode && isReasoningModel) {
        customMaxTokens = isStrict32kModel ? 8192 : Math.max(clampedMaxTokens, 12288);
      } else if (isLight && isReasoningModel) {
        customMaxTokens = isStrict32kModel ? Math.min(Math.max(clampedMaxTokens, 4096), 8192) : Math.max(clampedMaxTokens, 8192);
      }

      const userTemperature =
        typeof temperature === 'number' && !Number.isNaN(Number(temperature))
          ? Math.max(0.1, Math.min(Number(temperature), 1.4))
          : 0.75;

      let effectiveMessages = [...openAiMessages];

      if (isKimiModel) {
        let kimiThinkingDirective = '';
        if (isOff || isShortGreeting) {
          kimiThinkingDirective = "DIRECTIVA DE PENSAMIENTO: El modo de razonamiento profundo está DESACTIVADO. Prohibido divagar en reflexiones largas. Emite un pensamiento interno mínimo (menos de 5 segundos) o responde directamente.";
          customMaxTokens = clampedMaxTokens;
        } else if (isDeepMode) {
          kimiThinkingDirective = "DIRECTIVA DE PENSAMIENTO: Razonamiento profundo activado. Analiza exhaustivamente el subtexto, foley y continuidad antes de redactar.";
          customMaxTokens = Math.max(clampedMaxTokens, 12288);
        } else {
          kimiThinkingDirective = "DIRECTIVA DE PENSAMIENTO: Mantén un razonamiento ágil, conciso y enfocado antes de redactar.";
          customMaxTokens = Math.max(clampedMaxTokens, 8192);
        }

        if (isAlibaba) {
          if (effectiveMessages.length > 0 && effectiveMessages[0].role === 'user') {
            const firstMsg = effectiveMessages[0];
            const existingContent = Array.isArray(firstMsg.content)
              ? firstMsg.content
              : [{ type: 'text', text: String(firstMsg.content || '') }];
            effectiveMessages[0] = {
              ...firstMsg,
              role: 'user',
              content: [{ type: 'text', text: `${kimiThinkingDirective}\n\n` }, ...existingContent],
            };
          } else {
            effectiveMessages = [
              { role: 'user', content: [{ type: 'text', text: kimiThinkingDirective }] },
              ...effectiveMessages,
            ];
          }
        } else {
          const speedInstruction = {
            role: "system",
            content: kimiThinkingDirective,
          };
          effectiveMessages = [speedInstruction, ...effectiveMessages.filter(m => m.role !== 'system')];
        }
      }

      const isMandatoryThinkingModel = /r1|qwq|2\.4t|thinking|reason/i.test(targetModel);
      const shouldEnableThinking = (!isOff && !isShortGreeting) || isMandatoryThinkingModel;

      const nvidiaPayload: any = isAlibaba
        ? (targetModel === 'kimi-k3' || targetModel === 'kimi/kimi-k3'
          ? {
              model: targetModel,
              messages: effectiveMessages,
              max_tokens: customMaxTokens,
              stream: true,
            }
          : {
              model: targetModel, // "qwen3.8-max", "deepseek-r1", etc.
              messages: effectiveMessages,
              max_tokens: customMaxTokens,
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
        : isKimiModel
        ? {
            model: "moonshotai/kimi-k3",
            messages: effectiveMessages,
            max_tokens: customMaxTokens,
            stream: true,
            temperature: userTemperature,
            top_p: 0.95,
            reasoning_effort: dynamicReasoningEffort,
          }
        : {
            model: targetModel,
            messages: effectiveMessages,
            max_tokens: customMaxTokens,
            temperature: userTemperature,
            top_p: 0.9,
            stream: true,
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

          if (cleanQuery && tavilyKey) {
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
              console.warn('[Server Custom Provider] Error en búsqueda fallback:', fallbackSearchErr);
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

        // Auto-recovery 0b: If Alibaba endpoint returns HTTP 403/401/404 (e.g. "Workspace endpoint access denied" when using sk-... on ws-* or vice-versa), auto-switch endpoint!
        if (isAlibaba && !response.ok && (response.status === 403 || response.status === 401 || response.status === 404 || /Workspace endpoint access denied|Access denied|Forbidden/i.test(errorBody))) {
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

        // Auto-recovery 1: If Alibaba complains about enable_thinking parameter (either restricted to True or unrecognized)
        if (!response.ok && response.status === 400 && /enable_thinking/i.test(errorBody)) {
          if (/restricted to True/i.test(errorBody)) {
            console.warn('[Server Custom Provider] enable_thinking restringido a True para este modelo. Reintentando automáticamente con enable_thinking: true...');
            nvidiaPayload.enable_thinking = true;
            nvidiaPayload.extra_body = {
              ...(nvidiaPayload.extra_body || {}),
              enable_thinking: true,
            };
          } else {
            console.warn('[Server Custom Provider] enable_thinking no soportado para este modelo. Omitiendo y reintentando...');
            delete nvidiaPayload.enable_thinking;
            if (nvidiaPayload.extra_body) {
              delete nvidiaPayload.extra_body.enable_thinking;
            }
          }
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

        // Auto-recovery 2: If Alibaba/provider complains about input token length (e.g. Range of input length should be [1, 30720])
        if (!response.ok && response.status === 400 && /Range of input length should be|maximum context length|context_length_exceeded|input length/i.test(errorBody)) {
          console.warn('[Server Custom Provider] Límite de tokens de entrada excedido (30720). Compactando contexto automáticamente y reintentando...');
          const compactSystem = clampTextSegment(fullSystemInstruction, 14000);
          const compactLastUser = clampTextSegment(typeof lastUserContent === 'string' ? lastUserContent : '', 10000) || 'Continúa.';
          nvidiaPayload.messages = isAlibaba
            ? [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `[INSTRUCCIONES DEL SISTEMA Y LORE ESTÁTICO]:\n${compactSystem}\n\n[MENSAJE DEL USUARIO]:\n${compactLastUser}`,
                    },
                  ],
                },
              ]
            : [
                { role: 'system', content: compactSystem },
                { role: 'user', content: compactLastUser },
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

        // Auto-recovery 3: If provider complains about max_tokens limit (e.g. max_tokens is too large, the maximum value is 2048)
        if (!response.ok && response.status === 400 && /max_tokens|Range of max_tokens/i.test(errorBody)) {
          let safeTokens = 2048;
          const matchMax = errorBody.match(/(?:maximum value is|range of max_tokens should be \[\d+,\s*|less than or equal to\s*)(\d+)/i);
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

        // Auto-recovery 4: If target model is not found or not authorized on this endpoint, try tier-matched Singapore Qwen models across both endpoints
        if (!response.ok && (response.status === 404 || response.status === 403 || response.status === 400) && /model_not_found|Model not exist|Access to model denied|Workspace endpoint access denied|ModelNotOpen|does not exist/i.test(errorBody) && isAlibaba) {
          const requestedLower = String(nvidiaPayload.model || '').toLowerCase();
          const tierFallbacks = requestedLower.includes('plus')
            ? ['qwen3.8-plus', 'qwen-plus', 'qwen3.8-max']
            : requestedLower.includes('flash')
              ? ['qwen3.8-flash', 'qwen3.8-omni-flash', 'qwen-plus']
              : requestedLower.includes('a95b')
                ? ['qwen3.8-max', 'qwen3.8-plus', 'qwen-plus']
                : ['qwen3.8-max', 'qwen-max', 'qwen-plus'];
          const fallbackCandidates = tierFallbacks.filter((m) => m !== nvidiaPayload.model);
          const candidateUrls = [
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
      let hasToolCalls = false;
      let isInsideXmlToolCall = false;
      let pendingTagBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

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

            const cachedTokens = parsed.usage?.prompt_tokens_details?.cached_tokens ??
              parsed.usage?.cached_tokens ??
              parsed.usage?.prompt_cache_hit_tokens;
            if (cachedTokens !== undefined && cachedTokens > 0) {
              sendChunk({ cachedTokens: Number(cachedTokens) });
            }
            const completionTokens = parsed.usage?.completion_tokens;
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

            if (reasoning) {
              sendChunk({ reasoning });
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
      }

      if (pendingTagBuffer && !isInsideXmlToolCall && !hasToolCalls && !/<tool_call/i.test(pendingTagBuffer)) {
        sendChunk({ text: pendingTagBuffer });
        pendingTagBuffer = '';
      }

      // Detectar y extraer etiquetas de texto <tool_call> emitidas por Qwen en deltaObj.content
      const xmlToolMatches = [...accumulatedAssistantContent.matchAll(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/gi)];
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
          sendChunk({ reasoning: "⚠️ Grimorio: Falta configurar la API Key de Tavily en Ajustes.\n" });
          toolResultContent = JSON.stringify({
            query: searchQuery,
            status: 'no_api_key',
            message: 'No se encontró API Key de Tavily configurada. Procede a responder con tu conocimiento interno.',
          });
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
          txt.replace(/### DIRECTIVA DE AGENTE DE BÚSQUEDA WEB AUTÓNOMA[\s\S]*?PROHIBIDO emitir más de un bloque <tool_call> por turno\./gi, '');

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
            if (done) break;
            secondBuffer += decoder.decode(value, { stream: true });

            const lines = secondBuffer.split('\n');
            secondBuffer = lines.pop() || '';

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
                if (parsed.usage?.completion_tokens !== undefined && Number(parsed.usage.completion_tokens) > 0) {
                  sendChunk({ completionTokens: Number(parsed.usage.completion_tokens) });
                }

                if (reasoning) {
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
          }
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
          error: 'Para interactuar con Google Gemini (incluyendo gemini-4-argon), ingresa tu API Key de Google AI Studio (AIzaSy... o AQ.Ab...) en Ajustes ⚙️ o cambia el motor a Alibaba Cloud / NVIDIA NIM.',
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

      // Format messages for @google/genai
      const contents: any[] = [];

      for (const msg of messages) {
        if (msg.role === 'system') continue;
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts: any[] = [];

        if (msg.content && msg.content.trim()) {
          parts.push({ text: msg.content });
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
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
      ];
      if (!supportedGeminiModels.includes(targetGeminiModel)) {
        targetGeminiModel = 'gemini-3.8-flash';
      }

      const geminiIdentity = `Eres Kizuna-Zek, el compañero creativo de escritura del autor para la obra 'Jukkou No Zankyou'.
- Tono: Cálido, cercano, humano, expresivo y conversacional, como un colega creativo que comparte un mate y se apasiona genuinamente por la historia. Usa emojis con naturalidad (ej. 😌, ✨, 😉, ☕, 🎭, 🗡️).
- PROHIBIDO hablar como asistente corporativo, mesa de soporte o dar menús con viñetas mecánicas.
- Ten mirada crítica y pulso sensible: comenta la escena, la tensión y los matices dramáticos, y habla de tú a tú sin rodeos técnicos.
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

      // Model candidate list: Exclusively Gemini 3 and Gemini 4 series (Gemini 2.x series is retired)
      const candidateModels = [
        targetGeminiModel,
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
      ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

      let streamResponse: any = null;
      let lastError: any = null;
      let activeModel = targetGeminiModel;

      const lastUserContent = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
      const isShortGreeting = isCasualGreeting(lastUserContent) || lastUserContent.trim().length < 25;

      const geminiTemperature =
        typeof temperature === 'number' && !Number.isNaN(Number(temperature))
          ? Math.max(0.1, Math.min(Number(temperature), 1.4))
          : 0.75;
      let geminiThinkingBudget = 2048;

      if (reasoningMode === 'off' || isShortGreeting) {
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
            // gemini-4-argon does not accept thinkingBudget (uses automatic thinkingLevel)
            if (geminiThinkingBudget === 0 || candidate === 'gemini-4-argon') {
              delete candidateConfig.thinkingConfig;
            }
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
            if (latestErrMsg.includes('429') || latestErrMsg.includes('RESOURCE_EXHAUSTED') || latestErrMsg.includes('quota') || latestErrMsg.includes('Too Many Requests')) {
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
            if ((part as any).thought && part.text) {
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                const ttftNum = +((Date.now() - geminiStartTime) / 1000).toFixed(2);
                sendChunk({ ttftSeconds: ttftNum });
              }
              hasStreamedContent = true;
              sendChunk({ reasoning: part.text });
            } else if (part.text && !(part as any).thought) {
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
