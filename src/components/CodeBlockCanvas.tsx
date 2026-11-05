import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Copy,
  Check,
  Download,
  Maximize2,
  Code,
  Terminal,
  FileCode,
  Globe,
  FileText,
  Play,
  Eye,
  X,
  Type,
  BookOpen,
} from 'lucide-react';

interface CodeBlockCanvasProps {
  language: string;
  codeString: string;
  onShowToast?: (msg: string) => void;
}

export const CodeBlockCanvas: React.FC<CodeBlockCanvasProps> = ({
  language,
  codeString,
  onShowToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [wrapLines, setWrapLines] = useState<boolean>(true);
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(false);

  const cleanLang = (language || 'texto').toLowerCase().trim();
  const isHtml = cleanLang === 'html' || cleanLang === 'svg' || cleanLang === 'xml';
  const isDraft = cleanLang === 'markdown' || cleanLang === 'md' || cleanLang === 'text' || cleanLang === 'borrador' || cleanLang === 'manuscrito';

  const getLangExtension = (lang: string) => {
    switch (lang) {
      case 'typescript':
      case 'ts':
        return 'ts';
      case 'tsx':
        return 'tsx';
      case 'javascript':
      case 'js':
      case 'jsx':
        return 'js';
      case 'python':
      case 'py':
        return 'py';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'sql':
        return 'sql';
      case 'bash':
      case 'sh':
      case 'shell':
        return 'sh';
      case 'cpp':
      case 'c++':
        return 'cpp';
      case 'c':
        return 'c';
      case 'markdown':
      case 'md':
        return 'md';
      default:
        return 'txt';
    }
  };

  const getLangIcon = (lang: string) => {
    if (lang === 'html' || lang === 'svg') return <Globe size={13} className="text-cyan-400" />;
    if (lang === 'python' || lang === 'py') return <FileCode size={13} className="text-yellow-400" />;
    if (lang === 'typescript' || lang === 'ts' || lang === 'tsx') return <Code size={13} className="text-blue-400" />;
    if (lang === 'javascript' || lang === 'js') return <Code size={13} className="text-amber-300" />;
    if (lang === 'bash' || lang === 'sh' || lang === 'terminal') return <Terminal size={13} className="text-emerald-400" />;
    if (isDraft) return <FileText size={13} className="text-amber-400" />;
    return <FileCode size={13} className="text-zinc-400" />;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopied(true);
      if (onShowToast) onShowToast('Copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (onShowToast) onShowToast('Error al copiar');
    }
  };

  const handleDownload = () => {
    try {
      const ext = getLangExtension(cleanLang);
      const filename = `kizuna_code_${Date.now()}.${ext}`;
      const blob = new Blob([codeString], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (onShowToast) onShowToast(`Archivo descargado: ${filename}`);
    } catch {
      if (onShowToast) onShowToast('Error al descargar archivo');
    }
  };

  const lines = codeString.split('\n');
  const lineCount = lines.length;
  const wordCount = codeString.trim().split(/\s+/).filter(Boolean).length;

  return (
    <>
      {/* Primary Embedded Studio Card Container */}
      <div className="my-3.5 rounded-xl border border-zinc-200 dark:border-[#22222a] bg-zinc-50 dark:bg-[#08080b] text-zinc-900 dark:text-white shadow-sm dark:shadow-[0_10px_30px_rgba(0,0,0,0.45)] group/card transition-all hover:border-zinc-300 dark:hover:border-[#32323f]">
        {/* Sticky Studio Header Bar (OpenWebUI / ChatGPT Style) */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-3.5 py-2 bg-zinc-100/95 dark:bg-[#0e0e13]/95 backdrop-blur-md border-b border-zinc-200 dark:border-[#1c1c24] rounded-t-xl text-xs font-mono text-zinc-700 dark:text-zinc-300 select-none">
          <div className="flex items-center gap-2 min-w-0">
            {getLangIcon(cleanLang)}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 tracking-wide uppercase text-[11px]">
              {cleanLang || 'código'}
            </span>
            <span className="text-zinc-500 dark:text-zinc-500 font-mono text-[10px] truncate">
              {lineCount} {lineCount === 1 ? 'línea' : 'líneas'} · {wordCount} pal.
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* HTML Live Preview Tab Switcher */}
            {isHtml && (
              <div className="flex items-center p-0.5 rounded-lg bg-zinc-200/70 dark:bg-[#14141a] border border-zinc-300 dark:border-[#22222c] mr-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('code')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors cursor-pointer ${
                    activeTab === 'code'
                      ? 'bg-white dark:bg-[#22222c] text-zinc-900 dark:text-white font-semibold shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  Código
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors cursor-pointer flex items-center gap-1 ${
                    activeTab === 'preview'
                      ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-semibold border border-cyan-500/30'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Play size={10} className="text-cyan-600 dark:text-cyan-400 fill-cyan-600 dark:fill-cyan-400" />
                  <span>Probar</span>
                </button>
              </div>
            )}

            {/* Line Wrap Toggle (Ajustar líneas) */}
            {activeTab === 'code' && (
              <button
                type="button"
                onClick={() => setWrapLines((v) => !v)}
                className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-colors cursor-pointer flex items-center gap-1 border ${
                  wrapLines
                    ? 'bg-zinc-200/90 dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-200 border-zinc-300/80 dark:border-white/15'
                    : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-transparent hover:bg-zinc-200/60 dark:hover:bg-white/5'
                }`}
                title={wrapLines ? 'Ajuste de línea activo (click para desplazamiento horizontal)' : 'Activar ajuste automático de líneas'}
              >
                <Type size={11} />
                <span className="hidden md:inline">{wrapLines ? 'Ajuste' : 'Scroll'}</span>
              </button>
            )}

            {/* Line Numbers Toggle */}
            {activeTab === 'code' && lineCount > 3 && (
              <button
                type="button"
                onClick={() => setShowLineNumbers((v) => !v)}
                className={`hidden sm:inline-flex px-1.5 py-1 rounded-lg text-[10px] font-mono transition-colors cursor-pointer border ${
                  showLineNumbers
                    ? 'bg-zinc-200/90 dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-200 border-zinc-300/80 dark:border-white/15'
                    : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-transparent hover:bg-zinc-200/60 dark:hover:bg-white/5'
                }`}
                title="Mostrar / ocultar numeración de líneas"
              >
                #
              </button>
            )}

            {/* Quick Actions */}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 hover:bg-zinc-200/80 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white rounded-lg text-zinc-600 dark:text-zinc-400 text-xs font-mono transition-colors cursor-pointer flex items-center gap-1"
              title="Copiar contenido"
            >
              {copied ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} />}
              <span className="hidden sm:inline text-[11px]">{copied ? 'Copiado' : 'Copiar'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="p-1.5 hover:bg-zinc-200/80 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer"
              title="Descargar archivo"
            >
              <Download size={13} />
            </button>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 hover:bg-amber-500/15 dark:hover:bg-amber-500/20 text-zinc-600 dark:text-zinc-400 hover:text-amber-700 dark:hover:text-amber-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              title="Abrir en Canvas a pantalla completa"
            >
              <Maximize2 size={13} />
              <span className="hidden sm:inline text-[11px]">Canvas</span>
            </button>
          </div>
        </div>

        {/* Code Content or HTML Render Preview */}
        {activeTab === 'preview' && isHtml ? (
          <div className="w-full h-72 bg-white rounded-b-xl overflow-hidden relative">
            <iframe
              srcDoc={codeString}
              title="Kizuna Live Code Preview"
              className="w-full h-full border-none"
              sandbox="allow-scripts"
            />
          </div>
        ) : (
          <div className="relative overflow-x-auto p-3.5 text-xs font-mono text-zinc-800 dark:text-zinc-100 leading-relaxed bg-zinc-50 dark:bg-[#060608] rounded-b-xl smooth-scroll max-h-[420px]">
            {showLineNumbers ? (
              <div className="flex gap-3 font-mono text-[13px] leading-relaxed">
                <div className="select-none text-right pr-2 border-r border-zinc-200 dark:border-zinc-800/80 text-zinc-400 dark:text-zinc-600 text-[11px] shrink-0">
                  {lines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <pre className={`flex-1 font-mono text-[13px] leading-relaxed !m-0 !p-0 !border-none !bg-transparent ${wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
                  <code>{codeString}</code>
                </pre>
              </div>
            ) : (
              <pre className={`font-mono text-[13px] leading-relaxed !m-0 !p-0 !border-none !bg-transparent ${wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
                <code>{codeString}</code>
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen Canvas Studio Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-xs modal-backdrop-fluid">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-full max-w-5xl h-[88vh] bg-[#09090c] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[#181822] bg-[#060608] shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                    {getLangIcon(cleanLang)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                      <span>Canvas Studio ({cleanLang.toUpperCase()})</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/10">
                        {lineCount} líneas · {wordCount} palabras
                      </span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 truncate">
                      Espacio dedicado de edición, lectura y descarga de código / borrador
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Font Size controls */}
                  <div className="hidden sm:flex items-center bg-[#121218] border border-[#22222e] rounded-lg p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setFontSize('sm')}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        fontSize === 'sm' ? 'bg-white/10 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      A-
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontSize('base')}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        fontSize === 'base' ? 'bg-white/10 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontSize('lg')}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        fontSize === 'lg' ? 'bg-white/10 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      A+
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-1.5 rounded-xl bg-[#14141d] hover:bg-[#1f1f2c] border border-[#262636] text-xs text-white font-mono transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownload}
                    className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                  >
                    <Download size={14} />
                    <span>Guardar Archivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-all cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#050507] smooth-scroll font-mono">
                <div
                  className={`leading-relaxed whitespace-pre-wrap ${
                    fontSize === 'sm' ? 'text-xs' : fontSize === 'lg' ? 'text-base' : 'text-sm'
                  }`}
                >
                  <code>{codeString}</code>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
