export let wakeLockSentinel: any = null;

export async function requestScreenWakeLock() {
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
    }
  } catch (err) {
    console.debug('[WakeLock] Ignored or unsupported:', err);
  }
}

export function releaseScreenWakeLock() {
  try {
    if (wakeLockSentinel) {
      wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch {
    wakeLockSentinel = null;
  }
}

export async function notifyGenerationComplete(wordCount: number) {
  // 1. Tactile feedback (Vibration API)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([60, 80, 60]); // Subtle double pulse
    } catch {}
  }

  // 2. Browser notification (only if tab is hidden / backgrounded)
  if (
    typeof document !== 'undefined' &&
    document.hidden &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification('Kizuna-Zek: Escena completada', {
        body: `La IA terminó de redactar la escena (${wordCount} palabras).`,
        icon: '/favicon.ico',
      });
    } catch (err) {
      console.debug('[Notification] Failed:', err);
    }
  }
}

export function requestNotificationAccess() {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
    try {
      Notification.requestPermission().catch(() => {});
    } catch {}
  }
}
