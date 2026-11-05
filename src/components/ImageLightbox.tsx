import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Trash2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Attachment } from '../types';

interface ImageLightboxProps {
  image: Attachment | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  image,
  onClose,
  onDelete,
}) => {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setScale(1);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, image]);

  if (!image || !image.dataUrl || !image.dataUrl.trim()) return null;

  const handleDownload = () => {
    if (!image.dataUrl) return;
    const a = document.createElement('a');
    a.href = image.dataUrl;
    a.download = image.name || 'kizuna_session_image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const zoomIn = () => setScale((s) => Math.min(s + 0.3, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.3, 0.5));
  const resetZoom = () => setScale(1);

  return (
    <div
      className="fixed inset-0 z-60 flex flex-col items-center justify-between p-4 bg-black/95 backdrop-blur-md select-none modal-backdrop-fluid"
      onClick={onClose}
    >
      {/* Top Bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl px-3 py-2 flex items-center justify-between text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-mono text-xs text-[#a1a1aa] truncate max-w-[100px] sm:max-w-xs md:max-w-md">
            {image.name}
          </div>
          <span className="text-[11px] font-mono text-[#71717a] shrink-0">
            {typeof image.size === 'number' ? `${Math.round(image.size / 1024) || 1} KB` : image.size || ''}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Zoom controls - hidden on small screens */}
          <div className="hidden sm:flex items-center bg-[#101014] border border-[#1f1f23] rounded-md p-0.5 mr-1 sm:mr-2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={zoomOut}
              className="p-1.5 text-[#a1a1aa] hover:text-white rounded"
              title="Zoom out"
            >
              <ZoomOut size={13} />
            </motion.button>
            <span className="text-[10px] font-mono text-[#71717a] px-1.5">
              {Math.round(scale * 100)}%
            </span>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={zoomIn}
              className="p-1.5 text-[#a1a1aa] hover:text-white rounded"
              title="Zoom in"
            >
              <ZoomIn size={13} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={resetZoom}
              className="p-1.5 text-[#a1a1aa] hover:text-white rounded"
              title="Reset zoom"
            >
              <RotateCcw size={12} />
            </motion.button>
          </div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2 py-1.5 sm:px-3 text-xs text-black bg-white hover:bg-[#e4e4e7] rounded-md transition-colors"
            title="Download image"
          >
            <Download size={13} />
            <span className="hidden sm:inline">Descargar</span>
          </motion.button>

          {onDelete && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                onDelete(image.id);
                onClose();
              }}
              className="p-1.5 text-[#71717a] hover:text-red-400 hover:bg-[#1a1a1e] rounded-md transition-colors"
              title="Eliminar de la sesión"
            >
              <Trash2 size={16} />
            </motion.button>
          )}

          <button
            onClick={onClose}
            className="p-2 ml-1 text-white bg-white/15 hover:bg-white/25 active:scale-95 rounded-xl transition-all flex items-center justify-center shrink-0 z-50 cursor-pointer"
            title="Cerrar visor"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
      </motion.div>

      {/* Center Image Container with Zoom Scale */}
      <div
        className="flex-1 flex items-center justify-center p-2 max-w-full max-h-[82vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.img
          src={image.dataUrl}
          alt={image.name}
          animate={{ scale }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="max-h-[80vh] max-w-full object-contain rounded-md border border-[#1f1f23] shadow-2xl cursor-grab"
        />
      </div>

      {/* Bottom info caption */}
      <div
        className="text-[11px] font-mono text-[#71717a] py-2 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        Subido {new Date(image.timestamp || Date.now()).toLocaleTimeString()} · Toca el fondo o la cruz para cerrar · ESC en PC
      </div>
    </div>
  );
};
