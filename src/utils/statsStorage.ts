import { AppStatistics } from '../types';

const STATS_KEY = 'kizuna_zek_stats_v2';
const SESSION_LAUNCH_RECORDED_KEY = 'kizuna_zek_session_launched';

export function getLocalDateKey(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function loadStatistics(): AppStatistics {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const alreadyLaunchedThisSession =
      typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_LAUNCH_RECORDED_KEY) === '1';

    if (raw) {
      const parsed = JSON.parse(raw);
      const isLegacySeed = parsed.totalInputTokens === 1245000 && parsed.totalOutputTokens === 64300;
      if (!isLegacySeed) {
        const nextLaunchCount = alreadyLaunchedThisSession
          ? (parsed.appLaunchCount || 1)
          : (parsed.appLaunchCount || 1) + 1;

        if (!alreadyLaunchedThisSession && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(SESSION_LAUNCH_RECORDED_KEY, '1');
        }

        const loaded: AppStatistics = {
          totalInputTokens: typeof parsed.totalInputTokens === 'number' ? parsed.totalInputTokens : 0,
          totalOutputTokens: typeof parsed.totalOutputTokens === 'number' ? parsed.totalOutputTokens : 0,
          totalCachedTokens: typeof parsed.totalCachedTokens === 'number' ? parsed.totalCachedTokens : 0,
          appLaunchCount: nextLaunchCount,
          dailyActivity: parsed.dailyActivity && typeof parsed.dailyActivity === 'object' ? parsed.dailyActivity : {},
        };
        if (!alreadyLaunchedThisSession) {
          saveStatistics(loaded);
        }
        return loaded;
      }
    }
  } catch (e) {
    console.error('Error loading statistics:', e);
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(SESSION_LAUNCH_RECORDED_KEY, '1');
  }

  const initial: AppStatistics = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    appLaunchCount: 1,
    dailyActivity: {},
  };
  saveStatistics(initial);
  return initial;
}

export function saveStatistics(stats: AppStatistics): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Error saving statistics:', e);
  }
}

export function resetStatistics(): AppStatistics {
  const clean: AppStatistics = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    appLaunchCount: 1,
    dailyActivity: {},
  };
  saveStatistics(clean);
  return clean;
}

export function recordMessageActivity(inputTokens: number = 0, outputTokens: number = 0, cachedTokens: number = 0): void {
  try {
    const current = loadStatistics();
    const todayKey = getLocalDateKey(new Date());

    const updatedActivity = {
      ...current.dailyActivity,
      [todayKey]: (current.dailyActivity[todayKey] || 0) + 1,
    };

    const updated: AppStatistics = {
      ...current,
      totalInputTokens: current.totalInputTokens + Math.max(0, inputTokens),
      totalOutputTokens: current.totalOutputTokens + Math.max(0, outputTokens),
      totalCachedTokens: (current.totalCachedTokens || 0) + Math.max(0, cachedTokens),
      dailyActivity: updatedActivity,
    };

    saveStatistics(updated);
  } catch (e) {
    console.error('Error recording message activity:', e);
  }
}

export function formatTokenNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return (num || 0).toLocaleString();
}
