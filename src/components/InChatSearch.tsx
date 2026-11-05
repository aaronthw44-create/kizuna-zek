import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Chat } from '../types';

interface InChatSearchProps {
  isOpen: boolean;
  chat: Chat | null;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}

export const InChatSearch: React.FC<InChatSearchProps> = ({
  isOpen,
  chat,
  query,
  onQueryChange,
  onClose,
}) => {
  const [matchIndex, setMatchIndex] = useState(0);
  const [totalMarks, setTotalMarks] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear active spotlight classes from all marks
  const clearActiveMarkStyles = useCallback(() => {
    const marks = document.querySelectorAll('mark.search-highlight-keyword');
    marks.forEach((el) => {
      el.classList.remove(
        'ring-4',
        'ring-amber-300',
        'scale-110',
        'bg-orange-400',
        'shadow-[0_0_16px_rgba(251,191,36,0.95)]',
        'z-10',
        'relative'
      );
    });
  }, []);

  // Reset match index when query or chat changes
  useEffect(() => {
    setMatchIndex(0);
  }, [query, chat?.id]);

  // Count rendered <mark class="search-highlight-keyword"> elements and focus the active one
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setTotalMarks(0);
      clearActiveMarkStyles();
      return;
    }

    const timer = setTimeout(() => {
      const marks = Array.from(
        document.querySelectorAll('mark.search-highlight-keyword')
      ) as HTMLElement[];

      setTotalMarks(marks.length);
      clearActiveMarkStyles();

      if (marks.length > 0) {
        const safeIdx = ((matchIndex % marks.length) + marks.length) % marks.length;
        const activeMark = marks[safeIdx];
        if (activeMark) {
          activeMark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          activeMark.classList.add(
            'ring-4',
            'ring-amber-300',
            'scale-110',
            'bg-orange-400',
            'shadow-[0_0_16px_rgba(251,191,36,0.95)]',
            'z-10',
            'relative'
          );
        }
      }
    }, 45);

    return () => clearTimeout(timer);
  }, [query, matchIndex, isOpen, chat?.messages, clearActiveMarkStyles]);

  // Focus input on open and clean up on close
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      clearActiveMarkStyles();
      onQueryChange('');
    }
  }, [isOpen, clearActiveMarkStyles]);

  const handlePrev = () => {
    if (totalMarks === 0) return;
    setMatchIndex((prev) => (prev > 0 ? prev - 1 : totalMarks - 1));
  };

  const handleNext = () => {
    if (totalMarks === 0) return;
    setMatchIndex((prev) => (prev < totalMarks - 1 ? prev + 1 : 0));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -24, scale: 0.94, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -18, scale: 0.95, filter: 'blur(4px)' }}
          transition={{ type: 'spring', damping: 24, stiffness: 360 }}
          className="sticky top-2 z-40 mx-2 sm:mx-auto max-w-xl bg-white/95 dark:bg-[#121216]/95 border border-amber-500/50 dark:border-amber-500/40 backdrop-blur-md rounded-2xl shadow-xl dark:shadow-[0_12px_36px_rgba(0,0,0,0.75)] p-2.5 flex items-center gap-2 text-zinc-900 dark:text-white"
        >
          <motion.div
            animate={query.trim() ? { rotate: [0, -12, 12, 0], scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 0.35 }}
            className="shrink-0 ml-1"
          >
            <Search size={16} className="text-amber-500 dark:text-amber-400" />
          </motion.div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNext();
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Buscar concepto o palabra clave exacta..."
            className="flex-1 bg-transparent text-[16px] md:text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none font-medium"
          />

          <AnimatePresence mode="popLayout">
            {query.trim() && (
              <motion.span
                key={`${totalMarks}-${matchIndex}`}
                initial={{ opacity: 0, scale: 0.85, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -4 }}
                transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                className="text-[11px] font-mono text-amber-800 dark:text-amber-300 shrink-0 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 shadow-xs font-semibold"
              >
                {totalMarks === 0
                  ? 'Sin resultados'
                  : `${((matchIndex % totalMarks) + totalMarks) % totalMarks + 1}/${totalMarks}`}
              </motion.span>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-1 shrink-0 border-l border-zinc-200 dark:border-zinc-800 pl-1">
            <motion.button
              type="button"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              onClick={handlePrev}
              disabled={totalMarks === 0}
              className="p-1.5 min-h-[38px] min-w-[38px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed transition-colors"
              title="Palabra anterior"
            >
              <ChevronUp size={16} />
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleNext}
              disabled={totalMarks === 0}
              className="p-1.5 min-h-[38px] min-w-[38px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed transition-colors"
              title="Siguiente palabra"
            >
              <ChevronDown size={16} />
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.08, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-1.5 min-h-[38px] min-w-[38px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer ml-0.5 transition-colors"
              title="Cerrar búsqueda"
            >
              <X size={16} />
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

