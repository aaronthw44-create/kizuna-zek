import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import { parseDocumentFile, ParsedDocumentResult } from '../utils/documentParser';

// Scopes configured via OAuth setup for full Google Drive & Google Docs management
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
];

// In-memory cache for the OAuth access token (never persisted to localStorage/sessionStorage)
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
  webViewLink?: string;
}

export interface WorkspacePendingAction {
  id: string;
  action: 'create_doc' | 'append_doc' | 'replace_doc' | 'find_replace_doc' | 'rename_file' | 'delete_file';
  fileId?: string;
  fileName: string;
  newName?: string;
  content?: string;
  findText?: string;
  replaceText?: string;
}

/**
 * Initializes the Firebase Auth listener for Google Auth state.
 * Clears the in-memory cached token when the user signs out.
 */
export const initAuthListener = (
  onSuccess?: (user: User, token: string) => void,
  onFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onSuccess) onSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onFailure) onFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onFailure) onFailure();
    }
  });
};

/**
 * Executes interactive Sign In with Google Popup with full Drive & Docs scopes.
 */
export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  const provider = new GoogleAuthProvider();
  for (const scope of WORKSPACE_SCOPES) {
    provider.addScope(scope);
  }
  if (auth.currentUser?.email) {
    provider.setCustomParameters({
      login_hint: auth.currentUser.email,
    });
  } else {
    provider.setCustomParameters({
      prompt: 'select_account',
    });
  }

  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el Token de Acceso de Google Drive y Docs');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: credential.accessToken };
  } catch (err: any) {
    const code = err?.code || '';
    if (code.includes('network-request-failed') || code.includes('popup-blocked')) {
      throw new Error(
        'El navegador bloqueó la ventana emergente de Google. Autoriza las ventanas emergentes e intenta nuevamente.'
      );
    }
    if (code.includes('popup-closed-by-user')) {
      throw new Error('Inicio de sesión cancelado por el usuario.');
    }
    throw err;
  } finally {
    isSigningIn = false;
  }
};

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const ensureGoogleWorkspaceToken = async (): Promise<string> => {
  if (cachedAccessToken) return cachedAccessToken;
  const result = await signInWithGoogle();
  return result.accessToken;
};

