import React, { useState, useEffect } from 'react';
import { ExternalLink, Eye } from 'lucide-react';
import {
  WikiVisualMatch,
  fetchWikipediaVisualForHeading,
  extractCandidateQueryFromHeading,
  getCleanDomainBadgeLabel,
} from '../utils/wikipediaEnricher';
import { Attachment } from '../types';

interface WikiSectionHeadingProps {
  level: 'h1' | 'h2' | 'h3' | 'h4';
  children: React.ReactNode;
  isUser?: boolean;
  isStreaming?: boolean;
  onOpenImageLightbox?: (attachment: Attachment) => void;
}

function extractPlainText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractPlainText).join('');
  if (React.isValidElement(node)) {
    return extractPlainText((node.props as any)?.children);
  }
  return '';
}

export const WikiSectionHeading: React.FC<WikiSectionHeadingProps> = ({
  level,
  children,
  isUser = false,
  isStreaming = false,
  onOpenImageLightbox,
}) => {
  const [wikiMatch, setWikiMatch] = useState<WikiVisualMatch | null>(null);
  const [imgError, setImgError] = useState(false);

  const rawText = extractPlainText(children).trim();
  const candidateQuery = !isUser ? extractCandidateQueryFromHeading(rawText) : null;

  useEffect(() => {
    let isMounted = true;
    setImgError(false);

    if (isUser || !candidateQuery || isStreaming) {
      if (!candidateQuery) setWikiMatch(null);
      return () => {
        isMounted = false;
      };
    }

    fetchWikipediaVisualForHeading(rawText).then((res) => {
      if (isMounted) {
        setWikiMatch(res);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [rawText, candidateQuery, isUser, isStreaming]);

  const Tag = level;
  const headingClassName =
    level === 'h1'
      ? 'text-2xl font-bold text-zinc-900 dark:text-white tracking-tight break-words'
      : level === 'h2'
        ? 'text-xl font-bold text-zinc-900 dark:text-white tracking-tight break-words'
        : level === 'h3'
          ? 'text-lg font-semibold text-zinc-900 dark:text-white break-words'
          : 'text-base sm:text-lg font-semibold text-zinc-800 dark:text-[#f4f4f5] break-words';

  // Standard fallback heading when there is no verified Wikipedia visual match
  if (!wikiMatch || imgError || !wikiMatch.thumbnailUrl) {
    const spacingClass =
      level === 'h1'
        ? 'mt-4 mb-2 border-b border-zinc-200 dark:border-[#262626] pb-1'
        : level === 'h2'
          ? 'mt-3.5 mb-1.5'
          : level === 'h3'
            ? 'mt-3 mb-1'
            : 'mt-2.5 mb-1';
    return (
      <Tag className={`${headingClassName} ${spacingClass}`}>
        {children}
      </Tag>
    );
  }

  const badgeInfo = getCleanDomainBadgeLabel(wikiMatch.pageUrl, 'Wikipedia');

  return (
    <div className="my-3.5 p-2.5 sm:p-3.5 rounded-2xl bg-zinc-100/70 dark:bg-neutral-950/90 border border-zinc-200/80 dark:border-neutral-800/90 flex flex-row items-start gap-4 max-w-full shadow-xs transition-all">
      {/* Left Thumbnail (ChatGPT Rich Encyclopedic Card Style) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onOpenImageLightbox) {
            onOpenImageLightbox({
              id: `wiki-${wikiMatch.title}`,
              name: `${wikiMatch.title}${wikiMatch.description ? ` — ${wikiMatch.description}` : ''}`,
              type: 'image/jpeg',
              fileType: 'image',
              dataUrl: wikiMatch.originalImageUrl || wikiMatch.thumbnailUrl,
              size: 0,
            });
          }
        }}
        className="group/wikithumb relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-md shrink-0 cursor-pointer focus:outline-none select-none"
        title={`Ver imagen de ${wikiMatch.title}`}
      >
        <img
          src={wikiMatch.thumbnailUrl}
          alt={wikiMatch.title}
          loading="lazy"
          draggable={false}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover grayscale-[20%] group-hover/wikithumb:grayscale-0 group-hover/wikithumb:scale-105 transition-all duration-300 ease-out select-none pointer-events-none"
        />
        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/wikithumb:opacity-100 flex items-center justify-center transition-opacity select-none">
          <Eye size={14} className="text-white drop-shadow" />
        </div>
      </button>

      {/* Right Heading + Context Metadata + Inline Source Pill */}
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Tag className={`${headingClassName} m-0 leading-snug`}>{children}</Tag>

          {/* ChatGPT-style Inline Source Pill */}
          <a
            href={wikiMatch.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-200/90 dark:bg-zinc-800/90 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-[11px] font-sans font-medium text-zinc-700 dark:text-zinc-200 border border-zinc-300/80 dark:border-zinc-700 transition-colors shrink-0 no-underline select-none"
            title={`Fuente verificada: ${wikiMatch.title} (${badgeInfo.hostname})`}
          >
            <img
              src={badgeInfo.faviconUrl}
              alt=""
              draggable={false}
              className="w-3.5 h-3.5 rounded-full shrink-0 select-none pointer-events-none"
              loading="lazy"
            />
            <span className="truncate max-w-[110px]">{badgeInfo.label}</span>
          </a>
        </div>

        {wikiMatch.description && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1 font-normal m-0 select-none">
            {wikiMatch.description}
          </p>
        )}
      </div>
    </div>
  );
};

interface InlineSourcePillProps {
  url: string;
  title?: string;
  snippet?: string;
  citationIndex?: number;
  extraCount?: number;
}

export const InlineSourcePill: React.FC<InlineSourcePillProps> = ({
  url,
  title,
  snippet,
  citationIndex,
  extraCount = 0,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const badge = getCleanDomainBadgeLabel(url, title);

  return (
    <span
      className="relative inline-flex items-center align-middle mx-0.5 select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-200/90 dark:bg-[#191920] hover:bg-zinc-300 dark:hover:bg-[#252530] text-[11px] font-sans font-medium text-zinc-800 dark:text-zinc-200 border border-zinc-300/80 dark:border-white/[0.1] hover:border-amber-500/40 dark:hover:border-amber-400/40 transition-all no-underline shadow-2xs"
        title={title ? `${title} (${badge.hostname})` : badge.hostname}
      >
        {citationIndex !== undefined && (
          <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-500/15 px-1 rounded-sm">
            {citationIndex}
          </span>
        )}
        <img
          src={badge.faviconUrl}
          alt=""
          className="w-3.5 h-3.5 rounded-full shrink-0"
          loading="lazy"
        />
        <span className="truncate max-w-[115px]">{badge.label}</span>
        {extraCount > 0 && (
          <span className="text-[10px] font-mono font-semibold text-zinc-500 dark:text-zinc-400">
            +{extraCount}
          </span>
        )}
      </a>

      {/* Interactive Citation Preview Card (Perplexity / Kimi Style) */}
      {isHovered && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="hidden sm:block absolute bottom-full left-0 mb-2 w-72 p-3 rounded-2xl bg-white/98 dark:bg-[#111117]/98 border border-zinc-200 dark:border-white/15 shadow-[0_18px_45px_rgba(0,0,0,0.65)] backdrop-blur-xl z-50 text-left pointer-events-none animate-noir-enter"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <img
              src={badge.faviconUrl}
              alt=""
              className="w-4 h-4 rounded-full shrink-0"
            />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 truncate">
              {badge.hostname}
            </span>
            {citationIndex !== undefined && (
              <span className="ml-auto text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/25">
                [{citationIndex}]
              </span>
            )}
          </div>
          <div className="text-xs font-semibold text-zinc-900 dark:text-white line-clamp-2 leading-snug">
            {title || badge.label}
          </div>
          {snippet && (
            <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed font-normal">
              {snippet}
            </p>
          )}
        </div>
      )}
    </span>
  );
};

interface WebSearchPillsRowProps {
  sources: Array<{ title: string; url: string; snippet?: string }>;
  onToggleExpand?: () => void;
}

export const WebSearchPillsRow: React.FC<WebSearchPillsRowProps> = ({ sources, onToggleExpand }) => {
  if (!sources || sources.length === 0) return null;

  // Group sources by domain so we can show numbered interactive pills with snippet preview
  const grouped = new Map<
    string,
    { primaryUrl: string; primaryTitle: string; primarySnippet?: string; count: number; firstIndex: number }
  >();

  sources.forEach((src, idx) => {
    if (!src?.url) return;
    const badge = getCleanDomainBadgeLabel(src.url, src.title);
    const existing = grouped.get(badge.label);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(badge.label, {
        primaryUrl: src.url,
        primaryTitle: src.title || badge.hostname,
        primarySnippet: src.snippet,
        count: 1,
        firstIndex: idx + 1,
      });
    }
  });

  const entries = Array.from(grouped.entries()).slice(0, 5);

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 pb-0.5 select-none">
      {entries.map(([label, info]) => (
        <InlineSourcePill
          key={label}
          url={info.primaryUrl}
          title={info.primaryTitle}
          snippet={info.primarySnippet}
          citationIndex={info.firstIndex}
          extraCount={info.count > 1 ? info.count - 1 : 0}
        />
      ))}
      {onToggleExpand && sources.length > 0 && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-[#14141a] hover:bg-zinc-200 dark:hover:bg-[#1e1e26] text-[11px] font-mono text-zinc-600 dark:text-zinc-300 border border-zinc-300/70 dark:border-white/[0.08] cursor-pointer transition-colors"
        >
          <span>Fuentes ({sources.length})</span>
          <ExternalLink size={10} />
        </button>
      )}
    </div>
  );
};
