import React from 'react';
import { motion } from 'motion/react';

interface GrimoireBookButtonProps {
  isActive: boolean;
  isFetching?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
  asDiv?: boolean;
}

export const GrimoireBookButton: React.FC<GrimoireBookButtonProps> = ({
  isActive,
  isFetching = false,
  onClick,
  title,
  className = '',
  asDiv = false,
}) => {
  const tooltipText =
    title ||
    `Búsqueda Web en Vivo: ${
      isActive ? (isFetching ? 'BUSCANDO...' : 'ACTIVADA') : 'DESACTIVADA'
    }`;

  const Component = asDiv ? motion.div : motion.button;

  return (
    <Component
      whileTap={{ scale: 0.92 }}
      type={asDiv ? undefined : 'button'}
      onClick={onClick}
      className={`relative p-1.5 sm:p-2 rounded-full transition-all shrink-0 flex items-center justify-center cursor-pointer min-w-[32px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] ${
        isActive
          ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700/50 shadow-sm'
          : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-[#141418] dark:hover:bg-[#1e1e24] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800'
      } ${className}`}
      title={tooltipText}
      aria-label={tooltipText}
    >
      {/* 3D Grimoire Book Container */}
      <div
        className={`relative w-5 h-5 flex items-center justify-center transition-transform duration-300 ${
          isFetching ? 'animate-book-glow' : ''
        }`}
        style={{ perspective: '200px' }}
      >
        {!isActive ? (
          /* ============================================================
             STATE 1: INACTIVE - Closed elegant book spine with white KZ
             ============================================================ */
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Soft book drop shadow */}
            <rect x="5" y="4" width="14" height="17" rx="2" fill="#09090b" opacity="0.6" />
            
            {/* Book Body / Front Leather Cover */}
            <rect
              x="5.5"
              y="3"
              width="13"
              height="18"
              rx="1.5"
              fill="#18181f"
              stroke="#3a3a46"
              strokeWidth="0.8"
            />

            {/* Book Pages Edge on Right */}
            <path
              d="M17 4.5V19.5"
              stroke="#71717a"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <path
              d="M18 5.2V18.8"
              stroke="#e4e4e7"
              strokeWidth="0.8"
              strokeLinecap="round"
              opacity="0.8"
            />

            {/* Left Spine Binding */}
            <path
              d="M5.5 3H7.5V21H5.5C4.67 21 4 20.33 4 19.5V4.5C4 3.67 4.67 3 5.5 3Z"
              fill="#22222c"
              stroke="#444454"
              strokeWidth="0.8"
            />
            {/* Spine Gold/Silver Accent Ribs */}
            <line x1="4.2" y1="7" x2="7.3" y2="7" stroke="#8b8b9e" strokeWidth="0.6" />
            <line x1="4.2" y1="12" x2="7.3" y2="12" stroke="#8b8b9e" strokeWidth="0.6" />
            <line x1="4.2" y1="17" x2="7.3" y2="17" stroke="#8b8b9e" strokeWidth="0.6" />

            {/* Front Cover Ornate Border Line */}
            <rect
              x="8.5"
              y="4.5"
              width="7.5"
              height="15"
              rx="0.5"
              fill="none"
              stroke="#2e2e3a"
              strokeWidth="0.5"
            />

            {/* Subtle White KZ Insignia */}
            <text
              x="12.2"
              y="13"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="4.8"
              fontWeight="700"
              fontFamily="system-ui, -apple-system, sans-serif"
              letterSpacing="-0.3px"
              opacity="0.9"
            >
              KZ
            </text>

            {/* Bookmark ribbon tip hanging from bottom */}
            <path
              d="M11 20.5V22.5L12 21.8L13 22.5V20.5H11Z"
              fill="#94a3b8"
              opacity="0.85"
            />
          </svg>
        ) : !isFetching ? (
          /* ============================================================
             STATE 2: ACTIVE (IDLE) - Open book at 30° isometric perspective, faint glow
             ============================================================ */
          <div
            className="w-5 h-5 relative flex items-center justify-center drop-shadow-[0_0_6px_rgba(147,197,253,0.55)]"
            style={{
              transform: 'perspective(300px) rotateX(18deg) rotateY(-8deg) rotateZ(3deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            <svg
              viewBox="0 0 26 22"
              className="w-5 h-5"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Outer Grimoire Hard Cover Wings */}
              <path
                d="M13 18.5C10 17 4 16.5 2 17.5V4C4 3 10 3.5 13 5V18.5Z"
                fill="#0f172a"
                stroke="#38bdf8"
                strokeWidth="0.9"
              />
              <path
                d="M13 18.5C16 17 22 16.5 24 17.5V4C22 3 16 3.5 13 5V18.5Z"
                fill="#0f172a"
                stroke="#38bdf8"
                strokeWidth="0.9"
              />

              {/* Parchment Pages Layer - Left Wing */}
              <path
                d="M12.5 17.5C9.8 16.2 4.5 15.8 2.8 16.7V4.8C4.5 3.9 9.8 4.3 12.5 5.6V17.5Z"
                fill="#1e293b"
                stroke="#60a5fa"
                strokeWidth="0.5"
              />
              {/* Parchment Pages Layer - Right Wing */}
              <path
                d="M13.5 17.5C16.2 16.2 21.5 15.8 23.2 16.7V4.8C21.5 3.9 16.2 4.3 13.5 5.6V17.5Z"
                fill="#1e293b"
                stroke="#60a5fa"
                strokeWidth="0.5"
              />

              {/* Runic Archive Lines on Pages */}
              <line x1="4.5" y1="7.5" x2="10.5" y2="8.5" stroke="#93c5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.8" />
              <line x1="4.5" y1="10.5" x2="10" y2="11.5" stroke="#93c5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.8" />
              <line x1="4.5" y1="13.5" x2="9" y2="14.5" stroke="#93c5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.8" />

              <line x1="15.5" y1="8.5" x2="21.5" y2="7.5" stroke="#93c5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.8" />
              <line x1="16" y1="11.5" x2="21.5" y2="10.5" stroke="#93c5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.8" />
              <line x1="17" y1="14.5" x2="21.5" y2="13.5" stroke="#93c5fd" strokeWidth="0.6" strokeLinecap="round" opacity="0.8" />

              {/* Center Spine Crease */}
              <line x1="13" y1="4.5" x2="13" y2="18.5" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" />

              {/* Golden Bookmark Ribbon */}
              <path
                d="M13 18.5L12 21L13 20.2L14 21L13 18.5Z"
                fill="#38bdf8"
              />
            </svg>
          </div>
        ) : (
          /* ============================================================
             STATE 3: ACTIVE & FETCHING - Animated page-flip loop + bookGlow
             ============================================================ */
          <div
            className="w-5 h-5 relative flex items-center justify-center animate-book-glow"
            style={{
              transform: 'perspective(220px) rotateX(15deg) rotateY(-5deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Open Book Base */}
            <svg
              viewBox="0 0 26 22"
              className="w-5 h-5 absolute inset-0"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Outer Grimoire Wings */}
              <path
                d="M13 18.5C10 17 4 16.5 2 17.5V4C4 3 10 3.5 13 5V18.5Z"
                fill="#0b132b"
                stroke="#60a5fa"
                strokeWidth="0.9"
              />
              <path
                d="M13 18.5C16 17 22 16.5 24 17.5V4C22 3 16 3.5 13 5V18.5Z"
                fill="#0b132b"
                stroke="#60a5fa"
                strokeWidth="0.9"
              />

              {/* Left Static Page Wing */}
              <path
                d="M12.5 17.5C9.8 16.2 4.5 15.8 2.8 16.7V4.8C4.5 3.9 9.8 4.3 12.5 5.6V17.5Z"
                fill="#1e293b"
                stroke="#93c5fd"
                strokeWidth="0.5"
              />
              {/* Right Static Page Wing */}
              <path
                d="M13.5 17.5C16.2 16.2 21.5 15.8 23.2 16.7V4.8C21.5 3.9 16.2 4.3 13.5 5.6V17.5Z"
                fill="#1e293b"
                stroke="#93c5fd"
                strokeWidth="0.5"
              />

              <line x1="4.5" y1="8" x2="10" y2="9" stroke="#93c5fd" strokeWidth="0.5" opacity="0.7" />
              <line x1="4.5" y1="12" x2="9.5" y2="13" stroke="#93c5fd" strokeWidth="0.5" opacity="0.7" />
              <line x1="16" y1="9" x2="21.5" y2="8" stroke="#93c5fd" strokeWidth="0.5" opacity="0.7" />
              <line x1="16.5" y1="13" x2="21.5" y2="12" stroke="#93c5fd" strokeWidth="0.5" opacity="0.7" />

              {/* Spine line */}
              <line x1="13" y1="4.5" x2="13" y2="18.5" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" />
            </svg>

            {/* Flipping 3D Page Leaf 1 */}
            <div
              className="absolute top-[4px] left-[10px] w-[8px] h-[13px] pointer-events-none animate-flip-page"
              style={{
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="w-full h-full bg-gradient-to-r from-blue-300 via-sky-200 to-white/90 rounded-r-[1.5px] border-r border-white shadow-xs opacity-90" />
            </div>

            {/* Flipping 3D Page Leaf 2 (Staggered Delay) */}
            <div
              className="absolute top-[4px] left-[10px] w-[8px] h-[13px] pointer-events-none animate-flip-page-delayed"
              style={{
                transformStyle: 'preserve-3d',
              }}
            >
              <div className="w-full h-full bg-gradient-to-r from-blue-400 via-cyan-200 to-white/85 rounded-r-[1.5px] border-r border-cyan-100 shadow-xs opacity-85" />
            </div>
          </div>
        )}
      </div>
    </Component>
  );
};
