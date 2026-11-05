// src/components/Sidebar.tsx
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Folder as FolderIcon,
  FolderPlus,
  MessageSquare,
  Plus,
  SlidersHorizontal,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Image as ImageIcon,
  Search,
  X,
  Sparkles,
  BarChart3,
  FolderInput,
  FolderOpen,
  ExternalLink,
  MoreHorizontal,
  Globe,
  Glasses,
} from 'lucide-react';
import { Folder, Chat, LoreFile } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { AuthButton } from './AuthButton';

interface SidebarProps {
  folders: Folder[];
  chats: Chat[];
  loreFiles: LoreFile[];
  activeChatId: string | null;
  activeFolderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: (folderId?: string | null) => void;
  onOpenFolderManager: (folderId: string) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onMoveChat?: (chatId: string, targetFolderId: string | null) => void;
  onRenameChat?: (chatId: string, newTitle: string) => void;
  onSearchInChat?: (chatId: string) => void;
  onExportChat?: (chatId: string) => void;
  onOpenChatDriveSheet?: (chat: Chat) => void;
  onOpenSettings: () => void;
  onOpenMediaGallery: () => void;
  onOpenStats?: () => void;
  onOpenLanding?: () => void;
  onOpenVrSanctuary?: () => void;
  sessionMediaCount: number;
  isStreaming?: boolean;
  asideRef?: React.RefObject<HTMLElement | null>;
  backdropRef?: React.RefObject<HTMLDivElement | null>;
}

interface SidebarChatItemProps {
  chat: Chat;
  isActive: boolean;
  isStreaming?: boolean;
  onSelect: (chatId: string) => void;
  onOpenSheet: (chat: Chat) => void;
  onCloseSidebarOnMobile: () => void;
}

