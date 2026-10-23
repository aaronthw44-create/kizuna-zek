import React from 'react';

interface LivingInkDropProps {
  isThinking: boolean;
  size?: number;
  className?: string;
}

export const LivingInkDrop: React.FC<LivingInkDropProps> = ({
  isThinking,
  size = 15,
  className = '',
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Dynamic Concentric Expanding Ripple Rings when reasoning / thinking */}
      {isThinking && (
        <>
          {/* Ripple Ring 1 */}
          <span
            className="absolute rounded-full border border-sky-300 pointer-events-none animate-ink-ripple-1 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ willChange: 'transform, opacity, width, height' }}
          />

          {/* Ripple Ring 2 (staggered 0.7s delay) */}
          <span
            className="absolute rounded-full border border-sky-300 pointer-events-none animate-ink-ripple-2 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ willChange: 'transform, opacity, width, height' }}
          />
        </>
      )}

      {/* Ambient Droplet Aura when thinking */}
      {isThinking && (
        <span className="absolute inset-0 rounded-full bg-cyan-400/40 blur-[5px] animate-pulse pointer-events-none" />
      )}

      {/* Sleek Stylized Ink Droplet */}
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`relative z-10 transition-transform duration-300 ${
          isThinking ? 'animate-ink-drop scale-105' : 'scale-100'
        }`}
      >
        <defs>
          {/* Active Ink Gradient (Celestial Cyan to Deep Azure / Obsidian) */}
          <linearGradient id="livingInkActiveGrad" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="45%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>

          {/* Calm Solid Droplet Gradient (Complete / Frozen) */}
          <linearGradient id="livingInkCalmGrad" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#cbd5e1" />
            <stop offset="60%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>

          {/* Core Droplet Specular Reflection */}
          <linearGradient id="inkHighlightGrad" x1="9" y1="6" x2="13" y2="15" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Droplet Body */}
        <path
          d="M12 2.5C12 2.5 5.5 11 5.5 16C5.5 19.5899 8.41015 22.5 12 22.5C15.5899 22.5 18.5 19.5899 18.5 16C18.5 11 12 2.5 12 2.5Z"
          fill={isThinking ? 'url(#livingInkActiveGrad)' : 'url(#livingInkCalmGrad)'}
          stroke={isThinking ? 'rgba(186, 230, 253, 0.9)' : 'rgba(203, 213, 225, 0.6)'}
          strokeWidth="1.2"
          className="transition-colors duration-500"
        />

        {/* Elegant Specular Highlight Reflection */}
        <path
          d="M9.5 10C8.5 12.5 8.2 15 9.2 17.2C9.5 17.8 8.7 18.2 8.3 17.6C7.2 15 7.4 12.2 8.7 9.4C9 8.8 9.8 9.3 9.5 10Z"
          fill="url(#inkHighlightGrad)"
          opacity={isThinking ? 0.9 : 0.65}
        />

        {/* Small top drop glint */}
        <circle
          cx="12"
          cy="7"
          r="1"
          fill="#ffffff"
          opacity={isThinking ? 0.95 : 0.7}
        />
      </svg>
    </div>
  );
};
