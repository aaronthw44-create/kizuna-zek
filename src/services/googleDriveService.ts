import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import { parseDocumentFile, ParsedDocumentResult } from '../utils/documentParser';

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const setCachedAccessToken = (token: string | null): void => {
  cachedAccessToken = token;
};

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

/**
 * Initializes the Firebase Auth listener for Google Auth state.
 */
export const initAuthListener = (
  onSuccess: (user: User, token: string) => void,
  onFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user && cachedAccessToken) {
      onSuccess(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      onFailure();
    }
  });
};

/**
 * Executes interactive Sign In with Google Popup with Drive & Docs scopes.
 */
export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.addScope('https://www.googleapis.com/auth/drive.readonly');
  provider.addScope('https://www.googleapis.com/auth/documents.readonly');
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el Token de Acceso de Google Drive');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err: any) {
    const code = err?.code || '';
    if (code.includes('network-request-failed') || code.includes('popup-blocked')) {
      throw new Error('El navegador bloqueó la ventana emergente de Google. Autoriza las ventanas emergentes o usa el menú Google Drive.');
    }
    if (code.includes('popup-closed-by-user')) {
      throw new Error('Inicio de sesión cancelado por el usuario.');
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
};

export const getCachedAccessToken = (): string | null => cachedAccessToken;

export const signOutGoogle = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
};

/**
 * Lists files from Google Drive with optional query or folder parent.
 */
export const listDriveFiles = async (
  token: string,
  folderId: string = 'root',
  searchQuery: string = ''
): Promise<{ files: DriveFileItem[]; currentFolderName?: string }> => {
  let q = "trashed = false";

  if (searchQuery.trim()) {
    const escaped = searchQuery.trim().replace(/'/g, "\\'");
    q += ` and name contains '${escaped}'`;
  } else if (folderId) {
    q += ` and '${folderId}' in parents`;
  }

  const fields = "files(id, name, mimeType, modifiedTime, size, iconLink, thumbnailLink)";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    q
  )}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=folder,modifiedTime desc`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error('Sesión de Google expirada. Por favor vuelve a iniciar sesión.');
    }
    const errBody = await res.text().catch(() => '');
    throw new Error(`Error al listar archivos de Google Drive [HTTP ${res.status}]: ${errBody}`);
  }

  const data = await res.json();
  let currentFolderName: string | undefined;

  if (folderId && folderId !== 'root') {
    try {
      const nameRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (nameRes.ok) {
        const nameData = await nameRes.json();
        currentFolderName = nameData.name;
      }
    } catch {
      // Ignore folder name fetch error
    }
  }

  return { files: data.files || [], currentFolderName };
};

/**
 * Fetches and parses a Google Drive file (Google Doc, Word, PDF, TXT, MD, Image) into a ParsedDocumentResult.
 */
export const importDriveFileContent = async (
  token: string,
  fileItem: DriveFileItem
): Promise<ParsedDocumentResult> => {
  const { id, name, mimeType } = fileItem;

  // 1. Google Doc (application/vnd.google-apps.document)
  if (mimeType === 'application/vnd.google-apps.document') {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Falló al exportar el documento "${name}" de Google Docs [HTTP ${res.status}]`);
    }

    const rawText = await res.text();
    const cleanText = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
    const words = cleanText ? cleanText.split(/\s+/).length : 0;
    const tokens = Math.max(1, Math.round(cleanText.length / 3.8));

    return {
      text: cleanText,
      wordCount: words,
      estimatedTokens: tokens,
      fileType: 'md',
    };
  }

  // 2. Binary / Media Files (Word, PDF, TXT, MD, Image)
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Falló al descargar el archivo "${name}" de Google Drive [HTTP ${res.status}]`);
  }

  const blob = await res.blob();
  const fileObj = new File([blob], name, { type: mimeType });
  return await parseDocumentFile(fileObj);
};

/**
 * Creates or exports a file directly to Google Drive.
 * Converts to editable Google Doc when mimeType is 'application/vnd.google-apps.document'.
 */
export const createOrUpdateDriveFile = async (
  token: string,
  fileName: string,
  content: string,
  mimeType: string = 'text/plain',
  folderId?: string
): Promise<{ id: string; name: string; webViewLink?: string }> => {
  const isGoogleDoc = mimeType === 'application/vnd.google-apps.document';
  const metadata: any = {
    name: fileName,
    mimeType: isGoogleDoc
      ? 'application/vnd.google-apps.document'
      : mimeType === 'md' || fileName.endsWith('.md')
      ? 'text/markdown'
      : mimeType,
  };
  if (folderId && folderId !== 'root') {
    metadata.parents = [folderId];
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'text/plain; charset=utf-8' }));

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Error al exportar archivo a Google Drive [HTTP ${res.status}]: ${errText}`);
  }

  const data = await res.json();
  return { id: data.id, name: data.name, webViewLink: data.webViewLink };
};

