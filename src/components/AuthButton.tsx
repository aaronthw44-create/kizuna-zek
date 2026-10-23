import React from 'react';
import { motion } from 'motion/react';
import { LogOut, Loader2, User as UserIcon, AlertTriangle, ExternalLink, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface AuthButtonProps {
  className?: string;
}

export const AuthButton: React.FC<AuthButtonProps> = ({ className = '' }) => {
  const { user, loading, login, logout, error, clearError } = useAuth();

  if (loading) {
    return (
      <div
        className={`w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#0d0d11] border border-white/10 text-xs font-mono text-[#a1a1aa] ${className}`}
      >
        <Loader2 size={15} className="animate-spin text-white/70" />
        <span>Sincronizando sesión...</span>
      </div>
    );
  }

  if (user) {
    const displayName = user.displayName || user.email?.split('@')[0] || 'Usuario';
    const email = user.email || '';

    return (
      <div className={`w-full flex flex-col gap-1.5 ${className}`}>
        <div className="w-full min-h-[44px] flex items-center justify-between gap-2.5 p-2 rounded-lg bg-[#0d0d11] border border-white/10 shadow-xs">
          {/* User Profile Info */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {user.photoURL && user.photoURL.trim() ? (
              <img
                src={user.photoURL}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/15"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/15 flex items-center justify-center shrink-0 text-white font-mono text-xs">
                {displayName.charAt(0).toUpperCase() || <UserIcon size={14} />}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-white truncate leading-tight">
                {displayName}
              </span>
              {email && (
                <span className="block text-[10px] text-[#71717a] font-mono truncate leading-tight">
                  {email}
                </span>
              )}
            </div>
          </div>

          {/* Minimalist Logout Button */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.02 }}
            type="button"
            onClick={() => logout()}
            className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#71717a] hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer shrink-0"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={15} />
          </motion.button>
        </div>

        {error && (
          <div className="w-full p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-left flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-1">
              <div className="flex items-center gap-1.5 text-red-400 font-mono text-[11px] font-semibold">
                <AlertTriangle size={13} className="shrink-0 text-red-400" />
                <span>{error.message}</span>
              </div>
              <button
                type="button"
                onClick={clearError}
                className="text-zinc-400 hover:text-white p-1 rounded cursor-pointer min-h-[28px] min-w-[28px] flex items-center justify-center"
                title="Cerrar aviso"
              >
                <X size={12} />
              </button>
            </div>
            {error.details && (
              <p className="text-[10px] text-zinc-300 leading-relaxed">
                {error.details}
              </p>
            )}
            {error.actionUrl && (
              <a
                href={error.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-mono underline underline-offset-2 pt-0.5"
              >
                <span>Abrir Firebase Console</span>
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      <motion.button
        whileTap={{ scale: 0.98 }}
        whileHover={{ scale: 1.01 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        type="button"
        onClick={() => login()}
        className="w-full min-h-[44px] flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#0d0d11] hover:bg-[#141419] border border-white/10 hover:border-white/20 text-xs font-medium text-[#e4e4e7] hover:text-white transition-all cursor-pointer shadow-xs select-none"
      >
        {/* Google SVG Icon */}
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="#EA4335"
            d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
          />
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
          />
          <path
            fill="#FBBC05"
            d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 10.8 0 12.5s.7 2.8 1.9 5.2l3.7-2.9z"
          />
          <path
            fill="#34A853"
            d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"
          />
        </svg>
        <span>Iniciar sesión con Google</span>
      </motion.button>

      {error && (
        <div className="w-full p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-left flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-center gap-1.5 text-red-400 font-mono text-[11px] font-semibold">
              <AlertTriangle size={13} className="shrink-0 text-red-400" />
              <span>{error.message}</span>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="text-zinc-400 hover:text-white p-1 rounded cursor-pointer min-h-[28px] min-w-[28px] flex items-center justify-center"
              title="Cerrar aviso"
            >
              <X size={12} />
            </button>
          </div>
          {error.details && (
            <p className="text-[10px] text-zinc-300 leading-relaxed font-sans">
              {error.details}
            </p>
          )}
          {error.actionUrl && (
            <a
              href={error.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-mono underline underline-offset-2 pt-0.5"
            >
              <span>Abrir Firebase Console</span>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}
    </div>
  );
};
