export const DEFAULT_GEMINI_API_KEY = "";

/**
 * Clean any API key by removing carriage returns, newlines, and leading/trailing whitespace.
 */
export function cleanApiKey(key?: string | null): string {
  if (!key) return "";
  return key.replace(/[\r\n\s]+/g, "").trim();
}

/**
 * Check if a Gemini API key is validly formatted.
 * Accepts keys starting with 'AIzaSy' or standard Google API key format (>= 20 characters).
 */
export function isValidGeminiApiKey(key?: string | null): boolean {
  const cleaned = cleanApiKey(key);
  if (!cleaned || cleaned.includes("MY_GEMINI_API_KEY") || cleaned.includes("YOUR_API_KEY")) return false;
  return cleaned.startsWith("AIzaSy") || cleaned.startsWith("AQ.") || cleaned.length >= 20;
}

/**
 * Resolves the active Google Gemini API key.
 * Checks localStorage ('kizuna_gemini_api_key', 'kizuna_gemini_key') and VITE_GEMINI_API_KEY.
 * Purges legacy placeholder tokens.
 */
export function getGeminiApiKey(): string {
  let storedKey = localStorage.getItem("kizuna_gemini_api_key") || localStorage.getItem("kizuna_gemini_key");
  
  if (storedKey) {
    storedKey = cleanApiKey(storedKey);
    if (storedKey.includes("MY_GEMINI_API_KEY") || storedKey.includes("YOUR_API_KEY")) {
      localStorage.removeItem("kizuna_gemini_key");
      localStorage.removeItem("kizuna_gemini_api_key");
      storedKey = "";
    }
  }

  if (!storedKey) {
    const envKey = cleanApiKey(import.meta.env?.VITE_GEMINI_API_KEY as string);
    if (envKey && !envKey.includes("MY_GEMINI_API_KEY") && !envKey.includes("YOUR_API_KEY")) {
      localStorage.setItem("kizuna_gemini_key", envKey);
      localStorage.setItem("kizuna_gemini_api_key", envKey);
      return envKey;
    }
    return "";
  }

  return storedKey;
}

/**
 * Resolves the active NVIDIA / Custom API key.
 * Checks localStorage ('kizuna_nvidia_key', 'kizuna_custom_api_key') and VITE_NVIDIA_API_KEY.
 */
export function getNvidiaApiKey(): string {
  let storedKey = localStorage.getItem("kizuna_nvidia_key") || localStorage.getItem("kizuna_custom_api_key");
  if (storedKey) {
    return cleanApiKey(storedKey);
  }
  return cleanApiKey(import.meta.env?.VITE_NVIDIA_API_KEY as string) || "";
}

/**
 * Validate and return active Gemini API key for dispatch.
 * Throws an explicit error if missing or invalid to trigger the Error Diagnostic Modal.
 */
export function requireValidGeminiApiKey(customKey?: string): string {
  const keyToUse = cleanApiKey(customKey) || getGeminiApiKey();

  if (isValidGeminiApiKey(keyToUse)) {
    return keyToUse;
  }

  if (typeof window !== "undefined" && (window as any).GEMINI_API_KEY && window.self !== window.top) {
    return String((window as any).GEMINI_API_KEY);
  }

  throw new Error(
    "API Key de Google Gemini ausente o inválida. Ingrésala en el menú de Ajustes ⚙️ para continuar."
  );
}

/**
 * Sanitizes a user prompt into a clean search query for Google Search Grounding.
 * Removes conversational filler, greeting words, and punctuation.
 */
export function sanitizeSearchQuery(userPrompt: string): string {
  if (!userPrompt) return "";
  const cleaned = userPrompt
    .replace(/^(?:hola|buenas|che|tenía una duda|una pregunta)[,\s]*/gi, '')
    .replace(/(?:¿?podes|puedes|busca|buscar en internet sobre|que sabes de|averigua sobre)\s*/gi, '')
    .replace(/[?¿!¡]/g, '')
    .trim();
  return cleaned || userPrompt.trim();
}

