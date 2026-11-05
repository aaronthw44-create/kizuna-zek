import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="bg-zinc-900/95 border-b border-zinc-800/80 text-zinc-300 text-xs py-2 px-4 flex items-center justify-between backdrop-blur-md z-50 shrink-0 select-none animate-in fade-in duration-200">
      <div className="flex items-center gap-2 max-w-full overflow-hidden">
        <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="truncate font-medium text-[13px] md:text-xs">
          Modo Sin Conexión — Tus borradores y datos siguen a salvo localmente. Conéctate a internet para interactuar con la IA.
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-wider font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0 ml-2 hidden sm:inline-block">
        Offline
      </span>
    </div>
  );
};
