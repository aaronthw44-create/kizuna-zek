import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Film,
  Download,
  Copy,
  Check,
  Maximize2,
  AlertCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Attachment, GenerationState } from '../types';

interface GenerativeCanvasCardProps {
  state: GenerationState;
  onOpenLightbox?: (attachment: Attachment) => void;
  onAnimateVideo?: (prompt: string, imageUrl: string) => void;
  onRetry?: () => void;
  onShowToast?: (text: string) => void;
}

export const GenerativeCanvasCard: React.FC<GenerativeCanvasCardProps> = ({
  state,
  onOpenLightbox,
  onAnimateVideo,
  onRetry,
  onShowToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const isVideo = state.type === 'video';
  const isFinished = !state.isGenerating && Boolean(state.resultUrl);

  // Smooth real-time ticker so progress % and remaining time update dynamically every 250ms
  React.useEffect(() => {
    if (!state.isGenerating) {
      setElapsedMs(0);
      return;
    }
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 250);
    return () => clearInterval(interval);
  }, [state.isGenerating, state.prompt]);

  // Expected synthesis duration: ~16s for image sketch, ~28s for video render
  const targetDurationMs = isVideo ? 28000 : 16000;
  const rawRatio = elapsedMs / targetDurationMs;
  // Asymptotic curve from 2% up to 96% while waiting for completion
  const curvedProgress = Math.min(
    96,
    Math.max(2, Math.round((1 - Math.exp(-2.6 * rawRatio)) * 98))
  );
  const displayProgress = isFinished
    ? 100
    : Math.min(97, Math.max(curvedProgress, state.progress || 2));

  const remainingSeconds = Math.max(
    1,
    Math.ceil(Math.max(0, targetDurationMs - elapsedMs) / 1000)
  );

  // Dynamic step label based on live progress
  const dynamicStepLabel = React.useMemo(() => {
    if (!state.isGenerating) {
      if (isFinished) {
        return isVideo
          ? `Clip de video listo · ${state.model}`
          : `Ilustración lista · ${state.model}`;
      }
      return 'Generación detenida';
    }
    if (displayProgress < 20) {
      return isVideo ? 'Configurando fotogramas y escena...' : 'Haciendo un boceto inicial...';
    }
    if (displayProgress < 45) {
      return isVideo ? 'Creando el primer borrador de movimiento...' : 'Creando el primer borrador...';
    }
    if (displayProgress < 70) {
      return isVideo ? 'Calculando física, cámara e iluminación...' : 'Pensando luces y composición...';
    }
    if (displayProgress < 88) {
      return isVideo
        ? `Renderizando video con ${state.model}...`
        : `Sintetizando alta resolución con ${state.model}...`;
    }
    return isVideo ? 'Codificando fotogramas finales...' : 'Finalizando detalles del boceto...';
  }, [state.isGenerating, isFinished, isVideo, state.model, displayProgress]);

  const handleCopyPrompt = () => {
    if (!state.prompt) return;
    navigator.clipboard.writeText(state.prompt);
    setCopied(true);
    if (onShowToast) onShowToast('Prompt copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!state.resultUrl) return;
    const a = document.createElement('a');
    a.href = state.resultUrl;
    a.download = `${isVideo ? 'video' : 'ilustracion'}_${state.model}_${Date.now()}.${isVideo && !state.isPoster ? 'mp4' : 'jpg'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (onShowToast) onShowToast('Descargando archivo...');
  };

  const mockAttachment: Attachment = {
    id: `gen_card_${Date.now()}`,
    name: `${state.type}_${state.model}.jpg`,
    type: isVideo && !state.isPoster ? 'video/mp4' : 'image/jpeg',
    fileType: isVideo ? 'video' : 'image',
    dataUrl: state.resultUrl,
    videoUrl: isVideo ? state.resultUrl : undefined,
    duration: state.duration,
  };

  // Full-box density: 18 columns x 22 rows = 396 dots covering the entire black canvas
  const cols = 18;
  const rows = 22;
  const totalDots = cols * rows;

  return (
    <div className="w-full max-w-[380px] sm:max-w-[420px] my-3 select-none">
      {/* Dynamic Status Header */}
      <div className="flex items-center justify-between mb-1.5 px-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {state.isGenerating ? (
            <span className="w-2 h-2 rounded-full bg-zinc-300 animate-pulse shrink-0" />
          ) : isFinished ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
          )}
          <span className="text-sm font-medium text-zinc-200 truncate">
            {dynamicStepLabel}
          </span>
        </div>

        <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/60 text-zinc-400 rounded-full shrink-0">
          {state.model}
        </span>
      </div>

      {/* Live Remaining Time Sub-label while generating */}
      {state.isGenerating && !state.error && (
        <div className="flex items-center justify-between px-1 mb-2 text-[11px] text-zinc-400 font-mono">
          <span>
            {displayProgress < 92
              ? `Faltan ~${remainingSeconds}s para terminar el ${isVideo ? 'video' : 'boceto'}`
              : `Últimos retoques del ${isVideo ? 'video' : 'boceto'}...`}
          </span>
          <span className="text-zinc-300 font-semibold">{displayProgress}% completado</span>
        </div>
      )}

      {/* Canvas Frame Container */}
      <div className="relative w-full aspect-[4/5] bg-[#060608] border border-[#1f1f26] rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center justify-center">
        {state.error ? (
          <div className="p-6 text-center space-y-3.5 max-w-xs">
            <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-800/50 flex items-center justify-center text-red-400 mx-auto">
              <AlertCircle size={20} />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-200">Error de comunicación con el motor</p>
              <p className="text-[11px] text-red-300/90 leading-relaxed break-words">{state.error}</p>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white border border-zinc-700 transition-colors cursor-pointer select-none active:scale-95"
              >
                <RotateCcw size={13} />
                <span>Reintentar síntesis</span>
              </button>
            )}
          </div>
        ) : isFinished && state.resultUrl ? (
          /* Rendered Result View */
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="relative w-full h-full group/canvas cursor-pointer bg-black"
            onClick={() => onOpenLightbox?.(mockAttachment)}
          >
            {isVideo && !state.isPoster ? (
              <video
                src={state.resultUrl}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                onPlay={() => setIsVideoPlaying(true)}
                onPause={() => setIsVideoPlaying(false)}
              />
            ) : (
              <img
                src={state.resultUrl}
                alt={state.prompt}
                className="w-full h-full object-cover transition-transform duration-300 group-hover/canvas:scale-[1.02]"
              />
            )}

            {/* Hover overlay with quick actions */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 opacity-0 group-hover/canvas:opacity-100 transition-opacity flex flex-col justify-between p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono px-2 py-0.5 bg-black/60 backdrop-blur-xs text-zinc-300 rounded border border-white/10">
                  {isVideo ? 'VIDEO' : 'ILUSTRACIÓN'}
                </span>
                <span className="p-1.5 rounded-lg bg-black/60 text-white backdrop-blur-xs hover:bg-black/90 transition-colors">
                  <Maximize2 size={14} />
                </span>
              </div>

              {isVideo && (
                <div className="self-center p-3 rounded-full bg-white/20 backdrop-blur-xs text-white shadow-xl">
                  <Play size={20} fill="currentColor" />
                </div>
              )}

              <div className="text-[11px] text-zinc-300 line-clamp-2 bg-black/60 backdrop-blur-xs p-2 rounded-lg border border-white/10">
                {state.prompt}
              </div>
            </div>
          </motion.div>
        ) : (
          /* Full-Box Edge-to-Edge Dotted Matrix Thinking Animation */
          <div className="relative w-full h-full p-3.5 sm:p-4 flex items-center justify-center">
            <div
              className="w-full h-full grid place-items-center"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: totalDots }).map((_, idx) => {
                const r = Math.floor(idx / cols);
                const c = idx % cols;
                // Radial wave from center across the entire box
                const dist = Math.sqrt(
                  Math.pow(r - (rows - 1) / 2, 2) + Math.pow(c - (cols - 1) / 2, 2)
                );
                const delay = (dist * 0.09) % 1.8;
                // Highlight dots proportionally as progress advances
                const dotProgressThreshold = ((r * cols + c) / totalDots) * 100;
                const isReached = dotProgressThreshold <= displayProgress;

                return (
                  <motion.div
                    key={idx}
                    animate={{
                      opacity: isReached ? [0.28, 0.95, 0.28] : [0.1, 0.45, 0.1],
                      scale: isReached ? [0.85, 1.3, 0.85] : [0.75, 1.05, 0.75],
                    }}
                    transition={{
                      duration: 1.9,
                      repeat: Infinity,
                      delay,
                      ease: 'easeInOut',
                    }}
                    className={`w-1.5 h-1.5 rounded-full ${
                      isReached
                        ? 'bg-zinc-200 shadow-[0_0_6px_rgba(255,255,255,0.35)]'
                        : 'bg-zinc-500/70'
                    }`}
                  />
                );
              })}
            </div>

            {/* Dynamic Corner Pill: Remaining Time + Live Percentage */}
            <div className="absolute bottom-3.5 right-3.5 px-3 py-1 bg-[#141418]/95 border border-zinc-700/80 text-zinc-100 text-xs font-mono font-semibold rounded-full shadow-xl backdrop-blur-md flex items-center gap-2">
              <span className="text-[11px] font-normal text-zinc-400">
                {displayProgress < 92 ? `~${remainingSeconds}s` : '99%'}
              </span>
              <span className="w-px h-3 bg-zinc-700/80" />
              <span>{displayProgress}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Toolbar Below Card */}
      {isFinished && state.resultUrl && (
        <div className="flex items-center justify-between gap-1.5 mt-2.5 px-1 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenLightbox?.(mockAttachment)}
              className="min-h-[38px] px-3 rounded-lg bg-[#141418] border border-[#26262e] text-zinc-300 hover:text-white hover:bg-[#1e1e24] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95"
            >
              <Maximize2 size={13} />
              <span>Ver en grande</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[38px] px-2.5 rounded-lg bg-[#141418] border border-[#26262e] text-zinc-300 hover:text-white hover:bg-[#1e1e24] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95"
              title="Descargar archivo"
            >
              <Download size={13} />
            </button>

            <button
              type="button"
              onClick={handleCopyPrompt}
              className="min-h-[38px] px-2.5 rounded-lg bg-[#141418] border border-[#26262e] text-zinc-300 hover:text-white hover:bg-[#1e1e24] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95"
              title="Copiar Prompt"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
          </div>

          {!isVideo && onAnimateVideo && (
            <button
              type="button"
              onClick={() => onAnimateVideo(state.prompt, state.resultUrl!)}
              className="min-h-[38px] px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-zinc-600/80 cursor-pointer select-none active:scale-95"
            >
              <Film size={13} className="text-zinc-300" />
              <span>Animar Video</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