/**
 * Checks if the user prompt is a casual greeting or very short filler (< 8 chars),
 * where web search should be skipped to save API quota and avoid empty search noise.
 */
export function isCasualGreeting(userPrompt: string): boolean {
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

/**
 * Strip out HTML tags, JavaScript code blocks, binary garbage, and non-printable characters.
 * Keeps Latin/Spanish chars and punctuation, removes control/token gibberish and code injections.
 */
export function scrubSnippetText(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/<\|.*?\|>/g, '') // remove LLM control tokens like <|close|>
    .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u017F\u00C0-\u024F\n\r\t.,!?;:()'"-]/g, ' ') // keep Latin/Spanish chars and punctuation
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const HTTP_429_RATE_LIMIT_NOTICE =
  "⏳ Has alcanzado el límite de peticiones por minuto de Google (HTTP 429). Espera 1 o 2 minutos antes de reintentar, o crea una nueva clave en Google AI Studio.";

/**
 * Resolves the active Tavily API key.
 * Checks localStorage ('kizuna_tavily_key'), VITE_TAVILY_API_KEY.
 */
export function getTavilyApiKey(): string {
  let storedKey = localStorage.getItem("kizuna_tavily_key");
  if (storedKey) {
    storedKey = cleanApiKey(storedKey);
    if (storedKey) return storedKey;
  }
  const envKey = cleanApiKey(import.meta.env?.VITE_TAVILY_API_KEY as string);
  if (envKey) {
    localStorage.setItem("kizuna_tavily_key", envKey);
    return envKey;
  }
  return "";
}

/**
 * Check if a Tavily API key is validly formatted.
 */
export function isValidTavilyApiKey(key?: string | null): boolean {
  const cleaned = cleanApiKey(key);
  if (!cleaned) return false;
  return cleaned.startsWith("tvly-") || cleaned.length >= 15;
}

/**
 * Dedicated Tavily search helper.
 */
export async function searchWithTavily(query: string, apiKey: string) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey.trim(),
      query: query,
      search_depth: "basic",
      include_answer: true,
      max_results: 5
    })
  });
  if (!response.ok) {
    throw new Error(`Tavily error (${response.status}): ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Diagnostic test function for Tavily connection.
 */
export async function testTavilyConnection(
  apiKey: string
): Promise<{ success: boolean; message: string; results?: any[] }> {
  const cleanKey = cleanApiKey(apiKey);
  if (!cleanKey) {
    return {
      success: false,
      message: 'Fallo: Clave de API de Tavily ausente.',
    };
  }

  try {
    const data = await searchWithTavily('noticias de hoy', cleanKey);
    const results = Array.isArray(data?.results) ? data.results : [];
    return {
      success: true,
      message: `¡Tavily conectado! ${results.length} fuentes encontradas`,
      results,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Fallo al conectar con Tavily: ' + (err?.message || String(err)),
    };
  }
}

/**
 * Full Tavily Search Pipeline helper for chat messages.
 * Formats context snippet and sources for LLM generation.
 */
export async function executeTavilySearch(
  userPrompt: string,
  customApiKey?: string
): Promise<{
  contextSnippet: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
  answer?: string;
}> {
  if (isCasualGreeting(userPrompt)) {
    return { contextSnippet: '', sources: [] };
  }

  const cleanQuery = sanitizeSearchQuery(userPrompt);
  const activeKey = cleanApiKey(customApiKey) || getTavilyApiKey();

  if (!activeKey) {
    return { contextSnippet: '', sources: [] };
  }

  try {
    const data = await searchWithTavily(cleanQuery, activeKey);
    const rawResults = Array.isArray(data?.results) ? data.results : [];
    const sources = rawResults.map((r: any) => ({
      title: scrubSnippetText(r.title || 'Fuente Web'),
      url: r.url || '',
      snippet: scrubSnippetText(r.content || r.snippet || ''),
    }));

    let contextSnippet = '';
    if (sources.length > 0) {
      contextSnippet =
        '[INFORMACIÓN EN TIEMPO REAL VÍA TAVILY SEARCH]:\n' +
        sources.map((s: { title: string; snippet: string }) => `- ${s.title}: ${s.snippet}`).join('\n');
    }
    if (data?.answer) {
      const cleanAnswer = scrubSnippetText(data.answer);
      if (cleanAnswer) {
        contextSnippet = `[RESPUESTA DIRECTA TAVILY]:\n${cleanAnswer}\n\n` + contextSnippet;
      }
    }

    return {
      contextSnippet,
      sources,
      answer: data?.answer,
    };
  } catch (err) {
    console.warn('[Tavily Search] Error during search execution:', err);
    return { contextSnippet: '', sources: [] };
  }
}

/**
 * Execute a background search query using Tavily AI Search (or fallback to Google Gemini with googleSearch).
 * Used for NVIDIA and Gemini models to fetch real-time web context before generating responses.
 */
export async function fetchGoogleSearchGrounding(
  userPrompt: string,
  customApiKey?: string
): Promise<{
  searchSummary: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
  isRateLimited?: boolean;
  error?: string;
}> {
  if (isCasualGreeting(userPrompt)) {
    return { searchSummary: '', sources: [] };
  }

  const cleanTopic = sanitizeSearchQuery(userPrompt);

  // 1. Primary: If Tavily API Key is available, use Tavily AI Search to avoid Google 429
  const tavilyKey = getTavilyApiKey();
  if (tavilyKey) {
    try {
      const tavilyData = await searchWithTavily(cleanTopic, tavilyKey);
      const rawResults = Array.isArray(tavilyData?.results) ? tavilyData.results : [];
      if (rawResults.length > 0) {
        const sources = rawResults.map((r: any) => ({
          title: scrubSnippetText(r.title || 'Fuente Web'),
          url: r.url || '',
          snippet: scrubSnippetText(r.content || r.snippet || ''),
        }));
        let searchSummary =
          '[INFORMACIÓN EN TIEMPO REAL VÍA TAVILY SEARCH]:\n' +
          sources.map((s: { title: string; snippet: string }) => `- ${s.title}: ${s.snippet}`).join('\n');
        if (tavilyData.answer) {
          const cleanAns = scrubSnippetText(tavilyData.answer);
          if (cleanAns) {
            searchSummary = `[RESPUESTA DIRECTA TAVILY]:\n${cleanAns}\n\n` + searchSummary;
          }
        }
        return { searchSummary, sources };
      }
    } catch (tavilyErr) {
      console.warn('[fetchGoogleSearchGrounding] Tavily pre-fetch error:', tavilyErr);
    }
  }

  let apiKey: string;
  try {
    apiKey = requireValidGeminiApiKey(customApiKey);
  } catch {
    return { searchSummary: '', sources: [] };
  }

  const isVertexKey = apiKey.startsWith('AQ.');
  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];
  let hit429 = false;
  const baseEndpoints = isVertexKey
    ? [
        (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
        (m: string) => `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
      ]
    : [
        (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
      ];

  for (const buildUrl of baseEndpoints) {
    for (const candidateModel of candidateModels) {
      try {
        const url = buildUrl(candidateModel);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Busca en internet información reciente, hechos concretos y fuentes sobre: ${cleanTopic || userPrompt}`,
                  },
                ],
              },
            ],
            tools: [{ googleSearch: {} }],
          }),
        });

        if (!res.ok) {
          if (res.status === 429) {
            hit429 = true;
          } else {
            const errText = await res.text().catch(() => '');
            if (errText.includes('429') || errText.includes('RESOURCE_EXHAUSTED')) {
              hit429 = true;
            }
          }
          continue;
        }

        const data = await res.json();
      const candidate = data.candidates?.[0];
      const searchSummary = candidate?.content?.parts?.map((p: any) => p.text || '').join('\n').trim() || '';
      const groundingMetadata = candidate?.groundingMetadata;

      const sources: Array<{ title: string; url: string; snippet: string }> = [];
      if (groundingMetadata?.groundingChunks) {
        for (const chunk of groundingMetadata.groundingChunks) {
          if (chunk.web) {
            sources.push({
              title: chunk.web.title || 'Fuente Web',
              url: chunk.web.uri || '',
              snippet: chunk.web.snippet || chunk.web.title || '',
            });
          }
        }
      }

      if (searchSummary || sources.length > 0) {
        return { searchSummary, sources };
      }
      } catch (err: any) {
        if (err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
          hit429 = true;
        }
        console.warn(`[Background Search Grounding] Candidate ${candidateModel} failed:`, err);
      }
    }
  }

  if (hit429) {
    return {
      searchSummary: '',
      sources: [],
      isRateLimited: true,
      error: HTTP_429_RATE_LIMIT_NOTICE,
    };
  }

  return { searchSummary: '', sources: [] };
}

/**
 * Dispatch an NVIDIA chat completion using the official direct endpoint and payload calibration.
 */
export async function callNvidiaChat(
  apiKey: string,
  model: string,
  promptOrMessages: string | Array<{ role: string; content: string }>,
  baseUrl?: string
): Promise<{ text: string; reasoning?: string }> {
  const cleanKey = cleanApiKey(apiKey);
  if (!cleanKey) {
    throw new Error('API Key de NVIDIA no proporcionada.');
  }

  const targetModel = model || 'moonshotai/kimi-k3';
  const formattedMessages =
    typeof promptOrMessages === 'string'
      ? [{ role: 'user', content: promptOrMessages }]
      : promptOrMessages;

  const isKimi = /kimi|moonshot/i.test(targetModel) || targetModel === 'moonshotai/kimi-k3';

  // 1. Official direct endpoint URL
  const targetUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
  console.log("Despachando a:", targetUrl);

  // 2. Official headers
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${cleanKey.trim()}`,
    "Accept": "text/event-stream",
  };

  // 3. Official payload body calibrated for moonshotai/kimi-k3
  const payload = isKimi
    ? {
        model: "moonshotai/kimi-k3",
        messages: formattedMessages,
        max_tokens: 16384,
        seed: 0,
        stream: true,
        temperature: 1,
        reasoning_effort: "max",
      }
    : {
        model: targetModel,
        messages: formattedMessages,
        max_tokens: targetModel.toLowerCase().includes('qwen-long') ? 2048 : 8192,
        seed: 0,
        stream: true,
        temperature: 0.6,
        top_p: 0.9,
      };

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (fetchErr: any) {
    // If browser direct call fails with network/CORS error, try server-side proxy /api/chat fallback
    try {
      const serverProxyRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'custom',
          customConfig: {
            apiKey: cleanKey,
            baseUrl: baseUrl || 'https://integrate.api.nvidia.com/v1',
            model: targetModel,
          },
          messages: formattedMessages,
          maxOutputTokens: 16384,
          temperature: isKimi ? 1 : 0.6,
        }),
      });

      if (serverProxyRes.ok && serverProxyRes.body) {
        const reader = serverProxyRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let text = '';
        let reasoning = '';
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
            const jsonStr = trimmed.replace(/^data:\s*/, '');
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.text) text += parsed.text;
              if (parsed.reasoning) reasoning += parsed.reasoning;
            } catch {}
          }
        }

        if (text.trim()) {
          return { text: text.trim(), reasoning: reasoning.trim() };
        }
      }
    } catch {}

    throw new Error(fetchErr?.message || String(fetchErr));
  }

  // 4. Return exact target URL and raw server detail on failed response
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`[HTTP ${response.status}] Falló al consultar: ${targetUrl} | Detalle del servidor: ${errorText || 'Sin respuesta del servidor'}`);
  }

  if (!response.body) {
    return { text: '', reasoning: '' };
  }

  // Parse SSE stream from NVIDIA
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let text = '';
  let reasoning = '';
  let buffer = '';

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
      if (jsonStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) text += delta.content;
        if (delta?.reasoning_content) reasoning += delta.reasoning_content;
      } catch {}
    }
  }

  return { text: text.trim(), reasoning: reasoning.trim() };
}

