import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import {
  X,
  Search,
  FileText,
  Image as ImageIcon,
  Folder as FolderIcon,
  CheckSquare,
  Square,
  LogOut,
  RefreshCw,
  CloudDownload,
  AlertCircle,
  FileCode,
  Sparkles,
  CheckCircle2,
  Eye,
  Edit3,
  Trash2,
  FilePlus2,
  ExternalLink,
  Check,
  Replace,
} from 'lucide-react';
import { Attachment, LoreFile } from '../types';
import { DocumentPreviewModal, DocumentPreviewItem } from './DocumentPreviewModal';
import {
  initAuthListener,
  signInWithGoogle,
  signOutGoogle,
  listDriveFiles,
  importDriveFileContent,
  createOrUpdateDriveFile,
  updateDriveFileText,
  renameDriveFile,
  deleteDriveFile,
  DriveFileItem,
  getCachedAccessToken,
} from '../services/googleDriveService';

export interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId?: string;
  onImportLoreFiles?: (newFiles: Array<Omit<LoreFile, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  onImportToChat?: (attachments: Attachment[]) => void;
  defaultMode?: 'lore' | 'chat';
}

interface PendingConfirmOperation {
  type: 'delete_files' | 'save_edit' | 'rename_file';
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void>;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  folderId,
  onImportLoreFiles,
  onImportToChat,
  defaultMode = 'lore',
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(getCachedAccessToken());
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [currentDriveFolderId, setCurrentDriveFolderId] = useState<string>('root');
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: 'root', name: 'Mi Unidad (Google Drive)' },
  ]);

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | 'docs' | 'images'>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  const [previewDoc, setPreviewDoc] = useState<DocumentPreviewItem | null>(null);
  const [isPreviewLoadingId, setIsPreviewLoadingId] = useState<string | null>(null);

  // Live Google Doc / File Editor State
  const [editingFile, setEditingFile] = useState<DriveFileItem | null>(null);
  const [editMode, setEditMode] = useState<'replace_all' | 'append' | 'find_replace'>('replace_all');
  const [editorText, setEditorText] = useState('');
  const [findText, setFindText] = useState('');
  const [isEditorLoading, setIsEditorLoading] = useState(false);

  // Create New Google Doc State
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocBody, setNewDocBody] = useState('');

  // Rename State
  const [renamingFile, setRenamingFile] = useState<DriveFileItem | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Mandatory User Confirmation Dialog State for Destructive / Mutating Operations
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmOperation | null>(null);
  const [isExecutingMutation, setIsExecutingMutation] = useState(false);

  const handlePreviewFile = async (e: React.MouseEvent, file: DriveFileItem) => {
    e.stopPropagation();
    if (!accessToken) return;
    setIsPreviewLoadingId(file.id);
    setFetchError(null);
    try {
      const parsed = await importDriveFileContent(accessToken, file);
      setPreviewDoc({
        id: file.id,
        title: file.name,
        content: parsed.text,
        fileType: parsed.fileType,
        mimeType: file.mimeType,
        size: Number(file.size) || 1024,
        dataUrl: parsed.dataUrl,
        wordCount: parsed.wordCount,
        estimatedTokens: parsed.estimatedTokens,
        sourceLabel: 'Google Drive',
      });
    } catch (err: any) {
      console.error('Preview error:', err);
      setFetchError(err.message || 'Error al obtener vista previa del archivo');
    } finally {
      setIsPreviewLoadingId(null);
    }
  };

  const handleOpenLiveEditor = async (e: React.MouseEvent, file: DriveFileItem) => {
    e.stopPropagation();
    if (!accessToken) return;
    setEditingFile(file);
    setEditMode('replace_all');
    setFindText('');
    setIsEditorLoading(true);
    setFetchError(null);
    try {
      const parsed = await importDriveFileContent(accessToken, file);
      setEditorText(parsed.text);
    } catch (err: any) {
      setFetchError(err.message || 'No se pudo cargar el contenido para editar.');
      setEditingFile(null);
    } finally {
      setIsEditorLoading(false);
    }
  };

  const handleRequestSaveEdit = () => {
    if (!accessToken || !editingFile) return;
    const targetFile = editingFile;
    const modeLabel =
      editMode === 'append'
        ? `Añadir texto al final de "${targetFile.name}"`
        : editMode === 'find_replace'
        ? `Reemplazar "${findText}" dentro de "${targetFile.name}"`
        : `Actualizar el contenido completo de "${targetFile.name}"`;

    setPendingConfirm({
      type: 'save_edit',
      title: '¿Confirmar modificación en Google Docs / Drive?',
      description: `${modeLabel}. Este cambio modificará el documento real en tu cuenta de Google Drive.`,
      confirmLabel: 'Confirmar y Guardar en Google Drive',
      isDestructive: false,
      onConfirm: async () => {
        await updateDriveFileText(accessToken, targetFile, editorText, editMode, findText);
        setStatusNotice(`Documento "${targetFile.name}" actualizado en Google Drive.`);
        setEditingFile(null);
        await loadFiles(currentDriveFolderId, searchQuery);
      },
    });
  };

  const handleRequestRename = () => {
    if (!accessToken || !renamingFile || !renameValue.trim()) return;
    const target = renamingFile;
    const nextName = renameValue.trim();

    setPendingConfirm({
      type: 'rename_file',
      title: '¿Confirmar cambio de nombre en Google Drive?',
      description: `Se cambiará el nombre del archivo "${target.name}" a "${nextName}" en tu Google Drive.`,
      confirmLabel: 'Renombrar Archivo',
      isDestructive: false,
      onConfirm: async () => {
        await renameDriveFile(accessToken, target.id, nextName);
        setStatusNotice(`Archivo renombrado a "${nextName}".`);
        setRenamingFile(null);
        setRenameValue('');
        await loadFiles(currentDriveFolderId, searchQuery);
      },
    });
  };

  const handleRequestDeleteFiles = (filesToDelete: DriveFileItem[]) => {
    if (!accessToken || filesToDelete.length === 0) return;
    const namesPreview = filesToDelete
      .slice(0, 4)
      .map((f) => `"${f.name}"`)
      .join(', ');
    const extraCount = filesToDelete.length > 4 ? ` y ${filesToDelete.length - 4} más` : '';

    setPendingConfirm({
      type: 'delete_files',
      title: `¿Mover ${filesToDelete.length} archivo(s) a la papelera de Google Drive?`,
      description: `Se enviarán a la papelera de tu Google Drive: ${namesPreview}${extraCount}. Confirma si deseas continuar.`,
      confirmLabel: `Eliminar (${filesToDelete.length})`,
      isDestructive: true,
      onConfirm: async () => {
        for (const f of filesToDelete) {
          await deleteDriveFile(accessToken, f.id, false);
        }
        setSelectedFileIds((prev) =>
          prev.filter((id) => !filesToDelete.some((deleted) => deleted.id === id))
        );
        setStatusNotice(`${filesToDelete.length} archivo(s) movidos a la papelera de Google Drive.`);
        await loadFiles(currentDriveFolderId, searchQuery);
      },
    });
  };

  const handleCreateNewGoogleDoc = async () => {
    if (!accessToken || !newDocTitle.trim()) return;
    setIsExecutingMutation(true);
    setFetchError(null);
    try {
      const created = await createOrUpdateDriveFile(
        accessToken,
        newDocTitle.trim(),
        newDocBody,
        'application/vnd.google-apps.document',
        currentDriveFolderId
      );
      setStatusNotice(`Google Doc "${created.name}" creado correctamente.`);
      setIsCreatingDoc(false);
      setNewDocTitle('');
      setNewDocBody('');
      await loadFiles(currentDriveFolderId, searchQuery);
    } catch (err: any) {
      setFetchError(err.message || 'Error al crear el Google Doc.');
    } finally {
      setIsExecutingMutation(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = initAuthListener(
      (u, token) => {
        setUser(u);
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );

    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && accessToken) {
      loadFiles(currentDriveFolderId, searchQuery);

      const handleFocus = () => {
        loadFiles(currentDriveFolderId, searchQuery);
      };

      window.addEventListener('focus', handleFocus);
      return () => {
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [isOpen, accessToken, currentDriveFolderId]);

  const loadFiles = async (driveFolderId: string, query: string) => {
    if (!accessToken) return;
    setIsLoadingFiles(true);
    setFetchError(null);

    try {
      const { files, currentFolderName } = await listDriveFiles(
        accessToken,
        driveFolderId,
        query
      );
      setDriveFiles(files);

      if (currentFolderName && driveFolderId !== 'root') {
        setFolderBreadcrumbs((prev) => {
          if (!prev.some((b) => b.id === driveFolderId)) {
            return [...prev, { id: driveFolderId, name: currentFolderName }];
          }
          return prev;
        });
      }
    } catch (err: any) {
      console.error('Error listing Google Drive files:', err);
      setFetchError(err.message || 'Error al cargar los archivos de Google Drive');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setFetchError(null);
    try {
      const result = await signInWithGoogle();
      setUser(result.user);
      setAccessToken(result.accessToken);
    } catch (err: any) {
      console.error('Google Sign in error:', err);
      setFetchError(err.message || 'Error al iniciar sesión con Google');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOutGoogle();
    setUser(null);
    setAccessToken(null);
    setDriveFiles([]);
    setSelectedFileIds([]);
  };

  const handleNavigateToFolder = (targetFolderId: string, folderName: string) => {
    setCurrentDriveFolderId(targetFolderId);
    setSearchQuery('');
    const index = folderBreadcrumbs.findIndex((b) => b.id === targetFolderId);
    if (index !== -1) {
      setFolderBreadcrumbs(folderBreadcrumbs.slice(0, index + 1));
    } else {
      setFolderBreadcrumbs([...folderBreadcrumbs, { id: targetFolderId, name: folderName }]);
    }
  };

  const handleToggleSelect = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleSelectAllFiltered = () => {
    const selectableFiles = filteredFiles.filter(
      (f) => f.mimeType !== 'application/vnd.google-apps.folder'
    );
    const selectableIds = selectableFiles.map((f) => f.id);
    const allSelected = selectableIds.every((id) => selectedFileIds.includes(id));

    if (allSelected) {
      setSelectedFileIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelectedFileIds((prev) => Array.from(new Set([...prev, ...selectableIds])));
    }
  };

  const handleExecuteImport = async (targetMode: 'lore' | 'chat' = defaultMode) => {
    if (!accessToken || selectedFileIds.length === 0) return;

    setIsImporting(true);
    setImportProgress(`Preparando importación de ${selectedFileIds.length} documento(s)...`);
    setFetchError(null);

    const itemsToImport = driveFiles.filter((f) => selectedFileIds.includes(f.id));
    const newLoreItems: Array<Omit<LoreFile, 'id' | 'createdAt' | 'updatedAt'>> = [];

    try {
      let count = 0;
      for (const item of itemsToImport) {
        count++;
        setImportProgress(`Importando (${count}/${itemsToImport.length}): "${item.name}"...`);

        const parsed = await importDriveFileContent(accessToken, item);
        const title = item.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

        newLoreItems.push({
          folderId: folderId || 'general',
          title: title.charAt(0).toUpperCase() + title.slice(1),
          filename: item.name,
          content: parsed.text,
          fileType: parsed.fileType,
          dataUrl: parsed.dataUrl,
          size: Number(item.size) || 1024,
          wordCount: parsed.wordCount,
          estimatedTokens: parsed.estimatedTokens,
          parseStatus: 'ready',
        });
      }

      if (targetMode === 'chat' && onImportToChat) {
        const chatAttachments: Attachment[] = newLoreItems.map((lore, idx) => ({
          id: `gdrive_${Date.now()}_${idx}`,
          name: lore.filename || lore.title,
          fileType: lore.fileType,
          type: lore.fileType === 'image' ? 'image/png' : 'text/plain',
          size: lore.size,
          content: lore.content,
          textContent: lore.content,
          dataUrl: lore.dataUrl || '',
          estimatedTokens: lore.estimatedTokens,
          parseStatus: 'ready',
          timestamp: Date.now(),
        }));
        onImportToChat(chatAttachments);
      } else if (onImportLoreFiles) {
        onImportLoreFiles(newLoreItems);
      }

      setImportSuccessCount(newLoreItems.length);
      setSelectedFileIds([]);

      setTimeout(() => {
        setImportSuccessCount(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Import error:', err);
      setFetchError(err.message || 'Error al importar documentos desde Google Drive');
    } finally {
      setIsImporting(false);
      setImportProgress('');
    }
  };

  if (!isOpen) return null;

  const filteredFiles = driveFiles.filter((file) => {
    if (activeCategoryFilter === 'docs') {
      return (
        file.mimeType === 'application/vnd.google-apps.document' ||
        file.mimeType.includes('wordprocessingml') ||
        file.mimeType.includes('pdf') ||
        file.mimeType.includes('text/') ||
        file.name.endsWith('.docx') ||
        file.name.endsWith('.pdf') ||
        file.name.endsWith('.txt') ||
        file.name.endsWith('.md')
      );
    }
    if (activeCategoryFilter === 'images') {
      return file.mimeType.startsWith('image/');
    }
    return true;
  });

  const isFolder = (mime: string) => mime === 'application/vnd.google-apps.folder';
  const selectedDriveItems = driveFiles.filter((f) => selectedFileIds.includes(f.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-xs modal-backdrop-fluid">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="flex flex-col w-full max-w-4xl max-h-[85dvh] sm:max-h-[90vh] bg-[#09090b] border border-[#222228] rounded-2xl shadow-2xl text-white overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[#18181c] bg-[#070709] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <CloudDownload size={17} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                <span className="truncate">Google Drive & Google Docs · Herramientas</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  Lectura · Edición · Borrado
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400 truncate">
                Lee, crea, edita en vivo o elimina archivos de tu Google Drive y Google Docs con confirmación segura
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#18181c] rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Auth Bar & Unauthenticated State */}
        {!accessToken ? (
          <div className="p-6 sm:p-8 text-center flex flex-col items-center justify-center space-y-4 my-auto overflow-y-auto">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-200 mb-1 shadow-lg">
              <CloudDownload size={28} />
            </div>
            <div className="max-w-md space-y-1.5">
              <h4 className="text-base font-semibold text-white">
                Conectar con Google Drive y Google Docs
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Inicia sesión con tu cuenta de Google para que tú y el modelo puedan consultar, crear, editar y organizar tus documentos de Google Docs (como los capítulos de <em>Jukkou No Zankyou</em>) y archivos en Drive.
              </p>
            </div>

            {fetchError && (
              <div className="p-3 bg-red-950/40 border border-red-900/50 text-red-300 rounded-xl text-xs max-w-md text-left flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-red-400" />
                <span>{fetchError}</span>
              </div>
            )}

            {/* Official Google Material Sign-In Button */}
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="gsi-material-button min-h-[44px] px-6 rounded-xl bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-all flex items-center gap-3 shadow-md cursor-pointer disabled:opacity-50"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span>{isSigningIn ? 'Conectando...' : 'Sign in with Google'}</span>
            </button>
          </div>
        ) : (
          /* Authenticated Explorer & Editor View */
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* User & Navigation Toolbar */}
            <div className="px-4 sm:px-5 py-2.5 border-b border-[#18181c] bg-[#0c0c0f] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-xs overflow-x-auto py-0.5">
                {folderBreadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id}>
                    {idx > 0 && <span className="text-zinc-600">/</span>}
                    <button
                      type="button"
                      onClick={() => handleNavigateToFolder(crumb.id, crumb.name)}
                      className={`hover:underline cursor-pointer font-medium truncate max-w-[140px] sm:max-w-[180px] ${
                        idx === folderBreadcrumbs.length - 1 ? 'text-white' : 'text-zinc-400'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingDoc((v) => !v);
                    setEditingFile(null);
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer min-h-[32px]"
                  title="Crear un nuevo documento de Google Docs en esta carpeta"
                >
                  <FilePlus2 size={13} />
                  <span>+ Nuevo Google Doc</span>
                </button>

                <button
                  type="button"
                  onClick={() => loadFiles(currentDriveFolderId, searchQuery)}
                  disabled={isLoadingFiles}
                  className="px-2.5 py-1 text-[11px] font-medium bg-[#16161d] hover:bg-[#202028] border border-zinc-800 text-zinc-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 min-h-[32px]"
                >
                  <RefreshCw size={12} className={isLoadingFiles ? 'animate-spin text-amber-400' : ''} />
                  <span className="hidden sm:inline">{isLoadingFiles ? 'Cargando...' : 'Actualizar'}</span>
                </button>

                {user && (
                  <div className="hidden md:flex items-center gap-2 bg-[#141418] border border-zinc-800 px-2.5 py-1 rounded-full text-[11px] text-zinc-300">
                    <span className="truncate max-w-[130px] font-medium">{user.email || user.displayName}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="p-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                  title="Desconectar Google Drive"
                >
                  <LogOut size={13} />
                </button>
              </div>
            </div>

            {/* Create New Google Doc Inline Drawer */}
            <AnimatePresence>
              {isCreatingDoc && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-b border-amber-500/30 bg-[#101016] px-4 sm:px-5 py-3 space-y-2.5 shrink-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                      <FilePlus2 size={14} />
                      <span>Crear Nuevo Google Doc en "{folderBreadcrumbs[folderBreadcrumbs.length - 1]?.name}"</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingDoc(false)}
                      className="text-zinc-400 hover:text-white text-xs"
                    >
                      Cerrar
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    placeholder="Título del Google Doc (ej. Capítulo 23 - El Pulso de Monstereth)"
                    className="w-full bg-[#09090d] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                  />
                  <textarea
                    value={newDocBody}
                    onChange={(e) => setNewDocBody(e.target.value)}
                    placeholder="Contenido inicial del documento..."
                    rows={4}
                    className="w-full bg-[#09090d] border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingDoc(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateNewGoogleDoc}
                      disabled={!newDocTitle.trim() || isExecutingMutation}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <FilePlus2 size={13} />
                      <span>{isExecutingMutation ? 'Creando...' : 'Crear en Google Docs'}</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Live Google Doc / File Editor Drawer */}
            <AnimatePresence>
              {editingFile && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-b border-sky-500/35 bg-[#0d111a] px-4 sm:px-5 py-3.5 space-y-2.5 shrink-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Edit3 size={14} className="text-sky-400" />
                      <span className="text-xs font-semibold text-white">
                        Editando en vivo: <span className="text-sky-300">{editingFile.name}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
                      <button
                        type="button"
                        onClick={() => setEditMode('replace_all')}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          editMode === 'replace_all'
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Editar Todo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditMode('append');
                          setEditorText('');
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                          editMode === 'append'
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Añadir al Final
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditMode('find_replace');
                          setEditorText('');
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                          editMode === 'find_replace'
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        <Replace size={11} />
                        <span>Buscar y Reemplazar</span>
                      </button>
                    </div>
                  </div>

                  {isEditorLoading ? (
                    <div className="py-6 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                      <RefreshCw size={14} className="animate-spin text-sky-400" />
                      <span>Leyendo documento desde Google Docs API...</span>
                    </div>
                  ) : (
                    <>
                      {editMode === 'find_replace' && (
                        <input
                          type="text"
                          value={findText}
                          onChange={(e) => setFindText(e.target.value)}
                          placeholder="Texto exacto a buscar en el Google Doc..."
                          className="w-full bg-[#07090e] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500/50"
                        />
                      )}
                      <textarea
                        value={editorText}
                        onChange={(e) => setEditorText(e.target.value)}
                        rows={6}
                        placeholder={
                          editMode === 'append'
                            ? 'Escribe los párrafos o escena que deseas añadir al final del documento...'
                            : editMode === 'find_replace'
                            ? 'Escribe el nuevo texto por el que se reemplazará...'
                            : 'Contenido completo del documento...'
                        }
                        className="w-full bg-[#07090e] border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-sky-500/50 resize-y font-sans leading-relaxed"
                      />
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-zinc-400">
                          Se solicitará tu confirmación antes de modificar el archivo en Google Drive.
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingFile(null)}
                            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleRequestSaveEdit}
                            disabled={editMode === 'find_replace' && !findText.trim()}
                            className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check size={13} />
                            <span>Guardar en Google Docs</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Filter Bar & Search Input */}
            <div className="px-4 sm:px-5 py-2.5 border-b border-[#18181c] bg-[#09090c] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center shrink-0">
              <div className="relative sm:col-span-6">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar archivos o capítulos en Google Drive..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadFiles(currentDriveFolderId, searchQuery)}
                  className="w-full bg-[#121216] border border-[#22222a] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-zinc-500 transition-colors"
                />
              </div>

              <div className="sm:col-span-6 flex items-center gap-1.5 justify-start sm:justify-end overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
                    activeCategoryFilter === 'all'
                      ? 'bg-white text-black font-semibold'
                      : 'text-zinc-400 hover:text-white bg-[#121216] border border-[#22222a]'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('docs')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 shrink-0 ${
                    activeCategoryFilter === 'docs'
                      ? 'bg-white text-black font-semibold'
                      : 'text-zinc-400 hover:text-white bg-[#121216] border border-[#22222a]'
                  }`}
                >
                  <FileText size={12} />
                  <span>Documentos</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter('images')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 shrink-0 ${
                    activeCategoryFilter === 'images'
                      ? 'bg-white text-black font-semibold'
                      : 'text-zinc-400 hover:text-white bg-[#121216] border border-[#22222a]'
                  }`}
                >
                  <ImageIcon size={12} />
                  <span>Imágenes</span>
                </button>
              </div>
            </div>

            {/* Notifications */}
            {fetchError && (
              <div className="mx-4 sm:mx-5 mt-2.5 p-2.5 bg-red-950/40 border border-red-900/50 text-red-300 rounded-xl text-xs flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-red-400" />
                  <span>{fetchError}</span>
                </div>
                <button onClick={() => setFetchError(null)} className="text-red-300 hover:text-white">
                  <X size={14} />
                </button>
              </div>
            )}

            {statusNotice && (
              <div className="mx-4 sm:mx-5 mt-2.5 p-2.5 bg-emerald-950/40 border border-emerald-500/35 text-emerald-200 rounded-xl text-xs flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                  <span>{statusNotice}</span>
                </div>
                <button onClick={() => setStatusNotice(null)} className="text-emerald-300 hover:text-white">
                  <X size={14} />
                </button>
              </div>
            )}

            {importSuccessCount !== null && (
              <div className="mx-4 sm:mx-5 mt-2.5 p-2.5 bg-zinc-800/80 border border-zinc-700 text-zinc-100 rounded-xl text-xs flex items-center gap-2 shrink-0">
                <CheckCircle2 size={15} className="shrink-0 text-white" />
                <span>Se importaron {importSuccessCount} documento(s) correctamente.</span>
              </div>
            )}

            {/* Drive Files List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 custom-scrollbar">
              {isLoadingFiles ? (
                <div className="flex flex-col items-center justify-center h-40 space-y-3 text-zinc-500">
                  <RefreshCw size={22} className="animate-spin text-zinc-300" />
                  <p className="text-xs">Cargando archivos desde Google Drive...</p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-zinc-800 rounded-2xl my-2">
                  <FileCode size={26} className="mx-auto text-zinc-600 mb-2" />
                  <p className="text-xs text-zinc-300 font-medium">No se encontraron archivos</p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                    Puedes crear un nuevo Google Doc arriba o cambiar de carpeta.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-zinc-400 border-b border-zinc-800/60 mb-2">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="flex items-center gap-2 hover:text-white cursor-pointer select-none font-mono"
                    >
                      {filteredFiles.filter((f) => !isFolder(f.mimeType)).length > 0 &&
                      filteredFiles
                        .filter((f) => !isFolder(f.mimeType))
                        .every((f) => selectedFileIds.includes(f.id)) ? (
                        <CheckSquare size={14} className="text-white" />
                      ) : (
                        <Square size={14} className="text-zinc-500" />
                      )}
                      <span>Seleccionar Todos los Documentos</span>
                    </button>

                    <div className="flex items-center gap-3">
                      {selectedDriveItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleRequestDeleteFiles(selectedDriveItems)}
                          className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>Borrar seleccionados ({selectedDriveItems.length})</span>
                        </button>
                      )}
                      <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                        {selectedFileIds.length} seleccionado(s)
                      </span>
                    </div>
                  </div>

                  {filteredFiles.map((file) => {
                    const isDir = isFolder(file.mimeType);
                    const isDoc = file.mimeType === 'application/vnd.google-apps.document';
                    const isEditableText =
                      isDoc ||
                      file.mimeType.startsWith('text/') ||
                      file.name.endsWith('.md') ||
                      file.name.endsWith('.txt');
                    const isImg = file.mimeType.startsWith('image/');
                    const isSelected = selectedFileIds.includes(file.id);

                    return (
                      <div
                        key={file.id}
                        onClick={() => {
                          if (isDir) {
                            handleNavigateToFolder(file.id, file.name);
                          } else {
                            handleToggleSelect(file.id);
                          }
                        }}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none gap-2 ${
                          isSelected
                            ? 'bg-white/[0.08] border-white/30 text-white'
                            : 'bg-[#0e0e12] border-[#1a1a22] hover:border-zinc-700 hover:bg-[#131319]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {!isDir && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelect(file.id);
                              }}
                              className="text-zinc-500 hover:text-white shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare size={16} className="text-white" />
                              ) : (
                                <Square size={16} />
                              )}
                            </button>
                          )}

                          <div className="shrink-0">
                            {isDir ? (
                              <FolderIcon size={17} className="text-amber-300/80" />
                            ) : isImg ? (
                              file.thumbnailLink && file.thumbnailLink.trim() ? (
                                <img
                                  src={file.thumbnailLink}
                                  alt=""
                                  className="w-7 h-7 rounded object-cover border border-zinc-700"
                                />
                              ) : (
                                <ImageIcon size={17} className="text-zinc-400" />
                              )
                            ) : (
                              <FileText size={17} className={isDoc ? 'text-sky-400' : 'text-zinc-400'} />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            {renamingFile?.id === file.id ? (
                              <div
                                className="flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRequestRename();
                                    if (e.key === 'Escape') setRenamingFile(null);
                                  }}
                                  className="bg-[#08080c] border border-sky-500/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={handleRequestRename}
                                  className="px-2 py-1 rounded bg-sky-500 text-slate-950 text-[11px] font-semibold"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenamingFile(null)}
                                  className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-[11px]"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <>
                                <h4 className="text-xs font-medium text-white truncate flex items-center gap-2">
                                  <span className="truncate">{file.name}</span>
                                  {isDoc && (
                                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 shrink-0">
                                      Google Doc
                                    </span>
                                  )}
                                </h4>
                                <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                                  {file.modifiedTime
                                    ? `Modificado: ${new Date(file.modifiedTime).toLocaleDateString()}`
                                    : isDir
                                    ? 'Carpeta de Google Drive'
                                    : 'Archivo de Google Drive'}
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Per-file Action Buttons: Preview, Live Edit, Rename, Delete */}
                        <div
                          className="flex items-center gap-1.5 shrink-0 self-end sm:self-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!isDir && (
                            <button
                              type="button"
                              onClick={(e) => handlePreviewFile(e, file)}
                              disabled={isPreviewLoadingId === file.id}
                              className="px-2 py-1 text-[11px] text-zinc-300 hover:text-white bg-[#16161d] hover:bg-[#202028] border border-zinc-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                              title="Vista previa del documento"
                            >
                              {isPreviewLoadingId === file.id ? (
                                <RefreshCw size={12} className="animate-spin text-amber-400" />
                              ) : (
                                <Eye size={12} />
                              )}
                              <span className="hidden md:inline">Ver</span>
                            </button>
                          )}

                          {isEditableText && (
                            <button
                              type="button"
                              onClick={(e) => handleOpenLiveEditor(e, file)}
                              className="px-2 py-1 text-[11px] text-sky-300 hover:text-sky-200 bg-sky-950/30 hover:bg-sky-900/40 border border-sky-500/30 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                              title="Editar contenido del Google Doc / archivo en directo"
                            >
                              <Edit3 size={12} />
                              <span>Editar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setRenamingFile(file);
                              setRenameValue(file.name);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-white bg-[#16161d] hover:bg-[#202028] border border-zinc-800 rounded-lg transition-colors cursor-pointer"
                            title="Renombrar archivo en Google Drive"
                          >
                            <FileCode size={12} />
                          </button>

                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-zinc-400 hover:text-white bg-[#16161d] hover:bg-[#202028] border border-zinc-800 rounded-lg transition-colors"
                              title="Abrir en Google Docs / Drive"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRequestDeleteFiles([file])}
                            className="p-1.5 text-zinc-400 hover:text-rose-400 bg-[#16161d] hover:bg-rose-950/40 border border-zinc-800 hover:border-rose-500/35 rounded-lg transition-colors cursor-pointer"
                            title="Mover a la papelera de Google Drive"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 sm:px-5 py-3 border-t border-[#18181c] bg-[#070709] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="text-[11px] text-zinc-400 font-mono truncate">
                {selectedFileIds.length > 0 ? (
                  <span className="text-white font-semibold">
                    {selectedFileIds.length} seleccionado(s)
                  </span>
                ) : (
                  <span>Selecciona archivos para importar o usa "Editar" / "Borrar"</span>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isImporting}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer min-h-[40px]"
                >
                  Cerrar
                </button>

                {onImportToChat && (
                  <button
                    type="button"
                    onClick={() => handleExecuteImport('chat')}
                    disabled={selectedFileIds.length === 0 || isImporting}
                    className="px-3.5 py-1.5 text-xs font-semibold text-black bg-white hover:bg-zinc-200 disabled:opacity-35 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                  >
                    {isImporting ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <FileText size={13} />
                    )}
                    <span>Adjuntar al Chat ({selectedFileIds.length})</span>
                  </button>
                )}

                {onImportLoreFiles && (
                  <button
                    type="button"
                    onClick={() => handleExecuteImport('lore')}
                    disabled={selectedFileIds.length === 0 || isImporting}
                    className="px-3.5 py-1.5 text-xs font-semibold text-zinc-100 bg-[#1a1a22] hover:bg-[#24242f] border border-white/15 disabled:opacity-35 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                  >
                    {isImporting ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    <span>Importar a Lore ({selectedFileIds.length})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Mandatory User Confirmation Modal for Destructive / Mutating Drive & Docs Operations */}
      <AnimatePresence>
        {pendingConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0c0c12] border border-zinc-800 rounded-2xl p-5 shadow-2xl text-white space-y-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    pendingConfirm.isDestructive
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                      : 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                  }`}
                >
                  {pendingConfirm.isDestructive ? <Trash2 size={17} /> : <Edit3 size={17} />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{pendingConfirm.title}</h4>
                  <p className="text-xs text-zinc-300 leading-relaxed mt-1">
                    {pendingConfirm.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  disabled={isExecutingMutation}
                  onClick={() => setPendingConfirm(null)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-medium text-zinc-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isExecutingMutation}
                  onClick={async () => {
                    setIsExecutingMutation(true);
                    setFetchError(null);
                    try {
                      await pendingConfirm.onConfirm();
                      setPendingConfirm(null);
                    } catch (err: any) {
                      setFetchError(err.message || 'Error al ejecutar la operación en Google Drive.');
                      setPendingConfirm(null);
                    } finally {
                      setIsExecutingMutation(false);
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                    pendingConfirm.isDestructive
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                  }`}
                >
                  {isExecutingMutation && <RefreshCw size={13} className="animate-spin" />}
                  <span>{pendingConfirm.confirmLabel}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <DocumentPreviewModal
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />
    </div>
  );
};
