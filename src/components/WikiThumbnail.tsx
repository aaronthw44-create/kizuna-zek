import React, { useState, useEffect } from 'react';

export interface WikiSummaryResponse {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  originalimage?: {
    source: string;
    width: number;
    height: number;
  };
  content_urls?: {
    desktop?: {
      page: string;
    };
  };
}

export interface WikiThumbnailProps {
  /** Término histórico, concepto o entidad a consultar en Wikipedia */
  term: string;
  /** Clase adicional opcional para personalizar tamaño o márgenes */
  className?: string;
  /** Callback opcional al hacer clic en la miniatura */
  onClick?: (imageUrl: string, title: string) => void;
}

// Caché híbrida (Memoria + sessionStorage) para evitar consultas repetidas en la misma sesión
const memoryThumbnailCache = new Map<string, string | null>();
const inflightThumbnailRequests = new Map<string, Promise<string | null>>();
const SESSION_STORAGE_PREFIX = 'kizuna_wiki_thumb_v2:';

function normalizeTermKey(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, '_');
}

function getCachedThumbnail(key: string): { hit: boolean; url: string | null } {
  if (memoryThumbnailCache.has(key)) {
    return { hit: true, url: memoryThumbnailCache.get(key) ?? null };
  }
  try {
    const stored = sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${key}`);
    if (stored !== null) {
      const parsed: string | null = JSON.parse(stored);
      memoryThumbnailCache.set(key, parsed);
      return { hit: true, url: parsed };
    }
  } catch {
    // Ignorar errores de acceso a sessionStorage (modo incógnito estricto / cuota)
  }
  return { hit: false, url: null };
}

function setCachedThumbnail(key: string, url: string | null): void {
  memoryThumbnailCache.set(key, url);
  if (!url) return;
  try {
    sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${key}`, JSON.stringify(url));
  } catch {
    // Ignorar errores de cuota de almacenamiento
  }
}

async function fetchWikipediaThumbnailUrl(term: string): Promise<string | null> {
  const cleanTerm = term.trim();
  if (!cleanTerm) return null;

  const cacheKey = normalizeTermKey(cleanTerm);
  const cached = getCachedThumbnail(cacheKey);
  if (cached.hit) {
    return cached.url;
  }

  if (inflightThumbnailRequests.has(cacheKey)) {
    return inflightThumbnailRequests.get(cacheKey)!;
  }

  const requestPromise = (async (): Promise<string | null> => {
    try {
      const encodedTerm = encodeURIComponent(cleanTerm.replace(/\s+/g, '_'));
      const endpoint = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodedTerm}`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        setCachedThumbnail(cacheKey, null);
        return null;
      }

      const data: WikiSummaryResponse = await response.json();
      const thumbnailUrl = data?.thumbnail?.source ?? null;

      setCachedThumbnail(cacheKey, thumbnailUrl);
      return thumbnailUrl;
    } catch {
      // Fallo silencioso ante errores de red o CORS
      setCachedThumbnail(cacheKey, null);
      return null;
    } finally {
      inflightThumbnailRequests.delete(cacheKey);
    }
  })();

  inflightThumbnailRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Componente reutilizable que muestra la miniatura cuadrada de Wikipedia para un término dado.
 * Si el artículo no existe o no posee imagen, falla de forma silenciosa (retorna null).
 */
export const WikiThumbnail: React.FC<WikiThumbnailProps> = ({
  term,
  className = '',
  onClick,
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setHasError(false);

    if (!term || !term.trim()) {
      setThumbnailUrl(null);
      return () => {
        isMounted = false;
      };
    }

    fetchWikipediaThumbnailUrl(term).then((url) => {
      if (isMounted) {
        setThumbnailUrl(url);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [term]);

  // Fallo silencioso si no hay imagen disponible o si la carga de la imagen falla
  if (!thumbnailUrl || hasError) {
    return null;
  }

  return (
    <div
      onClick={() => onClick?.(thumbnailUrl, term)}
      className={`w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-md ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`.trim()}
    >
      <img
        src={thumbnailUrl}
        alt={term}
        loading="lazy"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover grayscale-[20%] hover:grayscale-0 hover:scale-105 transition-all duration-300 ease-out"
      />
    </div>
  );
};

export interface WikiEventBlockProps {
  /** Término exacto a buscar en Wikipedia (ej. "Noche de los Bastones Largos") */
  term: string;
  /** Título visible del bloque (ej. "1. La Noche de los Bastones Largos (1966)") */
  title: string;
  /** Texto descriptivo o párrafo explicativo */
  children: React.ReactNode;
  /** Etiqueta opcional de fuente (ej. "Wikipedia") */
  sourceLabel?: string;
  /** URL opcional de la fuente */
  sourceUrl?: string;
}

/**
 * Maqueta de bloque de contenido horizontal estilo ChatGPT / Wikipedia en Dark Mode.
 * Agrupa la miniatura a la izquierda y el título + descripción a la derecha.
 */
export const WikiEventBlock: React.FC<WikiEventBlockProps> = ({
  term,
  title,
  children,
  sourceLabel = 'Wikipedia',
  sourceUrl,
}) => {
  const resolvedSourceUrl =
    sourceUrl || `https://es.wikipedia.org/wiki/${encodeURIComponent(term.trim().replace(/\s+/g, '_'))}`;

  return (
    <article className="my-4 p-3.5 sm:p-4 rounded-2xl bg-neutral-950/90 border border-neutral-800/90 shadow-sm max-w-full overflow-hidden">
      <div className="flex flex-row items-start gap-4">
        {/* Miniatura cuadrada a la izquierda (se oculta sola si no hay imagen) */}
        <WikiThumbnail term={term} />

        {/* Bloque de título en negrita arriba y texto descriptivo abajo */}
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <h3 className="text-base sm:text-lg font-bold text-neutral-100 leading-snug tracking-tight break-words m-0">
            {title}
          </h3>

          <div className="text-sm text-neutral-300 leading-relaxed break-words">
            {children}
            {sourceLabel && (
              <a
                href={resolvedSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 ml-2 align-middle rounded-full bg-neutral-800/90 hover:bg-neutral-700 text-[11px] font-medium text-neutral-200 border border-neutral-700 transition-colors no-underline"
              >
                <span>{sourceLabel}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default WikiThumbnail;
