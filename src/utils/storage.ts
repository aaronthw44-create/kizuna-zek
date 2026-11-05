import { Folder, LoreFile, Chat, AppSettings, Attachment } from '../types';
import { INITIAL_FOLDERS, INITIAL_LORE_FILES, INITIAL_SETTINGS, INITIAL_CHATS } from './initialData';
import { idbSaveAll, idbGetAll } from './indexedDB';

const FOLDERS_KEY = 'kizuna_zek_folders_v2';
const LORE_KEY = 'kizuna_zek_lore_v2';
const CHATS_KEY = 'kizuna_zek_chats_v2';
const SETTINGS_KEY = 'kizuna_zek_settings_v2';
const MEDIA_KEY = 'kizuna_zek_session_media_v2';

export function loadFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) {
      saveFolders(INITIAL_FOLDERS);
      return INITIAL_FOLDERS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load folders:', e);
    return INITIAL_FOLDERS;
  }
}

export function saveFolders(folders: Folder[]): void {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch (e) {
    console.error('Failed to save folders:', e);
  }
}

export function loadLoreFiles(): LoreFile[] {
  try {
    const raw = localStorage.getItem(LORE_KEY);
    if (!raw) {
      saveLoreFiles(INITIAL_LORE_FILES);
      return INITIAL_LORE_FILES;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load lore files:', e);
    return INITIAL_LORE_FILES;
  }
}

export async function loadLoreFilesFromIDB(): Promise<LoreFile[] | null> {
  try {
    const idbData = await idbGetAll<LoreFile>('lore_files');
    if (idbData && idbData.length > 0) {
      return idbData;
    }
  } catch (e) {
    console.warn('IDB lore read fallback:', e);
  }
  return null;
}

export function saveLoreFiles(files: LoreFile[]): void {
  // Always persist full lore files (including massive manuscripts & images) in IndexedDB first
  idbSaveAll('lore_files', files).catch((err) => {
    console.warn('Background IDB lore save failed:', err);
  });

  try {
    localStorage.setItem(LORE_KEY, JSON.stringify(files));
  } catch {
    try {
      const sanitized = files.map((f) => ({
        ...f,
        dataUrl: f.dataUrl && f.dataUrl.length > 50000 ? '' : f.dataUrl,
      }));
      localStorage.setItem(LORE_KEY, JSON.stringify(sanitized));
    } catch {
      // If localStorage is completely full, IndexedDB retains the full lore safely
    }
  }
}

export function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) {
      saveChats(INITIAL_CHATS);
      return INITIAL_CHATS;
    }
    const parsed: Chat[] = JSON.parse(raw);
    return parsed.map((c) => ({
      ...c,
      messages: (c.messages || []).map((m) =>
        m.isStreaming || m.isThinking
          ? {
              ...m,
              isStreaming: false,
              isThinking: false,
              isInterrupted: true,
            }
          : m
      ),
    }));
  } catch (e) {
    console.error('Failed to load chats:', e);
    return INITIAL_CHATS;
  }
}

export async function loadChatsFromIDB(): Promise<Chat[] | null> {
  try {
    const idbData = await idbGetAll<Chat>('chats');
    if (idbData && idbData.length > 0) {
      return idbData.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
  } catch (e) {
    console.warn('IDB chats read fallback:', e);
  }
  return null;
}

let idbChatsSaveTimer: ReturnType<typeof setTimeout> | null = null;
let localChatsSaveTimer: ReturnType<typeof setTimeout> | null = null;

function writeLightweightChatsToLocalStorage(chats: Chat[]): void {
  try {
    // Proactively strip inline Base64 dataUrls > 12KB from synchronous localStorage copy
    // (IndexedDB 'chats' and 'sessionMedia' stores hold full-resolution Base64 attachments)
    const lightweight = chats.map((c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.attachments && m.attachments.length > 0
          ? {
              ...m,
              attachments: m.attachments.map((att) =>
                att.dataUrl && att.dataUrl.length > 12000 ? { ...att, dataUrl: '' } : att
              ),
            }
          : m
      ),
    }));
    localStorage.setItem(CHATS_KEY, JSON.stringify(lightweight));
  } catch {
    // Storage quota reached, fail gracefully without console pollution
  }
}

