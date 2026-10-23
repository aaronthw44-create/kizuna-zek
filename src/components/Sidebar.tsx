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
  onOpenSettings: () => void;
  onOpenMediaGallery: () => void;
  onOpenStats?: () => void;
  sessionMediaCount: number;
}

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
  onOpenSettings,
  onOpenMediaGallery,
  onOpenStats,
  sessionMediaCount,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [chatToMove, setChatToMove] = useState<Chat | null>(null);
  const drawerTouchRef = useRef<{ x: number; y: number } | null>(null);

  const handleDrawerTouchStart = (e: React.TouchEvent) => {
    drawerTouchRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleDrawerTouchEnd = (e: React.TouchEvent) => {
    if (!drawerTouchRef.current) return;
    const deltaX = e.changedTouches[0].clientX - drawerTouchRef.current.x;
    const deltaY = e.changedTouches[0].clientY - drawerTouchRef.current.y;
    // Fast swipe left (> 50px horizontally) closes drawer with zero lag
    if (deltaX < -50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      onClose();
    }
    drawerTouchRef.current = null;
  };
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
        className={`fixed inset-0 z-40 bg-black/75 md:hidden transition-opacity duration-200 ease-out ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar Panel with Hardware-Accelerated CSS Transitions */}
      <aside
        onTouchStart={handleDrawerTouchStart}
        onTouchEnd={handleDrawerTouchEnd}
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col w-[290px] max-w-[85vw] shrink-0 bg-[#070709] border-r border-[#1f1f23] text-white select-none transform-gpu transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${!isOpen ? 'pointer-events-none md:pointer-events-auto' : ''}`}
      >
        {/* Top Header / Branding */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#18181c]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[#121215] border border-[#27272b] flex items-center justify-center font-mono font-semibold text-xs text-white">
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
            whileTap={{ scale: 0.94 }}
            onClick={onClose}
            className="md:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#a1a1aa] hover:text-white rounded hover:bg-[#161619] active:scale-95 transition-transform"
            aria-label="Close Sidebar"
          >
            <X size={18} />
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
                              <span>Lore Storage ({folderLoreCount}/55)</span>
                            </span>
                            <span className="text-[10px] text-[#52525b] font-mono">Edit</span>
                          </div>

                          {folderChats.length === 0 ? (
                            <div className="px-2 py-1 text-[11px] text-[#52525b] italic">
                              No chats in this arc
                            </div>
                          ) : (
                            folderChats.map((chat) => (
                              <div
                                key={chat.id}
                                onClick={() => {
                                  onSelectChat(chat.id);
                                  if (window.innerWidth < 768) onClose();
                                }}
                                className={`group/chat flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                                  activeChatId === chat.id
                                    ? 'bg-[#18181d] text-white font-medium border border-[#27272d]'
                                    : 'text-[#a1a1aa] hover:bg-[#121216] hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <MessageSquare
                                    size={13}
                                    className={activeChatId === chat.id ? 'text-white' : 'text-[#71717a]'}
                                  />
                                  <span className="truncate">{chat.title}</span>
                                </div>
                                <div className="flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover/chat:opacity-100 transition-opacity">
                                  {onMoveChat && (
                                    <motion.button
                                      whileTap={{ scale: 0.85 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setChatToMove(chat);
                                      }}
                                      className="p-1 text-[#71717a] hover:text-white hover:bg-[#1f1f23] rounded transition-colors"
                                      title="Mover de carpeta"
                                      aria-label="Mover de carpeta"
                                    >
                                      <FolderInput size={12} />
                                    </motion.button>
                                  )}
                                  <motion.button
                                    whileTap={{ scale: 0.85 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setChatToDelete(chat.id);
                                    }}
                                    className="p-1 text-[#71717a] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                    title="Eliminar este chat"
                                    aria-label="Eliminar este chat"
                                  >
                                    <Trash2 size={12} />
                                  </motion.button>
                                </div>
                              </div>
                            ))
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
                  .map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => {
                        onSelectChat(chat.id);
                        if (window.innerWidth < 768) onClose();
                      }}
                      className={`group/chat flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                        activeChatId === chat.id
                          ? 'bg-[#18181d] text-white font-medium border border-[#27272d]'
                          : 'text-[#a1a1aa] hover:bg-[#121216] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MessageSquare
                          size={13}
                          className={activeChatId === chat.id ? 'text-white' : 'text-[#71717a]'}
                        />
                        <span className="truncate">{chat.title}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover/chat:opacity-100 transition-opacity">
                        {onMoveChat && (
                          <motion.button
                            whileTap={{ scale: 0.85 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChatToMove(chat);
                            }}
                            className="p-1 text-[#71717a] hover:text-white hover:bg-[#1f1f23] rounded transition-colors"
                            title="Mover de carpeta"
                            aria-label="Mover de carpeta"
                          >
                            <FolderInput size={12} />
                          </motion.button>
                        )}
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatToDelete(chat.id);
                          }}
                          className="p-1 text-[#71717a] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Eliminar este chat"
                          aria-label="Eliminar este chat"
                        >
                          <Trash2 size={12} />
                        </motion.button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Bar Controls: Session Media Gallery & Settings */}
        <div className="p-3 border-t border-[#18181c] bg-[#09090b] space-y-1.5">
          {/* Firebase Authentication Session */}
          <AuthButton className="mb-1" />

          {/* Session Media Gallery button (Cajita) */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onOpenMediaGallery}
            className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-[#d4d4d8] hover:text-white bg-[#101014] hover:bg-[#16161a] border border-[#1f1f23] rounded-md transition-colors"
          >
            <span className="flex items-center gap-2 font-medium">
              <ImageIcon size={14} className="text-[#a1a1aa]" />
              <span>Media Gallery (Cajita)</span>
            </span>
            <span className="text-[11px] font-mono px-1.5 py-0.2 bg-[#1f1f23] text-[#d4d4d8] rounded">
              {sessionMediaCount}
            </span>
          </motion.button>

          {/* Statistics & Heatmap Button (RikkaHub) */}
          {onOpenStats && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onOpenStats}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-[#d4d4d8] hover:text-white bg-[#101014] hover:bg-[#16161a] border border-[#1f1f23] rounded-md transition-colors"
            >
              <span className="flex items-center gap-2 font-medium">
                <BarChart3 size={14} className="text-[#a1a1aa]" />
                <span>Estadísticas & Heatmap</span>
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#1f1f23] text-[#d4d4d8] rounded">
                RikkaHub
              </span>
            </motion.button>
          )}

          {/* Google Drive Launcher Button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              const driveUrl = localStorage.getItem('kizuna_drive_url') || 'https://drive.google.com/drive/my-drive';
              window.open(driveUrl, '_blank', 'noopener,noreferrer');
            }}
            className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-[#d4d4d8] hover:text-white bg-[#101014] hover:bg-[#16161a] border border-[#1f1f23] rounded-md transition-colors"
          >
            <span className="flex items-center gap-2 font-medium">
              <FolderOpen size={14} className="text-[#a1a1aa]" />
              <span>Mi Carpeta en Drive</span>
            </span>
            <ExternalLink size={12} className="text-[#71717a]" />
          </motion.button>

          {/* Model Settings Button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onOpenSettings}
            className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-[#a1a1aa] hover:text-white hover:bg-[#121215] rounded-md transition-colors"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal size={14} />
              <span>Model & Memory Config</span>
            </span>
            <span className="text-[10px] font-mono text-[#52525b]">1M ctx</span>
          </motion.button>
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
});
