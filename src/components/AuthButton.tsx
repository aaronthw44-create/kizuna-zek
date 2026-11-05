import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { LogOut, Loader2, User as UserIcon, AlertTriangle, ExternalLink, X, Cloud, Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface AuthButtonProps {
  className?: string;
  onOpenSettings?: () => void;
}

export const AuthButton: React.FC<AuthButtonProps> = ({ className = '', onOpenSettings }) => {
  const { user, loading, login, logout, error, clearError } = useAuth();
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [syncStatsLabel, setSyncStatsLabel] = useState<string>('Sincronizado');

  useEffect(() => {
    const handleSyncStatus = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (detail.status === 'syncing') {
        setSyncState('syncing');
        if (detail.label) setSyncStatsLabel(detail.label);
      } else if (detail.status === 'done') {
        setSyncState('done');
        if (detail.label) setSyncStatsLabel(detail.label);
        setTimeout(() => setSyncState('idle'), 3500);
      } else {
        setSyncState('idle');
      }
    };
    window.addEventListener('kizuna:cloud-sync-status', handleSyncStatus);
    return () => window.removeEventListener('kizuna:cloud-sync-status', handleSyncStatus);
  }, []);

  if (loading) {
    return (
      <div
        className={`w-full min-h-[42px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#0d0d11] border border-zinc-200 dark:border-white/10 text-xs font-mono text-zinc-600 dark:text-[#a1a1aa] ${className}`}
      >
        <Loader2 size={14} className="animate-spin text-zinc-600 dark:text-white/70" />
        <span>Conectando nube...</span>
      </div>
    );
  }

  if (user) {
    const displayName = user.displayName || user.email?.split('@')[0] || 'Usuario';

    return (
      <div className={`w-full flex flex-col gap-1.5 ${className}`}>
        <div className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-white dark:bg-[#0d0d11] border border-zinc-200 dark:border-white/10 shadow-xs">
          {/* User Profile + Cloud Sync Status */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {user.photoURL && user.photoURL.trim() ? (
              <img
                src={user.photoURL}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full object-cover shrink-0 border border-zinc-200 dark:border-white/15"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-300 dark:border-white/15 flex items-center justify-center shrink-0 text-white font-mono text-xs">
                {displayName.charAt(0).toUpperCase() || <UserIcon size={13} />}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-zinc-900 dark:text-white truncate leading-tight">
                {displayName}
              </span>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('kizuna:cloud-sync-now'));
                }}
                disabled={syncState === 'syncing'}
                className="flex items-center gap-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer truncate leading-tight mt-0.5"
                title="Toca para sincronizar chats, carpetas, lore y memorias con Firebase"
              >
                {syncState === 'syncing' ? (
                  <Loader2 size={10} className="animate-spin shrink-0" />
                ) : syncState === 'done' ? (
                  <Check size={10} className="shrink-0" />
                ) : (
                  <Cloud size={10} className="shrink-0" />
                )}
                <span className="truncate">
                  {syncState === 'syncing' ? 'Sincronizando...' : `${syncStatsLabel} · Sincronizar`}
                </span>
              </button>
            </div>
          </div>

          {/* Right Actions: Sync Button & Logout */}
          <div className="flex items-center gap-1 shrink-0">
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={() => logout()}
              className="p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-500 dark:text-[#71717a] hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut size={14} />
            </motion.button>
          </div>
        </div>

        {error && (
          <div className="w-full p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 text-left flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-1">
              <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-mono text-[11px] font-semibold">
                <AlertTriangle size={13} className="shrink-0 text-red-600 dark:text-red-400" />
                <span>{error.message}</span>
              </div>
              <button
                type="button"
                onClick={clearError}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1 rounded cursor-pointer min-h-[28px] min-w-[28px] flex items-center justify-center"
                title="Cerrar aviso"
              >
                <X size={12} />
              </button>
            </div>
            {error.details && (
              <p className="text-[10px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
                {error.details}
              </p>
            )}
            {error.actionUrl && (
              <a
                href={error.actionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300 font-mono underline underline-offset-2 pt-0.5"
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
        className="w-full min-h-[44px] flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-lg bg-white dark:bg-[#0d0d11] hover:bg-zinc-100 dark:hover:bg-[#141419] border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 text-xs font-medium text-zinc-800 dark:text-[#e4e4e7] hover:text-zinc-950 dark:hover:text-white transition-all cursor-pointer shadow-xs select-none"
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
