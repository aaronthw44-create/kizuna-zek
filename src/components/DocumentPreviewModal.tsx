import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileText,
  Copy,
  Check,
  Download,
  Search,
  Eye,
  Type,
  BookOpen,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';

export interface DocumentPreviewItem {
  id?: string;
  title: string;
  content?: string;
  fileType?: string;
  mimeType?: string;
  size?: number | string;
  dataUrl?: string;
  wordCount?: number;
  estimatedTokens?: number;
  sourceLabel?: string; // e.g. 'Google Drive' | 'Bóveda de Lore' | 'Adjunto de Chat'
}

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentPreviewItem | null;
  onAttachToContext?: (doc: DocumentPreviewItem) => void;
  onShowToast?: (msg: string) => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  onAttachToContext,
  onShowToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');

  if (!isOpen || !document) return null;

  const rawText = document.content || '';
  const isImage =
    document.fileType === 'image' ||
    document.mimeType?.startsWith('image/') ||
    Boolean(document.dataUrl && (document.dataUrl.startsWith('data:image') || document.dataUrl.startsWith('http')));

  const words = document.wordCount ?? (rawText ? rawText.trim().split(/\s+/).filter(Boolean).length : 0);
  const tokens = document.estimatedTokens ?? Math.round(words * 1.3);

  const handleCopyText = async () => {
    if (!rawText) return;
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      onShowToast?.('✓ Texto del documento copiado al portapapeles');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      onShowToast?.('⚠️ No se pudo copiar el texto');
    }
  };

  const handleDownloadMd = () => {
    if (!rawText) return;
    try {
      const fileName = `${document.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.md`;
      const blob = new Blob([rawText], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = fileName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowToast?.(`💾 Descargado como "${fileName}"`);
    } catch {
      onShowToast?.('⚠️ Error al descargar el archivo');
    }
  };

  // Filter or highlight text
  const textLines = rawText.split('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-xs modal-backdrop-fluid">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="flex flex-col w-full max-w-4xl h-[90dvh] sm:h-[86vh] bg-[#09090c] border border-[#222228] rounded-2xl shadow-2xl text-white overflow-hidden modal-sheet-fluid"
      >
        {/* Header Row */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#18181c] bg-[#070709] shrink-0 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-amber-400 shrink-0">
              {isImage ? <ImageIcon size={17} /> : <BookOpen size={17} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-white truncate max-w-[260px] sm:max-w-[400px]" title={document.title}>
                  {document.title}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 shrink-0">
                  {document.fileType ? `.${document.fileType}` : isImage ? 'Imagen' : 'Documento'}
                </span>
                {document.sourceLabel && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                    {document.sourceLabel}
                  </span>
                )}
              </div>
              {!isImage && (
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  ~{words.toLocaleString('es-ES')} palabras | ~{tokens.toLocaleString('es-ES')} tokens
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onAttachToContext && (
              <button
                type="button"
                onClick={() => {
                  onAttachToContext(document);
                  onClose();
                }}
                className="px-3 py-1.5 bg-white text-black hover:bg-zinc-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
              >
                <Sparkles size={13} />
                <span className="hidden sm:inline">Adjuntar al Chat</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#18181c] rounded-lg transition-colors cursor-pointer shrink-0"
              aria-label="Cerrar vista previa"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Reading Controls Toolbar (Text docs) */}
        {!isImage && rawText && (
          <div className="px-4 sm:px-5 py-2 border-b border-[#18181c] bg-[#0c0c0f] flex flex-wrap items-center justify-between gap-2.5 shrink-0 text-xs">
            {/* Search filter in doc */}
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar en el documento..."
                className="w-full pl-8 pr-3 py-1 bg-[#141419] border border-[#222228] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 min-h-[32px]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Font Size Toggle */}
              <div className="flex items-center bg-[#141419] border border-[#222228] p-0.5 rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setFontSize('sm')}
                  className={`px-2 py-0.5 rounded font-mono ${fontSize === 'sm' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
                  title="Texto pequeño"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize('base')}
                  className={`px-2 py-0.5 rounded font-mono ${fontSize === 'base' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
                  title="Texto mediano"
                >
                  A
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize('lg')}
                  className={`px-2 py-0.5 rounded font-mono ${fontSize === 'lg' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
                  title="Texto grande"
                >
                  A+
                </button>
              </div>

              {/* Action Buttons */}
              <button
                type="button"
                onClick={handleCopyText}
                className="px-2.5 py-1 bg-[#16161d] hover:bg-[#202028] border border-zinc-800 text-zinc-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer min-h-[32px]"
                title="Copiar texto completo"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadMd}
                className="px-2.5 py-1 bg-[#16161d] hover:bg-[#202028] border border-zinc-800 text-zinc-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer min-h-[32px]"
                title="Descargar como archivo .md"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Descargar .md</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Viewer Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 smooth-scroll bg-[#08080a]">
          {isImage ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
              {document.dataUrl ? (
                <img
                  src={document.dataUrl}
                  alt={document.title}
                  className="max-h-[68vh] w-auto max-w-full object-contain rounded-lg border border-[#222228] shadow-xl"
                />
              ) : (
                <div className="text-zinc-500 text-xs">Imagen no disponible</div>
              )}
            </div>
          ) : rawText ? (
            <div
              className={`prose prose-invert max-w-none font-sans text-zinc-200 leading-relaxed space-y-2 select-text ${
                fontSize === 'sm' ? 'text-xs' : fontSize === 'lg' ? 'text-base' : 'text-sm'
              }`}
            >
              {textLines.map((line, idx) => {
                if (searchTerm.trim() && line.toLowerCase().includes(searchTerm.toLowerCase())) {
                  return (
                    <p key={idx} className="bg-amber-500/15 border-l-2 border-amber-400 pl-2 py-0.5 rounded-r">
                      {line}
                    </p>
                  );
                }
                if (line.startsWith('# ')) return <h1 key={idx} className="text-lg font-bold text-white pt-2 border-b border-zinc-800 pb-1">{line.slice(2)}</h1>;
                if (line.startsWith('## ')) return <h2 key={idx} className="text-base font-bold text-white pt-2">{line.slice(3)}</h2>;
                if (line.startsWith('### ')) return <h3 key={idx} className="text-sm font-bold text-zinc-100 pt-1">{line.slice(4)}</h3>;
                if (line.startsWith('---')) return <hr key={idx} className="border-zinc-800 my-3" />;
                if (!line.trim()) return <div key={idx} className="h-2" />;

                return <p key={idx}>{line}</p>;
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center text-zinc-500">
              <FileText size={32} className="mb-2 opacity-50" />
              <p className="text-xs">Este documento no contiene texto legible para vista previa.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
