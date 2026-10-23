import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Folder, LoreFile } from '../types';
import { BookOpen, Sparkles, Feather, FileText, ChevronRight } from 'lucide-react';

interface HourglassAvatarGreetingProps {
  userName?: string;
  folder: Folder | null;
  activeLoreFilesCount: number;
  onOpenFolderManager: () => void;
  onQuickPrompt: (promptText: string) => void;
  onAuditScene: (targetText?: string) => void;
}

export const HourglassAvatarGreeting: React.FC<HourglassAvatarGreetingProps> = ({
  userName = 'Aaron',
  folder,
  activeLoreFilesCount,
  onOpenFolderManager,
  onQuickPrompt,
  onAuditScene,
}) => {
  const fullText = `Hola, ${userName}. ¿Qué escribiremos hoy con Kizuna-Zek?`;
  const [displayedText, setDisplayedText] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  // Typewriter effect logic
  useEffect(() => {
    let index = 0;
    setDisplayedText('');
    setIsTypingComplete(false);

    const timer = setInterval(() => {
      if (index < fullText.length) {
        setDisplayedText(fullText.slice(0, index + 1));
        index++;
      } else {
        setIsTypingComplete(true);
        clearInterval(timer);
      }
    }, 45); // Smooth 45ms per character

    return () => clearInterval(timer);
  }, [fullText]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-2xl mx-auto w-full my-auto text-center select-none">
      {/* Hourglass Avatar Badge with Animated Looking Eyes */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 260 }}
        className="relative mb-6 group cursor-pointer"
        onClick={() => {
          // Re-trigger typewriter animation on tap
          setDisplayedText('');
          setIsTypingComplete(false);
          let i = 0;
          const t = setInterval(() => {
            if (i < fullText.length) {
              setDisplayedText(fullText.slice(0, i + 1));
              i++;
            } else {
              setIsTypingComplete(true);
              clearInterval(t);
            }
          }, 45);
        }}
      >
        {/* Soft Ambient Glow Outer Ring (Noir Silver - Static GPU friendly) */}
        <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-zinc-500/10 via-zinc-300/15 to-zinc-400/10 blur-sm opacity-80 transition-opacity" />

        {/* Circular Avatar Body */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-[#09090b] via-[#111115] to-[#18181f] border border-[#272730] shadow-2xl flex items-center justify-center overflow-hidden">
          {/* Subtle hourglass silhouette in background */}
          <svg
            className="absolute inset-0 w-full h-full opacity-15 text-zinc-300 pointer-events-none p-3"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M6 3H18M6 21H18M7.5 3V6.5C7.5 8.985 9.515 11 12 11C14.485 11 16.5 8.985 16.5 6.5V3M7.5 21V17.5C7.5 15.015 9.515 13 12 13C14.485 13 16.5 15.015 16.5 17.5V21"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>

          {/* Animated Hourglass / Creature Face Container */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            {/* Upper Glass Bulb with Subtle Smoke Glow */}
            <div className="w-10 h-3 rounded-t-full bg-zinc-400/15 border-t border-zinc-400/30 mb-1 flex items-center justify-center" />

            {/* Face / Eyeball Pair (Looking Left, Right, Up, Down) */}
            <div className="flex items-center gap-2.5 my-0.5">
              {/* Left Eye */}
              <motion.div
                animate={{
                  scaleY: [1, 1, 0.1, 1, 1, 1], // Blink
                }}
                transition={{
                  duration: 4,
                  repeat: 2,
                  ease: 'easeInOut',
                  times: [0, 0.45, 0.48, 0.51, 0.8, 1],
                }}
                className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full bg-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.45)] flex items-center justify-center relative overflow-hidden"
              >
                {/* Left Pupil moving around */}
                <motion.div
                  animate={{
                    x: [0, 2, -2, 2, 0, 0],
                    y: [0, 0, 0, -2, 2, 0],
                  }}
                  transition={{
                    duration: 5,
                    repeat: 2,
                    repeatType: 'reverse',
                    ease: 'easeInOut',
                  }}
                  className="w-2 h-2 rounded-full bg-[#09090b] relative"
                >
                  <div className="absolute top-0 right-0 w-0.8 h-0.8 rounded-full bg-white" />
                </motion.div>
              </motion.div>

              {/* Right Eye */}
              <motion.div
                animate={{
                  scaleY: [1, 1, 0.1, 1, 1, 1], // Blink synchronously
                }}
                transition={{
                  duration: 4,
                  repeat: 2,
                  ease: 'easeInOut',
                  times: [0, 0.45, 0.48, 0.51, 0.8, 1],
                }}
                className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full bg-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.45)] flex items-center justify-center relative overflow-hidden"
              >
                {/* Right Pupil moving around synchronously */}
                <motion.div
                  animate={{
                    x: [0, 2, -2, 2, 0, 0],
                    y: [0, 0, 0, -2, 2, 0],
                  }}
                  transition={{
                    duration: 5,
                    repeat: 2,
                    repeatType: 'reverse',
                    ease: 'easeInOut',
                  }}
                  className="w-2 h-2 rounded-full bg-[#09090b] relative"
                >
                  <div className="absolute top-0 right-0 w-0.8 h-0.8 rounded-full bg-white" />
                </motion.div>
              </motion.div>
            </div>

            {/* Lower Glass Bulb with Subtle Sand */}
            <div className="w-10 h-3 rounded-b-full bg-zinc-400/20 border-b border-zinc-400/35 mt-1" />
          </div>
        </div>
      </motion.div>

      {/* Typewriter Greeting Title */}
      <div className="min-h-[56px] flex items-center justify-center mb-4 px-2">
        <h1 className="greeting-title-text text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug font-sans">
          <span>{displayedText}</span>
          {!isTypingComplete && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="inline-block w-2 h-5 sm:h-6 ml-1 bg-zinc-300 rounded-xs align-middle"
            />
          )}
        </h1>
      </div>

      {/* Subtle Arc Environment Status Line */}
      {folder && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={onOpenFolderManager}
          className="flex items-center gap-2 px-4 py-2 bg-[#0c0c10] border border-[#22222a] hover:border-zinc-600 rounded-full text-xs text-[#a1a1aa] hover:text-white cursor-pointer transition-all shadow-md mb-6"
          title="Click para ver directivas y lore del arco"
        >
          <Feather size={13} className="text-zinc-300 shrink-0" />
          <span>Arco activo:</span>
          <span className="font-semibold text-white truncate max-w-[180px] sm:max-w-[240px]">{folder.name}</span>
          <span className="text-zinc-600">·</span>
          <span className="font-mono text-[11px] text-zinc-300">
            {activeLoreFilesCount} docs en lore
          </span>
        </motion.div>
      )}

      {/* Sleek Action Pills Row (Kimi Style Monochromatic Noir) */}
      <div className="w-full flex items-center justify-center gap-2 flex-wrap mb-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          onClick={() =>
            onQuickPrompt(
              'Desarrollemos una escena enfocada en presencia y regulación somática: silencios compartidos, micro-detalles sensoriales (tacto, temperatura, respiración) y contención sin explicaciones clínicas ni clichés.'
            )
          }
          className="group flex items-center gap-2 px-3.5 py-2 bg-[#0e0e12] hover:bg-[#16161d] border border-[#22222a] hover:border-zinc-600 rounded-full text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
        >
          <Sparkles size={13} className="text-zinc-400 group-hover:text-zinc-200 shrink-0 transition-colors" />
          <span>Regulación Somática</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          onClick={() =>
            onQuickPrompt(
              'Escribamos un diálogo con fuerte subtexto que contraste una voz con armadura teatral dramática frente a una respuesta analítica, contenida y deadpan.'
            )
          }
          className="group flex items-center gap-2 px-3.5 py-2 bg-[#0e0e12] hover:bg-[#16161d] border border-[#22222a] hover:border-zinc-600 rounded-full text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
        >
          <FileText size={13} className="text-zinc-400 group-hover:text-zinc-200 shrink-0 transition-colors" />
          <span>Subtexto & Máscaras</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          onClick={() =>
            onQuickPrompt(
              'Estructuremos una escena de combate o sobrecarga bioenergética. Mantén la tensión física, el riesgo somático y la narrativa viva sin porcentajes numéricos.'
            )
          }
          className="group flex items-center gap-2 px-3.5 py-2 bg-[#0e0e12] hover:bg-[#16161d] border border-[#22222a] hover:border-zinc-600 rounded-full text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
        >
          <BookOpen size={13} className="text-zinc-400 group-hover:text-zinc-200 shrink-0 transition-colors" />
          <span>Resonancia & Combate</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          onClick={() => {
            if (onAuditScene) onAuditScene();
          }}
          className="group flex items-center gap-2 px-3.5 py-2 bg-[#0e0e12] hover:bg-[#16161d] border border-[#22222a] hover:border-zinc-600 rounded-full text-xs font-medium text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
        >
          <Feather size={13} className="text-zinc-400 group-hover:text-zinc-200 shrink-0 transition-colors" />
          <span>Auditar Lore</span>
        </motion.button>
      </div>
    </div>
  );
};
