import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface RunicSealIconProps {
  isAuditing?: boolean;
  isFinished?: boolean;
  size?: number;
  className?: string;
}

export const RunicSealIcon: React.FC<RunicSealIconProps> = ({
  isAuditing = false,
  isFinished = false,
  size = 18,
  className = '',
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <AnimatePresence mode="wait">
        {isFinished ? (
          /* Finished State: Brief Emerald Green Flash with Checkmark */
          <motion.div
            key="finished"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full flex items-center justify-center text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]"
          >
            <svg
              viewBox="0 0 24 24"
              width={size}
              height={size}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Emerald Outer Runic Aura */}
              <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1" opacity="0.6" strokeDasharray="2 2" />
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.2" />
              {/* Checkmark */}
              <path d="M7.5 12.5L10.5 15.5L16.5 8.5" stroke="currentColor" strokeWidth="2.2" />
            </svg>
          </motion.div>
        ) : isAuditing ? (
          /* Auditing State: Arcane Breathing Pulse (Prismatic Resonance) */
          <div
            key="auditing"
            className="w-full h-full flex items-center justify-center text-amber-400 animate-rune-resonance"
          >
            <svg
              viewBox="0 0 24 24"
              width={size}
              height={size}
              fill="none"
              stroke="currentColor"
              className="origin-center"
            >
              {/* Outer Runic Circle */}
              <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1" opacity="0.9" />
              
              {/* Cardinal Glyph Accents / Ticks with Bioenergetic Flicker */}
              <g className="animate-glyph-flicker">
                <line x1="12" y1="1" x2="12" y2="3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="12" y1="20.8" x2="12" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="1" y1="12" x2="3.2" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="20.8" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />

                {/* Diagonal Rune Notches */}
                <line x1="4.2" y1="4.2" x2="5.8" y2="5.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <line x1="19.8" y1="4.2" x2="18.2" y2="5.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <line x1="4.2" y1="19.8" x2="5.8" y2="18.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <line x1="19.8" y1="19.8" x2="18.2" y2="18.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </g>

              {/* Middle Dashed/Runic Circle */}
              <circle
                cx="12"
                cy="12"
                r="7.5"
                stroke="currentColor"
                strokeWidth="0.8"
                strokeDasharray="2.5 1.5"
                opacity="0.8"
              />

              {/* Inner Sacred Geometry (Runic Diamond / Eye) with Alive Circuits */}
              <g className="animate-glyph-flicker">
                <polygon
                  points="12,5.5 18.5,12 12,18.5 5.5,12"
                  stroke="currentColor"
                  strokeWidth="0.9"
                  fill="none"
                  opacity="0.85"
                />
                <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1" />
                <circle cx="12" cy="12" r="1.2" fill="currentColor" />
              </g>
            </svg>
          </div>
        ) : (
          /* Resting State: Intricate Runic Seal SVG */
          <svg
            key="resting"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            className="transition-colors duration-200"
          >
            {/* Outer Concentric Circle */}
            <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1" opacity="0.8" />

            {/* Cardinal Rune Ticks */}
            <line x1="12" y1="1.5" x2="12" y2="3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="12" y1="20.8" x2="12" y2="22.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="1.5" y1="12" x2="3.2" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="20.8" y1="12" x2="22.5" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />

            {/* Middle Circle */}
            <circle
              cx="12"
              cy="12"
              r="7.8"
              stroke="currentColor"
              strokeWidth="0.8"
              strokeDasharray="3 1.8"
              opacity="0.65"
            />

            {/* Inner Concentric Circle */}
            <circle cx="12" cy="12" r="4.8" stroke="currentColor" strokeWidth="0.9" opacity="0.85" />

            {/* Center Sacred Glyph Node */}
            <polygon
              points="12,7.2 16.8,12 12,16.8 7.2,12"
              stroke="currentColor"
              strokeWidth="0.75"
              fill="none"
              opacity="0.7"
            />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.9" />
          </svg>
        )}
      </AnimatePresence>
    </div>
  );
};
