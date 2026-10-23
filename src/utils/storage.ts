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
  try {
    localStorage.setItem(LORE_KEY, JSON.stringify(files));
    // Also save in background to IndexedDB for offline persistence
    idbSaveAll('lore_files', files).catch((err) => {
      console.warn('Background IDB lore save failed:', err);
    });
  } catch (e) {
    console.error('Failed to save lore files:', e);
  }
}

export function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) {
      saveChats(INITIAL_CHATS);
      return INITIAL_CHATS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load chats:', e);
    return INITIAL_CHATS;
  }
}

export function saveChats(chats: Chat[]): void {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch {
    // If quota exceeded (e.g. large base64 attachments in chat), strip large dataUrls to save text chat safely
    try {
      const sanitized = chats.map((c) => ({
        ...c,
        messages: c.messages.map((m) => ({
          ...m,
          attachments: m.attachments?.map((att) => ({
            ...att,
            dataUrl: att.dataUrl && att.dataUrl.length > 50000 ? '' : att.dataUrl,
          })),
        })),
      }));
      localStorage.setItem(CHATS_KEY, JSON.stringify(sanitized));
    } catch {
      // Storage quota reached, fail gracefully without console pollution
    }
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      saveSettings(INITIAL_SETTINGS);
      return INITIAL_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    const geminiModel =
      parsed.geminiModel === 'gemini-2.5-flash' ||
      parsed.geminiModel === 'gemini-2.0-flash' ||
      parsed.geminiModel === 'gemini-1.5-flash' ||
      parsed.geminiModel === 'gemini-pro' ||
      !parsed.geminiModel
        ? 'gemini-3.6-flash'
        : parsed.geminiModel;
    return {
      ...INITIAL_SETTINGS,
      ...parsed,
      geminiModel,
      favoriteModelIds: Array.isArray(parsed.favoriteModelIds) ? parsed.favoriteModelIds : [],
      favoriteAlibabaModelIds: Array.isArray(parsed.favoriteAlibabaModelIds) && parsed.favoriteAlibabaModelIds.length > 0
        ? parsed.favoriteAlibabaModelIds.filter((m: string) => !/deepseek|qwen2\.5|qwen-long/i.test(m)).map((m: string) => m === 'qwen-3.8-max' ? 'qwen3.8-max' : m === 'qwen-3.8-flash' ? 'qwen3.8-flash' : m === 'kimi/kimi-k3' ? 'kimi-k3' : m)
        : ['qwen3.8-omni-flash', 'kimi-k3', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.8-plus', 'qwen-plus'],
      fetchedAlibabaModels: Array.isArray(parsed.fetchedAlibabaModels) ? parsed.fetchedAlibabaModels : [],
      alibabaBaseUrl: (parsed.alibabaApiKey && !parsed.alibabaApiKey.trim().startsWith('sk-ws-'))
        ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
        : (parsed.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'),
      alibabaModel: (parsed.alibabaModel === 'deepseek-k3' || parsed.alibabaModel === 'deepseek-r1' || parsed.alibabaModel === 'deepseek-v3' || parsed.alibabaModel === 'qwen-long' || !parsed.alibabaModel || parsed.alibabaModel === 'qwen-3.8-max')
        ? 'qwen3.8-max'
        : (parsed.alibabaModel === 'qwen-3.8-flash' ? 'qwen3.8-flash' : parsed.alibabaModel === 'kimi/kimi-k3' ? 'kimi-k3' : parsed.alibabaModel),
      alibabaCustomLoraModel: typeof parsed.alibabaCustomLoraModel === 'string' ? parsed.alibabaCustomLoraModel : '',
      alibabaCustomLoraName: typeof parsed.alibabaCustomLoraName === 'string' ? parsed.alibabaCustomLoraName : '',
      maxOutputTokens: (!parsed.maxOutputTokens || parsed.maxOutputTokens <= 1500) ? 8192 : parsed.maxOutputTokens,
    };
  } catch (e) {
    console.error('Failed to load settings:', e);
    return INITIAL_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export function loadSessionMedia(): Attachment[] {
  try {
    const raw = sessionStorage.getItem(MEDIA_KEY) || localStorage.getItem(MEDIA_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function loadSessionMediaFromIDB(): Promise<Attachment[] | null> {
  try {
    const idbData = await idbGetAll<Attachment>('media_files');
    if (idbData && idbData.length > 0) {
      return idbData;
    }
  } catch (e) {
    console.warn('IDB media read fallback:', e);
  }
  return null;
}

export function saveSessionMedia(media: Attachment[]): void {
  // Always persist binary media/images to IndexedDB (virtually unlimited quota)
  idbSaveAll('media_files', media).catch(() => {
    // Graceful IDB background sync
  });

  try {
    // Keep only lightweight entries in sessionStorage/localStorage to avoid 5MB quota exhaustion
    const lightweightMedia = media.slice(0, 10).map((m) => ({
      ...m,
      dataUrl: m.dataUrl && m.dataUrl.length > 50000 ? '' : m.dataUrl,
    }));
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

export function exportFullBackupJSON(): void {
  const folders = loadFolders();
  const loreFiles = loadLoreFiles();
  const chats = loadChats();
  const settings = loadSettings();
  const sessionMedia = loadSessionMedia();

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
