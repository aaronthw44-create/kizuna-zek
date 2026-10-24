import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
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
  getDocs,
  deleteDoc,
  collection,
  onSnapshot,
  enableIndexedDbPersistence,
} from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';
import { Chat, LoreFile } from '../types';

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

// Critical Firestore instance initialization with auto-detect long polling for web environment stability
export const db: Firestore = (() => {
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    }, dbId);
  } catch {
    return getFirestore(app, dbId);
  }
})();

if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch(() => {
    // Ignore persistence enablement errors in multi-tab or restricted environments
  });
}

export const googleProvider: GoogleAuthProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/documents.readonly');
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
    console.warn('Error al guardar conversación en Firestore:', error);
  }
}

/**
 * Guarda o sincroniza un documento de Lore en Firestore para el usuario activo.
 */
export async function syncLoreFileToFirestore(userId: string, loreFile: LoreFile): Promise<void> {
  if (!userId || !loreFile?.id) return;
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
    console.warn('Error al guardar documento de lore en Firestore:', error);
  }
}

/**
 * Elimina un documento de Lore de Firestore.
 */
export async function deleteLoreFileFromFirestore(userId: string, loreId: string): Promise<void> {
  if (!userId || !loreId) return;
  try {
    const loreRef = doc(db, 'users', userId, 'loreFiles', loreId);
    await deleteDoc(loreRef);
  } catch (error) {
    console.warn('Error al eliminar documento de lore de Firestore:', error);
  }
}

/**
 * Elimina una conversación de Firestore.
 */
export async function deleteChatFromFirestore(userId: string, chatId: string): Promise<void> {
  if (!userId || !chatId) return;
  try {
    const chatRef = doc(db, 'users', userId, 'chats', chatId);
    await deleteDoc(chatRef);
  } catch (error) {
    console.warn('Error al eliminar conversación de Firestore:', error);
  }
}

/**
 * Suscripción reactiva en tiempo real a las conversaciones del usuario en Firestore.
 */
export function subscribeToUserChats(
  userId: string,
  onChatsUpdate: (chats: Chat[]) => void
): () => void {
  if (!userId) return () => {};
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
      // Ordenar por última actualización descendente
      remoteChats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      onChatsUpdate(remoteChats);
    },
    (error) => {
      if (error?.code === 'unavailable' || (error?.message || '').includes('unavailable')) {
        console.warn('Firestore operando en modo offline temporal:', error.message);
        return;
      }
      console.warn('Error en listener de Firestore para chats:', error);
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
      console.warn('Error en listener de Firestore para loreFiles:', error);
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
  const projectId = firebaseConfig.projectId || 'kizuna-zek';
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