/**
 * Diagnostic test function for direct NVIDIA connection.
 */
export async function testNvidiaConnection(
  nvidiaApiKey: string,
  baseUrl?: string,
  model?: string
): Promise<{ success: boolean; message: string; response?: string }> {
  const cleanKey = cleanApiKey(nvidiaApiKey);
  if (!cleanKey) {
    return {
      success: false,
      message: 'Fallo: Clave de NVIDIA ausente.',
    };
  }

  try {
    const targetModel = model || 'moonshotai/kimi-k3';
    const res = await callNvidiaChat(
      cleanKey,
      targetModel,
      'Responde únicamente con la palabra "OK" para verificar conexión.',
      baseUrl
    );

    return {
      success: true,
      message: `¡Conexión exitosa con NVIDIA NIM (${targetModel})!`,
      response: res.text,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Fallo al conectar con NVIDIA NIM: ' + (err?.message || String(err)),
    };
  }
}

/**
 * Diagnostic test function for the Google Search -> NVIDIA NIM bridge.
 * Verifies that gemini-3.6-flash fetches grounded search data and feeds it into NVIDIA NIM via proxy.
 */
export async function testNvidiaGoogleSearchBridge(
  geminiApiKey: string,
  nvidiaApiKey?: string,
  nvidiaBaseUrl?: string,
  nvidiaModel?: string
): Promise<{
  success: boolean;
  message: string;
  sources?: Array<{ title: string; url: string; snippet: string }>;
  searchSummary?: string;
  nvidiaResponse?: string;
}> {
  const tavilyKey = getTavilyApiKey();
  const cleanGeminiKey = cleanApiKey(geminiApiKey);
  if (!tavilyKey && !cleanGeminiKey) {
    return {
      success: false,
      message: 'Fallo: Clave de API de Tavily o Google Gemini ausente para ejecutar la búsqueda de puente.',
    };
  }

  try {
    // 1) Search Grounding (Tavily or Gemini) -> retrieves real sources
    const grounding = await fetchGoogleSearchGrounding(
      'Noticias breves y destacadas de hoy en el mundo',
      cleanGeminiKey
    );

    if (!grounding.searchSummary && grounding.sources.length === 0) {
      if (grounding.isRateLimited || grounding.error?.includes('429') || grounding.error?.includes('RESOURCE_EXHAUSTED')) {
        return {
          success: false,
          message: HTTP_429_RATE_LIMIT_NOTICE,
        };
      }
      return {
        success: false,
        message: 'Fallo en Búsqueda Web: No se pudieron recuperar datos con la clave proporcionada.',
      };
    }

    const cleanNvidiaKey = cleanApiKey(nvidiaApiKey);
    if (!cleanNvidiaKey) {
      const providerName = grounding.searchSummary?.includes('TAVILY') ? 'Tavily Search' : 'Google Search';
      return {
        success: false,
        message: `${providerName} funcionó (${grounding.sources.length} fuentes obtenidas), pero falta la API Key de NVIDIA para completar la verificación del puente.`,
        sources: grounding.sources,
        searchSummary: grounding.searchSummary,
      };
    }

    const targetModel = nvidiaModel || 'moonshotai/kimi-k3';
    const isTavilySource = grounding.searchSummary?.includes('TAVILY');
    const headerTitle = isTavilySource
      ? '[INFORMACIÓN EN TIEMPO REAL VÍA TAVILY SEARCH]:'
      : '[INFORMACIÓN RECIENTE DE BÚSQUEDA WEB - FUENTE GOOGLE SEARCH]:';
    const promptPayload = `${headerTitle}\n${grounding.searchSummary || grounding.sources.map(s => s.title + ': ' + s.snippet).join('\n')}\n\nCONSULTA DEL USUARIO:\nResume en una sola frase breve estas noticias destacadas de hoy.`;

    // 2) Pass the enriched prompt into the internal 'callNvidiaChat(...)' service function
    try {
      const nvidiaResult = await callNvidiaChat(
        cleanNvidiaKey,
        targetModel,
        promptPayload,
        nvidiaBaseUrl
      );

      const engineName = isTavilySource ? 'Tavily' : 'Google';
      // 3) Display full success banner:
      return {
        success: true,
        message: `¡Puente 100% operativo! ${engineName} aportó ${grounding.sources.length} fuentes y el modelo de NVIDIA generó la respuesta.`,
        sources: grounding.sources,
        searchSummary: grounding.searchSummary,
        nvidiaResponse: nvidiaResult.text,
      };
    } catch (nvidiaErr: any) {
      return {
        success: false,
        message: `Fallo en NVIDIA NIM: La búsqueda web obtuvo ${grounding.sources.length} fuentes, pero ocurrió un error al contactar el modelo: ${nvidiaErr?.message || String(nvidiaErr)}`,
        sources: grounding.sources,
        searchSummary: grounding.searchSummary,
      };
    }
  } catch (err: any) {
    const errStr = err?.message || String(err);
    if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
      return {
        success: false,
        message: HTTP_429_RATE_LIMIT_NOTICE,
      };
    }
    return {
      success: false,
      message: 'Fallo en la prueba del puente: ' + errStr,
    };
  }
}