export function saveChats(chats: Chat[], immediate = false): void {
  // Debounce heavy IndexedDB bulk transactions by 1.4s so mobile CPU/flash storage stays cool
  if (idbChatsSaveTimer) {
    clearTimeout(idbChatsSaveTimer);
  }
  idbChatsSaveTimer = setTimeout(() => {
    idbChatsSaveTimer = null;
    idbSaveAll('chats', chats).catch((err) => {
      console.warn('Background IDB chats save failed:', err);
    });
  }, 1400);

  if (localChatsSaveTimer) {
    clearTimeout(localChatsSaveTimer);
    localChatsSaveTimer = null;
  }

  if (immediate || (typeof document !== 'undefined' && document.hidden)) {
    writeLightweightChatsToLocalStorage(chats);
  } else {
    localChatsSaveTimer = setTimeout(() => {
      localChatsSaveTimer = null;
      writeLightweightChatsToLocalStorage(chats);
    }, 350);
  }
}

let latestSettingsCache: AppSettings | null = null;

export function getLatestSettingsSync(): AppSettings | null {
  return latestSettingsCache;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      saveSettings(INITIAL_SETTINGS);
      latestSettingsCache = INITIAL_SETTINGS;
      return INITIAL_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    const hasAlibabaKey = Boolean((parsed.alibabaApiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('kizuna_alibaba_api_key') : '') || '').trim());
    const effectiveProvider = (parsed.provider === 'alibaba' && !hasAlibabaKey) ? 'gemini' : (parsed.provider || 'gemini');
    const geminiModel =
      parsed.geminiModel === 'gemini-2.5-flash' ||
      parsed.geminiModel === 'gemini-2.0-flash' ||
      parsed.geminiModel === 'gemini-1.5-flash' ||
      parsed.geminiModel === 'gemini-pro' ||
      !parsed.geminiModel
        ? 'gemini-3.8-flash'
        : parsed.geminiModel;
    const loaded: AppSettings = {
      ...INITIAL_SETTINGS,
      ...parsed,
      provider: effectiveProvider,
      geminiModel,
      favoriteModelIds: Array.isArray(parsed.favoriteModelIds) ? parsed.favoriteModelIds : [],
      favoriteAlibabaModelIds: Array.isArray(parsed.favoriteAlibabaModelIds) && parsed.favoriteAlibabaModelIds.length > 0
        ? parsed.favoriteAlibabaModelIds
            .filter((m: string) => !/deepseek-(?:r1|v3|k3)|qwen2\.5|qwen-long|qwen-turbo/i.test(m))
            .map((m: string) => m === 'qwen-3.8-max' ? 'qwen3.8-max' : m === 'qwen-3.8-flash' ? 'qwen3.8-flash' : m === 'kimi/kimi-k3' ? 'kimi-k3' : m)
        : ['deepseek-v4-pro-0813', 'deepseek-v4.1-flash-1017', 'qwen3.8-max-0902', 'qwen3.8-omni-flash', 'kimi-k3', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.8-plus'],
      fetchedAlibabaModels: Array.isArray(parsed.fetchedAlibabaModels)
        ? parsed.fetchedAlibabaModels.filter((m: any) => !/deepseek-(?:r1|v3|k3)|qwen2\.5|qwen-long/i.test(m?.id || ''))
        : [],
      alibabaBaseUrl: parsed.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
      alibabaModel: (parsed.alibabaModel === 'deepseek-k3' || parsed.alibabaModel === 'deepseek-r1' || parsed.alibabaModel === 'deepseek-v3')
        ? 'deepseek-v4-pro-0813'
        : (parsed.alibabaModel === 'qwen-long' || !parsed.alibabaModel || parsed.alibabaModel === 'qwen-3.8-max')
          ? 'qwen3.8-max'
          : (parsed.alibabaModel === 'qwen-3.8-flash' ? 'qwen3.8-flash' : parsed.alibabaModel === 'kimi/kimi-k3' ? 'kimi-k3' : parsed.alibabaModel),
      alibabaCustomLoraModel: typeof parsed.alibabaCustomLoraModel === 'string' ? parsed.alibabaCustomLoraModel : '',
      alibabaCustomLoraName: typeof parsed.alibabaCustomLoraName === 'string' ? parsed.alibabaCustomLoraName : '',
      autoModelRouting: typeof parsed.autoModelRouting === 'boolean' ? parsed.autoModelRouting : true,
      maxOutputTokens: (!parsed.maxOutputTokens || parsed.maxOutputTokens <= 1500) ? 8192 : parsed.maxOutputTokens,
    };
    latestSettingsCache = loaded;
    return loaded;
  } catch (e) {
    console.error('Failed to load settings:', e);
    latestSettingsCache = INITIAL_SETTINGS;
    return INITIAL_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  latestSettingsCache = settings;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

const DELETED_MEDIA_IDS_KEY = 'kizuna_deleted_media_ids';
const MEDIA_VHASH_CACHE_KEY = 'kizuna_media_vhash_v1';

interface VisualFingerprint {
  ar: number;
  lums: number[]; // 64 grayscale luminance values (0..255) on an 8x8 grid
}

const memoryVHashCache = new Map<string, VisualFingerprint>();

function getStoredVHashCache(): Record<string, VisualFingerprint> {
  try {
    const raw = localStorage.getItem(MEDIA_VHASH_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredVHashCache(cache: Record<string, VisualFingerprint>): void {
  try {
    const keys = Object.keys(cache);
    if (keys.length > 200) {
      const trimmed: Record<string, VisualFingerprint> = {};
      keys.slice(-150).forEach((k) => {
        trimmed[k] = cache[k];
      });
      localStorage.setItem(MEDIA_VHASH_CACHE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(MEDIA_VHASH_CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    // Ignore storage quota issues for cache
  }
}

export function loadDeletedMediaIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_MEDIA_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function addDeletedMediaIds(ids: string[]): void {
  if (!ids || ids.length === 0) return;
  try {
    const current = loadDeletedMediaIds();
    ids.forEach((id) => {
      if (id) current.add(id);
    });
    const arr = Array.from(current).slice(-500);
    localStorage.setItem(DELETED_MEDIA_IDS_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage error
  }
}

export function deduplicateSessionMediaSync(media: Attachment[]): Attachment[] {
  const deletedIds = loadDeletedMediaIds();
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const result: Attachment[] = [];

  for (const m of media || []) {
    if (!m || !m.id || deletedIds.has(m.id) || seenIds.has(m.id)) continue;
    const urlKey = (m.videoUrl && m.videoUrl.trim()) || (m.dataUrl && m.dataUrl.trim()) || '';
    if (!urlKey) continue;
    // Fast exact signature: length + middle/tail slice for dataUrls so identical base64 strings never duplicate
    const fastUrlSig =
      urlKey.length > 512
        ? `${urlKey.length}:${urlKey.slice(0, 96)}:${urlKey.slice(Math.floor(urlKey.length / 2), Math.floor(urlKey.length / 2) + 96)}:${urlKey.slice(-96)}`
        : urlKey;
    if (seenUrls.has(fastUrlSig)) {
      addDeletedMediaIds([m.id]);
      continue;
    }
    seenIds.add(m.id);
    seenUrls.add(fastUrlSig);
    result.push(m);
  }
  return result;
}

async function computeVisualFingerprint(att: Attachment, storedCache: Record<string, VisualFingerprint>): Promise<VisualFingerprint | null> {
  if (!att.dataUrl || (!att.type?.startsWith('image/') && att.fileType !== 'image' && !att.dataUrl.startsWith('data:image/'))) {
    return null;
  }
  if (memoryVHashCache.has(att.id)) {
    return memoryVHashCache.get(att.id)!;
  }
  if (storedCache[att.id] && Array.isArray(storedCache[att.id].lums) && storedCache[att.id].lums.length === 64) {
    memoryVHashCache.set(att.id, storedCache[att.id]);
    return storedCache[att.id];
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => resolve(null), 2500);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 8, 8);
        const data = ctx.getImageData(0, 0, 8, 8).data;
        const lums: number[] = [];
        for (let i = 0; i < 64; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          lums.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
        }
        const fp: VisualFingerprint = {
          ar: Number((w / h).toFixed(3)),
          lums,
        };
        memoryVHashCache.set(att.id, fp);
        storedCache[att.id] = fp;
        resolve(fp);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    img.src = att.dataUrl;
  });
}

function areVisualFingerprintsDuplicate(a: VisualFingerprint, b: VisualFingerprint): boolean {
  if (Math.abs(a.ar - b.ar) > 0.045) return false;
  if (a.lums.length !== 64 || b.lums.length !== 64) return false;
  let totalDiff = 0;
  for (let i = 0; i < 64; i++) {
    totalDiff += Math.abs(a.lums[i] - b.lums[i]);
  }
  const meanAbsDiff = totalDiff / 64;
  return meanAbsDiff <= 6.5;
}

export async function deduplicateSessionMediaVisual(media: Attachment[]): Promise<{
  deduplicated: Attachment[];
  removedIds: string[];
}> {
  const syncClean = deduplicateSessionMediaSync(media);
  if (syncClean.length <= 1 || typeof document === 'undefined') {
    return { deduplicated: syncClean, removedIds: [] };
  }

  const storedCache = getStoredVHashCache();
  let cacheDirty = false;
  const kept: Attachment[] = [];
  const keptFingerprints: VisualFingerprint[] = [];
  const removedIds: string[] = [];

  for (const item of syncClean) {
    const hadCached = Boolean(storedCache[item.id]);
    const fp = await computeVisualFingerprint(item, storedCache);
    if (!hadCached && fp) cacheDirty = true;

    if (fp) {
      const isDup = keptFingerprints.some((existingFp) => areVisualFingerprintsDuplicate(existingFp, fp));
      if (isDup) {
        removedIds.push(item.id);
        continue;
      }
      keptFingerprints.push(fp);
    }
    kept.push(item);
  }

  if (cacheDirty) {
    saveStoredVHashCache(storedCache);
  }
  if (removedIds.length > 0) {
    addDeletedMediaIds(removedIds);
  }

  return { deduplicated: kept, removedIds };
}

export function loadSessionMedia(): Attachment[] {
  try {
    const raw = sessionStorage.getItem(MEDIA_KEY) || localStorage.getItem(MEDIA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((m: Attachment) => Boolean((m.dataUrl && m.dataUrl.trim()) || (m.videoUrl && m.videoUrl.trim())));
    return deduplicateSessionMediaSync(valid);
  } catch {
    return [];
  }
}

export async function loadSessionMediaFromIDB(): Promise<Attachment[] | null> {
  try {
    const idbData = await idbGetAll<Attachment>('media_files');
    if (idbData && idbData.length > 0) {
      const valid = idbData
        .filter((m) => Boolean((m.dataUrl && m.dataUrl.trim()) || (m.videoUrl && m.videoUrl.trim())))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      return deduplicateSessionMediaSync(valid);
    }
  } catch (e) {
    console.warn('IDB media read fallback:', e);
  }
  return null;
}

export function saveSessionMedia(media: Attachment[]): void {
  const validMedia = deduplicateSessionMediaSync(
    (media || []).filter((m) => Boolean((m.dataUrl && m.dataUrl.trim()) || (m.videoUrl && m.videoUrl.trim())))
  );
  // Always persist binary media/images to IndexedDB (virtually unlimited quota)
  idbSaveAll('media_files', validMedia).catch(() => {
    // Graceful IDB background sync
  });

  try {
    // Keep only entries that fit in localStorage without saving blank ghost objects
    const lightweightMedia = validMedia
      .filter((m) => (!m.dataUrl || m.dataUrl.length <= 120000) || Boolean(m.videoUrl))
      .slice(0, 12);
    sessionStorage.setItem(MEDIA_KEY, JSON.stringify(lightweightMedia));
    localStorage.setItem(MEDIA_KEY, JSON.stringify(lightweightMedia));
  } catch {
    // Quota reached in web storage, IndexedDB retains the full payload safely
  }
}

export function exportChatAsMarkdown(
  chat: Chat,
  folder?: Folder,
  loreFiles?: LoreFile[]
): void {
  const dateStr = new Date(chat.createdAt).toISOString().split('T')[0];
  let md = `# ${chat.title}\n`;
  md += `*Exportado desde Kizuna-Zek el ${new Date().toLocaleString()}*\n\n`;

  if (folder) {
    md += `### Entorno / Arco: ${folder.name}\n`;
    if (folder.systemPrompt) {
      md += `> **Directivas del Sistema:**\n> ${folder.systemPrompt.replace(/\n/g, '\n> ')}\n\n`;
    }
  }

  if (loreFiles && loreFiles.length > 0) {
    md += `### Archivos de Lore Activos (${loreFiles.length})\n`;
    loreFiles.forEach((file) => {
      md += `- **${file.title}** (\`${file.filename}\` - ${file.wordCount} palabras)\n`;
    });
    md += `\n---\n\n`;
  }

  md += `## Historial de la Conversación\n\n`;

  chat.messages.forEach((msg) => {
    const roleName = msg.role === 'user' ? 'USUARIO' : 'KIZUNA-ZEK';
    const time = new Date(msg.timestamp).toLocaleTimeString();
    md += `### [${roleName}] — ${time}\n\n`;

    if (msg.attachments && msg.attachments.length > 0) {
      md += `*Adjuntos:* ${msg.attachments.map((a) => `[${a.name}]`).join(', ')}\n\n`;
    }

    md += `${msg.content}\n\n`;
    md += `---\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${chat.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${dateStr}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface KizunaBackupData {
  app: string;
  version: string;
  exportedAt: number;
  folders: Folder[];
  loreFiles: LoreFile[];
  chats: Chat[];
  settings: AppSettings;
  sessionMedia: Attachment[];
}

export async function exportFullBackupJSON(): Promise<void> {
  const folders = loadFolders();
  const [idbLore, idbChats, idbMedia] = await Promise.all([
    loadLoreFilesFromIDB(),
    loadChatsFromIDB(),
    loadSessionMediaFromIDB(),
  ]);
  const loreFiles = idbLore && idbLore.length > 0 ? idbLore : loadLoreFiles();
  const chats = idbChats && idbChats.length > 0 ? idbChats : loadChats();
  const settings = loadSettings();
  const sessionMedia = idbMedia && idbMedia.length > 0 ? idbMedia : loadSessionMedia();

  const backupData: KizunaBackupData = {
    app: 'Kizuna-Zek',
    version: '2.0',
    exportedAt: Date.now(),
    folders,
    loreFiles,
    chats,
    settings,
    sessionMedia,
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importFullBackupJSON(jsonText: string): {
  folders: Folder[];
  loreFiles: LoreFile[];
  chats: Chat[];
  settings: AppSettings;
  sessionMedia: Attachment[];
} {
  const data = JSON.parse(jsonText);
  if (!data || typeof data !== 'object') {
    throw new Error('El archivo no contiene un objeto JSON válido.');
  }

  const folders: Folder[] = Array.isArray(data.folders) ? data.folders : [];
  const loreFiles: LoreFile[] = Array.isArray(data.loreFiles) ? data.loreFiles : [];
  const chats: Chat[] = Array.isArray(data.chats) ? data.chats : [];
  const settings: AppSettings =
    data.settings && typeof data.settings === 'object'
      ? { ...loadSettings(), ...data.settings }
      : loadSettings();
  const sessionMedia: Attachment[] = Array.isArray(data.sessionMedia) ? data.sessionMedia : [];

  saveFolders(folders);
  saveLoreFiles(loreFiles);
  saveChats(chats);
  saveSettings(settings);
  saveSessionMedia(sessionMedia);

  return { folders, loreFiles, chats, settings, sessionMedia };
}
