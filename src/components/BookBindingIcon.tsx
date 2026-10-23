import React from 'react';

interface BookBindingIconProps {
  isBinding: boolean;
  size?: number;
  className?: string;
}

export const BookBindingIcon: React.FC<BookBindingIconProps> = ({
  isBinding,
  size = 16,
  className = '',
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${
        isBinding ? 'animate-epub-float-success' : ''
      } ${className}`}
      style={{ width: size + 2, height: size + 2 }}
    >
      {/* 3D Book & Cover */}
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`transition-transform ${isBinding ? 'animate-book-snap-shut' : ''}`}
      >
        <defs>
          <linearGradient id="bookCoverGrad" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2e2e38" />
            <stop offset="100%" stopColor="#141418" />
          </linearGradient>
          <linearGradient id="pageEdgeGrad" x1="17" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>

        {/* Back cover & page edges */}
        <path
          d="M5 3.5C5 2.67157 5.67157 2 6.5 2H18.5C19.3284 2 20 2.67157 20 3.5V20.5C20 21.3284 19.3284 22 18.5 22H6.5C5.67157 22 5 21.3284 5 20.5V3.5Z"
          fill="url(#bookCoverGrad)"
          stroke="#4b4b58"
          strokeWidth="1.2"
        />

        {/* Interior Page Trim Lines */}
        <path
          d="M18.5 4.5V19.5"
          stroke="url(#pageEdgeGrad)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity={isBinding ? 0.3 : 0.8}
        />

        {/* Front Cover Plate */}
        <path
          d="M4.5 3C4.5 2.44772 4.94772 2 5.5 2H17.5C18.0523 2 18.5 2.44772 18.5 3V21C18.5 21.5523 18.0523 22 17.5 22H5.5C4.94772 22 4.5 21.5523 4.5 21V3Z"
          fill="#1c1c24"
          stroke="#5a5a6e"
          strokeWidth="1"
        />

        {/* Spine stitches / leather bands */}
        <line x1="4.5" y1="6" x2="7" y2="6" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
        <line x1="4.5" y1="11" x2="7" y2="11" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
        <line x1="4.5" y1="16" x2="7" y2="16" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />

        {/* Book cover emboss glyph */}
        <circle cx="11.5" cy="11.5" r="2.5" stroke="#a855f7" strokeWidth="0.8" opacity="0.6" />
      </svg>

      {/* Golden Lock / Buckle Clasp appearing on the side */}
      {isBinding && (
        <div className="absolute right-[-2px] top-1/2 -translate-y-1/2 z-20 animate-latch-click pointer-events-none">
          <svg width="10" height="12" viewBox="0 0 10 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="goldLatchGrad" x1="0" y1="0" x2="10" y2="12" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#ca8a04" />
              </linearGradient>
            </defs>
            {/* Clasp strap */}
            <rect x="0" y="3.5" width="4" height="5" rx="1" fill="#713f12" />
            {/* Golden buckle plate */}
            <rect
              x="2.5"
              y="2"
              width="6.5"
              height="8"
              rx="1.5"
              fill="url(#goldLatchGrad)"
              stroke="#fef08a"
              strokeWidth="0.8"
            />
            {/* Clasp lock pinhole */}
            <circle cx="5.75" cy="6" r="1.1" fill="#422006" />
          </svg>
        </div>
      )}
    </div>
  );
};