export const testGoogleSearchGroundingBridge = testNvidiaGoogleSearchBridge;

export interface ApiCallOptions {
  webSearch?: boolean;
  model?: string;
  provider?: 'gemini' | 'custom' | 'alibaba';
}

/**
 * Log and verify webSearch state propagation before stream dispatch
 */
export function logApiDispatch(options: ApiCallOptions): void {
  console.log("Despachando llamada con webSearch:", Boolean(options.webSearch));
}

/**
 * Diagnostic test function for Google Search Grounding connection.
 * Performs a direct REST call with search tools enabled to verify Google API key capabilities.
 */
export async function testGoogleSearchGrounding(
  apiKey: string
): Promise<{ success: boolean; message: string; sources?: any[] }> {
  const cleanKey = cleanApiKey(apiKey);
  if (!cleanKey) {
    return {
      success: false,
      message: "Fallo en la prueba: La clave de API de Gemini está vacía.",
    };
  }

  try {
    const isVertexKey = cleanKey.startsWith('AQ.');
    const candidateEndpoints = isVertexKey
      ? [
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(cleanKey)}`,
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(cleanKey)}`,
          `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(cleanKey)}`,
          `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(cleanKey)}`,
        ]
      : [
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(cleanKey)}`,
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(cleanKey)}`,
        ];

    let res: Response | null = null;
    let lastErrText = '';
    let lastStatus = 500;

    for (const url of candidateEndpoints) {
      const attempt = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: "¿Cuáles son las principales noticias de hoy?" }],
            },
          ],
          tools: [{ googleSearch: {} }],
        }),
      });
      if (attempt.ok) {
        res = attempt;
        break;
      }
      lastStatus = attempt.status;
      lastErrText = await attempt.text().catch(() => '');
      if (lastStatus === 429 || lastErrText.includes('429') || lastErrText.includes('RESOURCE_EXHAUSTED')) {
        return {
          success: false,
          message: HTTP_429_RATE_LIMIT_NOTICE,
        };
      }
    }

    if (!res || !res.ok) {
      let detailedMsg = `HTTP ${lastStatus}`;
      try {
        const parsed = JSON.parse(lastErrText);
        detailedMsg += `: ${parsed.error?.message || lastErrText}`;
      } catch {
        if (lastErrText) detailedMsg += `: ${lastErrText}`;
      }
      return {
        success: false,
        message: "Fallo en la prueba: " + detailedMsg,
      };
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingChunks = groundingMetadata?.groundingChunks || [];

    if (groundingMetadata) {
      return {
        success: true,
        message: "¡Búsqueda Web y API Key de Google funcionando correctamente!",
        sources: groundingChunks,
      };
    } else {
      return {
        success: true,
        message: "Conexión con Google Gemini exitosa (respuesta generada con Google Search).",
        sources: [],
      };
    }
  } catch (err: any) {
    const errStr = err?.message || String(err);
    if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
      return {
        success: false,
        message: HTTP_429_RATE_LIMIT_NOTICE,
      };
    }
    return {
      success: false,
      message: "Fallo en la prueba: " + errStr,
    };
  }
}
