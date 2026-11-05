import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare,
  Edit2,
  Search,
  FolderInput,
  Trash2,
  Download,
  X,
  Check,
  Folder as FolderIcon,
  ChevronRight,
} from 'lucide-react';
import { Chat, Folder } from '../types';

interface ChatDriveSheetModalProps {
  isOpen: boolean;
  chat: Chat | null;
  folders?: Folder[];
  onClose: () => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onMoveChat?: (chatId: string, targetFolderId: string | null) => void;
  onDeleteChat: (chatId: string) => void;
  onSearchInChat?: (chatId: string) => void;
  onExportChat?: (chatId: string) => void;
}

export const ChatDriveSheetModal: React.FC<ChatDriveSheetModalProps> = ({
  isOpen,
  chat,
  folders = [],
  onClose,
  onRenameChat,
  onMoveChat,
  onDeleteChat,
  onSearchInChat,
  onExportChat,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  // Cache chat so exit animation stays fluid even when parent clears chat state
  const [cachedChat, setCachedChat] = useState<Chat | null>(chat);
  useEffect(() => {
    if (chat) {
      setCachedChat(chat);
      setTitleInput(chat.title);
      setIsRenaming(false);
      setIsFolderPickerOpen(false);
      setIsConfirmingDelete(false);
    }
  }, [chat, isOpen]);

  const activeChatData = chat || cachedChat;

  const handleSaveTitle = () => {
    if (!activeChatData) return;
    if (titleInput.trim() && titleInput.trim() !== activeChatData.title) {
      onRenameChat(activeChatData.id, titleInput.trim());
    }
    setIsRenaming(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && activeChatData && (
        <motion.div
          key="chat-drive-sheet-wrapper"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          {/* Backdrop click to close */}
          <div
            onClick={onClose}
            className="absolute inset-0 bg-black/75 cursor-pointer"
          />

          {/* Sheet / Modal Container - Hardware accelerated, fast 120Hz native curve without layout recalculations */}
          <motion.div
            key="chat-drive-sheet-container"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.22 }}
            className="relative w-full sm:max-w-md bg-white dark:bg-[#121216] border-t sm:border border-zinc-200 dark:border-[#27272a] shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden p-4 text-zinc-900 dark:text-white z-10 transform-gpu will-change-transform"
          >
            {/* Mobile Drag Handle */}
            <div className="w-10 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto mb-3 sm:hidden" />

            {/* Sheet Header */}
            <div className="flex items-start justify-between border-b border-zinc-200 dark:border-[#222226] pb-3 mb-2">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                  <MessageSquare size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white truncate leading-tight">
                    {activeChatData.title}
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                    {activeChatData.messages.length} mensajes • {activeChatData.folderId ? 'En carpeta' : 'Chat libre'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 min-h-[44px] min-w-[44px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors active:scale-95"
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {/* Mode 1: Rename Input inline */}
              {isRenaming ? (
                <motion.div
                  key="rename-view"
                  initial={{ opacity: 0, x: 18, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: -18, filter: 'blur(4px)' }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="py-2 space-y-3"
                >
                  <label className="block text-xs font-medium text-amber-600 dark:text-amber-300 font-mono">
                    Nuevo nombre de la conversación:
                  </label>
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsRenaming(false);
                    }}
                    autoFocus
                    className="w-full bg-zinc-50 dark:bg-[#0a0a0d] border border-amber-500/50 rounded-xl px-3.5 py-2.5 text-[16px] md:text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-amber-500 dark:focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20 font-medium transition-all"
                    placeholder="Escribe el título..."
                  />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsRenaming(false)}
                      className="px-3.5 py-2 min-h-[44px] text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSaveTitle}
                      className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] text-xs font-semibold text-black bg-amber-400 hover:bg-amber-300 rounded-xl shadow-md cursor-pointer transition-colors"
                    >
                      <Check size={14} />
                      <span>Guardar</span>
                    </motion.button>
                  </div>
                </motion.div>
              ) : isFolderPickerOpen ? (
                /* Mode 2: Folder Selector */
                <motion.div
                  key="folder-view"
                  initial={{ opacity: 0, x: 18, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: -18, filter: 'blur(4px)' }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="py-2 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 font-mono">
                      Seleccionar carpeta destino:
                    </span>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsFolderPickerOpen(false)}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:underline px-2 py-1 cursor-pointer"
                    >
                      Volver
                    </motion.button>
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ x: 3 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        if (onMoveChat) onMoveChat(activeChatData.id, null);
                        setIsFolderPickerOpen(false);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-3 min-h-[44px] rounded-xl border text-xs font-mono text-left transition-colors cursor-pointer ${
                        !activeChatData.folderId
                          ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/50 font-semibold'
                          : 'bg-zinc-50 dark:bg-[#18181d] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-[#27272a] hover:bg-zinc-100 dark:hover:bg-[#202026] hover:text-zinc-900 dark:hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <MessageSquare size={14} />
                        <span>Chat Libre (Sin carpeta)</span>
                      </span>
                      {!activeChatData.folderId && <span className="text-[10px] uppercase">Actual</span>}
                    </motion.button>

                    {folders.map((f, idx) => {
                      const isCurrent = activeChatData.folderId === f.id;
                      return (
                        <motion.button
                          key={f.id}
                          type="button"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min((idx + 1) * 0.03, 0.2) }}
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            if (onMoveChat) onMoveChat(activeChatData.id, f.id);
                            setIsFolderPickerOpen(false);
                            onClose();
                          }}
                          className={`w-full flex items-center justify-between p-3 min-h-[44px] rounded-xl border text-xs font-mono text-left transition-colors cursor-pointer ${
                            isCurrent
                              ? 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/50 font-semibold'
                              : 'bg-zinc-50 dark:bg-[#18181d] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-[#27272a] hover:bg-zinc-100 dark:hover:bg-[#202026] hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <FolderIcon size={14} />
                            <span className="truncate">{f.name}</span>
                          </span>
                          {isCurrent && <span className="text-[10px] uppercase">Actual</span>}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : isConfirmingDelete ? (
                /* Mode 3: Delete Confirmation Warning */
                <motion.div
                  key="delete-view"
                  initial={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="py-2 space-y-3"
                >
                  <motion.div
                    initial={{ x: 0 }}
                    animate={{ x: [0, -5, 5, -3, 3, 0] }}
                    transition={{ duration: 0.35 }}
                    className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl space-y-1.5"
                  >
                    <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2 font-mono">
                      <Trash2 size={15} />
                      <span>¿Eliminar conversación?</span>
                    </h4>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans">
                      ¿Estás seguro de que deseas eliminar "<span className="text-zinc-950 dark:text-white font-semibold">{activeChatData.title}</span>"? Esta acción borrará el historial de este chat de forma permanente.
                    </p>
                  </motion.div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(false)}
                      className="px-4 py-2.5 min-h-[44px] text-xs font-mono text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer active:scale-95"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!activeChatData) return;
                        const targetId = activeChatData.id;
                        setIsConfirmingDelete(false);
                        onClose();
                        setTimeout(() => {
                          onDeleteChat(targetId);
                        }, 50);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-md cursor-pointer transition-colors active:scale-95"
                    >
                      <Trash2 size={14} />
                      <span>Sí, eliminar chat</span>
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* Main Actions List (Google Drive Style) - Instant, clean & high-performance */
                <div className="py-1 space-y-1">
                  {/* Option 1: Renombrar */}
                  <button
                    type="button"
                    onClick={() => setIsRenaming(true)}
                    className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 active:bg-zinc-200 dark:active:bg-white/10 active:scale-[0.98] transition-all text-left cursor-pointer"
                  >
                    <Edit2 size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
                    <span className="flex-1">Renombrar conversación</span>
                  </button>

                  {/* Option 2: Buscar conceptos */}
                  {onSearchInChat && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSearchInChat(activeChatData.id);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 active:bg-zinc-200 dark:active:bg-white/10 active:scale-[0.98] transition-all text-left cursor-pointer"
                    >
                      <Search size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
                      <span className="flex-1">Buscar palabras clave / conceptos</span>
                    </button>
                  )}

                  {/* Option 3: Mover a carpeta */}
                  {onMoveChat && (
                    <button
                      type="button"
                      onClick={() => setIsFolderPickerOpen(true)}
                      className="w-full flex items-center justify-between px-3 py-3 min-h-[44px] rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 active:bg-zinc-200 dark:active:bg-white/10 active:scale-[0.98] transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FolderInput size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
                        <span className="truncate">Mover a carpeta</span>
                      </div>
                      <ChevronRight size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                    </button>
                  )}

                  {/* Option 4: Exportar chat */}
                  {onExportChat && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onExportChat(activeChatData.id);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 active:bg-zinc-200 dark:active:bg-white/10 active:scale-[0.98] transition-all text-left cursor-pointer"
                    >
                      <Download size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
                      <span className="flex-1">Exportar conversación</span>
                    </button>
                  )}

                  {/* Option 5: Eliminar */}
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(true)}
                    className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 active:scale-[0.98] transition-all text-left cursor-pointer mt-1"
                  >
                    <Trash2 size={16} className="shrink-0" />
                    <span className="flex-1 font-semibold">Eliminar conversación</span>
                  </button>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