export const signOutGoogle = async (): Promise<void> => {
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
  let q = 'trashed = false';

  if (searchQuery.trim()) {
    const escaped = searchQuery.trim().replace(/'/g, "\\'");
    q += ` and name contains '${escaped}'`;
  } else if (folderId) {
    q += ` and '${folderId}' in parents`;
  }

  const fields = 'files(id, name, mimeType, modifiedTime, size, iconLink, thumbnailLink, webViewLink)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    q
  )}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=folder,modifiedTime desc`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error('Sesión de Google expirada. Por favor vuelve a conectar tu cuenta de Google.');
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
 * Reads a Google Doc using the official Google Docs v1 API (`docs.googleapis.com/v1/documents/{id}`)
 * and extracts plain text + structural endIndex for batchUpdate operations.
 */
export const getGoogleDocStructured = async (
  token: string,
  documentId: string
): Promise<{ title: string; text: string; endIndex: number }> => {
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) cachedAccessToken = null;
    const errText = await res.text().catch(() => '');
    throw new Error(`Error al leer Google Doc [HTTP ${res.status}]: ${errText}`);
  }

  const doc = await res.json();
  const title = doc.title || 'Documento sin título';
  const contentArray = doc.body?.content || [];
  let fullText = '';
  let maxEndIndex = 1;

  for (const element of contentArray) {
    if (typeof element.endIndex === 'number' && element.endIndex > maxEndIndex) {
      maxEndIndex = element.endIndex;
    }
    if (element.paragraph?.elements) {
      for (const el of element.paragraph.elements) {
        if (el.textRun?.content) {
          fullText += el.textRun.content;
        }
      }
    } else if (element.table?.tableRows) {
      for (const row of element.table.tableRows) {
        for (const cell of row.tableCells || []) {
          for (const cellContent of cell.content || []) {
            for (const el of cellContent.paragraph?.elements || []) {
              if (el.textRun?.content) {
                fullText += el.textRun.content;
              }
            }
          }
          fullText += '\t';
        }
        fullText += '\n';
      }
    }
  }

  return {
    title,
    text: fullText.trimEnd(),
    endIndex: maxEndIndex,
  };
};

/**
 * Modifies a Google Doc via the Google Docs v1 `batchUpdate` API.
 * Supports:
 * - 'replace_all': Replaces the entire body of the Google Doc with `newText`
 * - 'append': Appends `newText` at the end of the Google Doc
 * - 'find_replace': Replaces all occurrences of `findText` with `newText`
 */
export const updateGoogleDocContent = async (
  token: string,
  documentId: string,
  options: {
    mode: 'replace_all' | 'append' | 'find_replace';
    newText: string;
    findText?: string;
  }
): Promise<{ title: string; updatedText: string }> => {
  const currentDoc = await getGoogleDocStructured(token, documentId);
  const requests: any[] = [];

  if (options.mode === 'find_replace' && options.findText) {
    requests.push({
      replaceAllText: {
        containsText: {
          text: options.findText,
          matchCase: false,
        },
        replaceText: options.newText,
      },
    });
  } else if (options.mode === 'append') {
    const insertIndex = Math.max(1, currentDoc.endIndex - 1);
    const prefix = currentDoc.text.length > 0 ? '\n\n' : '';
    requests.push({
      insertText: {
        location: { index: insertIndex },
        text: `${prefix}${options.newText}`,
      },
    });
  } else {
    // replace_all: Clear existing content if document has body text, then insert at index 1
    if (currentDoc.endIndex > 2) {
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: 1,
            endIndex: currentDoc.endIndex - 1,
          },
        },
      });
    }
    if (options.newText) {
      requests.push({
        insertText: {
          location: { index: 1 },
          text: options.newText,
        },
      });
    }
  }

  if (requests.length > 0) {
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!res.ok) {
      if (res.status === 401) cachedAccessToken = null;
      const errText = await res.text().catch(() => '');
      throw new Error(`Error al editar Google Doc [HTTP ${res.status}]: ${errText}`);
    }
  }

  const refreshed = await getGoogleDocStructured(token, documentId);
  return { title: refreshed.title, updatedText: refreshed.text };
};

/**
 * Updates the text content of any Google Drive file (routes Google Docs to Docs API v1 batchUpdate,
 * and plain text / markdown files to Drive v3 multipart/media upload).
 */
export const updateDriveFileText = async (
  token: string,
  fileItem: { id: string; name: string; mimeType: string },
  newContent: string,
  mode: 'replace_all' | 'append' | 'find_replace' = 'replace_all',
  findText?: string
): Promise<void> => {
  if (fileItem.mimeType === 'application/vnd.google-apps.document') {
    await updateGoogleDocContent(token, fileItem.id, {
      mode,
      newText: newContent,
      findText,
    });
    return;
  }

  // Standard text/markdown file in Google Drive
  let finalContent = newContent;
  if (mode === 'append' || (mode === 'find_replace' && findText)) {
    const existing = await importDriveFileContent(token, fileItem);
    if (mode === 'append') {
      finalContent = existing.text ? `${existing.text}\n\n${newContent}` : newContent;
    } else if (mode === 'find_replace' && findText) {
      finalContent = existing.text.split(findText).join(newContent);
    }
  }

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileItem.id}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': fileItem.mimeType || 'text/plain; charset=utf-8',
      },
      body: finalContent,
    }
  );

  if (!res.ok) {
    if (res.status === 401) cachedAccessToken = null;
    const errText = await res.text().catch(() => '');
    throw new Error(`Error al actualizar el archivo "${fileItem.name}" [HTTP ${res.status}]: ${errText}`);
  }
};

/**
 * Renames a file or Google Doc in Google Drive.
 */
export const renameDriveFile = async (
  token: string,
  fileId: string,
  newName: string
): Promise<{ id: string; name: string }> => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName.trim() }),
  });

  if (!res.ok) {
    if (res.status === 401) cachedAccessToken = null;
    const errText = await res.text().catch(() => '');
    throw new Error(`Error al renombrar archivo en Google Drive [HTTP ${res.status}]: ${errText}`);
  }

  return await res.json();
};

/**
 * Moves a Google Drive file to the trash or permanently deletes it.
 */
export const deleteDriveFile = async (
  token: string,
  fileId: string,
  permanent: boolean = false
): Promise<void> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = permanent
    ? await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    : await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trashed: true }),
      });

  if (!res.ok) {
    if (res.status === 401) cachedAccessToken = null;
    const errText = await res.text().catch(() => '');
    throw new Error(`Error al eliminar archivo en Google Drive [HTTP ${res.status}]: ${errText}`);
  }
};

/**
 * Fetches and parses a Google Drive file (Google Doc, Word, PDF, TXT, MD, Image) into a ParsedDocumentResult.
 */
export const importDriveFileContent = async (
  token: string,
  fileItem: DriveFileItem
): Promise<ParsedDocumentResult> => {
  const { id, name, mimeType } = fileItem;

  // 1. Google Doc (application/vnd.google-apps.document) - try Docs API first, fallback to Drive export
  if (mimeType === 'application/vnd.google-apps.document') {
    try {
      const docData = await getGoogleDocStructured(token, id);
      const cleanText = docData.text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
      const words = cleanText ? cleanText.split(/\s+/).length : 0;
      const tokens = Math.max(1, Math.round(cleanText.length / 3.8));
      return {
        text: cleanText,
        wordCount: words,
        estimatedTokens: tokens,
        fileType: 'md',
      };
    } catch {
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
    if (res.status === 401) cachedAccessToken = null;
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
  const token = await ensureGoogleWorkspaceToken();
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
 * Executes a confirmed WorkspacePendingAction proposed by the AI model or user.
 */
export const executeConfirmedWorkspaceAction = async (
  actionItem: WorkspacePendingAction
): Promise<{ summary: string; webViewLink?: string }> => {
  const token = await ensureGoogleWorkspaceToken();

  if (actionItem.action === 'create_doc') {
    const created = await createOrUpdateDriveFile(
      token,
      actionItem.fileName || 'Nuevo Documento de Kizuna',
      actionItem.content || '',
      'application/vnd.google-apps.document'
    );
    return {
      summary: `Documento "${created.name}" creado en Google Docs.`,
      webViewLink: created.webViewLink,
    };
  }

  // If fileId is not provided or looks like a name, search for it by name first
  let targetFileId = actionItem.fileId;
  let targetMimeType = 'application/vnd.google-apps.document';
  if (!targetFileId && actionItem.fileName) {
    const searchRes = await listDriveFiles(token, 'root', actionItem.fileName);
    const match =
      searchRes.files.find(
        (f) => f.name.toLowerCase() === actionItem.fileName.toLowerCase()
      ) || searchRes.files[0];
    if (!match) {
      throw new Error(`No se encontró ningún archivo llamado "${actionItem.fileName}" en tu Google Drive.`);
    }
    targetFileId = match.id;
    targetMimeType = match.mimeType;
  }

  if (!targetFileId) {
    throw new Error('No se especificó el archivo de destino en Google Drive.');
  }

  if (actionItem.action === 'rename_file') {
    const nextName = actionItem.newName || actionItem.content || actionItem.fileName;
    const renamed = await renameDriveFile(token, targetFileId, nextName);
    return { summary: `Archivo renombrado a "${renamed.name}" en Google Drive.` };
  }

  if (actionItem.action === 'delete_file') {
    await deleteDriveFile(token, targetFileId, false);
    return { summary: `Archivo "${actionItem.fileName}" movido a la papelera de Google Drive.` };
  }

  if (actionItem.action === 'append_doc') {
    await updateDriveFileText(
      token,
      { id: targetFileId, name: actionItem.fileName, mimeType: targetMimeType },
      actionItem.content || '',
      'append'
    );
    return {
      summary: `Texto añadido al final de "${actionItem.fileName}" en Google Docs.`,
      webViewLink: `https://docs.google.com/document/d/${targetFileId}/edit`,
    };
  }

  if (actionItem.action === 'find_replace_doc') {
    await updateDriveFileText(
      token,
      { id: targetFileId, name: actionItem.fileName, mimeType: targetMimeType },
      actionItem.replaceText ?? actionItem.content ?? '',
      'find_replace',
      actionItem.findText || ''
    );
    return {
      summary: `Texto reemplazado dentro de "${actionItem.fileName}" en Google Docs.`,
      webViewLink: `https://docs.google.com/document/d/${targetFileId}/edit`,
    };
  }

  // Default: replace_doc
  await updateDriveFileText(
    token,
    { id: targetFileId, name: actionItem.fileName, mimeType: targetMimeType },
    actionItem.content || '',
    'replace_all'
  );
  return {
    summary: `Contenido de "${actionItem.fileName}" actualizado en Google Docs.`,
    webViewLink: `https://docs.google.com/document/d/${targetFileId}/edit`,
  };
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
    .replace(/<<<DRIVE_ACTION:[\s\S]*?>>>/gi, '')
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
        systemInstruction:
          'Eres un extractor editorial de manuscritos. Tu única función es devolver la prosa o estructura sin saludos ni comentarios.',
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