/**
 * Saves a scene or chat transcript directly as a Google Doc in the user's Google Drive.
 * Prompts Google Sign In if token is not cached.
 */
export const saveTextToGoogleDriveDoc = async (
  title: string,
  content: string
): Promise<{ success: boolean; webViewLink?: string; name: string }> => {
  let token = getCachedAccessToken();
  if (!token) {
    const authResult = await signInWithGoogle();
    token = authResult.accessToken;
  }
  if (!token) {
    throw new Error('No se pudo autenticar con Google Drive.');
  }

  const cleanTitle = title.trim() || `Escena - ${new Date().toLocaleDateString('es-ES')}`;
  const docResult = await createOrUpdateDriveFile(
    token,
    cleanTitle,
    content,
    'application/vnd.google-apps.document'
  );

  return { success: true, webViewLink: docResult.webViewLink, name: docResult.name };
};

/**
 * Uses DeepSeek V4.1 Flash to extract strictly clean manuscript prose or structure
 * removing conversational AI filler before saving to Google Drive.
 */
export async function extractCleanDraftWithDeepSeek(
  rawContent: string,
  alibabaApiKey?: string
): Promise<{ title: string; content: string }> {
  const cleanFallback = rawContent
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<<<FOLLOW_UP>>>[\s\S]*$/gi, '')
    .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
    .trim();

  if (cleanFallback.length < 120) {
    return {
      title: 'Borrador_Kizuna',
      content: cleanFallback,
    };
  }

  const prompt = `Analiza el siguiente texto de un asistente de escritura y extrae ÚNICAMENTE la escena, capítulo, borrador o estructura narrativa propuesta.

[TEXTO COMPLETO]:
${cleanFallback.slice(0, 6000)}

REGLAS ESTRICTAS DE EXTRACCIÓN EDITORIAL:
1. Elimina cualquier saludo, comentario conversacional ("Aquí tienes...", "Espero que te guste...", "Pásame el párrafo..."), preguntas de seguimiento y explicaciones meta.
2. Mantén intacto el cuerpo del capítulo, diálogo, borrador o estructura.
3. Si hay un título en el capítulo o borrador, ponlo en la primera línea como "# Título".
4. Devuelve ÚNICAMENTE el texto limpio sin ningún preámbulo ni frase de tu propia parte.`;

  try {
    const key = alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '';
    if (!key) {
      return { title: 'Escena_Kizuna', content: cleanFallback };
    }

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: `ext_${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() }],
        systemInstruction: 'Eres un extractor editorial de manuscritos. Tu única función es devolver la prosa o estructura sin saludos ni comentarios.',
        provider: 'alibaba',
        customConfig: {
          apiKey: key,
          alibabaApiKey: key,
          alibabaBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
          alibabaModel: 'deepseek-v4.1-flash-1017',
          baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
          model: 'deepseek-v4.1-flash-1017',
        },
        maxOutputTokens: 2048,
        temperature: 0.1,
        model: 'deepseek-v4.1-flash-1017',
        enableReasoning: false,
        reasoningMode: 'off',
      }),
    });

    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let extractedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          try {
            const parsed = JSON.parse(trimmed.replace(/^data:\s*/, ''));
            if (parsed.text) extractedText += parsed.text;
          } catch {}
        }
      }

      const cleanAI = extractedText
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .trim();

      if (cleanAI.length > 50) {
        const firstLineMatch = cleanAI.match(/^#+\s*(.+)|^([^\n]{3,60})/);
        const titleCandidate = firstLineMatch
          ? (firstLineMatch[1] || firstLineMatch[2] || '').trim().replace(/[#*`_~]/g, '')
          : 'Escena_Manuscrito';
        return { title: titleCandidate, content: cleanAI };
      }
    }
  } catch (e) {
    console.warn('DeepSeek Flash extraction error, using fallback:', e);
  }

  return { title: 'Escena_Kizuna', content: cleanFallback };
}

