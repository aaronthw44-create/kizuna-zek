import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  isDestructive = true,
  onConfirm,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') {
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs select-none modal-backdrop-fluid">
          <div
            className="w-full max-w-sm bg-[#09090c] border border-[#222226] rounded-xl shadow-2xl p-5 text-white modal-sheet-fluid"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5 mb-4">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  isDestructive
                    ? 'bg-red-950/40 border border-red-900/50 text-red-400'
                    : 'bg-[#151518] border border-[#26262b] text-[#a1a1aa]'
                }`}
              >
                {isDestructive ? <Trash2 size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white tracking-tight leading-snug">
                  {title}
                </h3>
                <p className="mt-1 text-xs text-[#a1a1aa] leading-relaxed">
                  {description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#161619]">
              <motion.button
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-[#a1a1aa] hover:text-white hover:bg-[#141418] rounded-md transition-colors"
              >
                {cancelLabel}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => {
                  onConfirm();
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isDestructive
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-xs'
                    : 'bg-white hover:bg-[#e4e4e7] text-black font-semibold'
                }`}
              >
                {confirmLabel}
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
