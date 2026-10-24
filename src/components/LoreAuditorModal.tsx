import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X,
  AlertCircle,
  Copy,
  Check,
  Sparkles,
  Camera,
  RotateCw,
  Download,
  Layers,
  BookOpen,
  CheckSquare,
  Square,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { RunicSealIcon } from './RunicSealIcon';
import { Chat, LoreFile } from '../types';

export interface LoreAuditorModalProps {
  isOpen: boolean;
  isAuditing: boolean;
  auditResult: string;
  auditError: string | null;
  onClose: () => void;
  onInspectUI?: () => void;
  onReaudit?: (
    overrideProvider?: 'gemini' | 'custom' | 'alibaba',
    overrideModel?: string,
    speedMode?: 'fast' | 'deep'
  ) => void;
  chats?: Chat[];
  loreFiles?: LoreFile[];
  onBatchAudit?: (
    selectedChatIds: string[],
    overrideProvider?: 'gemini' | 'custom' | 'alibaba',
    overrideModel?: string,
    speedMode?: 'fast' | 'deep'
  ) => void;
  activeProvider?: 'gemini' | 'custom' | 'alibaba';
  activeModel?: string;
}

interface AuditorModelOption {
  id: string;
  provider: 'gemini' | 'custom' | 'alibaba';
  name: string;
  badge: string;
  icon: string;
}

interface AuditorModelGroup {
  provider: 'gemini' | 'custom' | 'alibaba';
  title: string;
  icon: string;
  models: AuditorModelOption[];
}

const AUDITOR_MODEL_GROUPS: AuditorModelGroup[] = [
  {
    provider: 'gemini',
    title: 'Google AI Studio (Gemini)',
    icon: '✨',
    models: [
      { id: 'gemini-3.8-flash', provider: 'gemini', name: 'Gemini 3.8 Flash', badge: 'Ultra-Rápido', icon: '⚡' },
      { id: 'gemini-3.8-live', provider: 'gemini', name: 'Gemini 3.8 Live', badge: '1M Contexto + Visión', icon: '⚡' },
      { id: 'gemini-3.1-pro-preview', provider: 'gemini', name: 'Gemini 3.1 Pro', badge: 'Análisis Complejo', icon: '🧠' },
    ],
  },
  {
    provider: 'alibaba',
    title: 'Alibaba Cloud MaaS',
    icon: '☁️',
    models: [
      { id: 'deepseek-v4-pro-0813', provider: 'alibaba', name: 'DeepSeek V4 Pro (0813)', badge: 'Auditor Maestro · 1.6T MoE', icon: '🧠' },
      { id: 'deepseek-v4.1-flash-1017', provider: 'alibaba', name: 'DeepSeek V4.1 Flash', badge: 'Flash MoE · $0.15/1M', icon: '⚡' },
      { id: 'qwen3.8-max-0902', provider: 'alibaba', name: 'Qwen 3.8 Max 0902', badge: 'Flagship CoT', icon: '🧠' },
      { id: 'kimi-k3', provider: 'alibaba', name: 'Kimi K3 (Moonshot)', badge: 'Prosa & Lore', icon: '📜' },
      { id: 'qwen3.8-flash', provider: 'alibaba', name: 'Qwen 3.8 Flash', badge: 'Alta Cadencia', icon: '⚡' },
    ],
  },
  {
    provider: 'custom',
    title: 'NVIDIA NIM',
    icon: '⚙️',
    models: [
      { id: 'moonshotai/kimi-k3', provider: 'custom', name: 'Kimi K3 (NVIDIA)', badge: 'Prosa & Lore', icon: '📜' },
      { id: 'meta/llama-3.3-70b-instruct', provider: 'custom', name: 'Llama 3.3 70B', badge: 'Enterprise Llama', icon: '⚡' },
    ],
  },
];