const SidebarChatItem = React.memo<SidebarChatItemProps>(({
  chat,
  isActive,
  isStreaming = false,
  onSelect,
  onOpenSheet,
  onCloseSidebarOnMobile,
}) => {
  const [isPressing, setIsPressing] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const didLongPressTriggerRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    didLongPressTriggerRef.current = false;
    setIsPressing(true);
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      didLongPressTriggerRef.current = true;
      setIsPressing(false);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(20); } catch {}
      }
      onOpenSheet(chat);
    }, 280);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !longPressTimerRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 8 || dy > 8) {
      setIsPressing(false);
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    setIsPressing(false);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleClick = () => {
    if (didLongPressTriggerRef.current) {
      didLongPressTriggerRef.current = false;
      return;
    }
    onSelect(chat.id);
    if (window.innerWidth < 768) onCloseSidebarOnMobile();
  };

  return (
    <div
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        setIsPressing(false);
        onOpenSheet(chat);
      }}
      className={`group/chat flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer text-xs select-none transition-all duration-150 ${
        isPressing
          ? 'scale-[0.96] bg-amber-500/15 border border-amber-500/40 text-zinc-900 dark:text-white shadow-sm'
          : isActive
          ? 'bg-zinc-200/90 dark:bg-[#18181d] text-zinc-900 dark:text-white font-semibold border border-zinc-300 dark:border-[#27272d] shadow-xs active:scale-[0.98]'
          : 'text-zinc-600 dark:text-[#a1a1aa] hover:bg-zinc-200/60 dark:hover:bg-[#121216] hover:text-zinc-900 dark:hover:text-white active:scale-[0.98]'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <MessageSquare
          size={13}
          className={
            isPressing || isActive
              ? 'text-amber-400 shrink-0 transition-transform duration-150 scale-110'
              : 'text-[#71717a] shrink-0 transition-transform duration-150'
          }
        />
        <span
          className={`truncate inline-block max-w-full ${
            isStreaming ? 'chat-title-streaming-fade' : ''
          }`}
        >
          {chat.title}
        </span>
      </div>

      <div className="flex items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover/chat:opacity-100 transition-opacity shrink-0">
        <button
          type="button"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenSheet(chat);
          }}
          className="p-1 min-h-[32px] min-w-[32px] text-[#71717a] hover:text-white hover:bg-[#1f1f23] rounded flex items-center justify-center transition-colors cursor-pointer"
          title="Opciones del chat"
          aria-label="Opciones del chat"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.chat.id === next.chat.id &&
    prev.chat.title === next.chat.title &&
    prev.chat.folderId === next.chat.folderId &&
    prev.isActive === next.isActive &&
    prev.isStreaming === next.isStreaming
  );
});

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  folders,
  chats,
  loreFiles,
  activeChatId,
  activeFolderId,
  isOpen,
  onClose,
  onSelectChat,
  onNewChat,
  onOpenFolderManager,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDeleteChat,
  onMoveChat,
  onRenameChat,
  onSearchInChat,
  onExportChat,
  onOpenChatDriveSheet,
  onOpenSettings,
  onOpenMediaGallery,
  onOpenStats,
  onOpenLanding,
  onOpenVrSanctuary,
  sessionMediaCount,
  isStreaming = false,
  asideRef,
  backdropRef,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [chatToMove, setChatToMove] = useState<Chat | null>(null);

  const handleOpenSheet = React.useCallback((chat: Chat) => {
    if (onOpenChatDriveSheet) onOpenChatDriveSheet(chat);
  }, [onOpenChatDriveSheet]);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    folders.forEach((f, idx) => {
      initial[f.id] = idx === 0 || f.id === activeFolderId;
    });
    return initial;
  });

  const toggleFolder = (folderId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const filteredChats = chats.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        ref={backdropRef}
        className={`fixed inset-0 z-40 bg-black/75 md:hidden transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar Panel: Smooth Interactive 120Hz Drawer on Mobile (< md) + Collapsible OpenWebUI Panel on Desktop (md+) */}
      <aside
        ref={asideRef as React.RefObject<HTMLElement>}
        className={`fixed md:relative inset-y-0 left-0 z-50 md:z-40 flex flex-col shrink-0 bg-[#070709] border-[#1f1f23] text-white select-none transform-gpu will-change-transform transition-[width,transform,opacity,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden ${
          isOpen
            ? 'w-[280px] max-w-[85vw] translate-x-0 opacity-100 border-r shadow-[16px_0_48px_rgba(0,0,0,0.65)] md:shadow-none pointer-events-auto'
            : 'w-[280px] max-w-[85vw] -translate-x-full md:w-0 md:translate-x-0 md:opacity-0 border-r-0 shadow-none pointer-events-none'
        }`}
      >
        <div className="w-[280px] max-w-[85vw] flex flex-col h-full min-h-0">
        {/* Top Header / Branding */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#18181c]">
          <div className="flex items-center gap-2.5">
            <div className="kz-brand-badge w-7 h-7 rounded-md bg-zinc-900 dark:bg-[#121215] border border-zinc-800 dark:border-[#27272b] flex items-center justify-center font-mono font-semibold text-xs text-white">
              KZ
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-white block">
                Kizuna-Zek
              </span>
              <span className="text-[10px] text-[#71717a] font-mono tracking-wider block uppercase">
                Noir Workspace
              </span>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center text-[#a1a1aa] hover:text-white rounded-lg hover:bg-[#161619] transition-colors cursor-pointer"
            aria-label="Cerrar barra lateral"
            title="Ocultar barra lateral"
          >
            <X size={17} />
          </motion.button>
        </div>

        {/* Action Button: New Chat (General / Unfiled) */}
        <div className="p-3">
          <motion.button
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => {
              onNewChat(null);
              if (window.innerWidth < 768) onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] text-xs font-semibold text-black bg-white rounded-md hover:bg-[#e4e4e7] active:bg-[#d4d4d8] active:scale-95 transition-transform shadow-xs cursor-pointer"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Nuevo Chat Libre</span>
          </motion.button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative flex items-center">
            <Search
              size={13}
              className="absolute left-2.5 text-[#71717a] pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0d0d10] border border-[#1f1f23] rounded-md py-2 pl-8 pr-3 text-[16px] md:text-xs text-white placeholder-[#71717a] focus:outline-none focus:border-[#38383e] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[#71717a] hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Navigation Area */}
        <div className="flex-1 overflow-y-auto px-2 py-1 smooth-scroll space-y-4">
          {/* Folders / Project Arcs Section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-mono text-[#71717a] uppercase tracking-wider">
              <span>Workspaces & Arcs</span>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onCreateFolder}
                className="p-1 hover:text-white hover:bg-[#161619] rounded transition-colors"
                title="Create New Folder/Arc"
                aria-label="Create Folder"
              >
                <FolderPlus size={13} />
              </motion.button>
            </div>

            <div className="mt-1 space-y-0.5">
              {folders.map((folder) => {
                const folderChats = filteredChats.filter((c) => c.folderId === folder.id);
                const isExpanded = Boolean(expandedFolders[folder.id]);
                const folderLoreCount = loreFiles.filter((l) => l.folderId === folder.id).length;

                return (
                  <div key={folder.id} className="rounded group/folder">
                    {/* Folder row */}
                    <div
                      onClick={() => toggleFolder(folder.id)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                        activeFolderId === folder.id
                          ? 'bg-[#141418] text-white font-medium'
                          : 'text-[#a1a1aa] hover:bg-[#101014] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          className="text-[#71717a] hover:text-white shrink-0 p-0.5"
                          onClick={(e) => toggleFolder(folder.id, e)}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                        <FolderIcon
                          size={14}
                          className={activeFolderId === folder.id ? 'text-white' : 'text-[#71717a]'}
                        />
                        <span className="truncate">{folder.name}</span>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover/folder:opacity-100 transition-opacity">
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedFolders((prev) => ({ ...prev, [folder.id]: true }));
                            onNewChat(folder.id);
                            if (window.innerWidth < 768) onClose();
                          }}
                          className="p-1 text-[#71717a] hover:text-white hover:bg-[#1f1f23] rounded"
                          title="Nuevo chat en este proyecto"
                        >
                          <Plus size={12} />
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFolderManager(folder.id);
                          }}
                          className="p-1 text-[#71717a] hover:text-white hover:bg-[#1f1f23] rounded"
                          title="Manage Lore & System Prompt"
                        >
                          <BookOpen size={12} />
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRenameFolder(folder);
                          }}
                          className="p-1 text-[#71717a] hover:text-white hover:bg-[#1f1f23] rounded"
                          title="Rename Folder"
                        >
                          <Edit2 size={12} />
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFolderToDelete(folder);
                          }}
                          className="p-1 text-[#71717a] hover:text-red-400 hover:bg-[#1f1f23] rounded"
                          title="Delete Folder"
                        >
                          <Trash2 size={12} />
                        </motion.button>
                      </div>

                      <span className="text-[10px] font-mono text-[#52525b] hidden sm:inline sm:group-hover/folder:hidden shrink-0 ml-1">
                        {folderChats.length}
                      </span>
                    </div>

                    {/* Sub-list: Chats within Folder */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.15 }}
                          className="pl-5 pr-1 py-1 space-y-0.5 border-l border-[#1a1a1e] ml-3.5 my-0.5 overflow-hidden"
                        >
                          {/* Folder Lore summary pill */}
                          <div
                            onClick={() => onOpenFolderManager(folder.id)}
                            className="flex items-center justify-between px-2 py-1 text-[11px] text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#101014] rounded cursor-pointer transition-colors"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <BookOpen size={11} />
                              <span>Lore Storage ({folderLoreCount}/200)</span>
                            </span>
                            <span className="text-[10px] text-[#52525b] font-mono">Edit</span>
                          </div>

                          {folderChats.length === 0 ? (
                            <div className="px-2 py-1 text-[11px] text-[#52525b] italic">
                              No chats in this arc
                            </div>
                          ) : (
                            folderChats.map((chat) => {
                              const isChatActive = activeChatId === chat.id;
                              const isChatStreaming =
                                (isChatActive && isStreaming) ||
                                chat.messages.some(
                                  (m) => m.isStreaming || m.isThinking || m.generationState?.isGenerating
                                );
                              return (
                                <SidebarChatItem
                                  key={chat.id}
                                  chat={chat}
                                  isActive={isChatActive}
                                  isStreaming={isChatStreaming}
                                  onSelect={onSelectChat}
                                  onOpenSheet={handleOpenSheet}
                                  onCloseSidebarOnMobile={onClose}
                                />
                              );
                            })
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Unfiled / General Chats Section */}
          {filteredChats.filter((c) => !c.folderId).length > 0 && (
            <div>
              <div className="px-2 py-1 text-[11px] font-mono text-[#71717a] uppercase tracking-wider">
                Unfiled Chats
              </div>
              <div className="mt-1 space-y-0.5">
                {filteredChats
                  .filter((c) => !c.folderId)
                  .map((chat) => {
                    const isChatActive = activeChatId === chat.id;
                    const isChatStreaming =
                      (isChatActive && isStreaming) ||
                      chat.messages.some(
                        (m) => m.isStreaming || m.isThinking || m.generationState?.isGenerating
                      );
                    return (
                      <SidebarChatItem
                        key={chat.id}
                        chat={chat}
                        isActive={isChatActive}
                        isStreaming={isChatStreaming}
                        onSelect={onSelectChat}
                        onOpenSheet={handleOpenSheet}
                        onCloseSidebarOnMobile={onClose}
                      />
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Bar Controls: Compact OpenWebUI / Gemini Style Dock */}
        <div className="p-2.5 border-t border-[#18181c] bg-[#09090b] space-y-2">
          {/* Row 1: Compact Utility Dock (La Cajita, VR 3D, Drive, Stats, Showcase) */}
          <div className="grid grid-cols-5 gap-1">
            <button
              type="button"
              onClick={onOpenMediaGallery}
              className="relative flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-[#101014] hover:bg-[#18181f] border border-[#1f1f23] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer"
              title={`La Cajita · Galería Multimedia (${sessionMediaCount})`}
            >
              <ImageIcon size={14} />
              <span className="text-[9.5px] font-medium truncate max-w-full px-0.5">Cajita</span>
              {sessionMediaCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-zinc-200 text-black text-[9px] font-mono font-bold flex items-center justify-center">
                  {sessionMediaCount}
                </span>
              )}
            </button>

            {onOpenVrSanctuary && (
              <button
                type="button"
                onClick={() => {
                  if (window.innerWidth < 768) onClose();
                  onOpenVrSanctuary();
                }}
                className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-[#101014] hover:bg-sky-950/35 border border-[#1f1f23] hover:border-sky-500/40 text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
                title="Santuario VR 3D Interactivo (Quest 3 · PSVR2)"
              >
                <Glasses size={14} />
                <span className="text-[9.5px] font-medium truncate max-w-full px-0.5">VR 3D</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const driveUrl = localStorage.getItem('kizuna_drive_url') || 'https://drive.google.com/drive/my-drive';
                window.open(driveUrl, '_blank', 'noopener,noreferrer');
              }}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-[#101014] hover:bg-[#18181f] border border-[#1f1f23] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer"
              title="Abrir mi carpeta en Google Drive"
            >
              <FolderOpen size={14} />
              <span className="text-[9.5px] font-medium truncate max-w-full px-0.5">Drive</span>
            </button>

            {onOpenStats && (
              <button
                type="button"
                onClick={onOpenStats}
                className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-[#101014] hover:bg-[#18181f] border border-[#1f1f23] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer"
                title="Estadísticas y Heatmap de Actividad"
              >
                <BarChart3 size={14} />
                <span className="text-[9.5px] font-medium truncate max-w-full px-0.5">Stats</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg bg-[#101014] hover:bg-[#18181f] border border-[#1f1f23] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer"
              title="Configuración de Modelos, Memorias y Respaldo"
            >
              <SlidersHorizontal size={14} />
              <span className="text-[9.5px] font-medium truncate max-w-full px-0.5">Ajustes</span>
            </button>
          </div>

          {/* Row 2: Firebase Authentication & Cloud Sync Session */}
          <AuthButton />
        </div>
        </div>
      </aside>

      {/* Quick Confirmation Modal for Chat Deletion */}
      <ConfirmModal
        isOpen={Boolean(chatToDelete)}
        title="Eliminar este chat?"
        description="¿Estás seguro de que deseas eliminar este chat? Solo se borrará esta conversación y no afectará al resto de tus sesiones."
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (chatToDelete) {
            onDeleteChat(chatToDelete);
            setChatToDelete(null);
          }
        }}
        onClose={() => setChatToDelete(null)}
      />

      {/* Confirmation Modal for Folder Deletion */}
      <ConfirmModal
        isOpen={Boolean(folderToDelete)}
        title="¿Eliminar carpeta y todos sus chats?"
        description={
          folderToDelete
            ? `¿Estás seguro de que deseas eliminar la carpeta "${folderToDelete.name}" y todos sus archivos de lore? Los chats pasarán a la sección general sin archivar.`
            : ''
        }
        confirmLabel="Eliminar carpeta"
        onConfirm={() => {
          if (folderToDelete) {
            onDeleteFolder(folderToDelete.id);
            setFolderToDelete(null);
          }
        }}
        onClose={() => setFolderToDelete(null)}
      />

      {/* Reassign / Move Chat Folder Modal */}
      <AnimatePresence>
        {chatToMove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#09090c] border border-[#222226] rounded-xl shadow-2xl p-5 text-white space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#18181c] pb-3">
                <div className="flex items-center gap-2">
                  <FolderInput size={16} className="text-white" />
                  <h3 className="text-sm font-semibold text-white">Mover Conversación</h3>
                </div>
                <button
                  onClick={() => setChatToMove(null)}
                  className="p-1 text-[#71717a] hover:text-white rounded"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="text-xs text-[#a1a1aa] font-mono truncate">
                Reasignar "<span className="text-white font-medium">{chatToMove.title}</span>":
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto smooth-scroll pr-1">
                {/* Unfiled option */}
                <button
                  type="button"
                  onClick={() => {
                    if (onMoveChat) onMoveChat(chatToMove.id, null);
                    setChatToMove(null);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-xs font-mono text-left transition-colors ${
                    !chatToMove.folderId
                      ? 'bg-white text-black border-white font-semibold'
                      : 'bg-[#101014] text-[#d4d4d8] border-[#1f1f23] hover:border-[#38383e] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <MessageSquare size={13} />
                    <span>Sin archivar (General)</span>
                  </span>
                  {!chatToMove.folderId && <span className="text-[10px] uppercase">Actual</span>}
                </button>

                {/* List of folders */}
                {folders.map((f) => {
                  const isCurrent = chatToMove.folderId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        if (onMoveChat) onMoveChat(chatToMove.id, f.id);
                        setChatToMove(null);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-xs font-mono text-left transition-colors ${
                        isCurrent
                          ? 'bg-white text-black border-white font-semibold'
                          : 'bg-[#101014] text-[#d4d4d8] border-[#1f1f23] hover:border-[#38383e] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <FolderIcon size={13} />
                        <span className="truncate">{f.name}</span>
                      </span>
                      {isCurrent && <span className="text-[10px] uppercase">Actual</span>}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </>
  );
}, (prev, next) => {
  // If Sidebar is closed on mobile (< 768px), skip all background re-renders completely
  if (!prev.isOpen && !next.isOpen && typeof window !== 'undefined' && window.innerWidth < 768) {
    return true;
  }
  const prevActiveTitle = prev.chats.find((c) => c.id === prev.activeChatId)?.title;
  const nextActiveTitle = next.chats.find((c) => c.id === next.activeChatId)?.title;
  return (
    prev.isOpen === next.isOpen &&
    prev.activeChatId === next.activeChatId &&
    prev.activeFolderId === next.activeFolderId &&
    prev.isStreaming === next.isStreaming &&
    prev.sessionMediaCount === next.sessionMediaCount &&
    prev.folders.length === next.folders.length &&
    prev.loreFiles.length === next.loreFiles.length &&
    prev.chats.length === next.chats.length &&
    prevActiveTitle === nextActiveTitle
  );
});
