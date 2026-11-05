export let wakeLockSentinel: any = null;
let webLockResolver: (() => void) | null = null;
let bgAudioCtx: AudioContext | null = null;
let bgOscillator: OscillatorNode | null = null;

const PENDING_BG_JOB_KEY = 'kizuna_pending_bg_job';

export interface PendingBackgroundJob {
  jobId: string;
  chatId: string;
  startedAt: number;
}

export function savePendingBackgroundJob(job: PendingBackgroundJob) {
  try {
    localStorage.setItem(PENDING_BG_JOB_KEY, JSON.stringify(job));
  } catch {}
}

export function getPendingBackgroundJob(): PendingBackgroundJob | null {
  try {
    const raw = localStorage.getItem(PENDING_BG_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.jobId && parsed.chatId) {
      // Only valid if created within the last 30 minutes
      if (Date.now() - (parsed.startedAt || 0) < 30 * 60 * 1000) {
        return parsed;
      }
    }
  } catch {}
  return null;
}

export function clearPendingBackgroundJob() {
  try {
    localStorage.removeItem(PENDING_BG_JOB_KEY);
  } catch {}
}

export async function fetchBackgroundJobFromServer(jobId: string): Promise<{
  found: boolean;
  job?: {
    jobId: string;
    text: string;
    reasoning: string;
    sources?: any[];
    ttftSeconds?: number;
    cachedTokens?: number;
    completionTokens?: number;
    truncated?: boolean;
    done: boolean;
    error?: string;
    updatedAt: number;
  };
}> {
  try {
    const res = await fetch(`/api/chat/job/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { found: false };
    return await res.json();
  } catch {
    return { found: false };
  }
}

function startSilentBackgroundKeepAlive() {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!bgAudioCtx || bgAudioCtx.state === 'closed') {
      bgAudioCtx = new AudioCtx();
    }
    if (bgAudioCtx && bgAudioCtx.state === 'suspended') {
      bgAudioCtx.resume().catch(() => {});
    }
    if (bgAudioCtx && !bgOscillator) {
      const osc = bgAudioCtx.createOscillator();
      const gain = bgAudioCtx.createGain();
      // Completely inaudible (0.00001) — keeps mobile browser JS & network socket alive while watching YouTube or screen off
      gain.gain.value = 0.00001;
      osc.frequency.value = 1;
      osc.connect(gain);
      gain.connect(bgAudioCtx.destination);
      osc.start();
      bgOscillator = osc;
    }
  } catch {}
}

function stopSilentBackgroundKeepAlive() {
  try {
    if (bgOscillator) {
      bgOscillator.stop();
      bgOscillator.disconnect();
      bgOscillator = null;
    }
    if (bgAudioCtx && bgAudioCtx.state !== 'closed') {
      bgAudioCtx.suspend().catch(() => {});
    }
  } catch {
    bgOscillator = null;
  }
}

export async function requestScreenWakeLock() {
  // 1. Screen Wake Lock
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
    }
  } catch (err) {
    console.debug('[WakeLock] Ignored or unsupported:', err);
  }

  // 2. Web Locks API (prevents background tab freezing in Chromium/Android while generation is active)
  try {
    if (typeof navigator !== 'undefined' && 'locks' in navigator && !webLockResolver) {
      (navigator as any).locks
        .request('kizuna_active_generation', () => {
          return new Promise<void>((resolve) => {
            webLockResolver = resolve;
          });
        })
        .catch(() => {});
    }
  } catch {}

  // 3. Silent Audio Keep-Alive (prevents mobile OS from suspending fetch stream while in YouTube or screen locked)
  startSilentBackgroundKeepAlive();
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

  try {
    if (webLockResolver) {
      webLockResolver();
      webLockResolver = null;
    }
  } catch {
    webLockResolver = null;
  }

  stopSilentBackgroundKeepAlive();
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
      new Notification('Kizuna-Zek: Respuesta lista', {
        body: `El modelo terminó de escribir en segundo plano (${wordCount} palabras).`,
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