export const LoreAuditorModal: React.FC<LoreAuditorModalProps> = ({
  isOpen,
  isAuditing,
  auditResult,
  auditError,
  onClose,
  onInspectUI,
  onReaudit,
  chats = [],
  loreFiles = [],
  onBatchAudit,
  activeProvider,
  activeModel,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'scene' | 'batch'>('scene');
  const [selectedBatchChatIds, setSelectedBatchChatIds] = useState<string[]>(() => {
    return chats.slice(0, 3).map((c) => c.id);
  });

  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'custom' | 'alibaba'>(
    activeProvider || 'gemini'
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    activeModel || 'gemini-3.8-flash'
  );
  const [speedMode, setSpeedMode] = useState<'fast' | 'deep'>('fast');
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<'gemini' | 'custom' | 'alibaba' | null>(
    activeProvider || 'gemini'
  );

  if (!isOpen) return null;

  const currentProvider = selectedProvider || activeProvider || 'gemini';
  const currentModel = selectedModel || activeModel || 'gemini-3.8-flash';

  const activeOption = AUDITOR_MODEL_GROUPS.flatMap((g) => g.models).find(
    (m) => m.provider === currentProvider && m.id === currentModel
  ) || {
    id: currentModel,
    provider: currentProvider,
    name: currentModel,
    badge: 'Modelo Activo',
    icon: '⚡',
  };

  const providerLabel =
    currentProvider === 'alibaba'
      ? `Alibaba Cloud (${currentModel})`
      : currentProvider === 'custom'
        ? `NVIDIA NIM (${currentModel})`
        : `Google Gemini (${currentModel})`;

  const handleCopy = () => {
    if (!auditResult) return;
    navigator.clipboard.writeText(auditResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReport = () => {
    if (!auditResult) return;
    const blob = new Blob([auditResult], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `auditoria_manuscrito_jukkou_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleChatSelection = (id: string) => {
    setSelectedBatchChatIds((prev) =>
      prev.includes(id) ? prev.filter((cId) => cId !== id) : [...prev, id]
    );
  };

  const selectAllChats = () => {
    if (selectedBatchChatIds.length === chats.length) {
      setSelectedBatchChatIds([]);
    } else {
      setSelectedBatchChatIds(chats.map((c) => c.id));
    }
  };

  const cleanedAuditResult = (auditResult || '')
    .replace(/<<<FOLLOW_UP>>>[\s\S]*?<<<END_FOLLOW_UP>>>/gi, '')
    .replace(/<<<FOLLOW_UP>>>[\s\S]*$/gi, '')
    .trim();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-sm modal-backdrop-fluid">
        <div
          className="relative w-full max-w-2xl bg-[#0b0b0f] border border-[#22222a] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] modal-sheet-fluid"
        >
          {/* Header */}
          <div className="flex items-start sm:items-center justify-between px-3.5 sm:px-5 py-3 sm:py-3.5 border-b border-[#1c1c24] bg-[#0d0d14] gap-2">
            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="p-1.5 sm:p-2 bg-[#171722] border border-[#2a2a38] rounded-xl text-white flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <RunicSealIcon
                  isAuditing={isAuditing}
                  isFinished={!isAuditing && Boolean(auditResult)}
                  size={20}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h3 className="text-xs sm:text-base font-bold text-white leading-tight">
                    Sello Rúnico: Auditoría
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-[#141419] border-[#292934] text-[#a1a1aa] font-normal truncate max-w-[130px] sm:max-w-xs">
                    {providerLabel}
                  </span>
                  {isAuditing && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-normal text-amber-400 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded-full animate-pulse">
                      <Sparkles size={10} />
                      Resonancia...
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] text-[#71717a] mt-0.5 truncate">
                  Coherencia sensorial, reglas del mundo y fugas de tono
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-[#71717a] hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1"
              title="Cerrar auditoría"
            >
              <X size={18} />
            </button>
          </div>

          {/* Audit Mode Tabs & Model Selection Bar */}
          <div className="flex flex-col border-b border-[#1c1c24] bg-[#09090d]">
            <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 pt-2 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveTab('scene')}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-mono rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 shrink-0 min-h-[40px] ${
                  activeTab === 'scene'
                    ? 'border-amber-400 text-white font-semibold bg-[#121218]'
                    : 'border-transparent text-[#71717a] hover:text-[#d4d4d8]'
                }`}
              >
                <FileText size={13} />
                <span>Escena Actual</span>
              </button>
              {onBatchAudit && (
                <button
                  type="button"
                  onClick={() => setActiveTab('batch')}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-mono rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 shrink-0 min-h-[40px] ${
                    activeTab === 'batch'
                      ? 'border-amber-400 text-white font-semibold bg-[#121218]'
                      : 'border-transparent text-[#71717a] hover:text-[#d4d4d8]'
                  }`}
                >
                  <Layers size={13} className="text-amber-400" />
                  <span>Auditoría Integral (Batch)</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono hidden sm:inline">
                    Novela
                  </span>
                </button>
              )}
            </div>

            {/* Interactive Custom Model Selector (Accordion) & Speed Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 sm:px-5 sm:py-2.5 bg-[#0e0e14] border-t border-[#1a1a24] relative">
              <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto relative">
                <span className="text-[11px] font-mono text-[#a1a1aa] shrink-0 font-medium">
                  Modelo Auditor:
                </span>

                {/* Custom Model Trigger Button */}
                <div className="relative flex-1 sm:flex-initial min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsModelPickerOpen(!isModelPickerOpen)}
                    disabled={isAuditing}
                    className="w-full bg-[#15151f] hover:bg-[#1a1a26] border border-[#2e2e3d] hover:border-amber-400/60 text-amber-300 font-semibold text-xs font-mono rounded-xl px-3 py-2 flex items-center justify-between gap-2 transition-all cursor-pointer min-h-[44px] disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span>{activeOption.icon}</span>
                      <span className="truncate">{activeOption.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 font-normal hidden xs:inline">
                        {activeOption.badge}
                      </span>
                    </div>
                    <ChevronDown size={14} className={`text-amber-400 shrink-0 transition-transform ${isModelPickerOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Custom OpenWebUI Accordion Popover Modal */}
                  <AnimatePresence>
                    {isModelPickerOpen && (
                      <>
                        {/* Backdrop */}
                        <div
                          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs"
                          onClick={() => setIsModelPickerOpen(false)}
                        />

                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -6 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-0 right-0 sm:right-auto sm:w-[320px] top-full mt-2 z-50 bg-[#0e0e14] border border-[#282838] shadow-2xl rounded-2xl p-2.5 space-y-1.5 max-h-[340px] overflow-y-auto smooth-scroll"
                        >
                          <div className="px-2 py-1 text-[10px] font-mono text-[#a1a1aa] uppercase tracking-wider flex items-center justify-between">
                            <span>Seleccionar Modelo Auditor</span>
                            <button
                              type="button"
                              onClick={() => setIsModelPickerOpen(false)}
                              className="text-[#71717a] hover:text-white p-1 cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>

                          {AUDITOR_MODEL_GROUPS.map((group) => {
                            const isGroupOpen = expandedProvider === group.provider;
                            return (
                              <div key={group.provider} className="border border-[#1f1f2a] rounded-xl overflow-hidden bg-[#12121a]">
                                {/* Category Accordion Header */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedProvider(isGroupOpen ? null : group.provider)}
                                  className="w-full flex items-center justify-between p-2.5 text-left text-xs font-mono font-semibold text-white bg-[#151520] hover:bg-[#1a1a28] transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-2">
                                    <span>{group.icon}</span>
                                    <span>{group.title}</span>
                                  </div>
                                  <ChevronDown size={14} className={`text-zinc-400 transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Category Accordion Content */}
                                <AnimatePresence>
                                  {isGroupOpen && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="p-1 space-y-1 bg-[#0b0b10]"
                                    >
                                      {group.models.map((opt) => {
                                        const isSelected = selectedProvider === opt.provider && selectedModel === opt.id;
                                        return (
                                          <button
                                            key={`${opt.provider}:${opt.id}`}
                                            type="button"
                                            onClick={() => {
                                              setSelectedProvider(opt.provider);
                                              setSelectedModel(opt.id);
                                              setIsModelPickerOpen(false);
                                            }}
                                            className={`w-full flex items-center justify-between p-2 rounded-lg text-xs font-mono text-left transition-all cursor-pointer ${
                                              isSelected
                                                ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                                                : 'text-[#d4d4d8] hover:bg-[#181824] hover:text-white'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span>{opt.icon}</span>
                                              <div className="truncate">
                                                <div className="truncate font-medium">{opt.name}</div>
                                                <div className="text-[9px] text-[#71717a]">{opt.badge}</div>
                                              </div>
                                            </div>
                                            {isSelected && <Check size={14} className="text-amber-400 shrink-0 ml-2" />}
                                          </button>
                                        );
                                      })}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                {/* Speed Toggle */}
                <div className="flex items-center bg-[#151520] border border-[#2a2a38] p-0.5 rounded-lg text-[10px] font-mono min-h-[40px]">
                  <button
                    type="button"
                    onClick={() => setSpeedMode('fast')}
                    disabled={isAuditing}
                    className={`px-2.5 py-1.5 rounded transition-colors cursor-pointer min-h-[36px] ${
                      speedMode === 'fast'
                        ? 'bg-amber-400 text-black font-bold shadow-xs'
                        : 'text-[#a1a1aa] hover:text-white'
                    }`}
                    title="Modo Rápido: Respuesta instantánea sin esperar (~1024 tokens)"
                  >
                    ⚡ Rápido
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpeedMode('deep')}
                    disabled={isAuditing}
                    className={`px-2.5 py-1.5 rounded transition-colors cursor-pointer min-h-[36px] ${
                      speedMode === 'deep'
                        ? 'bg-amber-400 text-black font-bold shadow-xs'
                        : 'text-[#a1a1aa] hover:text-white'
                    }`}
                    title="Modo Profundo: Informe analítico con CoT razonado (~3072 tokens)"
                  >
                    🧠 Profundo (CoT)
                  </button>
                </div>

                {/* Direct Action Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'batch') {
                      onBatchAudit?.(selectedBatchChatIds, selectedProvider, selectedModel, speedMode);
                    } else {
                      onReaudit?.(selectedProvider, selectedModel, speedMode);
                    }
                  }}
                  disabled={isAuditing}
                  className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 min-h-[40px] shrink-0"
                >
                  <RotateCw size={13} className={isAuditing ? 'animate-spin' : ''} />
                  <span>{isAuditing ? 'Auditando...' : 'Auditar Ahora'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 flex-1 smooth-scroll min-h-[220px]">
            {auditError ? (
              <div className="p-4 bg-red-950/40 border border-red-900/60 rounded-xl text-red-200 text-xs space-y-3">
                <div className="flex items-center gap-2 font-semibold text-red-300">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>Error en el servicio de auditoría</span>
                </div>
                <p className="text-[#d4d4d8] leading-relaxed whitespace-pre-wrap">{auditError}</p>
                <div className="pt-2 flex items-center justify-end gap-2">
                  {onReaudit && (
                    <button
                      onClick={() => onReaudit(selectedProvider, selectedModel, speedMode)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg text-xs transition-colors cursor-pointer min-h-[44px]"
                    >
                      <RotateCw size={12} />
                      <span>Reintentar con {selectedModel}</span>
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800/60 text-white font-medium rounded-lg text-xs transition-colors cursor-pointer min-h-[44px]"
                  >
                    Cerrar (✕)
                  </button>
                </div>
              </div>
            ) : isAuditing && !cleanedAuditResult ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 text-[#71717a]">
                <RunicSealIcon isAuditing={true} size={48} />
                <p className="text-xs font-mono text-amber-300/90 animate-pulse max-w-sm">
                  {activeTab === 'batch'
                    ? `Auditoría Integral en curso con ${selectedModel}: Inspeccionando múltiples capítulos con Prompt Caching...`
                    : `Resonancia rúnica activa con ${selectedModel}: Analizando coherencia sensorial, reglas del mundo y tono...`}
                </p>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  ⚡ Generando respuesta en tiempo real sin demoras
                </span>
              </div>
            ) : activeTab === 'batch' && !cleanedAuditResult ? (
              <div className="space-y-4">
                <div className="p-3 bg-[#121217] border border-[#22222a] rounded-xl flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">Capítulos / Escenas a Auditar en Lote</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {selectedBatchChatIds.length} seleccionados
                      </span>
                    </div>
                    <p className="text-[11px] text-[#71717a] mt-0.5">
                      Combina varios capítulos para verificar la continuidad sin contradicciones temporales o de lore.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={selectAllChats}
                    className="text-xs text-amber-400 hover:text-amber-300 underline font-mono cursor-pointer"
                  >
                    {selectedBatchChatIds.length === chats.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                </div>

                <div className="space-y-1.5 max-h-60 overflow-y-auto smooth-scroll pr-1">
                  {chats.map((c, index) => {
                    const isSelected = selectedBatchChatIds.includes(c.id);
                    const msgCount = c.messages.length;
                    return (
                      <div
                        key={c.id || `batch_chat_${index}`}
                        onClick={() => toggleChatSelection(c.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/40 text-white'
                            : 'bg-[#0f0f13] border-[#1d1d24] text-[#a1a1aa] hover:bg-[#15151c] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isSelected ? (
                            <CheckSquare size={16} className="text-amber-400 shrink-0" />
                          ) : (
                            <Square size={16} className="text-[#52525b] shrink-0" />
                          )}
                          <div className="truncate">
                            <span className="text-xs font-medium block truncate">{c.title}</span>
                            <span className="text-[10px] font-mono text-[#71717a]">
                              {msgCount} mensajes · Creado {new Date(c.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-[#1c1c24]">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                    <span>⚡ Prompt Caching:</span>
                    <span>{selectedModel} procesará el lote con alta eficiencia de tokens</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBatchAudit?.(selectedBatchChatIds, selectedProvider, selectedModel, speedMode)}
                    disabled={selectedBatchChatIds.length === 0 || isAuditing}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 min-h-[44px]"
                  >
                    <Layers size={14} />
                    <span>Iniciar Auditoría Integral</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="prose prose-invert max-w-none text-xs sm:text-sm text-[#e4e4e7] leading-relaxed select-text font-sans">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {cleanedAuditResult}
                </ReactMarkdown>
                {isAuditing && (
                  <span className="inline-block w-2 h-4 bg-amber-400 ml-1 animate-pulse align-middle" />
                )}
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="px-3.5 sm:px-5 py-3 border-t border-[#1c1c24] bg-[#0d0d14] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <span className="text-[10px] font-mono text-[#71717a] text-center sm:text-left">
              {cleanedAuditResult ? `${cleanedAuditResult.split(/\s+/).filter(Boolean).length} palabras generadas` : 'Kizuna-Zek Lore Auditor'}
            </span>

            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
              {onInspectUI && (
                <button
                  onClick={onInspectUI}
                  className="flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-2 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/60 text-emerald-300 rounded-xl text-xs transition-colors font-medium cursor-pointer min-h-[44px] min-w-[100px]"
                  title="Capturar pantalla y auditar diseño UI"
                >
                  <Camera size={14} />
                  <span>Auditar UI</span>
                </button>
              )}

              {cleanedAuditResult && !auditError && (
                <>
                  <button
                    onClick={handleDownloadReport}
                    className="flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-2 bg-[#171720] hover:bg-[#20202c] border border-[#2a2a38] text-white rounded-xl text-xs transition-colors font-medium cursor-pointer min-h-[44px] min-w-[110px]"
                    title="Descargar informe editorial en formato Markdown"
                  >
                    <Download size={14} className="text-amber-400" />
                    <span>Descargar (.md)</span>
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 py-2 bg-[#171720] hover:bg-[#20202c] border border-[#2a2a38] text-white rounded-xl text-xs transition-colors font-medium cursor-pointer min-h-[44px] min-w-[90px]"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </>
              )}

              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-2 bg-white text-black font-semibold rounded-xl text-xs hover:bg-neutral-200 transition-colors cursor-pointer min-h-[44px] min-w-[80px]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </AnimatePresence>
  );
};

// Backwards compatibility alias
export const AuditModal = LoreAuditorModal;
export default LoreAuditorModal;
