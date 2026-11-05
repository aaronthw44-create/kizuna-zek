import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  BookOpen,
  FileText,
  Download,
  CheckCircle2,
  Type,
  Sparkles,
  FileDown,
} from 'lucide-react';
import { Chat, Folder } from '../types';
import {
  EditorialExportOptions,
  buildCleanedManuscript,
  exportEditorialMarkdown,
  exportEditorialDocx,
  exportEditorialEpub,
  exportEditorialPdf,
} from '../utils/editorialExporter';

interface EditorialExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat | null;
  folder: Folder | null;
  defaultAuthor?: string;
  onShowToast?: (msg: string) => void;
}

export const EditorialExportModal: React.FC<EditorialExportModalProps> = ({
  isOpen,
  onClose,
  chat,
  folder,
  defaultAuthor = 'Aaron',
  onShowToast,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState(defaultAuthor);
  const [subtitle, setSubtitle] = useState('');
  const [mode, setMode] = useState<'narrative_only' | 'full_dialogue'>('narrative_only');
  const [includeSceneNumbers, setIncludeSceneNumbers] = useState(true);
  const [typography, setTypography] = useState<'serif_classic' | 'modern_clean'>('serif_classic');
  const [isExporting, setIsExporting] = useState<'md' | 'docx' | 'epub' | 'pdf' | null>(null);

  useEffect(() => {
    if (isOpen && chat) {
      setTitle(chat.title || 'Manuscrito Editorial');
      setSubtitle(folder?.name || 'Jukkou no Zankyou');
      if (defaultAuthor) setAuthor(defaultAuthor);
    }
  }, [isOpen, chat?.id, folder?.name, defaultAuthor]);

  const exportOptions: EditorialExportOptions = useMemo(
    () => ({
      title: title.trim() || chat?.title || 'Manuscrito Editorial',
      author: author.trim() || 'Autor',
      subtitle: subtitle.trim(),
      mode,
      includeSceneNumbers,
      typography,
    }),
    [title, author, subtitle, mode, includeSceneNumbers, typography, chat?.title]
  );

  const manuscriptStats = useMemo(() => {
    if (!isOpen || !chat) {
      return {
        cleanedScenes: [],
        totalWords: 0,
        purgedThinkingCount: 0,
        purgedCommandsCount: 0,
      };
    }
    return buildCleanedManuscript(chat, exportOptions);
  }, [isOpen, chat, exportOptions]);

  if (!isOpen || !chat) return null;

  const handleExport = async (format: 'md' | 'docx' | 'epub' | 'pdf') => {
    if (manuscriptStats.cleanedScenes.length === 0) {
      onShowToast?.('No hay contenido en esta sesión para exportar');
      return;
    }
    setIsExporting(format);
    try {
      if (format === 'md') {
        exportEditorialMarkdown(chat, exportOptions, folder);
        onShowToast?.('Manuscrito exportado en Markdown Editorial (.md)');
      } else if (format === 'docx') {
        await exportEditorialDocx(chat, exportOptions, folder);
        onShowToast?.('Manuscrito exportado en Word Editorial (.docx)');
      } else if (format === 'epub') {
        await exportEditorialEpub(chat, exportOptions, folder);
        onShowToast?.('Libro electrónico encuadernado (.epub)');
      } else if (format === 'pdf') {
        exportEditorialPdf(chat, exportOptions, folder);
        onShowToast?.('Generando vista PDF Editorial lista para guardar');
      }
    } catch (err: any) {
      onShowToast?.(err?.message || 'Error durante la exportación editorial');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[140] flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-sm select-none">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.16 }}
          className="flex flex-col w-full max-w-3xl max-h-[92dvh] bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-[#22222a] rounded-2xl shadow-2xl text-zinc-900 dark:text-zinc-100 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-zinc-200 dark:border-[#1c1c24] bg-zinc-50 dark:bg-[#0d0d12] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
                <BookOpen size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white truncate">
                  Exportador Editorial Profesional (PDF / DOCX / EPUB / MD)
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  Purga automática de notas de pensamiento, comandos y metadatos para maquetación limpia
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              aria-label="Cerrar exportador editorial"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 smooth-scroll">
            {/* Sanitization Status Bar */}
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <span>
                  Limpieza Editorial Activa: <strong>{manuscriptStats.purgedThinkingCount}</strong> bloques de
                  pensamiento y <strong>{manuscriptStats.purgedCommandsCount}</strong> menús/metadatos eliminados.
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-zinc-900 dark:text-white px-2.5 py-1 rounded-lg bg-white/80 dark:bg-[#12121a] border border-zinc-200 dark:border-[#252532]">
                {manuscriptStats.cleanedScenes.length} escenas · {manuscriptStats.totalWords.toLocaleString()} palabras
              </span>
            </div>

            {/* Metadata Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mb-1">
                  Título del Manuscrito
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full min-h-[42px] bg-zinc-50 dark:bg-[#12121a] border border-zinc-300 dark:border-[#252532] rounded-xl px-3 py-2 text-[16px] md:text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-amber-500/60"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mb-1">
                  Subtítulo / Arco / Obra
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full min-h-[42px] bg-zinc-50 dark:bg-[#12121a] border border-zinc-300 dark:border-[#252532] rounded-xl px-3 py-2 text-[16px] md:text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-amber-500/60"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mb-1">
                  Autor
                </label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full min-h-[42px] bg-zinc-50 dark:bg-[#12121a] border border-zinc-300 dark:border-[#252532] rounded-xl px-3 py-2 text-[16px] md:text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-amber-500/60"
                />
              </div>
            </div>

            {/* Formatting Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#1f1f2a] space-y-2">
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-500" />
                  <span>Contenido a Maquetar</span>
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('narrative_only')}
                    className={`min-h-[42px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      mode === 'narrative_only'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                        : 'bg-white dark:bg-[#14141d] border-zinc-200 dark:border-[#252532] text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    Solo Narrativa Limpia
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('full_dialogue')}
                    className={`min-h-[42px] px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      mode === 'full_dialogue'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                        : 'bg-white dark:bg-[#14141d] border-zinc-200 dark:border-[#252532] text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    Sesión Completa
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#1f1f2a] space-y-2">
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Type size={13} className="text-amber-500" />
                  <span>Tipografía Editorial (DOCX / EPUB)</span>
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTypography('serif_classic')}
                    className={`min-h-[42px] px-2.5 py-1.5 rounded-xl text-xs font-serif font-semibold border transition-colors cursor-pointer ${
                      typography === 'serif_classic'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                        : 'bg-white dark:bg-[#14141d] border-zinc-200 dark:border-[#252532] text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    Clásica (Georgia / Serif)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypography('modern_clean')}
                    className={`min-h-[42px] px-2.5 py-1.5 rounded-xl text-xs font-sans font-semibold border transition-colors cursor-pointer ${
                      typography === 'modern_clean'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                        : 'bg-white dark:bg-[#14141d] border-zinc-200 dark:border-[#252532] text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    Moderna (Sans-Serif)
                  </button>
                </div>
              </div>
            </div>

            {/* Editorial Live Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Vista Previa de Maquetación (Sin notas de pensamiento)
                </span>
                <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSceneNumbers}
                    onChange={(e) => setIncludeSceneNumbers(e.target.checked)}
                    className="accent-amber-500 cursor-pointer"
                  />
                  <span>Numerar escenas</span>
                </label>
              </div>

              <div
                className={`p-5 rounded-2xl bg-zinc-50 dark:bg-[#0c0c12] border border-zinc-200 dark:border-[#20202c] max-h-56 overflow-y-auto space-y-4 smooth-scroll ${
                  typography === 'serif_classic' ? 'font-serif' : 'font-sans'
                }`}
              >
                <div className="text-center border-b border-zinc-200 dark:border-[#1e1e28] pb-3">
                  <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
                    {exportOptions.title}
                  </h3>
                  {exportOptions.subtitle && (
                    <p className="text-xs italic text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {exportOptions.subtitle} — {exportOptions.author}
                    </p>
                  )}
                </div>

                {manuscriptStats.cleanedScenes.length === 0 ? (
                  <p className="text-xs text-center text-zinc-500 py-6 font-sans">
                    No hay escenas para mostrar con el filtro actual.
                  </p>
                ) : (
                  manuscriptStats.cleanedScenes.slice(0, 4).map((scene, idx) => (
                    <div key={idx} className="space-y-2 text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
                      {scene.heading && (
                        <h4 className="text-center font-bold text-xs uppercase tracking-widest text-amber-600 dark:text-amber-400 pt-1">
                          {scene.heading}
                        </h4>
                      )}
                      {scene.paragraphs.slice(0, 3).map((p, pIdx) => (
                        <p key={pIdx} className="indent-5 text-justify">
                          {p}
                        </p>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer with 3 Export Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 sm:px-5 py-3.5 border-t border-zinc-200 dark:border-[#1c1c24] bg-zinc-50 dark:bg-[#0d0d12] shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-zinc-300 dark:border-[#272732] bg-white dark:bg-[#14141c] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Cerrar
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={Boolean(isExporting)}
                onClick={() => handleExport('md')}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-zinc-200 dark:bg-[#181822] hover:bg-zinc-300 dark:hover:bg-[#222230] border border-zinc-300 dark:border-[#2c2c3c] text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download size={14} className="text-amber-500" />
                <span>Markdown (.md)</span>
              </button>

              <button
                type="button"
                disabled={Boolean(isExporting)}
                onClick={() => handleExport('pdf')}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/40 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText size={14} className="text-rose-400" />
                <span>Convertir chat a PDF (.pdf)</span>
              </button>

              <button
                type="button"
                disabled={Boolean(isExporting)}
                onClick={() => handleExport('docx')}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/40 text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText size={14} className="text-blue-400" />
                <span>{isExporting === 'docx' ? 'Generando Word...' : 'Word Editorial (.docx)'}</span>
              </button>

              <button
                type="button"
                disabled={Boolean(isExporting)}
                onClick={() => handleExport('epub')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-xs font-bold text-black flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <FileDown size={14} />
                <span>{isExporting === 'epub' ? 'Encuadernando...' : 'Libro EPUB (.epub)'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
