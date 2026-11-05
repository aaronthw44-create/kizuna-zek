import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  MessageSquare,
  BookOpen,
  Sparkles,
  Plus,
  Image as ImageIcon,
  Glasses,
  CloudDownload,
  Sun,
  Moon,
  SlidersHorizontal,
  X,
  Check,
  ArrowRight,
  Folder as FolderIcon,
  RefreshCw,
} from 'lucide-react';
import { Chat, Folder, LoreFile } from '../types';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  folders: Folder[];
  loreFiles: LoreFile[];
  activeChat: Chat | null;
  isLightMode: boolean;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onToggleLoreFile: (chatId: string, loreId: string) => void;
  onSelectQuickModel: (provider: 'gemini' | 'custom' | 'alibaba', modelId: string) => void;
  onToggleAutoRouting: (enabled: boolean) => void;
  onOpenMediaGallery: () => void;
  onOpenVrSanctuary: () => void;
  onOpenGoogleDrive: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
}

interface PaletteItem {
  id: string;
  category: 'Acciones Rápidas' | 'Modelos' | 'Documentos de Lore' | 'Capítulos y Chats';
  title: string;
  subtitle?: string;
  badge?: string;
  isActive?: boolean;
  icon: React.ReactNode;
  onExecute: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  chats,
  folders,
  loreFiles,
  activeChat,
  isLightMode,
  onSelectChat,
  onNewChat,
  onToggleLoreFile,
  onSelectQuickModel,
  onToggleAutoRouting,
  onOpenMediaGallery,
  onOpenVrSanctuary,
  onOpenGoogleDrive,
  onOpenSettings,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 40);
    }
  }, [isOpen]);

  const folderMap = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [folders]);

  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [
      {
        id: 'act-new-chat',
        category: 'Acciones Rápidas',
        title: 'Nuevo Chat Libre',
        subtitle: 'Iniciar una nueva sesión en blanco',
        icon: <Plus size={15} className="text-amber-400" />,
        onExecute: () => {
          onNewChat();
          onClose();
        },
      },
      {
        id: 'act-cajita',
        category: 'Acciones Rápidas',
        title: 'Abrir La Cajita (Estudio de Medios)',
        subtitle: 'Galería de ilustraciones y video 3.0',
        icon: <ImageIcon size={15} className="text-amber-400" />,
        onExecute: () => {
          onOpenMediaGallery();
          onClose();
        },
      },
      {
        id: 'act-vr',
        category: 'Acciones Rápidas',
        title: 'Santuario Espacial 3D (VR / WebXR)',
        subtitle: 'Entorno 3D interactivo para Meta Quest 3, PSVR2 y PC',
        badge: '3D',
        icon: <Glasses size={15} className="text-sky-400" />,
        onExecute: () => {
          onOpenVrSanctuary();
          onClose();
        },
      },
      {
        id: 'act-drive',
        category: 'Acciones Rápidas',
        title: 'Gestor y Editor de Google Drive & Docs',
        subtitle: 'Importar, editar o crear documentos en tu Google Drive',
        icon: <CloudDownload size={15} className="text-sky-400" />,
        onExecute: () => {
          onOpenGoogleDrive();
          onClose();
        },
      },
      {
        id: 'act-sync-firebase',
        category: 'Acciones Rápidas',
        title: 'Sincronizar con Firebase Cloud ahora',
        subtitle: 'Subir y descargar chats, lore y memorias de la nube',
        icon: <RefreshCw size={15} className="text-emerald-400" />,
        onExecute: () => {
          window.dispatchEvent(new CustomEvent('kizuna:cloud-sync-now'));
          onClose();
        },
      },
      {
        id: 'act-theme',
        category: 'Acciones Rápidas',
        title: isLightMode ? 'Cambiar a Modo Noir (Oscuro)' : 'Cambiar a Modo Día (Claro)',
        subtitle: 'Alternar apariencia visual de la aplicación',
        icon: isLightMode ? <Moon size={15} className="text-zinc-400" /> : <Sun size={15} className="text-amber-400" />,
        onExecute: () => {
          onToggleTheme();
          onClose();
        },
      },
      {
        id: 'act-settings',
        category: 'Acciones Rápidas',
        title: 'Abrir Ajustes y Directivas',
        subtitle: 'Claves API, System Prompt, Memorias y Copias de Seguridad',
        icon: <SlidersHorizontal size={15} className="text-zinc-400" />,
        onExecute: () => {
          onOpenSettings();
          onClose();
        },
      },
      // Quick Models
      {
        id: 'mod-auto',
        category: 'Modelos',
        title: '✦ Kizuna Auto (Enrutador Inteligente)',
        subtitle: 'Alterna automáticamente entre Qwen 3.8 Max, Kimi K3 y Flash',
        badge: 'Auto',
        icon: <Sparkles size={15} className="text-amber-400" />,
        onExecute: () => {
          onToggleAutoRouting(true);
          onClose();
        },
      },
      {
        id: 'mod-qwen-max',
        category: 'Modelos',
        title: 'Qwen 3.8 Max 0902 (Alibaba Singapur)',
        subtitle: 'Flagship SOTA con Razonamiento CoT Profundo',
        badge: 'Alibaba',
        icon: <Sparkles size={15} className="text-amber-400" />,
        onExecute: () => {
          onSelectQuickModel('alibaba', 'qwen3.8-max-0902');
          onClose();
        },
      },
      {
        id: 'mod-deepseek-v4',
        category: 'Modelos',
        title: 'DeepSeek V4 Pro 0813 (1.6T MoE)',
        subtitle: 'Auditoría literaria, subtexto y diálogos complejos',
        badge: 'Alibaba',
        icon: <Sparkles size={15} className="text-sky-400" />,
        onExecute: () => {
          onSelectQuickModel('alibaba', 'deepseek-v4-pro-0813');
          onClose();
        },
      },
      {
        id: 'mod-kimi-k3',
        category: 'Modelos',
        title: 'Kimi K3 (1M Cuota Gratis)',
        subtitle: 'Narrativa extensa y contexto de 1 millón de tokens',
        badge: '1M',
        icon: <Sparkles size={15} className="text-emerald-400" />,
        onExecute: () => {
          onSelectQuickModel('alibaba', 'kimi-k3');
          onClose();
        },
      },
      {
        id: 'mod-gemini-flash',
        category: 'Modelos',
        title: 'Gemini 3.8 Flash (Google)',
        subtitle: 'Rápido, multimodal y con ventana de 1M tokens',
        badge: 'Google',
        icon: <Sparkles size={15} className="text-amber-300" />,
        onExecute: () => {
          onSelectQuickModel('gemini', 'gemini-3.8-flash');
          onClose();
        },
      },
    ];

    // Lore Documents
    loreFiles.forEach((doc) => {
      const isSelected = Boolean(activeChat?.selectedLoreFileIds.includes(doc.id));
      items.push({
        id: `lore-${doc.id}`,
        category: 'Documentos de Lore',
        title: doc.title,
        subtitle: `${doc.wordCount.toLocaleString()} palabras · ~${Math.round((doc.estimatedTokens || 0) / 1000 * 10) / 10}k tok`,
        badge: isSelected ? 'Activo en chat' : 'Inactivo',
        isActive: isSelected,
        icon: <BookOpen size={15} className={isSelected ? 'text-amber-400' : 'text-zinc-500'} />,
        onExecute: () => {
          if (activeChat) {
            onToggleLoreFile(activeChat.id, doc.id);
          }
        },
      });
    });

    // Chats
    chats.forEach((c) => {
      const folderName = c.folderId ? folderMap.get(c.folderId) : 'Chat Libre';
      const isCurrent = activeChat?.id === c.id;
      items.push({
        id: `chat-${c.id}`,
        category: 'Capítulos y Chats',
        title: c.title,
        subtitle: `${folderName || 'General'} · ${c.messages.length} mensajes`,
        badge: isCurrent ? 'Actual' : undefined,
        isActive: isCurrent,
        icon: c.folderId ? (
          <FolderIcon size={15} className={isCurrent ? 'text-amber-400' : 'text-zinc-400'} />
        ) : (
          <MessageSquare size={15} className={isCurrent ? 'text-amber-400' : 'text-zinc-400'} />
        ),
        onExecute: () => {
          onSelectChat(c.id);
          onClose();
        },
      });
    });

    return items;
  }, [
    chats,
    loreFiles,
    activeChat,
    isLightMode,
    folderMap,
    onNewChat,
    onClose,
    onOpenMediaGallery,
    onOpenVrSanctuary,
    onOpenGoogleDrive,
    onOpenSettings,
    onToggleTheme,
    onToggleAutoRouting,
    onSelectQuickModel,
    onToggleLoreFile,
    onSelectChat,
  ]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Show top quick actions, models, lore, and recent chats
      return allItems.slice(0, 28);
    }
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0
        );
      } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
        e.preventDefault();
        filteredItems[selectedIndex].onExecute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  // Group filtered items by category while preserving global index for keyboard navigation
  const groupedSections = useMemo(() => {
    const groups: { category: string; entries: { item: PaletteItem; globalIdx: number }[] }[] = [];
    filteredItems.forEach((item, idx) => {
      let group = groups.find((g) => g.category === item.category);
      if (!group) {
        group = { category: item.category, entries: [] };
        groups.push(group);
      }
      group.entries.push({ item, globalIdx: idx });
    });
    return groups;
  }, [filteredItems]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[8vh] sm:pt-[12vh] px-3 sm:px-4 select-none">
          {/* Frosted Dark Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/65 backdrop-blur-md"
          />

          {/* Spotlight Command Palette Card */}
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 430, damping: 28, mass: 0.72 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-xl rounded-[24px] bg-white/95 dark:bg-[#111117]/95 border border-zinc-200 dark:border-white/[0.12] shadow-[0_28px_70px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden text-zinc-900 dark:text-zinc-100 flex flex-col max-h-[78dvh]"
          >
            {/* Top Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-200 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02]">
              <Search size={18} className="text-amber-500 dark:text-amber-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Saltar a capítulo, activar documento de Lore, cambiar modelo o herramienta..."
                className="w-full bg-transparent text-[15px] sm:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  <X size={15} />
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/70 dark:bg-white/[0.06] rounded-md border border-zinc-300/60 dark:border-white/10">
                  ESC
                </kbd>
              )}
            </div>

            {/* Results List */}
            <div ref={listRef} className="flex-1 overflow-y-auto smooth-scroll p-2 space-y-3">
              {groupedSections.length === 0 ? (
                <div className="py-10 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No se encontraron capítulos, documentos de Lore ni herramientas para "{query}".
                </div>
              ) : (
                groupedSections.map((group) => (
                  <div key={group.category} className="space-y-1">
                    <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {group.category}
                    </div>
                    {group.entries.map(({ item, globalIdx }) => {
                      const isHighlighted = globalIdx === selectedIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          onClick={item.onExecute}
                          className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl text-left transition-all cursor-pointer ${
                            isHighlighted
                              ? 'bg-zinc-200/80 dark:bg-white/[0.09] text-zinc-950 dark:text-white shadow-xs'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-[#191922] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-center shrink-0">
                              {item.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs sm:text-[13px] font-semibold truncate flex items-center gap-2">
                                <span className="truncate">{item.title}</span>
                                {item.isActive && (
                                  <Check size={12} className="text-amber-500 dark:text-amber-400 shrink-0" />
                                )}
                              </div>
                              {item.subtitle && (
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.badge && (
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                  item.isActive
                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 font-semibold'
                                    : 'bg-zinc-100 dark:bg-white/[0.06] border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-400'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                            <ArrowRight
                              size={13}
                              className={`transition-transform ${
                                isHighlighted
                                  ? 'translate-x-0.5 text-zinc-900 dark:text-white opacity-100'
                                  : 'opacity-0'
                              }`}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer Hint */}
            <div className="px-4 py-2 border-t border-zinc-200 dark:border-white/[0.07] bg-zinc-50/80 dark:bg-[#0d0d12] flex items-center justify-between text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
              <span>Navegador Rápido Kizuna-Zek</span>
              <div className="hidden sm:flex items-center gap-3">
                <span>↑↓ Navegar</span>
                <span>↵ Ejecutar</span>
                <span>Ctrl+K Abrir/Cerrar</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
