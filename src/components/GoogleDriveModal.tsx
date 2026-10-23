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
  ArrowLeft,
  CloudDownload,
  AlertCircle,
  FileCode,
  Sparkles,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { Attachment, LoreFile } from '../types';
import { DocumentPreviewModal, DocumentPreviewItem } from './DocumentPreviewModal';
import {
  initAuthListener,
  signInWithGoogle,
  signOutGoogle,
  listDriveFiles,
  importDriveFileContent,
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
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = initAuthListener(
      (u, token) => {
        setUser(u);
        setAccessToken(token);
        setIsAuthChecking(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setIsAuthChecking(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-xs modal-backdrop-fluid">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="flex flex-col w-full max-w-4xl max-h-[82dvh] sm:max-h-[88vh] bg-[#09090b] border border-[#222228] rounded-2xl shadow-2xl text-white overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[#18181c] bg-[#070709] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-200 shrink-0">
              <CloudDownload size={17} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                <span className="truncate">Google Drive & Docs</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-zinc-300">
                  Integración Directa
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400 truncate">
                Selecciona capítulos, manuscritos e imágenes de Google Drive
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
                Conectar con Google Drive
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Inicia sesión con tu cuenta de Google para acceder a tus documentos de Google Docs (como los capítulos de <em>Jukkou No Zankyou</em>), Word, PDFs e imágenes.
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
              <span>{isSigningIn ? 'Conectando...' : 'Iniciar Sesión con Google'}</span>
            </button>
          </div>
        ) : (
          /* Authenticated Explorer View */
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

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => loadFiles(currentDriveFolderId, searchQuery)}
                  disabled={isLoadingFiles}
                  className="px-2.5 py-1 text-[11px] font-medium bg-[#16161d] hover:bg-[#202028] border border-zinc-800 text-zinc-300 hover:text-white rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 min-h-[32px]"
                  title="Sincronizar y actualizar lista de archivos desde Google Drive"
                >
                  <RefreshCw size={12} className={isLoadingFiles ? 'animate-spin text-amber-400' : ''} />
                  <span>{isLoadingFiles ? 'Cargando...' : 'Actualizar'}</span>
                </button>

                {user && (
                  <div className="flex items-center gap-2 bg-[#141418] border border-zinc-800 px-2.5 py-1 rounded-full text-[11px] text-zinc-300">
                    {user.photoURL && user.photoURL.trim() ? (
                      <img src={user.photoURL} alt="" className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-zinc-700 text-white font-bold flex items-center justify-center text-[9px]">
                        {user.displayName?.charAt(0) || 'G'}
                      </div>
                    )}
                    <span className="truncate max-w-[130px] font-medium">{user.email || user.displayName}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="p-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                  title="Cerrar sesión de Google"
                >
                  <LogOut size={13} />
                  <span className="hidden sm:inline">Cerrar Sesión</span>
                </button>
              </div>
            </div>

            {/* Filter Bar & Search Input */}
            <div className="px-4 sm:px-5 py-2.5 border-b border-[#18181c] bg-[#09090c] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center shrink-0">
              {/* Search Bar */}
              <div className="relative sm:col-span-6">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar archivos en Google Drive..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadFiles(currentDriveFolderId, searchQuery)}
                  className="w-full bg-[#121216] border border-[#22222a] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-zinc-500 transition-colors"
                />
              </div>

              {/* Category Filters (Monochromatic Noir) */}
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

                <button
                  type="button"
                  onClick={() => loadFiles(currentDriveFolderId, searchQuery)}
                  disabled={isLoadingFiles}
                  className="p-1.5 text-zinc-400 hover:text-white bg-[#121216] border border-[#22222a] rounded-lg cursor-pointer transition-colors shrink-0"
                  title="Actualizar lista"
                >
                  <RefreshCw size={13} className={isLoadingFiles ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Notification / Error / Progress Banner */}
            {fetchError && (
              <div className="mx-4 sm:mx-5 mt-2.5 p-2.5 bg-red-950/40 border border-red-900/50 text-red-300 rounded-xl text-xs flex items-center gap-2 shrink-0">
                <AlertCircle size={15} className="shrink-0 text-red-400" />
                <span>{fetchError}</span>
              </div>
            )}

            {importSuccessCount !== null && (
              <div className="mx-4 sm:mx-5 mt-2.5 p-2.5 bg-zinc-800/80 border border-zinc-700 text-zinc-100 rounded-xl text-xs flex items-center gap-2 shrink-0">
                <CheckCircle2 size={15} className="shrink-0 text-white" />
                <span>Se importaron {importSuccessCount} documento(s) correctamente.</span>
              </div>
            )}

            {/* Drive Files Grid / List (Flexible height so footer never clips on mobile) */}
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
                    Intenta cambiar los filtros o navegar a otra carpeta de tu Google Drive.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {/* Select All Bar */}
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

                    <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                      {selectedFileIds.length} seleccionado(s)
                    </span>
                  </div>

                  {filteredFiles.map((file) => {
                    const isDir = isFolder(file.mimeType);
                    const isDoc = file.mimeType === 'application/vnd.google-apps.document';
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
                        className={`flex items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none ${
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

                          {/* Icon (Monochromatic Noir) */}
                          <div className="shrink-0">
                            {isDir ? (
                              <FolderIcon size={17} className="text-zinc-300" />
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
                              <FileText size={17} className="text-zinc-400" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-medium text-white truncate flex items-center gap-2">
                              <span className="truncate">{file.name}</span>
                              {isDoc && (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/[0.06] border border-white/15 text-zinc-300 shrink-0">
                                  Google Doc
                                </span>
                              )}
                            </h4>
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                              {file.modifiedTime
                                ? `Modificado: ${new Date(file.modifiedTime).toLocaleDateString()}`
                                : isDir
                                ? 'Carpeta de Google Drive'
                                : 'Documento de Google Drive'}
                            </p>
                          </div>

                          {!isDir && (
                            <button
                              type="button"
                              onClick={(e) => handlePreviewFile(e, file)}
                              disabled={isPreviewLoadingId === file.id}
                              className="px-2 py-1 text-[11px] text-zinc-300 hover:text-white bg-[#16161d] hover:bg-[#202028] border border-zinc-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                              title="Vista previa en Kizuna-Zek"
                            >
                              {isPreviewLoadingId === file.id ? (
                                <RefreshCw size={12} className="animate-spin text-amber-400" />
                              ) : (
                                <Eye size={12} />
                              )}
                              <span className="hidden sm:inline">Vista Previa</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer (Always visible, shrink-0, clean Noir buttons) */}
            <div className="px-4 sm:px-5 py-3 border-t border-[#18181c] bg-[#070709] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="text-[11px] text-zinc-400 font-mono truncate">
                {selectedFileIds.length > 0 ? (
                  <span className="text-white font-semibold">
                    {selectedFileIds.length} seleccionado(s)
                  </span>
                ) : (
                  <span>Toca un archivo para seleccionar</span>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isImporting}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer min-h-[40px]"
                >
                  Cancelar
                </button>

                {onImportToChat && (
                  <button
                    type="button"
                    onClick={() => handleExecuteImport('chat')}
                    disabled={selectedFileIds.length === 0 || isImporting}
                    className="px-3.5 py-1.5 text-xs font-semibold text-black bg-white hover:bg-zinc-200 disabled:opacity-35 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                    title="Adjuntar al mensaje del chat para consultarlo de inmediato"
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
                    title="Guardar como documentos permanentes de Lore en el proyecto"
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
      <DocumentPreviewModal
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />
    </div>
  );
};
