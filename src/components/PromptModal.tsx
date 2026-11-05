import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FolderPlus, Edit2, X } from 'lucide-react';

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (val: string) => void;
  onClose: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  title,
  description,
  initialValue = '',
  placeholder = 'Introduce un nombre...',
  confirmLabel = 'Guardar',
  onConfirm,
  onClose,
}) => {
  const [val, setVal] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setVal(initialValue);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialValue]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!val.trim()) return;
    onConfirm(val.trim());
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs select-none modal-backdrop-fluid">
          <div
            className="w-full max-w-sm bg-[#09090c] border border-[#222226] rounded-xl shadow-2xl p-5 text-white modal-sheet-fluid"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white tracking-tight">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#71717a] hover:text-white rounded active:scale-95 transition-transform"
              >
                <X size={16} />
              </button>
            </div>

            {description && (
              <p className="text-xs text-[#a1a1aa] mb-3 leading-relaxed">
                {description}
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                ref={inputRef}
                type="text"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[#121216] border border-[#26262b] focus:border-[#4b4b55] rounded-lg px-3 py-2 text-[16px] md:text-xs text-white placeholder-[#71717a] outline-none transition-colors"
              />

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#161619]">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-[#a1a1aa] hover:text-white hover:bg-[#141418] rounded-md transition-colors"
                >
                  Cancelar
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  disabled={!val.trim()}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-white hover:bg-[#e4e4e7] disabled:opacity-40 text-black transition-colors"
                >
                  {confirmLabel}
                </motion.button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
