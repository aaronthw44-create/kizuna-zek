import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Menu,
  Download,
  SlidersHorizontal,
  Image as ImageIcon,
  BookOpen,
  Edit2,
  Check,
  ChevronDown,
  Trash2,
  Gauge,
  X,
  BarChart3,
  FolderInput,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Book,
  FolderOpen,
  Camera,
  MoreVertical,
  Sun,
  Moon,
  Gamepad,
  CloudUpload,
  Phone,
} from 'lucide-react';
import { RunicSealIcon } from './RunicSealIcon';
import { BookBindingIcon } from './BookBindingIcon';
import { Chat, Folder, LoreFile, AppSettings } from '../types';
import { useGamepadNav } from '../hooks/useGamepadNav';

interface ChatHeaderProps {
  chat: Chat | null;
  folder: Folder | null;
  folders?: Folder[];
  availableLoreFiles: LoreFile[];
  sessionMediaCount: number;
  totalContextTokens: number;
  settings?: AppSettings;
  currentProvider?: 'gemini' | 'custom' | 'alibaba';
  onSelectQuickModel?: (provider: 'gemini' | 'custom' | 'alibaba', model: string) => void;
  onToggleAutoRouting?: (enabled: boolean) => void;
  onUpdateProvider?: (provider: 'gemini' | 'custom' | 'alibaba', model: string) => void;
  isZenMode?: boolean;
  isAuditingLore?: boolean;
  isAuditFinished?: boolean;
  isLightMode?: boolean;
  onToggleTheme?: () => void;
  reasoningMode?: 'off' | 'light' | 'deep';
  onCycleReasoningMode?: () => void;
  onToggleReasoning?: (mode: 'off' | 'light' | 'deep') => void;
  onToggleSidebar: () => void;
  onOpenMediaGallery: () => void;
  onOpenSettings: () => void;
  onOpenStats?: () => void;
  onToggleZenMode?: () => void;
  onAuditScene?: () => void;
  onInspectUI?: () => void;
  onOpenFolderManager: (folderId: string) => void;
  onUpdateChatTitle: (chatId: string, newTitle: string) => void;
  onToggleLoreFile: (chatId: string, loreFileId: string) => void;
  onMoveChat?: (chatId: string, targetFolderId: string | null) => void;
  onExportChat: () => void;
  onExportEpub?: () => void;
  onExportChatToDrive?: () => void;
  onClearChat: () => void;
  onOpenGoogleDrive?: () => void;
  onStartVoiceCall?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  chat,
  folder,
  folders = [],
  availableLoreFiles,
  sessionMediaCount,
  totalContextTokens,
  settings,
  currentProvider = 'gemini',
  onSelectQuickModel,
  onToggleAutoRouting,
  onUpdateProvider,
  isZenMode = false,
  isAuditingLore = false,
  isAuditFinished = false,
  isLightMode = false,
  onToggleTheme,
  reasoningMode = 'deep',
  onCycleReasoningMode,
  onToggleReasoning,
  onToggleSidebar,
  onOpenMediaGallery,
  onOpenSettings,
  onOpenStats,
  onToggleZenMode,
  onAuditScene,
  onInspectUI,
  onOpenFolderManager,
  onUpdateChatTitle,
  onToggleLoreFile,
  onMoveChat,
  onExportChat,
  onExportEpub,
  onExportChatToDrive,
  onClearChat,
  onOpenGoogleDrive,
  onStartVoiceCall,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [isLoreSelectorOpen, setIsLoreSelectorOpen] = useState(false);
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isTokenGaugeOpen, setIsTokenGaugeOpen] = useState(false);
  const [isBindingEpub, setIsBindingEpub] = useState(false);
  const loreDropdownRef = useRef<HTMLDivElement>(null);
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const tokenGaugeRef = useRef<HTMLDivElement>(null);

  const handleTriggerExportEpub = () => {
    if (!onExportEpub || isBindingEpub) return;
    setIsBindingEpub(true);
    // 1.2s micro-interaction: bookSnapShut -> latchClick -> epubFloatSuccess bounce as download triggers
    setTimeout(() => {
      onExportEpub();
    }, 450);
    setTimeout(() => {
      setIsBindingEpub(false);
    }, 1200);
  };

  useEffect(() => {
    if (chat) {
      setTitleInput(chat.title);
    }
  }, [chat?.id, chat?.title]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        loreDropdownRef.current &&
        !loreDropdownRef.current.contains(e.target as Node)
      ) {
        setIsLoreSelectorOpen(false);
      }
      if (
        folderDropdownRef.current &&
        !folderDropdownRef.current.contains(e.target as Node)
      ) {
        setIsFolderSelectorOpen(false);
      }
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as Node)
      ) {
        setIsOverflowOpen(false);
      }
      if (
        modelMenuRef.current &&
        !modelMenuRef.current.contains(e.target as Node)
      ) {
        setIsModelMenuOpen(false);
      }
      if (
        tokenGaugeRef.current &&
        !tokenGaugeRef.current.contains(e.target as Node)
      ) {
        setIsTokenGaugeOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLoreSelectorOpen(false);
        setIsFolderSelectorOpen(false);
        setIsOverflowOpen(false);
        setIsModelMenuOpen(false);
        setIsTokenGaugeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSaveTitle = () => {
    if (chat && titleInput.trim()) {
      onUpdateChatTitle(chat.id, titleInput.trim());
    }
    setIsEditingTitle(false);
  };

  const activeLoreCount = chat
    ? availableLoreFiles.filter((l) => chat.selectedLoreFileIds.includes(l.id)).length
    : 0;

  const activeLoreWords = chat
    ? availableLoreFiles
        .filter((l) => chat.selectedLoreFileIds.includes(l.id))
        .reduce((sum, l) => sum + l.wordCount, 0)
    : 0;

  const { isGamepadConnected, gamepadName } = useGamepadNav();

  // 1,000,000 Context Window Calculation
  const maxContextWindow = 1000000;
  const contextPercentage = Math.min((totalContextTokens / maxContextWindow) * 100, 100);
  const formattedTokenCount =
    totalContextTokens > 1000
      ? `${(totalContextTokens / 1000).toFixed(1)}k`
      : `${totalContextTokens}`;

  return (
    <header className="sticky top-0 z-30 w-full h-14 bg-[#09090b] border-b border-white/10 px-2 sm:px-3 flex items-center justify-between gap-1 sm:gap-2 shrink-0 select-none">
      {/* Left Section: Fixed Hamburger Menu + Clean Title & Folder */}
      <div className="flex items-center min-w-0 flex-1 mr-1 sm:mr-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 sm:p-2 min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] -ml-1 shrink-0 rounded-xl text-neutral-300 hover:text-white hover:bg-white/10 select-none active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1 flex flex-col justify-center ml-1 sm:ml-1.5 py-0.5">
          {/* Breadcrumb row */}
          {chat && (
            <div className="relative z-20" ref={folderDropdownRef}>
              <div className="flex items-center gap-1 text-[10.5px] sm:text-[11px] text-zinc-500 dark:text-[#71717a] font-mono leading-tight mb-0.5 truncate">
                <button
                  type="button"
                  onClick={() => setIsFolderSelectorOpen(!isFolderSelectorOpen)}
                  className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors truncate cursor-pointer max-w-[150px] sm:max-w-[220px] select-none active:scale-95"
                  title="Cambiar carpeta / arco"
                >
                  <span className="truncate font-semibold">{folder ? folder.name : 'General'}</span>
                  <ChevronDown size={10} className="shrink-0 text-zinc-500" />
                </button>
              </div>
              {/* Folder Selector Dropdown */}
              <AnimatePresence>
                {isFolderSelectorOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.96 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 top-full mt-2 w-60 max-w-[calc(100vw-24px)] bg-[#0e0e12] border border-[#27272c] rounded-xl shadow-2xl p-2 z-[120] text-white space-y-1"
                  >
                    <div className="px-2 py-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-[#1c1c24]">
                      Reasignar Conversación
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onMoveChat?.(chat.id, null);
                        setIsFolderSelectorOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono text-left transition-colors cursor-pointer ${
                        !chat.folderId
                          ? 'bg-white text-black font-semibold'
                          : 'text-zinc-300 hover:bg-[#181820] hover:text-white'
                      }`}
                    >
                      <span>Sin archivar (General)</span>
                      {!chat.folderId && <Check size={12} />}
                    </button>
                    {folders.map((f) => {
                      const isSelected = chat.folderId === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            onMoveChat?.(chat.id, f.id);
                            setIsFolderSelectorOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-white text-black font-semibold'
                              : 'text-zinc-300 hover:bg-[#181820] hover:text-white'
                          }`}
                        >
                          <span className="truncate">{f.name}</span>
                          {isSelected && <Check size={12} />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {/* Title row */}
          {chat ? (
            <div className="flex items-center gap-1 min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-1 min-w-0">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
                    autoFocus
                    className="bg-[#141418] border border-[#27272c] rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-amber-400 font-medium max-w-[150px] sm:max-w-[220px]"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} // prevent input blur before button click
                    onClick={handleSaveTitle}
                    className="p-1 min-h-[32px] min-w-[32px] text-white hover:bg-white/10 rounded shrink-0 cursor-pointer flex items-center justify-center"
                    title="Guardar título"
                  >
                    <Check size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group min-w-0">
                  <h1
                    className="truncate max-w-[160px] xs:max-w-[210px] sm:max-w-xs text-xs sm:text-sm font-medium text-white leading-normal select-text"
                    title={chat.title}
                  >
                    {chat.title}
                  </h1>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-1 min-h-[32px] min-w-[32px] text-zinc-400 hover:text-white transition-opacity shrink-0 cursor-pointer flex items-center justify-center"
                    title="Renombrar chat"
                  >
                    <Edit2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <h1 className="truncate max-w-[160px] sm:max-w-xs text-sm font-medium text-white leading-normal">
              Kizuna-Zek
            </h1>
          )}
        </div>
      </div>

      {/* PS5 DualSense Gamepad Indicator */}
      {isGamepadConnected && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] rounded-xl text-xs font-mono bg-amber-500/15 border border-amber-500/40 text-amber-300 animate-noir-enter shrink-0 mr-1 sm:mr-2"
          title={`${gamepadName} activo • D-Pad/Sticks: Navegar | ✖: Seleccionar | ◯: Atrás | ■: Razonamiento | ▲: Modelos`}
        >
          <Gamepad size={15} className="text-amber-400 animate-pulse" />
          <span className="hidden sm:inline text-[11px] font-semibold">{gamepadName}</span>
        </div>
      )}

      {/* UNIVERSAL MODEL HUB DROPDOWN */}
      <div className="relative shrink-0 mr-1 sm:mr-2" ref={modelMenuRef}>
        <button
          type="button"
          onClick={() => setIsModelMenuOpen((prev) => !prev)}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 min-h-[36px] sm:min-h-[44px] rounded-xl text-xs font-mono border transition-all cursor-pointer select-none active:scale-95 ${
            settings?.autoModelRouting
              ? 'bg-amber-500/10 dark:bg-[#161410] border-amber-500/40 text-amber-300 hover:border-amber-400'
              : 'bg-zinc-100 dark:bg-[#141418] border-zinc-300 dark:border-[#27272c] text-zinc-800 dark:text-zinc-200 hover:text-black dark:hover:text-white'
          }`}
          title={
            settings?.autoModelRouting
              ? 'Modo Automático Activo: Alterna entre Qwen 3.8 Max, DeepSeek V4 Pro 0813, Kimi K3, Qwen 2.4-A95B, DeepSeek V4.1 Flash, Qwen Flash y Qwen Plus'
              : 'Cambiar modelo activo'
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              settings?.autoModelRouting
                ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                : currentProvider === 'alibaba'
                  ? 'bg-orange-500'
                  : currentProvider === 'custom'
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
            } animate-pulse`}
          />
          <span className="text-[10.5px] sm:text-[11px] font-semibold truncate max-w-[70px] xs:max-w-[90px] sm:max-w-[145px] flex items-center gap-1">
            {settings?.autoModelRouting ? (
              <span className="flex items-center gap-1 text-amber-300">
                <span>✦</span>
                <span className="hidden sm:inline">Automático</span>
                <span className="sm:hidden">Auto</span>
              </span>
            ) : (
              <>
                {currentProvider === 'alibaba' && settings?.alibabaCustomLoraModel && settings.alibabaModel === settings.alibabaCustomLoraModel && (
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    LoRA
                  </span>
                )}
                <span>
                  {currentProvider === 'alibaba'
                    ? (settings?.alibabaModel?.split('/')?.pop() || 'Qwen 3.8')
                    : currentProvider === 'custom'
                      ? (settings?.customModel?.split('/')?.pop() || 'Kimi K3')
                      : (settings?.geminiModel || 'Gemini 3.6')}
                </span>
              </>
            )}
          </span>
          <ChevronDown size={10} className="text-zinc-500 shrink-0" />
        </button>

        <AnimatePresence>
          {isModelMenuOpen && (
            <UniversalModelDropdown
              settings={settings}
              currentProvider={currentProvider}
              currentModel={
                currentProvider === 'alibaba'
                  ? (settings?.alibabaModel || 'qwen-3.8-max')
                  : currentProvider === 'custom'
                    ? (settings?.customModel || 'moonshotai/kimi-k3')
                    : (settings?.geminiModel || 'gemini-3.6-flash')
              }
              onSelect={(provider, modelId) => {
                onSelectQuickModel?.(provider, modelId);
                setIsModelMenuOpen(false);
              }}
              onToggleAutoRouting={(enabled) => {
                onToggleAutoRouting?.(enabled);
                setIsModelMenuOpen(false);
              }}
              onClose={() => setIsModelMenuOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Right Section: Header Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Lore selector (Hidden on mobile <640px to prevent overcrowding, accessible via ChatInput and overflow) */}
        {chat && (
          <div className="relative shrink-0 hidden sm:block" ref={loreDropdownRef}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsLoreSelectorOpen(!isLoreSelectorOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] text-xs rounded-xl border transition-colors select-none active:scale-95 ${
                activeLoreCount > 0
                  ? 'bg-[#121216] border-[#25252b] text-white hover:border-[#38383e]'
                  : 'bg-transparent border-[#1b1b1f] text-[#71717a] hover:text-[#d4d4d8]'
              }`}
              title="Selector de Lore: Elige qué documentos de este arco alimentar en el contexto"
            >
              <BookOpen size={13} className={activeLoreCount > 0 ? 'text-white' : 'text-[#71717a]'} />
              <span className="hidden sm:inline font-medium">Docs:</span>
              <span className="font-mono text-[11px] text-white">
                {activeLoreCount}/{availableLoreFiles.length}
              </span>
              <ChevronDown size={11} className="text-[#71717a]" />
            </motion.button>

            {/* Lore checklist dropdown */}
            <AnimatePresence>
              {isLoreSelectorOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-[#0a0a0d]/95 backdrop-blur-md border border-[#262626] rounded-xl shadow-2xl p-3 z-[120] text-white"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1f1f23]">
                    <div>
                      <h4 className="text-xs font-semibold text-white">Docs en Contexto</h4>
                      <p className="text-[10px] text-[#71717a]">
                        {activeLoreWords.toLocaleString()} palabras cargadas en prompt
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setIsLoreSelectorOpen(false);
                        onOpenFolderManager(folder?.id || 'general');
                      }}
                      className="text-[11px] text-[#a1a1aa] hover:text-white underline font-mono"
                    >
                      Gestionar
                    </button>
                  </div>

                  {availableLoreFiles.length === 0 ? (
                    <div className="py-4 text-center text-xs text-[#71717a]">
                      No hay documentos en contexto todavía.
                      <button
                        onClick={() => {
                          setIsLoreSelectorOpen(false);
                          onOpenFolderManager(folder?.id || 'general');
                        }}
                        className="block mx-auto mt-1.5 text-white underline"
                      >
                        Subir o Pegar Documentos (.txt, .md, Docs)
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto smooth-scroll pr-1">
                      {availableLoreFiles.map((file) => {
                        const isSelected = chat.selectedLoreFileIds.includes(file.id);
                        return (
                          <div
                            key={file.id}
                            onClick={() => onToggleLoreFile(chat.id, file.id)}
                            className={`flex items-start gap-2.5 p-2 rounded-md cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#15151a] text-white'
                                : 'hover:bg-[#111115] text-[#a1a1aa]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="mt-0.5 accent-white cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium truncate flex items-center gap-1.5">
                                <span>{file.title}</span>
                                <span className="text-[9px] font-mono text-[#71717a] uppercase">
                                  [{file.fileType}]
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-[#71717a]">
                                {file.filename} · ~{(file.estimatedTokens || 0).toLocaleString()} tok
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Media Gallery "Cajita" (Hidden on mobile <640px to prevent overcrowding, accessible via ChatInput and overflow) */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onOpenMediaGallery}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] text-xs text-[#d4d4d8] hover:text-white bg-[#0e0e12] hover:bg-[#141418] border border-[#1f1f23] hover:border-[#2f2f35] rounded-xl transition-colors shrink-0 select-none active:scale-95 cursor-pointer"
          title="Galería Multimedia (La Cajita): Ver imágenes y referencias de la sesión"
        >
          <ImageIcon size={13} className="text-white" />
          <span className="hidden sm:inline font-medium">Cajita</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 bg-[#1f1f23] text-white rounded">
            {sessionMediaCount}
          </span>
        </motion.button>

        {/* Visual Infinite Continuous Context Gauge (Visible on both Mobile & PC) */}
        <div className="relative shrink-0" ref={tokenGaugeRef}>
          <button
            type="button"
            onClick={() => setIsTokenGaugeOpen((prev) => !prev)}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 min-h-[38px] sm:min-h-[40px] bg-[#0d0d12] hover:bg-[#14141c] border border-[#22222a] hover:border-[#343442] rounded-xl shrink-0 cursor-pointer active:scale-95 transition-all"
            title={`Hilo Continuo Infinito: ${totalContextTokens.toLocaleString()} tokens procesados. Toca para ver desglose y documentos activos.`}
          >
            <Gauge size={12} className="text-emerald-400 shrink-0" />
            <div className="flex flex-col items-start">
              <span className="text-[9.5px] sm:text-[10px] font-mono text-white leading-tight whitespace-nowrap">
                Infinito · {formattedTokenCount} tok
              </span>
              <div className="w-full min-w-[54px] sm:w-16 h-1 bg-[#1a1a22] rounded-full overflow-hidden mt-0.5">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${Math.max(contextPercentage, 5)}%` }}
                />
              </div>
            </div>
          </button>

          {/* Interactive Context & Quick Hub Popover for Mobile & PC */}
          <AnimatePresence>
            {isTokenGaugeOpen && (
              <>
                <div
                  className="fixed inset-0 z-[118] bg-black/40 sm:bg-transparent"
                  onClick={() => setIsTokenGaugeOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="fixed right-2 left-2 top-14 sm:fixed-none sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 max-w-[calc(100vw-16px)] rounded-2xl bg-[#0e0e14] border border-white/15 p-3.5 shadow-2xl z-[120] text-white space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <Gauge size={14} className="text-emerald-400" />
                      <span className="text-xs font-semibold text-white">
                        Hilo Continuo Infinito (1M)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Activo
                    </span>
                  </div>

                  {/* Token Gauge Meter */}
                  <div className="p-2.5 rounded-xl bg-[#14141d] border border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">Contexto en sesión:</span>
                      <span className="text-white font-bold">
                        {totalContextTokens.toLocaleString()} / 1,000,000 tok
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#09090d] rounded-full overflow-hidden border border-white/5">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                        style={{ width: `${Math.max(contextPercentage, 3)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-relaxed pt-0.5">
                      Memoria elástica activa: Kizuna conserva el hilo narrativo y tus documentos de Lore sin que tengas que reiniciar el chat.
                    </p>
                  </div>

                  {/* Quick Mobile/PC Controls for Docs & Cajita */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenFolderManager(folder?.id || 'general');
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#15151f] hover:bg-[#1c1c28] border border-white/10 text-xs transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={13} className="text-amber-400 shrink-0" />
                        <span className="font-medium text-zinc-200">Docs Lore</span>
                      </div>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        {activeLoreCount}/{availableLoreFiles.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenMediaGallery();
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#15151f] hover:bg-[#1c1c28] border border-white/10 text-xs transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <ImageIcon size={13} className="text-cyan-400 shrink-0" />
                        <span className="font-medium text-zinc-200">La Cajita</span>
                      </div>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                        {sessionMediaCount}
                      </span>
                    </button>
                  </div>

                  {onOpenStats && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenStats();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer"
                    >
                      <BarChart3 size={13} className="text-emerald-400" />
                      <span>Ver Estadísticas y Actividad Completa</span>
                    </button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Day / Night Theme Toggle (Desktop quick toggle, mobile in overflow) */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="hidden sm:flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-zinc-400 hover:text-amber-400 select-none active:scale-95 transition-all cursor-pointer shrink-0"
          title={isLightMode ? "Modo Noir" : "Modo Día"}
        >
          {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* OpenWebUI Overflow Menu Button (Visible on desktop & mobile) */}
        <div className="relative shrink-0" ref={overflowRef}>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => setIsOverflowOpen(!isOverflowOpen)}
            className="p-1.5 sm:p-2 min-w-[38px] min-h-[38px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center rounded-xl text-neutral-300 hover:text-white hover:bg-white/10 select-none active:scale-95 transition-all cursor-pointer"
            aria-label="Más opciones"
            title="Más opciones"
          >
            <MoreVertical className="w-5 h-5" />
          </motion.button>

          {/* Mobile Dropdown Panel with Dark Frosted Backdrop */}
          <AnimatePresence>
            {isOverflowOpen && (
              <>
                {/* Dark Frosted Backdrop Overlay */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOverflowOpen(false);
                  }}
                  className="fixed inset-0 z-[119] bg-black/50 backdrop-blur-[4px]"
                />

                {/* Constrained Menu Card */}
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  className="fixed right-3 top-14 max-w-[min(320px,90vw)] w-full rounded-2xl bg-white dark:bg-[#111216] border border-zinc-200 dark:border-white/15 p-2 shadow-2xl z-[120] text-zinc-900 dark:text-white space-y-1"
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-mono text-zinc-500 dark:text-neutral-400 uppercase tracking-wider border-b border-zinc-200 dark:border-white/10 mb-1">
                    Acciones y Herramientas
                  </div>

                  {/* Modo Día / Noche */}
                  {onToggleTheme && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onToggleTheme();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-zinc-700 dark:text-[#d4d4d8] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      {isLightMode ? <Moon size={16} /> : <Sun size={16} />}
                      <span>{isLightMode ? 'Cambiar a Modo Noir' : 'Cambiar a Modo Día'}</span>
                    </button>
                  )}

                  {/* Modo Llamada Omni en Vivo */}
                  {onStartVoiceCall && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onStartVoiceCall();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-emerald-600 dark:text-emerald-300 hover:text-emerald-700 dark:hover:text-white hover:bg-emerald-50 dark:hover:bg-emerald-500/15 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      <Phone size={16} className="text-emerald-500 shrink-0" />
                      <span>Llamada Omni en Vivo (Voz)</span>
                    </button>
                  )}

                  {/* Ajustes Generales / Settings */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOverflowOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-zinc-700 dark:text-[#d4d4d8] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer select-none active:scale-95"
                  >
                    <SlidersHorizontal size={16} />
                    <span>Ajustes generales</span>
                  </button>

                  {/* Inspeccionar UI */}
                  {onInspectUI && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onInspectUI();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-[#d4d4d8] hover:text-emerald-400 hover:bg-white/10 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      <Camera size={16} />
                      <span>Inspeccionar UI / Captura</span>
                    </button>
                  )}

                  {/* Gestión de Lore y Documentos */}
                  {chat && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onOpenFolderManager(folder?.id || 'general');
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-[#d4d4d8] hover:text-amber-400 hover:bg-white/10 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      <BookOpen size={16} className="text-amber-400" />
                      <div className="flex items-center justify-between flex-1 pr-1">
                        <span>Gestión de Lore y Documentos</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {activeLoreCount}/{availableLoreFiles.length}
                        </span>
                      </div>
                    </button>
                  )}

                  {/* Auditar Escena / Lore */}
                  {chat && chat.messages.length > 0 && onAuditScene && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onAuditScene();
                      }}
                      disabled={isAuditingLore}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium transition-colors cursor-pointer select-none active:scale-95 ${
                        isAuditingLore
                          ? 'text-amber-400 bg-amber-500/10'
                          : isAuditFinished
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-[#d4d4d8] hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <RunicSealIcon isAuditing={isAuditingLore} isFinished={isAuditFinished} size={16} />
                      <span>
                        {isAuditingLore
                          ? 'Auditando Continuidad Lore...'
                          : isAuditFinished
                          ? '¡Continuidad Auditada!'
                          : 'Auditar Continuidad Lore'}
                      </span>
                    </button>
                  )}

                  {/* Exportar EPUB */}
                  {chat && chat.messages.length > 0 && onExportEpub && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        handleTriggerExportEpub();
                      }}
                      disabled={isBindingEpub}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium transition-colors cursor-pointer select-none active:scale-95 ${
                        isBindingEpub
                          ? 'text-purple-300 bg-purple-950/40 border border-purple-500/40 animate-epub-float-success'
                          : 'text-[#d4d4d8] hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <BookBindingIcon isBinding={isBindingEpub} size={16} />
                      <span>{isBindingEpub ? 'Encuadernando Novela...' : 'Exportar EPUB (.epub)'}</span>
                    </button>
                  )}

                  {/* Exportar Markdown */}
                  {chat && chat.messages.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onExportChat();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-[#d4d4d8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      <Download size={16} />
                      <span>Exportar Markdown (.md)</span>
                    </button>
                  )}

                  {/* Exportar a Google Drive */}
                  {chat && chat.messages.length > 0 && onExportChatToDrive && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onExportChatToDrive();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-[#d4d4d8] hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      <CloudUpload size={16} className="text-blue-400" />
                      <span>Exportar a Google Drive</span>
                    </button>
                  )}

                  {/* Estadísticas */}
                  {onOpenStats && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onOpenStats();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-[#d4d4d8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      <BarChart3 size={16} />
                      <span>Estadísticas y Métricas</span>
                    </button>
                  )}

                  {/* Google Drive */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOverflowOpen(false);
                      if (onOpenGoogleDrive) {
                        onOpenGoogleDrive();
                      }
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-[#d4d4d8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer select-none active:scale-95"
                  >
                    <FolderOpen size={16} className="text-blue-400" />
                    <span>Google Drive (Capítulos / Lore)</span>
                  </button>

                  {/* Modo Zen */}
                  {onToggleZenMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onToggleZenMode();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-[#d4d4d8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      {isZenMode ? <Minimize2 size={16} /> : <BookOpen size={16} />}
                      <span>{isZenMode ? 'Salir de Modo Zen' : 'Modo Zen de Lectura'}</span>
                    </button>
                  )}

                  {/* Limpiar conversación */}
                  {chat && chat.messages.length > 0 && (
                    <div className="pt-1 border-t border-white/10">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onClearChat();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer select-none active:scale-95"
                      >
                        <Trash2 size={16} />
                        <span>Limpiar conversación</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Full-Width Runic Amber Filament directly under top header */}
      <div className="absolute bottom-0 left-0 right-0 w-full overflow-hidden pointer-events-none">
        <div className="runic-aura-divider" />
      </div>
    </header>
  );
};

const VisionLensIcon: React.FC<{ size?: number; className?: string }> = ({ size = 11, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    <circle cx="12" cy="12" r="9" opacity="0.3" strokeDasharray="2 2" />
    <path d="M2.5 12c2.8-4.8 6.5-7.5 9.5-7.5s6.7 2.7 9.5 7.5c-2.8 4.8-6.5 7.5-9.5 7.5s-6.7-2.7-9.5-7.5z" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" fillOpacity="0.2" />
    <circle cx="13.2" cy="10.8" r="0.9" fill="currentColor" />
  </svg>
);

const NeuralCoreIcon: React.FC<{ size?: number; className?: string }> = ({ size = 11, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    <rect x="4" y="4" width="16" height="16" rx="4" opacity="0.3" />
    <circle cx="9" cy="9" r="1.8" fill="currentColor" fillOpacity="0.25" />
    <circle cx="15" cy="9" r="1.8" fill="currentColor" fillOpacity="0.25" />
    <circle cx="12" cy="15" r="1.8" fill="currentColor" fillOpacity="0.25" />
    <path d="M9 9l3 6 3-6" opacity="0.75" />
    <path d="M9 9h6" opacity="0.5" strokeDasharray="1.5 1.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

interface LiveModelItem {
  id: string;
  name: string;
  provider: 'gemini' | 'custom' | 'alibaba';
  description: string;
  isVision: boolean;
  hasReasoning: boolean;
  badge?: string;
}

const UniversalModelDropdown: React.FC<{
  settings?: AppSettings;
  currentProvider: 'gemini' | 'custom' | 'alibaba';
  currentModel: string;
  onSelect: (provider: 'gemini' | 'custom' | 'alibaba', modelId: string) => void;
  onToggleAutoRouting?: (enabled: boolean) => void;
  onClose: () => void;
}> = ({ settings, currentProvider, currentModel, onSelect, onToggleAutoRouting, onClose }) => {
  const [models, setModels] = useState<LiveModelItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [providerTab, setProviderTab] = useState<'all' | 'alibaba' | 'gemini' | 'custom'>('all');
  const [onlyVision, setOnlyVision] = useState(false);
  const [onlyReasoning, setOnlyReasoning] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchAllModels = async () => {
      setIsLoading(true);
      const list: LiveModelItem[] = [];

      // 0. Registered Author LoRA / Custom Fine-Tuned Model
      if (settings?.alibabaCustomLoraModel?.trim()) {
        const loraId = settings.alibabaCustomLoraModel.trim();
        list.push({
          id: loraId,
          name: settings.alibabaCustomLoraName?.trim() || `${loraId} (Afinado de Autor)`,
          provider: 'alibaba',
          description: 'Alibaba Cloud MaaS: Adaptador LoRA / SFT Personalizado de Novela',
          isVision: true,
          hasReasoning: true,
          badge: 'LoRA Autor',
        });
      }

      // 1. Fetch real Gemini models
      try {
        const gKey = settings?.geminiApiKey || localStorage.getItem('kizuna_gemini_api_key') || '';
        const gRes = await fetch(`/api/gemini/models?key=${encodeURIComponent(gKey)}`);
        if (gRes.ok) {
          const gData = await gRes.json();
          const listM = Array.isArray(gData.models) ? gData.models : [];
          const nonChatRegex = /tts|computer-use|audio|robotics|embedding|imagen|veo|aqa/i;
          listM.forEach((m: any) => {
            const cleanId = m.id.replace(/^models\//, '');
            if (nonChatRegex.test(cleanId) || nonChatRegex.test(m.name || '') || nonChatRegex.test(m.displayName || '')) return;
            list.push({
              id: cleanId,
              name: m.displayName || cleanId,
              provider: 'gemini',
              description: m.description || 'Google Generative AI Engine',
              isVision: true,
              hasReasoning: /3\.[0-9]|4-|thinking/i.test(cleanId),
              badge: cleanId.includes('3.8') ? 'Flash 3.8' : cleanId.includes('argon') ? 'Argon' : undefined,
            });
          });
        }
      } catch {
        // Fallback core models
        ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.8-live', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'].forEach((id) => {
          list.push({
            id,
            name: id === 'gemini-4-argon' ? 'Gemini 4 Argon' : id === 'gemini-3.8-live' ? 'Gemini 3.8 Live' : id,
            provider: 'gemini',
            description: 'Google Generative AI Engine',
            isVision: true,
            hasReasoning: true,
            badge: id === 'gemini-4-argon' ? 'Argon 4' : id.includes('3.8') ? 'SOTA Flash' : undefined,
          });
        });
      }

      // 2. Fetch real NVIDIA NIM models from server route
      const nKey = (settings?.customApiKey || localStorage.getItem('kizuna_custom_api_key') || '').trim();
      const nBase = (settings?.customBaseUrl || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');

      if (nKey) {
        try {
          const nRes = await fetch('/api/nvidia/models', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${nKey}`,
            },
            body: JSON.stringify({ apiKey: nKey, baseUrl: nBase, silent: true }),
          });
          if (nRes.ok) {
            const nData = await nRes.json();
            const rawNvModels = Array.isArray(nData.data) ? nData.data : [];
            rawNvModels.forEach((m: any) => {
              const modelId = m.id || m.name || '';
              if (!modelId) return;

              // STRICT FILTER: Exclude embeddings, detectors, audio, rerankers, reward models, tts, robotics, etc.
              const isNonChat = /embed|embedding|rerank|detector|reward|moderation|guard|safety|stt|tts|whisper|audio|diffusion|flux|clip|computer-use|robotics|imagen|veo|aqa/i.test(modelId);
              if (isNonChat) return;

              const isVis = /vision|vl|-v-|-4v|fuyu|pixtral|llava|omni/i.test(modelId);
              const isCoT = /kimi|moonshot|reason|cot|thinking/i.test(modelId);
              list.push({
                id: modelId,
                name: modelId.split('/').pop()?.replace(/-/g, ' ') || modelId,
                provider: 'custom',
                description: `NVIDIA NIM: ${modelId.split('/')[0] || 'Inferencia'}`,
                isVision: isVis,
                hasReasoning: isCoT,
                badge: modelId.includes('kimi') ? 'Narrativa' : isCoT ? 'CoT' : isVis ? 'Visión' : undefined,
              });
            });
          }
        } catch {
          // Graceful fallback
        }
      }

      // 3. Fetch real Alibaba Cloud MaaS models from server route
      const aKey = (settings?.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim();
      const aBase = (
        aKey && !aKey.startsWith('sk-ws-')
          ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
          : (settings?.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
      ).replace(/\/+$/, '');

      if (aKey) {
        try {
          const aRes = await fetch('/api/alibaba/models', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${aKey}`,
            },
            body: JSON.stringify({ apiKey: aKey, baseUrl: aBase, silent: true }),
          });
          if (aRes.ok) {
            const aData = await aRes.json();
            const rawAliModels = Array.isArray(aData.data) ? aData.data : [];
            rawAliModels.forEach((m: any) => {
              const modelId = m.id || m.name || '';
              if (!modelId) return;
              const isNonChat = /embed|embedding|rerank|detector|reward|moderation|guard|safety|stt|tts|whisper|audio|diffusion|flux|clip|computer-use|robotics|imagen|veo|aqa/i.test(modelId);
              if (isNonChat) return;

              const isVis = /vision|vl|-v-|-4v|kimi|omni/i.test(modelId);
              const isCoT = /reason|cot|thinking|k3|deepseek|kimi|omni|3\.8/i.test(modelId);
              const displayName =
                modelId === 'kimi-k3'
                  ? 'Kimi K3 (1M Cuota Gratis)'
                  : modelId === 'kimi/kimi-k3'
                  ? 'Kimi K3 (Partner / Pago directo)'
                  : modelId.split('/').pop()?.replace(/-/g, ' ') || modelId;
              list.push({
                id: modelId,
                name: displayName,
                provider: 'alibaba',
                description:
                  modelId === 'kimi-k3'
                    ? 'Alibaba Singapur: 1M Tokens Gratis + Tope de Seguridad'
                    : modelId === 'kimi/kimi-k3'
                    ? 'Alibaba Partner Endpoint (0% cuota gratis, cobro por uso)'
                    : `Alibaba Cloud MaaS: ${modelId}`,
                isVision: isVis,
                hasReasoning: isCoT,
                badge: modelId === 'kimi-k3' ? 'K3 Gratis' : modelId.includes('omni') ? 'Omni 1M' : modelId.includes('3.8') ? 'Qwen 3.8' : modelId.includes('kimi') ? 'Partner' : isCoT ? 'CoT' : isVis ? 'Visión' : undefined,
              });
            });
          }
        } catch {
          // Graceful fallback
        }
      }

      // Add preset Alibaba core models supported in Singapore (ap-southeast-1)
      const alibabaPresets: LiveModelItem[] = [
        { id: 'deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813 (1.6T MoE)', provider: 'alibaba', description: 'Alibaba Singapur: 1.6T MoE (49B activos) • $0.66/1M • Auditor & Diálogos con Subtexto', isVision: false, hasReasoning: true, badge: 'V4 Pro 0813' },
        { id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash (1017)', provider: 'alibaba', description: 'Alibaba Singapur: 552B MoE (~8B activos) • Multimodal • $0.15/1M • Co-agente Ágil', isVision: true, hasReasoning: true, badge: 'V4.1 Flash' },
        { id: 'qwen3.8-max-0902', name: 'Qwen 3.8 Max 0902 (Último)', provider: 'alibaba', description: 'Alibaba Singapur: Flagship 0902 con Thinking CoT Profundo', isVision: false, hasReasoning: true, badge: '0902 SOTA' },
        { id: 'qwen3.8-2.4-a95b', name: 'Qwen 3.8 2.4-A95B (MoE)', provider: 'alibaba', description: 'Alibaba Singapur: Arquitectura MoE A95B Activos + Thinking CoT', isVision: false, hasReasoning: true, badge: 'A95B MoE' },
        { id: 'kimi-k3', name: 'Kimi K3 (1M Cuota Gratis)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Tokens Gratis + Tope de Seguridad Activo', isVision: true, hasReasoning: true, badge: 'K3 Gratis' },
        { id: 'qwen3.8-plus', name: 'Qwen 3.8 Plus (1M)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Contexto Extendido para Manuscritos y Síntesis', isVision: true, hasReasoning: true, badge: '3.8 Plus' },
        { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash (1M)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Tokens + Ultra-rápido y económico', isVision: false, hasReasoning: true, badge: 'Flash 1M' },
        { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus (Balanceado)', provider: 'alibaba', description: 'Alibaba Singapur: Equilibrio óptimo para síntesis y estructura', isVision: true, hasReasoning: true, badge: '3.7 Plus' },
        { id: 'qwen3.8-omni-flash', name: 'Qwen 3.8 Omni Flash (1M)', provider: 'alibaba', description: 'Alibaba Singapur: Multimodal Nativo + 1M Contexto (Ultra-Económico)', isVision: true, hasReasoning: true, badge: 'Omni 1M' },
        { id: 'qwen3.8-max', name: 'Qwen 3.8 Max (CoT)', provider: 'alibaba', description: 'Alibaba Singapur: SOTA con Thinking CoT', isVision: false, hasReasoning: true, badge: 'Max' },
        { id: 'deepseek-r1', name: 'DeepSeek R1 (CoT)', provider: 'alibaba', description: 'Alibaba Cloud MaaS: SOTA Razonamiento CoT', isVision: false, hasReasoning: true, badge: 'DeepSeek' },
        { id: 'deepseek-v3', name: 'DeepSeek V3', provider: 'alibaba', description: 'Alibaba Cloud MaaS: MoE 671B', isVision: false, hasReasoning: false, badge: 'V3' },
        { id: 'qwen-plus', name: 'Qwen Plus (1M)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Contexto Balanceado', isVision: false, hasReasoning: false, badge: '1M' },
        { id: 'qwen-vl-max', name: 'Qwen VL Max', provider: 'alibaba', description: 'Alibaba Singapur: Visión Multimodal', isVision: true, hasReasoning: false, badge: 'Visión' },
      ];
      alibabaPresets.forEach((preset) => {
        if (!list.some((m) => m.id === preset.id)) {
          list.push(preset);
        }
      });

      if (isMounted) {
        if (list.length > 0) {
          const loraModelId = settings?.alibabaCustomLoraModel?.trim();
          const topPriority = [
            ...(loraModelId ? [loraModelId] : []),
            'deepseek-v4-pro-0813', 'deepseek-v4.1-flash-1017', 'qwen3.8-max-0902', 'qwen3.8-2.4-a95b', 'kimi-k3', 'qwen3.8-plus', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-omni-flash', 'gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.8-live', 'qwen3.8-max', 'qwen-plus', 'moonshotai/kimi-k3', 'gemini-3.1-pro-preview'
          ];
          // Deduplicate list by provider and ID to avoid React key warnings
          const uniqueMap = new Map<string, LiveModelItem>();
          list.forEach((m) => {
            const key = `${m.provider}_${m.id}`;
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, m);
            }
          });
          const uniqueList = Array.from(uniqueMap.values());

          uniqueList.sort((a, b) => {
            if (a.id === currentModel && b.id !== currentModel) return -1;
            if (b.id === currentModel && a.id !== currentModel) return 1;
            const prioA = topPriority.indexOf(a.id);
            const prioB = topPriority.indexOf(b.id);
            if (prioA !== -1 && prioB !== -1) return prioA - prioB;
            if (prioA !== -1) return -1;
            if (prioB !== -1) return 1;
            if (a.hasReasoning && !b.hasReasoning) return -1;
            if (!a.hasReasoning && b.hasReasoning) return 1;
            return a.name.localeCompare(b.name);
          });
          setModels(uniqueList);
        } else {
          // Standard defaults fallback if network is cold
          const defaultLora = settings?.alibabaCustomLoraModel?.trim()
            ? [{
                id: settings.alibabaCustomLoraModel.trim(),
                name: settings.alibabaCustomLoraName?.trim() || `${settings.alibabaCustomLoraModel.trim()} (Afinado de Autor)`,
                provider: 'alibaba' as const,
                description: 'Alibaba Cloud MaaS: Adaptador LoRA / SFT Personalizado',
                isVision: true,
                hasReasoning: true,
                badge: 'LoRA Autor'
              }]
            : [];
          setModels([
            ...defaultLora,
            { id: 'deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813 (1.6T MoE)', provider: 'alibaba', description: 'Alibaba Singapur: 1.6T MoE (49B activos) • $0.66/1M • Auditor & Diálogos', isVision: false, hasReasoning: true, badge: 'V4 Pro 0813' },
            { id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash (1017)', provider: 'alibaba', description: 'Alibaba Singapur: 552B MoE (~8B activos) • Multimodal • $0.15/1M', isVision: true, hasReasoning: true, badge: 'V4.1 Flash' },
            { id: 'qwen3.8-max-0902', name: 'Qwen 3.8 Max 0902 (Último)', provider: 'alibaba', description: 'Alibaba Singapur: Flagship 0902 con Thinking CoT', isVision: false, hasReasoning: true, badge: '0902 SOTA' },
            { id: 'qwen3.8-2.4-a95b', name: 'Qwen 3.8 2.4-A95B (MoE)', provider: 'alibaba', description: 'Alibaba Singapur: Arquitectura MoE A95B + Thinking CoT', isVision: false, hasReasoning: true, badge: 'A95B MoE' },
            { id: 'kimi-k3', name: 'Kimi K3 (1M Cuota Gratis)', provider: 'alibaba', description: 'Alibaba Singapur: Visión & CoT', isVision: true, hasReasoning: true, badge: 'K3 Gratis' },
            { id: 'qwen3.8-plus', name: 'Qwen 3.8 Plus (1M)', provider: 'alibaba', description: 'Alibaba Cloud MaaS: 1M Contexto & Visión', isVision: true, hasReasoning: true, badge: '3.8 Plus' },
            { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash', provider: 'alibaba', description: 'Alibaba Cloud MaaS: Visión & CoT', isVision: true, hasReasoning: true, badge: 'Flash' },
            { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus', provider: 'alibaba', description: 'Alibaba Cloud MaaS: Balanceado', isVision: true, hasReasoning: true, badge: '3.7 Plus' },
            { id: 'gemini-4-argon', name: 'Gemini 4 Argon', provider: 'gemini', description: 'Google AI Studio: SOTA Model', isVision: true, hasReasoning: true, badge: 'Argon 4' },
            { id: 'qwen3.8-max', name: 'Qwen 3.8 Max', provider: 'alibaba', description: 'Alibaba Cloud MaaS: Visión & CoT', isVision: true, hasReasoning: true, badge: 'Max' },
            { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'gemini', description: 'Google Generative AI', isVision: true, hasReasoning: true, badge: 'Flash 3.8' },
            { id: 'gemini-3.8-live', name: 'Gemini 3.8 Live', provider: 'gemini', description: 'Google Generative AI (Llamada)', isVision: true, hasReasoning: true, badge: 'Live' },
            { id: 'moonshotai/kimi-k3', name: 'Kimi K3 (Moonshot)', provider: 'custom', description: 'NVIDIA NIM: MoE CoT & Visión', isVision: true, hasReasoning: true, badge: 'Narrativa' },
            { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B (NVIDIA)', provider: 'custom', description: 'NVIDIA NIM: Ultra-rápido', isVision: false, hasReasoning: true, badge: 'NVIDIA' },
          ]);
        }
        setIsLoading(false);
      }
    };

    fetchAllModels();
    return () => { isMounted = false; };
  }, [settings?.customApiKey, settings?.customBaseUrl, settings?.alibabaApiKey, settings?.alibabaBaseUrl, settings?.alibabaCustomLoraModel, settings?.alibabaCustomLoraName, currentModel]);

  const filtered = models.filter((m) => {
    if (providerTab !== 'all' && m.provider !== providerTab) return false;
    if (onlyVision && !m.isVision) return false;
    if (onlyReasoning && !m.hasReasoning) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {/* Full-screen backdrop to catch taps outside on mobile */}
      <div
        className="fixed inset-0 z-[115] bg-black/40 sm:bg-transparent"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.96 }}
        transition={{ duration: 0.12 }}
        className="fixed left-3 right-3 top-14 sm:fixed-none sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px] max-w-[calc(100vw-24px)] max-h-[80vh] flex flex-col bg-white dark:bg-[#0e0e12] border border-zinc-200 dark:border-[#27272c] rounded-2xl shadow-2xl z-[120] text-zinc-900 dark:text-zinc-100 overflow-hidden"
      >
        {/* Header with Search and Counters */}
        <div className="p-3 border-b border-zinc-200 dark:border-[#1c1c24] space-y-2 bg-zinc-50 dark:bg-[#121216]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
              Modelos de tus APIs
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {isLoading ? 'Sincronizando...' : `${filtered.length} disponibles`}
            </span>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar modelo real (ej. qwen, deepseek, kimi, flash)..."
            className="w-full bg-white dark:bg-[#09090c] border border-zinc-300 dark:border-[#27272e] rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-amber-400 font-sans"
            autoFocus={typeof window !== 'undefined' && window.innerWidth >= 640}
          />

          {/* Filter Pills with Safe Light/Dark Contrast */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center bg-zinc-200 dark:bg-zinc-800 p-0.5 rounded-lg text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setProviderTab('all')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  providerTab === 'all'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setProviderTab('alibaba')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  providerTab === 'alibaba'
                    ? 'bg-white dark:bg-zinc-700 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Alibaba
              </button>
              <button
                type="button"
                onClick={() => setProviderTab('gemini')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  providerTab === 'gemini'
                    ? 'bg-white dark:bg-zinc-700 text-emerald-700 dark:text-emerald-400 font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Gemini
              </button>
              <button
                type="button"
                onClick={() => setProviderTab('custom')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  providerTab === 'custom'
                    ? 'bg-white dark:bg-zinc-700 text-amber-700 dark:text-amber-400 font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                NVIDIA
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOnlyVision((v) => !v)}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1 border transition-colors cursor-pointer ${
                onlyVision
                  ? 'bg-amber-100 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-300 font-semibold'
                  : 'bg-zinc-100 dark:bg-transparent border-zinc-300 dark:border-[#27272e] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <VisionLensIcon size={11} className={onlyVision ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500'} />
              <span>Visión</span>
            </button>
            <button
              type="button"
              onClick={() => setOnlyReasoning((r) => !r)}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1 border transition-colors cursor-pointer ${
                onlyReasoning
                  ? 'bg-purple-100 dark:bg-purple-500/15 border-purple-300 dark:border-purple-500/50 text-purple-800 dark:text-purple-300 font-semibold'
                  : 'bg-zinc-100 dark:bg-transparent border-zinc-300 dark:border-[#27272e] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <NeuralCoreIcon size={11} className={onlyReasoning ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-500'} />
              <span>CoT</span>
            </button>
          </div>
        </div>

        {/* Dynamic List */}
        <div className="p-1.5 overflow-y-auto max-h-72 space-y-1 smooth-scroll">
          {/* Smart Auto-Router Pinned Option (Gemini PC Style) */}
          <button
            type="button"
            onClick={() => {
              onToggleAutoRouting?.(!settings?.autoModelRouting);
            }}
            className={`w-full flex items-start justify-between p-2.5 mb-1.5 rounded-xl text-left transition-all cursor-pointer border ${
              settings?.autoModelRouting
                ? 'bg-amber-500/15 border-amber-500/50 text-zinc-900 dark:text-white shadow-sm'
                : 'bg-zinc-50 dark:bg-[#13131a] hover:bg-zinc-100 dark:hover:bg-[#181822] border-zinc-200 dark:border-[#252530] text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-500 dark:text-amber-400 font-bold text-xs">✦</span>
                <span className="font-semibold text-xs text-zinc-900 dark:text-white">
                  Modo Automático (Smart Router)
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold">
                  {settings?.autoModelRouting ? 'Activo' : 'Auto'}
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-sans mt-0.5 leading-snug">
                Detecta tu mensaje y alterna automáticamente entre <strong className="text-zinc-700 dark:text-zinc-200">Qwen 3.8 Max 0902</strong>, <strong className="text-zinc-700 dark:text-zinc-200">DeepSeek V4 Pro 0813</strong> (Auditoría/Diálogos), <strong className="text-zinc-700 dark:text-zinc-200">Kimi K3</strong>, <strong className="text-zinc-700 dark:text-zinc-200">Qwen 3.8 2.4-A95B</strong>, <strong className="text-zinc-700 dark:text-zinc-200">DeepSeek V4.1 Flash</strong> (Co-agente ágil), <strong className="text-zinc-700 dark:text-zinc-200">Qwen 3.8 Flash</strong> y <strong className="text-zinc-700 dark:text-zinc-200">Qwen 3.7 Plus</strong>.
              </div>
            </div>
            {settings?.autoModelRouting && <Check size={14} className="text-amber-500 shrink-0 mt-1" />}
          </button>

          {isLoading && filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400 font-mono animate-pulse">
              Sincronizando modelos con tus claves...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              No se encontraron modelos
            </div>
          ) : (
            filtered.map((m) => {
              const isSelected = !settings?.autoModelRouting && currentProvider === m.provider && currentModel === m.id;
              return (
                <button
                  key={`${m.provider}_${m.id}`}
                  type="button"
                  onClick={() => {
                    onSelect(m.provider, m.id);
                  }}
                  className={`w-full flex items-start justify-between p-2 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/10 border border-amber-500/40 text-zinc-900 dark:text-white'
                      : 'hover:bg-zinc-100 dark:hover:bg-[#16161c] text-zinc-700 dark:text-zinc-300 border border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-zinc-900 dark:text-white truncate">
                        {m.name}
                      </span>
                      {m.badge && (
                        <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full ${
                          m.badge === 'LoRA Autor'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}>
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate" title={m.id}>
                      {m.id}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${m.provider === 'alibaba' ? 'bg-orange-100 dark:bg-orange-500/10 text-orange-800 dark:text-orange-400' : m.provider === 'gemini' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400'}`}>
                        {m.provider === 'alibaba' ? 'Alibaba' : m.provider === 'gemini' ? 'Google' : 'NVIDIA'}
                      </span>
                      {m.isVision && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-500/30">
                          <VisionLensIcon size={9} className="text-amber-600 dark:text-amber-400" />
                          <span>Visión</span>
                        </span>
                      )}
                      {m.hasReasoning && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1 py-0.2 rounded bg-purple-100 dark:bg-purple-500/10 text-purple-800 dark:text-purple-300">
                          <NeuralCoreIcon size={9} /> CoT
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check size={13} className="text-amber-500 shrink-0 mt-1" />}
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </>
  );
};

