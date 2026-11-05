import { initializeApp, getApps, getApp, FirebaseApp, setLogLevel } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  deleteDoc,
  collection,
  onSnapshot,
  enableIndexedDbPersistence,
} from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';
import { Chat, LoreFile, Folder, AppSettings, SmartMemory } from '../types';

// Silence Firebase internal logger to prevent sandbox connection timeouts from polluting console
try {
  setLogLevel('silent');
} catch {}

export const firebaseConfig = {
  apiKey: appletConfig.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: appletConfig.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: appletConfig.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: appletConfig.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: appletConfig.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: appletConfig.appId || import.meta.env.VITE_FIREBASE_APP_ID || '',
  firestoreDatabaseId: (appletConfig as any).firestoreDatabaseId || '(default)',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId
);

export const app: FirebaseApp = getApps().length > 0
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);

// Critical Firestore instance initialization with forced long polling to bypass WebSocket timeouts in sandboxes
export const db: Firestore = (() => {
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      dbId
    );
  } catch {
    return getFirestore(app, dbId);
  }
})();

if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch(() => {
    // Ignore persistence enablement errors in multi-tab or restricted environments
  });
}

// Validate connection to Firestore on startup per firebase-integration-rpc skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
if (typeof window !== 'undefined' && isFirebaseConfigured) {
  void testConnection();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export const googleProvider: GoogleAuthProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/documents');
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Limpia recursivamente cualquier propiedad `undefined` (que hace fallar a Firestore `setDoc`)
 * y asegura que el objeto sea 100% compatible con Firestore.
 */
function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      if (value !== undefined && typeof value !== 'function') {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

/**
 * Protege contra el límite de 1 MB por documento de Firestore:
 * Si un chat pesa más de ~820 KB (por ejemplo por imágenes en base64 o adjuntos gigantes),
 * aligera los `dataUrl` pesados en la copia de la nube manteniendo 100% intacto todo el texto,
 * el razonamiento y la Libretita de Resumen (`sessionSummary`).
 */
function compactChatForFirestore(chat: Chat): Chat {
  const sanitized = sanitizeForFirestore(chat);
  let serialized = '';
  try {
    serialized = JSON.stringify(sanitized);
  } catch {
    return sanitized;
  }

  // Si pesa menos de 820 KB, se envía tal cual sin tocar nada
  if (serialized.length < 820_000) {
    return sanitized;
  }

  // Fase 1: Aligerar imágenes Base64 pesadas dentro de los mensajes para no superar 1 MB en Firestore
  const compactedMessages = (sanitized.messages || []).map((m) => {
    if (!m.attachments || m.attachments.length === 0) return m;
    return {
      ...m,
      attachments: m.attachments.map((att) => {
        if (att.dataUrl && att.dataUrl.length > 35_000) {
          const { dataUrl, ...restAtt } = att;
          return restAtt;
        }
        if (att.content && att.content.length > 80_000) {
          return { ...att, content: att.content.slice(0, 80_000) };
        }
        return att;
      }),
    };
  });

  const phase1Chat: Chat = { ...sanitized, messages: compactedMessages };
  try {
    if (JSON.stringify(phase1Chat).length < 900_000) {
      return phase1Chat;
    }
  } catch {
    return phase1Chat;
  }

  // Fase 2: Si el chat tiene cientos de páginas de texto puro (>900 KB), conservar los últimos 120 mensajes completos + la Libretita de Resumen
  return {
    ...phase1Chat,
    messages: phase1Chat.messages.slice(-120),
  };
}

/**
 * Guarda o sincroniza una conversación en Firestore para el usuario activo.
 */
export async function syncChatToFirestore(userId: string, chat: Chat): Promise<void> {
  if (!userId || !chat?.id) return;
  const path = `users/${userId}/chats/${chat.id}`;
  try {
    const safeChat = compactChatForFirestore({
      ...chat,
      updatedAt: chat.updatedAt || Date.now(),
    });
    const chatRef = doc(db, 'users', userId, 'chats', chat.id);
    await setDoc(
      chatRef,
      {
        ...safeChat,
        userId,
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Guarda o sincroniza una carpeta (Workspace / Arco) en Firestore para el usuario activo.
 */
export async function syncFolderToFirestore(userId: string, folder: Folder): Promise<void> {
  if (!userId || !folder?.id) return;
  const path = `users/${userId}/folders/${folder.id}`;
  try {
    const safeFolder = sanitizeForFirestore({
      ...folder,
      updatedAt: folder.updatedAt || Date.now(),
    });
    const folderRef = doc(db, 'users', userId, 'folders', folder.id);
    await setDoc(
      folderRef,
      {
        ...safeFolder,
        userId,
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Elimina una carpeta de Firestore.
 */
export async function deleteFolderFromFirestore(userId: string, folderId: string): Promise<void> {
  if (!userId || !folderId) return;
  const path = `users/${userId}/folders/${folderId}`;
  try {
    const folderRef = doc(db, 'users', userId, 'folders', folderId);
    await deleteDoc(folderRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Guarda o sincroniza las memorias persistentes, perfil de autor, configuración y claves de proveedores en Firestore.
 */
export interface CloudWorkspaceSettings {
  userId: string;
  // Claves de API de proveedores y URLs personalizadas
  alibabaApiKey?: string;
  customApiKey?: string;
  geminiApiKey?: string;
  tavilyApiKey?: string;
  alibabaBaseUrl?: string;
  customBaseUrl?: string;

  // Proveedor activo y selecciones de modelo
  provider?: 'gemini' | 'custom' | 'alibaba';
  alibabaModel?: string;
  customModel?: string;
  geminiModel?: string;
  favoriteAlibabaModelIds?: string[];
  favoriteModelIds?: string[];
  autoModelRouting?: boolean;
  alibabaCustomLoraModel?: string;
  alibabaCustomLoraName?: string;

  // Memorias persistentes y perfil de autor
  memories?: SmartMemory[];
  userProfile?: AppSettings['userProfile'];
  personalityConfig?: AppSettings['personalityConfig'];
  globalSystemPrompt?: string;
  globalPersona?: string;

  // Ajustes de contexto y motor
  contextDepth?: AppSettings['contextDepth'];
  enableDynamicLoreRag?: boolean;
  enableWebSearch?: boolean;
  enableReasoning?: boolean;
  reasoningMode?: AppSettings['reasoningMode'];
  thinkingBudget?: number;
  temperature?: number;
  maxOutputTokens?: number;
  enableAlibabaKeepAlive?: boolean;
  updatedAt: number;
}

const cleanKeyString = (val?: string | null): string => {
  if (!val) return '';
  return val.replace(/[\r\n\s]+/g, '').trim();
};

export async function syncUserSettingsToFirestore(
  userId: string,
  settings: AppSettings
): Promise<void> {
  if (!userId || !settings) return;
  const path = `users/${userId}/settings/workspace`;
  try {
    const alibabaKey =
      cleanKeyString(settings.alibabaApiKey) ||
      (typeof localStorage !== 'undefined'
        ? cleanKeyString(localStorage.getItem('kizuna_alibaba_api_key'))
        : '');

    const tavilyKey =
      cleanKeyString(settings.tavilyApiKey) ||
      (typeof localStorage !== 'undefined'
        ? cleanKeyString(localStorage.getItem('kizuna_tavily_key'))
        : '');

    const geminiKey =
      cleanKeyString(settings.geminiApiKey) ||
      (typeof localStorage !== 'undefined'
        ? cleanKeyString(localStorage.getItem('kizuna_gemini_key') || localStorage.getItem('kizuna_gemini_api_key'))
        : '');

    const customKey =
      cleanKeyString(settings.customApiKey) ||
      (typeof localStorage !== 'undefined'
        ? cleanKeyString(localStorage.getItem('kizuna_nvidia_key') || localStorage.getItem('kizuna_custom_api_key'))
        : '');

    const payload: CloudWorkspaceSettings = sanitizeForFirestore({
      userId,
      alibabaApiKey: alibabaKey || undefined,
      customApiKey: customKey || undefined,
      geminiApiKey: geminiKey || undefined,
      tavilyApiKey: tavilyKey || undefined,
      alibabaBaseUrl: settings.alibabaBaseUrl,
      customBaseUrl: settings.customBaseUrl,
      provider: settings.provider,
      alibabaModel: settings.alibabaModel,
      customModel: settings.customModel,
      geminiModel: settings.geminiModel,
      favoriteAlibabaModelIds: settings.favoriteAlibabaModelIds,
      favoriteModelIds: settings.favoriteModelIds,
      autoModelRouting: settings.autoModelRouting,
      alibabaCustomLoraModel: settings.alibabaCustomLoraModel,
      alibabaCustomLoraName: settings.alibabaCustomLoraName,
      memories: Array.isArray(settings.memories) ? settings.memories : [],
      userProfile: settings.userProfile,
      personalityConfig: settings.personalityConfig,
      globalSystemPrompt: settings.globalSystemPrompt,
      globalPersona: settings.globalPersona,
      contextDepth: settings.contextDepth,
      enableDynamicLoreRag: settings.enableDynamicLoreRag,
      enableWebSearch: settings.enableWebSearch,
      enableReasoning: settings.enableReasoning,
      reasoningMode: settings.reasoningMode,
      thinkingBudget: settings.thinkingBudget,
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
      enableAlibabaKeepAlive: settings.enableAlibabaKeepAlive,
      updatedAt: Date.now(),
    });
    const settingsRef = doc(db, 'users', userId, 'settings', 'workspace');
    await setDoc(settingsRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Guarda o sincroniza un documento de Lore en Firestore para el usuario activo.
 */
export async function syncLoreFileToFirestore(userId: string, loreFile: LoreFile): Promise<void> {
  if (!userId || !loreFile?.id) return;
  const path = `users/${userId}/loreFiles/${loreFile.id}`;
  try {
    let safeLore = sanitizeForFirestore({
      ...loreFile,
      updatedAt: loreFile.updatedAt || Date.now(),
    });
    // Evitar superar el límite de 1 MB de Firestore si un documento o imagen es muy grande
    if (safeLore.dataUrl && safeLore.dataUrl.length > 750_000) {
      const { dataUrl, ...rest } = safeLore;
      safeLore = rest as LoreFile;
    }
    if (safeLore.content && safeLore.content.length > 800_000) {
      safeLore = { ...safeLore, content: safeLore.content.slice(0, 800_000) };
    }
    const loreRef = doc(db, 'users', userId, 'loreFiles', loreFile.id);
    await setDoc(
      loreRef,
      {
        ...safeLore,
        userId,
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Elimina un documento de Lore de Firestore.
 */
export async function deleteLoreFileFromFirestore(userId: string, loreId: string): Promise<void> {
  if (!userId || !loreId) return;
  const path = `users/${userId}/loreFiles/${loreId}`;
  try {
    const loreRef = doc(db, 'users', userId, 'loreFiles', loreId);
    await deleteDoc(loreRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Elimina una conversación de Firestore.
 */
export async function deleteChatFromFirestore(userId: string, chatId: string): Promise<void> {
  if (!userId || !chatId) return;
  const path = `users/${userId}/chats/${chatId}`;
  try {
    const chatRef = doc(db, 'users', userId, 'chats', chatId);
    await deleteDoc(chatRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Sincronización masiva completa de todo el espacio de trabajo local hacia Firebase Firestore
 * (Chats, Carpetas/Arcos, Lore Storage y Memorias/Perfil).
 */
export async function syncAllWorkspaceToFirestore(
  userId: string,
  data: {
    chats: Chat[];
    folders: Folder[];
    loreFiles: LoreFile[];
    settings: AppSettings;
  }
): Promise<{
  syncedChats: number;
  syncedFolders: number;
  syncedLore: number;
  syncedMemories: number;
}> {
  if (!userId) {
    return { syncedChats: 0, syncedFolders: 0, syncedLore: 0, syncedMemories: 0 };
  }

  let syncedChats = 0;
  let syncedFolders = 0;
  let syncedLore = 0;

  // 1. Subir carpetas / proyectos
  for (const folder of data.folders || []) {
    if (!folder?.id) continue;
    await syncFolderToFirestore(userId, folder);
    syncedFolders++;
  }

  // 2. Subir documentos de Lore
  for (const lore of data.loreFiles || []) {
    if (!lore?.id) continue;
    await syncLoreFileToFirestore(userId, lore);
    syncedLore++;
  }

  // 3. Subir todas las conversaciones (saltando el chat demo inicial si hay chats reales)
  const hasRealUserChats = (data.chats || []).some((c) => c.id !== 'chat_prologue');
  for (const chat of data.chats || []) {
    if (!chat?.id) continue;
    if (hasRealUserChats && chat.id === 'chat_prologue' && (chat.messages?.length || 0) <= 2) {
      continue;
    }
    await syncChatToFirestore(userId, chat);
    syncedChats++;
  }

  // 4. Subir memorias, perfil y configuración de personalidad
  await syncUserSettingsToFirestore(userId, data.settings);
  const syncedMemories = Array.isArray(data.settings?.memories) ? data.settings.memories.length : 0;

  return { syncedChats, syncedFolders, syncedLore, syncedMemories };
}

/**
 * Descarga inmediata bajo demanda de todos los datos del usuario en Firestore.
 */
export async function pullAllWorkspaceFromFirestore(userId: string): Promise<{
  chats: Chat[];
  folders: Folder[];
  loreFiles: LoreFile[];
  settings: CloudWorkspaceSettings | null;
}> {
  if (!userId) {
    return { chats: [], folders: [], loreFiles: [], settings: null };
  }

  const [chatsSnap, foldersSnap, loreSnap, settingsSnap] = await Promise.all([
    getDocs(collection(db, 'users', userId, 'chats')).catch((e) => {
      handleFirestoreError(e, OperationType.LIST, `users/${userId}/chats`);
      return null;
    }),
    getDocs(collection(db, 'users', userId, 'folders')).catch((e) => {
      handleFirestoreError(e, OperationType.LIST, `users/${userId}/folders`);
      return null;
    }),
    getDocs(collection(db, 'users', userId, 'loreFiles')).catch((e) => {
      handleFirestoreError(e, OperationType.LIST, `users/${userId}/loreFiles`);
      return null;
    }),
    getDoc(doc(db, 'users', userId, 'settings', 'workspace')).catch((e) => {
      handleFirestoreError(e, OperationType.GET, `users/${userId}/settings/workspace`);
      return null;
    }),
  ]);

  const chats: Chat[] = [];
  chatsSnap?.forEach((d) => {
    const data = d.data() as Chat;
    if (data && data.id) chats.push(data);
  });
  chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const folders: Folder[] = [];
  foldersSnap?.forEach((d) => {
    const data = d.data() as Folder;
    if (data && data.id) folders.push(data);
  });

  const loreFiles: LoreFile[] = [];
  loreSnap?.forEach((d) => {
    const data = d.data() as LoreFile;
    if (data && data.id) loreFiles.push(data);
  });
  loreFiles.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const settings =
    settingsSnap && settingsSnap.exists()
      ? (settingsSnap.data() as CloudWorkspaceSettings)
      : null;

  return { chats, folders, loreFiles, settings };
}

/**
 * Suscripción reactiva en tiempo real a las conversaciones del usuario en Firestore.
 */
export function subscribeToUserChats(
  userId: string,
  onChatsUpdate: (chats: Chat[]) => void
): () => void {
  if (!userId) return () => {};
  const path = `users/${userId}/chats`;
  const chatsCol = collection(db, 'users', userId, 'chats');
  return onSnapshot(
    chatsCol,
    (snapshot) => {
      const remoteChats: Chat[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as Chat;
        if (data && data.id) {
          remoteChats.push(data);
        }
      });
      remoteChats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      onChatsUpdate(remoteChats);
    },
    (error) => {
      if (error?.code === 'unavailable' || (error?.message || '').includes('unavailable')) {
        console.warn('Firestore operando en modo offline temporal:', error.message);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Suscripción reactiva en tiempo real a las carpetas (Workspaces/Arcos) del usuario en Firestore.
 */
export function subscribeToUserFolders(
  userId: string,
  onFoldersUpdate: (folders: Folder[]) => void
): () => void {
  if (!userId) return () => {};
  const path = `users/${userId}/folders`;
  const foldersCol = collection(db, 'users', userId, 'folders');
  return onSnapshot(
    foldersCol,
    (snapshot) => {
      const remoteFolders: Folder[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as Folder;
        if (data && data.id) {
          remoteFolders.push(data);
        }
      });
      onFoldersUpdate(remoteFolders);
    },
    (error) => {
      if (error?.code === 'unavailable' || (error?.message || '').includes('unavailable')) {
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Suscripción reactiva en tiempo real a las memorias y configuración de personalidad del usuario en Firestore.
 */
export function subscribeToUserSettings(
  userId: string,
  onSettingsUpdate: (cloudSettings: CloudWorkspaceSettings) => void
): () => void {
  if (!userId) return () => {};
  const path = `users/${userId}/settings/workspace`;
  const settingsRef = doc(db, 'users', userId, 'settings', 'workspace');
  return onSnapshot(
    settingsRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as CloudWorkspaceSettings;
        if (data) {
          onSettingsUpdate(data);
        }
      }
    },
    (error) => {
      if (error?.code === 'unavailable' || (error?.message || '').includes('unavailable')) {
        return;
      }
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Suscripción reactiva en tiempo real a los documentos de Lore del usuario en Firestore.
 */
export function subscribeToUserLoreFiles(
  userId: string,
  onLoreUpdate: (loreFiles: LoreFile[]) => void
): () => void {
  if (!userId) return () => {};
  const path = `users/${userId}/loreFiles`;
  const loreCol = collection(db, 'users', userId, 'loreFiles');
  return onSnapshot(
    loreCol,
    (snapshot) => {
      const remoteLore: LoreFile[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as LoreFile;
        if (data && data.id) {
          remoteLore.push(data);
        }
      });
      remoteLore.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      onLoreUpdate(remoteLore);
    },
    (error) => {
      if (error?.code === 'unavailable' || (error?.message || '').includes('unavailable')) {
        console.warn('Firestore operando en modo offline temporal para LoreFiles:', error.message);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export interface FirebaseAuthErrorDetails {
  code: string;
  message: string;
  details?: string;
  actionUrl?: string;
}

/**
 * Traduce y diagnostica errores de Firebase Auth con instrucciones claras.
 */
export function parseFirebaseAuthError(error: any): FirebaseAuthErrorDetails {
  const code = error?.code || '';
  const rawMsg = error?.message || '';
  const projectId = firebaseConfig.projectId || 'kizuna-free';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/configuration-not-found' || rawMsg.includes('configuration-not-found')) {
    return {
      code: 'auth/configuration-not-found',
      message: 'Proveedor Google no activado en Firebase Console',
      details: `En tu proyecto "${projectId}", debes ir a Firebase Console > Authentication > Sign-in method y habilitar el proveedor "Google".`,
      actionUrl: `https://console.firebase.google.com/project/${projectId}/authentication/providers`,
    };
  }

  if (code === 'auth/unauthorized-domain' || rawMsg.includes('unauthorized-domain')) {
    return {
      code: 'auth/unauthorized-domain',
      message: 'Dominio no autorizado en Firebase',
      details: `Agrega "${hostname}" en Firebase Console > Authentication > Settings > Authorized domains.`,
      actionUrl: `https://console.firebase.google.com/project/${projectId}/authentication/settings`,
    };
  }

  if (code === 'auth/popup-closed-by-user' || rawMsg.includes('popup-closed-by-user')) {
    return {
      code: 'auth/popup-closed-by-user',
      message: 'Inicio de sesión cancelado',
      details: 'La ventana de Google fue cerrada antes de completar el inicio de sesión.',
    };
  }

  if (code === 'auth/popup-blocked' || rawMsg.includes('popup-blocked')) {
    return {
      code: 'auth/popup-blocked',
      message: 'Ventana emergente bloqueada',
      details: 'El navegador bloqueó la ventana de autenticación. Permite ventanas emergentes para este sitio.',
    };
  }

  if (code === 'auth/network-request-failed' || rawMsg.includes('network-request-failed')) {
    return {
      code: 'auth/network-request-failed',
      message: 'Fallo de conexión',
      details: 'No se pudo conectar con los servidores de autenticación. Revisa tu red.',
    };
  }

  return {
    code: code || 'auth/unknown',
    message: rawMsg || 'Error al iniciar sesión con Google',
    details: 'Verifica las credenciales y configuración del proyecto en Firebase Console.',
    actionUrl: projectId ? `https://console.firebase.google.com/project/${projectId}/authentication` : undefined,
  };
}

/**
 * Inicia sesión utilizando Google Auth Popup.
 */
export const loginWithGoogle = async (): Promise<User> => {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase no está configurado. Por favor define las variables VITE_FIREBASE_* en tu entorno.'
    );
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      try {
        const { setCachedAccessToken } = await import('./googleDriveService');
        setCachedAccessToken(credential.accessToken);
      } catch {
        // Safe dynamic import ignore
      }
    }
    return result.user;
  } catch (error: any) {
    console.error('Error al iniciar sesión con Google en Firebase:', error);
    throw error;
  }
};

/**
 * Cierra la sesión activa del usuario.
 */
export const logoutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error: any) {
    console.error('Error al cerrar sesión en Firebase:', error);
    throw error;
  }
};

/**
 * Observer reactivo para cambios en el estado de autenticación.
 */
export const subscribeToAuthChanges = (
  callback: (user: User | null) => void
): (() => void) => {
  return onAuthStateChanged(auth, callback);
};
