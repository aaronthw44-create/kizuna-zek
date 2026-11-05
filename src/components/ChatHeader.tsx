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
  Search,
  MoreHorizontal,
  Columns,
  Filter,
  FileText,
  Glasses,
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
  isStreaming?: boolean;
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
  onSelectAllLoreFiles?: (chatId: string, loreIds: string[]) => void;
  onDeselectAllLoreFiles?: (chatId: string) => void;
  onMoveChat?: (chatId: string, targetFolderId: string | null) => void;
  onExportChat: () => void;
  onExportEpub?: () => void;
  onExportChatToDrive?: () => void;
  onClearChat: () => void;
  onOpenGoogleDrive?: () => void;
  onStartVoiceCall?: () => void;
  onOpenChatDriveSheet?: (chat: Chat) => void;
  onToggleInChatSearch?: () => void;
  onOpenTokenBreakdown?: () => void;
  onOpenEngineDuel?: () => void;
  onOpenEditorialExport?: () => void;
  onOpenVrSanctuary?: () => void;
  onOpenCommandPalette?: () => void;
  onToggleDynamicLoreRag?: (enabled: boolean) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = React.memo(({
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
  isStreaming = false,
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
  onSelectAllLoreFiles,
  onDeselectAllLoreFiles,
  onMoveChat,
  onExportChat,
  onExportEpub,
  onExportChatToDrive,
  onClearChat,
  onOpenGoogleDrive,
  onStartVoiceCall,
  onOpenChatDriveSheet,
  onToggleInChatSearch,
  onOpenTokenBreakdown,
  onOpenEngineDuel,
  onOpenEditorialExport,
  onOpenVrSanctuary,
  onOpenCommandPalette,
  onToggleDynamicLoreRag,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [isLoreSelectorOpen, setIsLoreSelectorOpen] = useState(false);
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const [isTokenGaugeOpen, setIsTokenGaugeOpen] = useState(false);
  const [isBindingEpub, setIsBindingEpub] = useState(false);
  const [fontScale, setFontScale] = useState<'normal' | 'large' | 'xl' | 'xxl'>(() => {
    try {
      const saved = localStorage.getItem('kizuna_font_scale');
      if (saved === 'normal' || saved === 'large' || saved === 'xl' || saved === 'xxl') {
        return saved;
      }
    } catch {}
    return 'large';
  });
  const loreDropdownRef = useRef<HTMLDivElement>(null);
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const tokenGaugeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (fontScale === 'normal') {
      root.style.setProperty('--kz-prose-size', '15.5px');
      root.style.setProperty('--kz-prose-leading', '1.58');
    } else if (fontScale === 'large') {
      root.style.setProperty('--kz-prose-size', '17px');
      root.style.setProperty('--kz-prose-leading', '1.62');
    } else if (fontScale === 'xl') {
      root.style.setProperty('--kz-prose-size', '18.5px');
      root.style.setProperty('--kz-prose-leading', '1.66');
    } else if (fontScale === 'xxl') {
      root.style.setProperty('--kz-prose-size', '20.5px');
      root.style.setProperty('--kz-prose-leading', '1.70');
    }
    try {
      localStorage.setItem('kizuna_font_scale', fontScale);
    } catch {}
  }, [fontScale]);

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

  const anyHeaderPopoverOpen = isModelMenuOpen || isTokenGaugeOpen || isOverflowOpen || isLoreSelectorOpen || isFolderSelectorOpen;

  return (
    <header className={`sticky top-0 ${anyHeaderPopoverOpen ? 'z-[70]' : 'z-30'} w-full h-14 bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-200/80 dark:border-white/[0.07] px-2.5 sm:px-4 flex items-center justify-between gap-2 shrink-0 select-none transition-colors`}>
      {/* Left Zone: Sidebar Toggle + OpenWebUI/Gemini-style Model Selector + Quiet Chat Title */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          type="button"
          onClick={onToggleSidebar}
          className="relative z-30 w-9 h-9 sm:w-10 sm:h-10 min-h-[36px] min-w-[36px] shrink-0 rounded-full hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-white/[0.08] dark:active:bg-white/[0.14] text-zinc-700 dark:text-neutral-200 select-none transition-colors duration-150 flex items-center justify-center cursor-pointer touch-manipulation"
          aria-label="Alternar barra lateral"
          title="Mostrar / ocultar barra lateral"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" className="pointer-events-none">
            <line x1="4" y1="8.5" x2="20" y2="8.5" />
            <line x1="4" y1="15.5" x2="14" y2="15.5" />
          </svg>
        </motion.button>

        {/* Model Selector Pill (Primary Header Control like OpenWebUI & Gemini) */}
        <div className="relative shrink-0" ref={modelMenuRef}>
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => setIsModelMenuOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
              isModelMenuOpen
                ? 'bg-zinc-200 dark:bg-white/[0.12] text-zinc-950 dark:text-white border border-zinc-300 dark:border-white/20 shadow-sm'
                : settings?.autoModelRouting
                  ? 'bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200/80 dark:hover:bg-white/[0.1] text-zinc-900 dark:text-white border border-zinc-200/80 dark:border-white/10'
                  : 'bg-zinc-100/80 dark:bg-white/[0.05] hover:bg-zinc-200/80 dark:hover:bg-white/[0.09] text-zinc-900 dark:text-zinc-100 border border-zinc-200/70 dark:border-white/[0.08]'
            }`}
            title="Cambiar modelo o motor activo"
          >
            <span className="text-xs sm:text-[13px] font-semibold tracking-tight truncate max-w-[125px] xs:max-w-[155px] sm:max-w-[210px] flex items-center gap-1.5">
              {settings?.autoModelRouting ? (
                <span className="flex items-center gap-1 text-zinc-900 dark:text-white">
                  <span className="text-amber-500 dark:text-amber-400">✦</span>
                  <span>Kizuna Auto</span>
                </span>
              ) : (
                <>
                  {currentProvider === 'alibaba' && settings?.alibabaCustomLoraModel && settings.alibabaModel === settings.alibabaCustomLoraModel && (
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                      LoRA
                    </span>
                  )}
                  <span>
                    {currentProvider === 'alibaba'
                      ? (settings?.alibabaModel?.split('/')?.pop()?.replace(/^qwen-?/i, 'Qwen ') || 'Qwen 3.8')
                      : currentProvider === 'custom'
                        ? (settings?.customModel?.split('/')?.pop()?.replace(/^moonshotai\//i, '') || 'Kimi K3')
                        : (settings?.geminiModel || 'Gemini 3.8')}
                  </span>
                </>
              )}
            </span>
            <motion.span
              animate={{ rotate: isModelMenuOpen ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              className="inline-flex items-center justify-center"
            >
              <ChevronDown size={13} className="text-zinc-400 shrink-0" />
            </motion.span>
          </motion.button>

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

        {/* Subtle Chat Title & Folder Breadcrumb on Tablet/Desktop */}
        {chat && (
          <div className="hidden md:flex items-center gap-1.5 min-w-0 flex-1 pl-1">
            <span className="text-zinc-300 dark:text-zinc-700 select-none">/</span>
            {folder && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenFolderManager(folder.id)}
                  className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white truncate max-w-[140px] cursor-pointer transition-colors"
                  title={`Proyecto: ${folder.name}`}
                >
                  {folder.name}
                </button>
                <span className="text-zinc-300 dark:text-zinc-700 select-none">·</span>
              </>
            )}
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
                  className="bg-[#141418] border border-amber-500/50 rounded-md px-2 py-0.5 text-xs text-white focus:outline-none focus:border-amber-400 font-medium max-w-[220px]"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSaveTitle}
                  className="p-1 text-amber-400 hover:text-white rounded-md shrink-0 cursor-pointer"
                  title="Guardar título"
                >
                  <Check size={13} />
                </button>
              </div>
            ) : (
              <h1
                onClick={() => {
                  if (onOpenChatDriveSheet) {
                    onOpenChatDriveSheet(chat);
                  } else {
                    setIsEditingTitle(true);
                  }
                }}
                className={`truncate max-w-[240px] lg:max-w-[340px] text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer transition-colors ${
                  isStreaming ? 'chat-title-streaming-fade' : ''
                }`}
                title={`${chat.title} • Click para opciones del chat`}
              >
                {chat.title}
              </h1>
            )}
          </div>
        )}
      </div>

      {/* Right Zone: Clean 3-Control Cluster (Unified Context/Lore Pill + Search + Overflow Menu) */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {isGamepadConnected && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300 shrink-0"
            title={`${gamepadName} activo`}
          >
            <Gamepad size={13} className="text-amber-400" />
          </div>
        )}

        {/* Unified Context & Lore Pill (Combines Docs + Cajita + 1M Context Inspector in 1 sleek button) */}
        <div className="relative shrink-0" ref={tokenGaugeRef}>
          <button
            type="button"
            onClick={() => setIsTokenGaugeOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-full text-[11px] font-mono transition-all cursor-pointer active:scale-95 border ${
              activeLoreCount > 0
                ? 'bg-amber-500/10 dark:bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15'
                : 'bg-zinc-100/80 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/[0.08] border-zinc-200/80 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300'
            }`}
            title={`Contexto activo: ${totalContextTokens.toLocaleString()} tokens · ${activeLoreCount} documentos de Lore. Toca para gestionar.`}
          >
            {activeLoreCount > 0 ? (
              <>
                <BookOpen size={12} className="text-amber-500 dark:text-amber-400 shrink-0" />
                <span className="font-semibold">{activeLoreCount} docs</span>
                <span className="opacity-50 hidden xs:inline">·</span>
                <span className="hidden xs:inline">{formattedTokenCount}</span>
              </>
            ) : (
              <>
                <Gauge size={12} className="text-zinc-500 dark:text-zinc-400 shrink-0" />
                <span>{formattedTokenCount}</span>
              </>
            )}
          </button>

          {/* Interactive Context & Quick Hub Popover */}
          <AnimatePresence>
            {isTokenGaugeOpen && (
              <>
                <div
                  className="fixed inset-0 z-[118] bg-black/40 sm:bg-transparent"
                  onClick={() => setIsTokenGaugeOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.72 }}
                  className="fixed right-3 left-3 top-[60px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 max-w-[calc(100vw-24px)] origin-top-right rounded-2xl bg-white/95 dark:bg-[#0e0e14]/95 backdrop-blur-2xl border border-zinc-200 dark:border-white/15 p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.75)] z-[120] text-zinc-900 dark:text-white space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <Gauge size={14} className="text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                        Contexto y Documentos (1M)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                      {totalContextTokens.toLocaleString()} tok
                    </span>
                  </div>

                  {/* Token Gauge Meter */}
                  <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-[#14141d] border border-zinc-200 dark:border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-600 dark:text-zinc-400">Ventana activa:</span>
                      <span className="text-zinc-900 dark:text-white font-bold">
                        {totalContextTokens.toLocaleString()} / 1,000,000
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-200 dark:bg-[#09090d] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 dark:bg-amber-400 transition-all duration-300"
                        style={{ width: `${Math.max(contextPercentage, 3)}%` }}
                      />
                    </div>
                  </div>

                  {/* Quick Checklist of Lore Files right inside the popover */}
                  {chat && availableLoreFiles.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                        <span>Documentos en este arco ({activeLoreCount}/{availableLoreFiles.length})</span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsTokenGaugeOpen(false);
                            onOpenFolderManager(folder?.id || 'general');
                          }}
                          className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          Abrir Gestor →
                        </button>
                      </div>
                      <div className="max-h-36 overflow-y-auto smooth-scroll space-y-1 pr-1">
                        {availableLoreFiles.map((file) => {
                          const isSelected = chat.selectedLoreFileIds.includes(file.id);
                          return (
                            <div
                              key={file.id}
                              onClick={() => onToggleLoreFile(chat.id, file.id)}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                                isSelected
                                  ? 'bg-zinc-100 dark:bg-[#161620] text-zinc-900 dark:text-white font-medium'
                                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#12121a]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="accent-amber-500 dark:accent-white cursor-pointer shrink-0"
                              />
                              <span className="truncate flex-1">{file.title}</span>
                              <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                                ~{Math.round((file.estimatedTokens || 0) / 1000 * 10) / 10}k
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Quick Controls for Docs & Cajita */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenFolderManager(folder?.id || 'general');
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-100 dark:bg-[#15151f] hover:bg-zinc-200 dark:hover:bg-[#1c1c28] border border-zinc-200 dark:border-white/10 text-xs transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">Docs Lore</span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                        {activeLoreCount}/{availableLoreFiles.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenMediaGallery();
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-100 dark:bg-[#15151f] hover:bg-zinc-200 dark:hover:bg-[#1c1c28] border border-zinc-200 dark:border-white/10 text-xs transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <ImageIcon size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">La Cajita</span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                        {sessionMediaCount}
                      </span>
                    </button>
                  </div>

                  {onOpenTokenBreakdown && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenTokenBreakdown();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                    >
                      <Gauge size={13} className="text-amber-500 dark:text-amber-400" />
                      <span>Inspector de Contexto y Filtro RAG</span>
                    </button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Spotlight / Command Palette (Ctrl+K) Button */}
        {onOpenCommandPalette && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={onOpenCommandPalette}
            className="h-9 px-2.5 min-w-[36px] min-h-[36px] flex items-center justify-center gap-1.5 rounded-full bg-zinc-100/80 dark:bg-white/[0.04] hover:bg-zinc-200/80 dark:hover:bg-white/[0.1] border border-zinc-200/80 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white select-none transition-all cursor-pointer shrink-0"
            aria-label="Buscador rápido Spotlight (Ctrl+K)"
            title="Navegador rápido Spotlight: Saltar a capítulos, Lore, modelos o herramientas (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span className="hidden sm:inline text-[10px] font-mono text-zinc-500 dark:text-zinc-400">⌘K</span>
          </motion.button>
        )}

        {/* In-Chat Search Button */}
        {chat && onToggleInChatSearch && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={onToggleInChatSearch}
            className="hidden sm:flex w-9 h-9 min-w-[36px] min-h-[36px] items-center justify-center rounded-full text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 select-none transition-all cursor-pointer shrink-0"
            aria-label="Buscar en este chat"
            title="Buscar palabras clave en esta conversación"
          >
            <Search className="w-4 h-4" />
          </motion.button>
        )}

        {/* OpenWebUI Overflow Menu Button (Visible on desktop & mobile) */}
        <div className="relative shrink-0" ref={overflowRef}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setIsOverflowOpen(!isOverflowOpen)}
            className={`p-1.5 sm:p-2 min-w-[38px] min-h-[38px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center rounded-full select-none transition-colors duration-200 cursor-pointer ${
              isOverflowOpen
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black shadow-lg'
                : 'text-zinc-700 dark:text-neutral-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10'
            }`}
            aria-label={isOverflowOpen ? 'Cerrar menú' : 'Más opciones'}
            title={isOverflowOpen ? 'Cerrar menú (×)' : 'Más opciones'}
          >
            <motion.span
              animate={{ rotate: isOverflowOpen ? 90 : 0, scale: isOverflowOpen ? 1.08 : 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 16, mass: 0.7 }}
              className="flex items-center justify-center origin-center"
            >
              {isOverflowOpen ? <X className="w-5 h-5" strokeWidth={2.4} /> : <MoreVertical className="w-5 h-5" />}
            </motion.span>
          </motion.button>

          {/* Mobile Dropdown Panel with Dark Frosted Backdrop & Staggered Spring Cascade */}
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

                {/* Constrained Menu Card with Staggered Cascade ("Fila India") & Spring Bounce */}
                <motion.div
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={{
                    hidden: { opacity: 0, y: -16, scale: 0.84 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: {
                        type: 'spring',
                        stiffness: 390,
                        damping: 20,
                        mass: 0.72,
                        staggerChildren: 0.042,
                        delayChildren: 0.01,
                      },
                    },
                    exit: {
                      opacity: 0,
                      y: -10,
                      scale: 0.9,
                      transition: { duration: 0.12 },
                    },
                  }}
                  className="fixed right-3 top-14 max-w-[min(330px,92vw)] max-h-[calc(100dvh-4.5rem)] overflow-y-auto smooth-scroll w-full rounded-[26px] bg-white/95 dark:bg-[#13131a]/95 border border-zinc-200 dark:border-white/12 p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.78)] z-[120] text-zinc-900 dark:text-white space-y-2 origin-top-right font-sans"
                >
                  {/* 1. Selector Rápido de Tamaño de Letra */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: -12, scale: 0.84 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                      },
                    }}
                    className="px-2.5 py-2 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/10 origin-center"
                  >
                    <div className="flex items-center justify-between text-[11px] font-medium tracking-tight text-zinc-600 dark:text-zinc-300 mb-1.5">
                      <span>Tamaño de letra</span>
                      <span className="text-[11px] text-orange-600 dark:text-orange-400 font-semibold tracking-tight">
                        {fontScale === 'normal'
                          ? '15.5px'
                          : fontScale === 'large'
                          ? '17px · Cómodo'
                          : fontScale === 'xl'
                          ? '18.5px'
                          : '20.5px'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { id: 'normal', label: 'A', desc: 'Compacto' },
                          { id: 'large', label: 'A+', desc: 'Cómodo' },
                          { id: 'xl', label: 'A++', desc: 'Grande' },
                          { id: 'xxl', label: 'MAX', desc: 'Extra' },
                        ] as const
                      ).map((opt) => {
                        const active = fontScale === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFontScale(opt.id);
                            }}
                            className={`flex flex-col items-center justify-center min-h-[44px] rounded-xl border text-xs font-sans tracking-tight transition-all cursor-pointer select-none active:scale-95 ${
                              active
                                ? 'bg-orange-500/20 border-orange-500/60 text-orange-700 dark:text-orange-300 font-semibold shadow-xs'
                                : 'bg-white dark:bg-[#16161d] border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10'
                            }`}
                            title={`Tamaño ${opt.desc}`}
                          >
                            <span className="text-[12px] leading-none font-semibold">{opt.label}</span>
                            <span className="text-[9.5px] opacity-75 mt-0.5">{opt.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>

                  {/* 2. Cuadrícula Principal de Accesos Rápidos (Efecto Cascada Item por Item) */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {onToggleTheme && (
                      <motion.button
                        variants={{
                          hidden: { opacity: 0, y: -12, scale: 0.82 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                          },
                        }}
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onToggleTheme();
                        }}
                        className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none origin-center"
                      >
                        {isLightMode ? <Moon size={15} className="shrink-0" /> : <Sun size={15} className="shrink-0" />}
                        <span className="truncate">{isLightMode ? 'Modo Noir' : 'Modo Día'}</span>
                      </motion.button>
                    )}

                    {onToggleZenMode && (
                      <motion.button
                        variants={{
                          hidden: { opacity: 0, y: -12, scale: 0.82 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                          },
                        }}
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onToggleZenMode();
                        }}
                        className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none origin-center"
                      >
                        {isZenMode ? <Minimize2 size={15} className="shrink-0" /> : <BookOpen size={15} className="shrink-0" />}
                        <span className="truncate">{isZenMode ? 'Salir Zen' : 'Modo Zen'}</span>
                      </motion.button>
                    )}

                    {onStartVoiceCall && (
                      <motion.button
                        variants={{
                          hidden: { opacity: 0, y: -12, scale: 0.82 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                          },
                        }}
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onStartVoiceCall();
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/10 text-xs transition-colors cursor-pointer select-none origin-center group"
                      >
                        {/* Mini Noir Volumetric Sphere ("esa bola" en Blanco y Negro) */}
                        <span
                          className="w-4 h-4 rounded-full shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform"
                          style={{
                            background:
                              'radial-gradient(circle at 36% 32%, #ffffff 0%, #e4e4e7 42%, #52525b 78%, #09090b 100%)',
                          }}
                        />
                        <span className="truncate tracking-tight text-[12.5px] flex items-baseline gap-1">
                          <span className="font-semibold text-zinc-900 dark:text-white">Kizuna</span>
                          <span className="font-normal text-zinc-500 dark:text-zinc-400">Voz</span>
                        </span>
                      </motion.button>
                    )}

                    <motion.button
                      variants={{
                        hidden: { opacity: 0, y: -12, scale: 0.82 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                        },
                      }}
                      whileTap={{ scale: 0.94 }}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onOpenSettings();
                      }}
                      className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none origin-center"
                    >
                      <SlidersHorizontal size={15} className="shrink-0" />
                      <span className="truncate">Ajustes</span>
                    </motion.button>

                    {onOpenVrSanctuary && (
                      <motion.button
                        variants={{
                          hidden: { opacity: 0, y: -12, scale: 0.82 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                          },
                        }}
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onOpenVrSanctuary();
                        }}
                        className="flex items-center justify-between gap-1.5 px-2.5 py-2 min-h-[44px] rounded-2xl bg-sky-500/12 hover:bg-sky-500/22 border border-sky-500/35 text-xs font-medium tracking-tight text-sky-700 dark:text-sky-300 transition-colors cursor-pointer select-none origin-center"
                        title="Abrir Santuario Espacial 3D Interactivo (Meta Quest 3 / PSVR2 / 3D Libre)"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Glasses size={15} className="text-sky-500 dark:text-sky-400 shrink-0" />
                          <span className="truncate font-semibold">Santuario 3D</span>
                        </div>
                        <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-800 dark:text-sky-200 shrink-0">
                          VR
                        </span>
                      </motion.button>
                    )}

                    <motion.button
                      variants={{
                        hidden: { opacity: 0, y: -12, scale: 0.82 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                        },
                      }}
                      whileTap={{ scale: 0.94 }}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onOpenMediaGallery();
                      }}
                      className="flex items-center justify-between gap-1.5 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none origin-center"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ImageIcon size={15} className="shrink-0" />
                        <span className="truncate">La Cajita</span>
                      </div>
                      <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 shrink-0">
                        {sessionMediaCount}
                      </span>
                    </motion.button>

                    {chat && (
                      <motion.button
                        variants={{
                          hidden: { opacity: 0, y: -12, scale: 0.82 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                          },
                        }}
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onOpenFolderManager(folder?.id || 'general');
                        }}
                        className="flex items-center justify-between gap-1.5 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-orange-500 dark:hover:text-orange-400 transition-colors cursor-pointer select-none origin-center"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <BookOpen size={15} className="text-orange-500 dark:text-orange-400 shrink-0" />
                          <span className="truncate">Docs Lore</span>
                        </div>
                        <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-800 dark:text-orange-300 shrink-0">
                          {activeLoreCount}/{availableLoreFiles.length}
                        </span>
                      </motion.button>
                    )}
                  </div>

                  {/* 3. Barra Compacta de Exportación (1 sola fila con efecto resorte y paleta Noir/Naranja) */}
                  {chat && chat.messages.length > 0 && (
                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: -12, scale: 0.84 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                        },
                      }}
                      className="pt-1.5 border-t border-zinc-200 dark:border-white/10 origin-center"
                    >
                      <div className="px-1 pb-1.5 text-[11px] font-medium tracking-tight text-zinc-500 dark:text-zinc-400">
                        Exportar capítulo
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {onOpenEditorialExport && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOverflowOpen(false);
                              onOpenEditorialExport();
                            }}
                            className="flex flex-col items-center justify-center gap-1 min-h-[44px] rounded-xl bg-orange-500/12 hover:bg-orange-500/22 border border-orange-500/35 text-[10.5px] font-medium tracking-tight text-orange-700 dark:text-orange-300 transition-colors cursor-pointer select-none active:scale-95"
                            title="Exportador Editorial (MD / DOCX / EPUB)"
                          >
                            <FileText size={14} className="text-orange-500 dark:text-orange-400" />
                            <span>Editorial</span>
                          </button>
                        )}

                        {onExportEpub && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOverflowOpen(false);
                              handleTriggerExportEpub();
                            }}
                            disabled={isBindingEpub}
                            className="flex flex-col items-center justify-center gap-1 min-h-[44px] rounded-xl bg-zinc-100/80 dark:bg-white/[0.04] hover:bg-zinc-200/80 dark:hover:bg-white/10 border border-zinc-200/80 dark:border-white/10 text-[10.5px] font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none active:scale-95"
                            title="Exportar EPUB (.epub)"
                          >
                            <BookBindingIcon isBinding={isBindingEpub} size={14} />
                            <span>EPUB</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsOverflowOpen(false);
                            onExportChat();
                          }}
                          className="flex flex-col items-center justify-center gap-1 min-h-[44px] rounded-xl bg-zinc-100/80 dark:bg-white/[0.04] hover:bg-zinc-200/80 dark:hover:bg-white/10 border border-zinc-200/80 dark:border-white/10 text-[10.5px] font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none active:scale-95"
                          title="Exportar Markdown (.md)"
                        >
                          <Download size={14} className="text-zinc-800 dark:text-white" />
                          <span>.MD</span>
                        </button>

                        {onExportChatToDrive && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOverflowOpen(false);
                              onExportChatToDrive();
                            }}
                            className="flex flex-col items-center justify-center gap-1 min-h-[44px] rounded-xl bg-zinc-100/80 dark:bg-white/[0.04] hover:bg-orange-500/15 border border-zinc-200/80 dark:border-white/10 text-[10.5px] font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-orange-400 transition-colors cursor-pointer select-none active:scale-95"
                            title="Exportar a Google Drive"
                          >
                            <CloudUpload size={14} className="text-orange-500 dark:text-orange-400" />
                            <span>Drive</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* 4. Acordeón Compacto de Herramientas Avanzadas con Cascada Spring */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: -10, scale: 0.86 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                      },
                    }}
                    className="pt-1 border-t border-zinc-200 dark:border-white/10 origin-center"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAdvancedMenu((prev) => !prev);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 min-h-[44px] rounded-2xl text-xs font-medium tracking-tight text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer select-none"
                    >
                      <span>Más herramientas y análisis</span>
                      <motion.span
                        animate={{ rotate: showAdvancedMenu ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                        className="flex items-center justify-center"
                      >
                        <ChevronDown size={15} className={showAdvancedMenu ? 'text-orange-400' : ''} />
                      </motion.span>
                    </button>

                    <AnimatePresence>
                      {showAdvancedMenu && (
                        <motion.div
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                          variants={{
                            hidden: { opacity: 0, height: 0 },
                            visible: {
                              opacity: 1,
                              height: 'auto',
                              transition: { staggerChildren: 0.038 },
                            },
                          }}
                          className="grid grid-cols-2 gap-1.5 pt-1.5 overflow-hidden"
                        >
                          {chat && chat.messages.length > 0 && onAuditScene && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onAuditScene();
                              }}
                              disabled={isAuditingLore}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <RunicSealIcon isAuditing={isAuditingLore} isFinished={isAuditFinished} size={14} />
                              <span className="truncate">Auditar Lore</span>
                            </motion.button>
                          )}

                          {chat && onOpenEngineDuel && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onOpenEngineDuel();
                              }}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <Columns size={14} className="text-orange-500 dark:text-orange-400 shrink-0" />
                              <span className="truncate">Duelo Motores</span>
                            </motion.button>
                          )}

                          {chat && onOpenTokenBreakdown && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onOpenTokenBreakdown();
                              }}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <Gauge size={14} className="text-orange-500 dark:text-orange-400 shrink-0" />
                              <span className="truncate">Tokens (%)</span>
                            </motion.button>
                          )}

                          {onOpenStats && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onOpenStats();
                              }}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <BarChart3 size={14} className="shrink-0" />
                              <span className="truncate">Estadísticas</span>
                            </motion.button>
                          )}

                          <motion.button
                            variants={{
                              hidden: { opacity: 0, y: 10, scale: 0.84 },
                              visible: {
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: { type: 'spring', stiffness: 380, damping: 18 },
                              },
                            }}
                            whileTap={{ scale: 0.94 }}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOverflowOpen(false);
                              if (onOpenGoogleDrive) {
                                onOpenGoogleDrive();
                              }
                            }}
                            className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                          >
                            <FolderOpen size={14} className="text-orange-500 dark:text-orange-400 shrink-0" />
                            <span className="truncate">Carpeta Drive</span>
                          </motion.button>

                          {onInspectUI && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onInspectUI();
                              }}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <Camera size={14} className="shrink-0" />
                              <span className="truncate">Captura UI</span>
                            </motion.button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* 5. Limpiar conversación */}
                  {chat && chat.messages.length > 0 && (
                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: -8, scale: 0.88 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                        },
                      }}
                      className="pt-1 border-t border-zinc-200 dark:border-white/10 origin-center"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onClearChat();
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 min-h-[44px] rounded-2xl text-xs font-medium tracking-tight text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 transition-colors cursor-pointer select-none active:scale-95"
                      >
                        <Trash2 size={14} />
                        <span>Limpiar conversación</span>
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Full-Width Runic Amber Filament / Active Streaming Light Wave directly under top header */}
      <div className="absolute bottom-0 left-0 right-0 w-full overflow-hidden pointer-events-none">
        {isStreaming ? (
          <div className="h-[2px] w-full kz-header-stream-wave" />
        ) : (
          <div className="runic-aura-divider" />
        )}
      </div>
    </header>
  );
}, (prev, next) => {
  return (
    prev.chat?.id === next.chat?.id &&
    prev.chat?.title === next.chat?.title &&
    prev.chat?.folderId === next.chat?.folderId &&
    (prev.chat?.selectedLoreFileIds?.length || 0) === (next.chat?.selectedLoreFileIds?.length || 0) &&
    prev.folder?.id === next.folder?.id &&
    prev.folder?.name === next.folder?.name &&
    (prev.folders?.length || 0) === (next.folders?.length || 0) &&
    prev.availableLoreFiles.length === next.availableLoreFiles.length &&
    prev.sessionMediaCount === next.sessionMediaCount &&
    prev.totalContextTokens === next.totalContextTokens &&
    prev.settings === next.settings &&
    prev.currentProvider === next.currentProvider &&
    prev.isZenMode === next.isZenMode &&
    prev.isStreaming === next.isStreaming &&
    prev.isAuditingLore === next.isAuditingLore &&
    prev.isAuditFinished === next.isAuditFinished &&
    prev.isLightMode === next.isLightMode &&
    prev.reasoningMode === next.reasoningMode
  );
});

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
        ['gemini-3.8-flash', 'gemini-3.8-live', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'].forEach((id) => {
          list.push({
            id,
            name: id === 'gemini-3.8-live' ? 'Gemini 3.8 Live' : id,
            provider: 'gemini',
            description: 'Google Generative AI Engine',
            isVision: true,
            hasReasoning: true,
            badge: id.includes('3.8') ? 'SOTA Flash' : undefined,
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

              const isVis = /vision|vl|-v-|-4v|fuyu|pixtral|llava|omni|step/i.test(modelId);
              const isCoT = /kimi|moonshot|reason|cot|thinking|step/i.test(modelId);
              list.push({
                id: modelId,
                name: modelId.split('/').pop()?.replace(/-/g, ' ') || modelId,
                provider: 'custom',
                description: `NVIDIA NIM: ${modelId.split('/')[0] || 'Inferencia'}`,
                isVision: isVis,
                hasReasoning: isCoT,
                badge: modelId.includes('step') ? 'StepFun 1M' : modelId.includes('kimi') ? 'Narrativa' : isCoT ? 'CoT' : isVis ? 'Visión' : undefined,
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
              const isRetiredCommercial = /^(?:deepseek-r1|deepseek-v3|deepseek-k3|qwen-long|qwen-turbo|qwen2\.5)/i.test(modelId);
              if (isNonChat || isRetiredCommercial) return;

              const isVis = /vision|vl|-v-|-4v|kimi|omni|v4\.1-flash/i.test(modelId);
              const isCoT = /reason|cot|thinking|k3|deepseek|kimi|omni|3\.8/i.test(modelId);
              const displayName =
                modelId === 'kimi-k3.1-pro' || modelId === 'moonshotai/kimi-k3.1-pro'
                  ? 'Kimi K3.1 Pro (1M Contexto)'
                  : modelId === 'kimi-k3'
                  ? 'Kimi K3 (1M Cuota Gratis)'
                  : modelId === 'kimi/kimi-k3'
                  ? 'Kimi K3 (Partner / Pago directo)'
                  : modelId.split('/').pop()?.replace(/-/g, ' ') || modelId;
              list.push({
                id: modelId,
                name: displayName,
                provider: 'alibaba',
                description:
                  modelId.includes('k3.1')
                    ? 'Alibaba Cloud MaaS: 3T-class 1M Contexto • Agentic Coding & Prosa'
                    : modelId === 'kimi-k3'
                    ? 'Alibaba Singapur: 1M Tokens Gratis + Tope de Seguridad'
                    : modelId === 'kimi/kimi-k3'
                    ? 'Alibaba Partner Endpoint (0% cuota gratis, cobro por uso)'
                    : `Alibaba Cloud MaaS: ${modelId}`,
                isVision: isVis,
                hasReasoning: isCoT,
                badge: modelId.includes('k3.1') ? 'K3.1 Pro' : modelId === 'kimi-k3' ? 'K3 Gratis' : modelId.includes('omni') ? 'Omni 1M' : modelId.includes('3.8') ? 'Qwen 3.8' : modelId.includes('kimi') ? 'Partner' : isCoT ? 'CoT' : isVis ? 'Visión' : undefined,
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
        { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash (1M)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Tokens + Visión & CoT Ultra-rápido', isVision: true, hasReasoning: true, badge: 'Flash 1M' },
        { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus (Balanceado)', provider: 'alibaba', description: 'Alibaba Singapur: Equilibrio óptimo para síntesis y estructura', isVision: true, hasReasoning: true, badge: '3.7 Plus' },
        { id: 'qwen3.8-omni-flash', name: 'Qwen 3.8 Omni Flash (1M)', provider: 'alibaba', description: 'Alibaba Singapur: Multimodal Nativo + 1M Contexto (Ultra-Económico)', isVision: true, hasReasoning: true, badge: 'Omni 1M' },
        { id: 'qwen3.8-max', name: 'Qwen 3.8 Max (CoT)', provider: 'alibaba', description: 'Alibaba Singapur: SOTA con Thinking CoT & Visión', isVision: true, hasReasoning: true, badge: 'Max' },
        { id: 'qwen-plus', name: 'Qwen Plus (1M)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Contexto Balanceado', isVision: false, hasReasoning: false, badge: '1M' },
        { id: 'qwen-vl-max', name: 'Qwen VL Max', provider: 'alibaba', description: 'Alibaba Singapur: Visión Multimodal', isVision: true, hasReasoning: false, badge: 'Visión' },
      ];
      alibabaPresets.forEach((preset) => {
        if (!list.some((m) => m.id === preset.id)) {
          list.push(preset);
        }
      });

      // Add preset NVIDIA NIM core models supported on build.nvidia.com
      const nvidiaPresets: LiveModelItem[] = [
        { id: 'moonshotai/kimi-k3.1-pro', name: 'Kimi K3.1 Pro (NVIDIA 1M)', provider: 'custom', description: 'NVIDIA NIM: 3T-class 1M Contexto • Coding Agéntico & 3D Modeling SOTA', isVision: true, hasReasoning: true, badge: 'K3.1 Pro' },
        { id: 'stepfun-ai/step-5-preview', name: 'Step 5 Preview (StepFun 1M)', provider: 'custom', description: 'NVIDIA NIM: 1M Contexto Multimodal MoE', isVision: true, hasReasoning: true, badge: 'Step 5' },
        { id: 'moonshotai/kimi-k3', name: 'Kimi K3 (Moonshot)', provider: 'custom', description: 'NVIDIA NIM: MoE CoT & Visión', isVision: true, hasReasoning: true, badge: 'Narrativa' },
        { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', provider: 'custom', description: 'NVIDIA NIM: Inferencia Versátil', isVision: false, hasReasoning: false, badge: 'Llama 3.3' },
      ];
      nvidiaPresets.forEach((preset) => {
        if (!list.some((m) => m.id === preset.id)) {
          list.push(preset);
        }
      });

      if (isMounted) {
        if (list.length > 0) {
          const loraModelId = settings?.alibabaCustomLoraModel?.trim();
          const topPriority = [
            ...(loraModelId ? [loraModelId] : []),
            'moonshotai/kimi-k3.1-pro', 'deepseek-v4-pro-0813', 'deepseek-v4.1-flash-1017', 'qwen3.8-max-0902', 'qwen3.8-2.4-a95b', 'kimi-k3', 'moonshotai/kimi-k3', 'stepfun-ai/step-5-preview', 'qwen3.8-plus', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-omni-flash', 'gemini-4-argon', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.8-live', 'qwen3.8-max', 'qwen-plus', 'gemini-3.1-pro-preview'
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
            { id: 'moonshotai/kimi-k3.1-pro', name: 'Kimi K3.1 Pro (NVIDIA 1M)', provider: 'custom', description: 'NVIDIA NIM: 3T-class 1M Contexto • Coding Agéntico & 3D Modeling SOTA', isVision: true, hasReasoning: true, badge: 'K3.1 Pro' },
            { id: 'deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813 (1.6T MoE)', provider: 'alibaba', description: 'Alibaba Singapur: 1.6T MoE (49B activos) • $0.66/1M • Auditor & Diálogos', isVision: false, hasReasoning: true, badge: 'V4 Pro 0813' },
            { id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash (1017)', provider: 'alibaba', description: 'Alibaba Singapur: 552B MoE (~8B activos) • Multimodal • $0.15/1M', isVision: true, hasReasoning: true, badge: 'V4.1 Flash' },
            { id: 'qwen3.8-max-0902', name: 'Qwen 3.8 Max 0902 (Último)', provider: 'alibaba', description: 'Alibaba Singapur: Flagship 0902 con Thinking CoT', isVision: false, hasReasoning: true, badge: '0902 SOTA' },
            { id: 'qwen3.8-2.4-a95b', name: 'Qwen 3.8 2.4-A95B (MoE)', provider: 'alibaba', description: 'Alibaba Singapur: Arquitectura MoE A95B + Thinking CoT', isVision: false, hasReasoning: true, badge: 'A95B MoE' },
            { id: 'kimi-k3', name: 'Kimi K3 (1M Cuota Gratis)', provider: 'alibaba', description: 'Alibaba Singapur: Visión & CoT', isVision: true, hasReasoning: true, badge: 'K3 Gratis' },
            { id: 'qwen3.8-plus', name: 'Qwen 3.8 Plus (1M)', provider: 'alibaba', description: 'Alibaba Cloud MaaS: 1M Contexto & Visión', isVision: true, hasReasoning: true, badge: '3.8 Plus' },
            { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash', provider: 'alibaba', description: 'Alibaba Cloud MaaS: Visión & CoT', isVision: true, hasReasoning: true, badge: 'Flash' },
            { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus', provider: 'alibaba', description: 'Alibaba Cloud MaaS: Balanceado', isVision: true, hasReasoning: true, badge: '3.7 Plus' },
            { id: 'gemini-4-argon', name: 'Gemini 4 Argon (Paid)', provider: 'gemini', description: 'Google AI Studio: SOTA Model (Paid Tier)', isVision: true, hasReasoning: true, badge: 'Argon 4' },
            { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'gemini', description: 'Google Generative AI', isVision: true, hasReasoning: true, badge: 'Flash 3.8' },
            { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', provider: 'gemini', description: 'Google Generative AI: Rápido y Multimodal', isVision: true, hasReasoning: true, badge: 'Flash 3.6' },
            { id: 'gemini-3.8-live', name: 'Gemini 3.8 Live', provider: 'gemini', description: 'Google Generative AI (Llamada)', isVision: true, hasReasoning: true, badge: 'Live' },
            { id: 'stepfun-ai/step-5-preview', name: 'Step 5 Preview (StepFun 1M)', provider: 'custom', description: 'NVIDIA NIM: 1M Contexto Multimodal MoE', isVision: true, hasReasoning: true, badge: 'Step 5' },
            { id: 'moonshotai/kimi-k3', name: 'Kimi K3 (Moonshot)', provider: 'custom', description: 'NVIDIA NIM: MoE CoT & Visión', isVision: true, hasReasoning: true, badge: 'Narrativa' },
            { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', provider: 'custom', description: 'NVIDIA NIM: Inferencia Versátil', isVision: false, hasReasoning: false, badge: 'Llama 3.3' },
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
        initial={{ opacity: 0, y: -10, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26, mass: 0.72 }}
        className="fixed left-3 right-3 top-[60px] sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[390px] max-w-[calc(100vw-24px)] max-h-[min(520px,78dvh)] origin-top-left flex flex-col bg-white/95 dark:bg-[#0e0e12]/95 backdrop-blur-2xl border border-zinc-200 dark:border-[#27272c] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.8)] z-[120] text-zinc-900 dark:text-zinc-100 overflow-hidden"
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
                    ? 'bg-white dark:bg-zinc-700 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
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
                    ? 'bg-white dark:bg-zinc-700 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                NVIDIA
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOnlyVision((v) => !v)}
              className={`px-2 py-1 rounded-lg text-[10px] font-sans flex items-center gap-1 border transition-colors cursor-pointer ${
                onlyVision
                  ? 'bg-orange-100 dark:bg-orange-500/15 border-orange-300 dark:border-orange-500/50 text-orange-800 dark:text-orange-300 font-semibold'
                  : 'bg-zinc-100 dark:bg-transparent border-zinc-300 dark:border-[#27272e] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <VisionLensIcon size={11} className={onlyVision ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-500'} />
              <span>Visión</span>
            </button>
            <button
              type="button"
              onClick={() => setOnlyReasoning((r) => !r)}
              className={`px-2 py-1 rounded-lg text-[10px] font-sans flex items-center gap-1 border transition-colors cursor-pointer ${
                onlyReasoning
                  ? 'bg-orange-100 dark:bg-orange-500/15 border-orange-300 dark:border-orange-500/50 text-orange-800 dark:text-orange-300 font-semibold'
                  : 'bg-zinc-100 dark:bg-transparent border-zinc-300 dark:border-[#27272e] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <NeuralCoreIcon size={11} className={onlyReasoning ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-500'} />
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
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${m.provider === 'alibaba' ? 'bg-orange-100 dark:bg-orange-500/10 text-orange-800 dark:text-orange-400' : m.provider === 'gemini' ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400' : 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400'}`}>
                        {m.provider === 'alibaba' ? 'Alibaba' : m.provider === 'gemini' ? 'Google' : 'NVIDIA'}
                      </span>
                      {m.isVision && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-500/30">
                          <VisionLensIcon size={9} className="text-amber-600 dark:text-amber-400" />
                          <span>Visión</span>
                        </span>
                      )}
                      {m.hasReasoning && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300">
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
