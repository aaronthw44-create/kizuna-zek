import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  Columns,
  Play,
  Square,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Copy,
  Zap,
  Timer,
  BookOpen,
  Swords,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { AppSettings, Chat, Folder, LoreFile, Message } from '../types';
import { executeDirectApiStream } from '../utils/directApiStream';
import { compressLoreDocsTo2K, estimateTokenCount } from '../utils/documentParser';
import { filterLoreByDynamicRag } from '../utils/lorebookRag';
import { buildRollingSessionSummary } from '../utils/memoryDetector';
import { getGeminiApiKey, getNvidiaApiKey } from '../services/apiService';

export interface DuelEngineOption {
  id: string;
  label: string;
  provider: 'alibaba' | 'gemini' | 'custom';
  model: string;
  badge: string;
  tagline: string;
  isVision?: boolean;
  hasReasoning?: boolean;
}

const DUEL_ENGINES: DuelEngineOption[] = [
  {
    id: 'alibaba_deepseek_v4_pro',
    label: 'DeepSeek V4 Pro 0813 (1.6T)',
    provider: 'alibaba',
    model: 'deepseek-v4-pro-0813',
    badge: 'Alibaba Singapur',
    tagline: '1.6T MoE (49B activos) • Razonamiento CoT profundo y subtexto literario',
    hasReasoning: true,
  },
  {
    id: 'alibaba_qwen38_max_0902',
    label: 'Qwen 3.8 Max 0902 (SOTA)',
    provider: 'alibaba',
    model: 'qwen3.8-max-0902',
    badge: 'Alibaba Singapur',
    tagline: 'Flagship 0902 en prosa en español y coherencia narrativa extensa',
    hasReasoning: true,
  },
  {
    id: 'alibaba_deepseek_v41_flash',
    label: 'DeepSeek V4.1 Flash 1017',
    provider: 'alibaba',
    model: 'deepseek-v4.1-flash-1017',
    badge: 'Alibaba Singapur',
    tagline: '552B MoE (~8B activos) • Multimodal • Co-agente ágil de baja latencia',
    isVision: true,
    hasReasoning: true,
  },
  {
    id: 'alibaba_qwen38_max',
    label: 'Alibaba Qwen 3.8 Max',
    provider: 'alibaba',
    model: 'qwen3.8-max',
    badge: 'Alibaba MaaS',
    tagline: 'Liderazgo en prosa en español y visión multimodal con CoT',
    isVision: true,
    hasReasoning: true,
  },
  {
    id: 'gemini_36_flash',
    label: 'Google Gemini 3.6 Flash',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    badge: 'Google AI',
    tagline: 'Inferencia ultrarrápida con razonamiento nativo multimodal',
    isVision: true,
    hasReasoning: true,
  },
  {
    id: 'nvidia_kimi_k3',
    label: 'Kimi K3 (Moonshot)',
    provider: 'alibaba',
    model: 'kimi-k3',
    badge: 'Alibaba / NIM',
    tagline: 'Procesamiento profundo de contexto 1M y matices literarios',
    isVision: true,
    hasReasoning: true,
  },
  {
    id: 'alibaba_qwen37_plus',
    label: 'Alibaba Qwen 3.7 Plus',
    provider: 'alibaba',
    model: 'qwen3.7-plus',
    badge: 'Alibaba MaaS',
    tagline: 'Balance óptimo entre velocidad de respuesta y riqueza léxica',
    isVision: true,
    hasReasoning: true,
  },
  {
    id: 'nvidia_step_5',
    label: 'StepFun Step 5 Preview (1M)',
    provider: 'custom',
    model: 'stepfun-ai/step-5-preview',
    badge: 'NVIDIA NIM',
    tagline: '1M de contexto multimodal MoE para análisis estructural',
    isVision: true,
    hasReasoning: true,
  },
  {
    id: 'gemini_31_pro',
    label: 'Google Gemini 3.1 Pro',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    badge: 'Google AI',
    tagline: 'Modelo de alta precisión para resolución de dilemas complejos',
    isVision: true,
    hasReasoning: true,
  },
];

interface DuelSideState {
  text: string;
  thinking: string;
  isStreaming: boolean;
  error: string | null;
  ttftSeconds: number | null;
  reasoningSeconds: number | null;
  tokensPerSec: number | null;
  wordCount: number;
}

const INITIAL_SIDE_STATE: DuelSideState = {
  text: '',
  thinking: '',
  isStreaming: false,
  error: null,
  ttftSeconds: null,
  reasoningSeconds: null,
  tokensPerSec: null,
  wordCount: 0,
};

interface EngineDuelModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat | null;
  folder: Folder | null;
  loreFiles: LoreFile[];
  settings: AppSettings;
  onAdoptDuelResult: (
    promptText: string,
    winnerText: string,
    winnerThinking: string,
    winnerModelLabel: string,
    winnerModelId: string,
    runnerUpText?: string
  ) => void;
  onShowToast?: (msg: string) => void;
}

function cleanDuelProse(raw: string): { prose: string; inlineThought: string } {
  if (!raw) return { prose: '', inlineThought: '' };
  let extractedThought = '';
  let clean = raw;

  if (/(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)/i.test(raw)) {
    const closeMatch = raw.match(/([\s\S]*?)(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)([\s\S]*)/i);
    if (closeMatch) {
      const preTag = closeMatch[1];
      const postTag = closeMatch[2];
      const openMatch = preTag.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
      if (openMatch) {
        extractedThought = openMatch[1].trim();
        clean = postTag;
      } else {
        extractedThought = preTag.trim();
        clean = postTag;
      }
    }
  } else if (/(?:<think>|<thought>|<reasoning>|<cot>)/i.test(raw)) {
    const openMatch = raw.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
    if (openMatch) {
      extractedThought = openMatch[1].trim();
      clean = raw.slice(0, raw.toLowerCase().indexOf(openMatch[0].toLowerCase()));
    }
  }

  clean = clean
    .replace(/<<<FOLLOW_UP>>>[\s\S]*$/gi, '')
    .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
    .replace(/<\/?(?:think|thought|reasoning|cot)[^>]*>/gi, '')
    .trim();

  return { prose: clean, inlineThought: extractedThought };
}

export const EngineDuelModal: React.FC<EngineDuelModalProps> = ({
  isOpen,
  onClose,
  chat,
  folder,
  loreFiles,
  settings,
  onAdoptDuelResult,
  onShowToast,
}) => {
  const [engineAId, setEngineAId] = useState<string>('alibaba_deepseek_v4_pro');
  const [engineBId, setEngineBId] = useState<string>('alibaba_qwen38_max_0902');
  const [promptInput, setPromptInput] = useState<string>('');
  const [mobileViewMode, setMobileViewMode] = useState<'split' | 'a' | 'b'>('split');

  const [sideA, setSideA] = useState<DuelSideState>(INITIAL_SIDE_STATE);
  const [sideB, setSideB] = useState<DuelSideState>(INITIAL_SIDE_STATE);
  const [expandedThinkingA, setExpandedThinkingA] = useState<boolean>(false);
  const [expandedThinkingB, setExpandedThinkingB] = useState<boolean>(false);
  const [isDropdownAOpen, setIsDropdownAOpen] = useState<boolean>(false);
  const [isDropdownBOpen, setIsDropdownBOpen] = useState<boolean>(false);

  const abortARef = useRef<AbortController | null>(null);
  const abortBRef = useRef<AbortController | null>(null);

  // Pre-fill prompt with last user message if empty when modal opens
  useEffect(() => {
    if (isOpen && !promptInput.trim() && chat && chat.messages.length > 0) {
      const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
      if (lastUser?.content) {
        setPromptInput(lastUser.content);
      }
    }
  }, [isOpen, chat?.id]);

  const stopAllStreams = () => {
    if (abortARef.current) {
      try {
        abortARef.current.abort();
      } catch {}
      abortARef.current = null;
    }
    if (abortBRef.current) {
      try {
        abortBRef.current.abort();
      } catch {}
      abortBRef.current = null;
    }
    setSideA((prev) => ({ ...prev, isStreaming: false }));
    setSideB((prev) => ({ ...prev, isStreaming: false }));
  };

  const runSingleSide = async (
    engine: DuelEngineOption,
    userPrompt: string,
    setSide: React.Dispatch<React.SetStateAction<DuelSideState>>,
    abortRef: React.MutableRefObject<AbortController | null>
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setSide({
      text: '',
      thinking: '',
      isStreaming: true,
      error: null,
      ttftSeconds: null,
      reasoningSeconds: null,
      tokensPerSec: null,
      wordCount: 0,
    });

    const maxHistoryWindow = settings.contextDepth === 'quick' ? 6 : 15;
    const allMsgs = chat?.messages || [];
    const olderMsgs = allMsgs.length > maxHistoryWindow ? allMsgs.slice(0, -maxHistoryWindow) : [];
    const recentMsgs = allMsgs.slice(-maxHistoryWindow);

    const selectedLore = chat
      ? loreFiles.filter((l) => Array.isArray(chat.selectedLoreFileIds) && chat.selectedLoreFileIds.includes(l.id))
      : [];

    const ragResult = filterLoreByDynamicRag(
      selectedLore,
      userPrompt,
      recentMsgs,
      settings.enableDynamicLoreRag !== false,
      8
    );

    const loreDocsText = compressLoreDocsTo2K(ragResult.injectedFiles, userPrompt);
    const loreContext = loreDocsText.trim()
      ? `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO (${ragResult.injectedFiles.length} documentos inyectados por RAG)]:\n--- INICIO DE DOCUMENTOS ---\n${loreDocsText.trim()}\n--- FIN DE DOCUMENTOS ---`
      : '';

    const validSavedSummary =
      chat?.sessionSummary && !chat.sessionSummary.includes(' [...] ') ? chat.sessionSummary : '';
    const rollingSummary =
      olderMsgs.length > 0
        ? validSavedSummary || buildRollingSessionSummary(olderMsgs)
        : validSavedSummary;

    const payloadMessages: Message[] = [
      ...recentMsgs,
      {
        id: `duel_usr_${Date.now()}`,
        role: 'user',
        content: userPrompt,
        timestamp: Date.now(),
      },
    ];

    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let firstProseTime: number | null = null;
    let rawTextAcc = '';
    let rawThinkAcc = '';

    try {
      await executeDirectApiStream({
        messages: payloadMessages,
        systemInstruction:
          settings.globalSystemPrompt ||
          'Eres Kizuna-Zek, colega creativo y taller editorial de cabecera del autor.',
        folderSystemPrompt: folder?.systemPrompt || '',
        loreContext,
        sessionSummary: rollingSummary,
        memories: settings.enableMemoryToggle === false ? [] : settings.memories,
        userProfile: settings.userProfile,
        personalityConfig: settings.personalityConfig,
        isWebSearchEnabled: false,
        provider: engine.provider,
        customConfig: {
          apiKey:
            engine.provider === 'gemini'
              ? settings.geminiApiKey || getGeminiApiKey()
              : engine.provider === 'alibaba'
                ? settings.alibabaApiKey || ''
                : settings.customApiKey || getNvidiaApiKey(),
          alibabaApiKey: settings.alibabaApiKey || '',
          alibabaBaseUrl:
            settings.alibabaBaseUrl ||
            'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
          alibabaModel: engine.model,
          baseUrl:
            engine.provider === 'alibaba'
              ? settings.alibabaBaseUrl ||
                'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'
              : settings.customBaseUrl || 'https://integrate.api.nvidia.com/v1',
          model: engine.model,
        },
        maxOutputTokens: Math.min(settings.maxOutputTokens || 4096, 4096),
        temperature: settings.temperature || 0.75,
        model: engine.model,
        enableReasoning: settings.reasoningMode !== 'off',
        reasoningMode: settings.reasoningMode || 'light',
        thinkingBudget: settings.reasoningMode === 'deep' ? 4096 : 1536,
        signal: controller.signal,
        onChunk: (chunkText, reasoningChunk) => {
          const now = Date.now();
          if ((chunkText || reasoningChunk) && firstTokenTime === null) {
            firstTokenTime = now;
          }
          if (reasoningChunk) {
            rawThinkAcc += reasoningChunk;
          }
          if (chunkText) {
            rawTextAcc += chunkText;
          }

          const { prose, inlineThought } = cleanDuelProse(rawTextAcc);
          const fullThinking = [rawThinkAcc.trim(), inlineThought.trim()]
            .filter(Boolean)
            .join('\n\n');

          if (prose.length > 0 && firstProseTime === null) {
            firstProseTime = now;
          }

          const elapsedSec = Math.max(0.2, (now - (firstTokenTime || startTime)) / 1000);
          const estTokens = estimateTokenCount(prose + ' ' + fullThinking);
          const tokPerSec = estTokens > 0 ? +(estTokens / elapsedSec).toFixed(1) : null;
          const words = prose.trim() ? prose.trim().split(/\s+/).length : 0;

          setSide({
            text: prose,
            thinking: fullThinking,
            isStreaming: true,
            error: null,
            ttftSeconds: firstTokenTime ? +((firstTokenTime - startTime) / 1000).toFixed(1) : null,
            reasoningSeconds:
              fullThinking && firstProseTime
                ? Math.max(0.3, +((firstProseTime - startTime) / 1000).toFixed(1))
                : fullThinking
                  ? Math.max(0.3, +((now - startTime) / 1000).toFixed(1))
                  : null,
            tokensPerSec: tokPerSec,
            wordCount: words,
          });
        },
      });

      setSide((prev) => ({ ...prev, isStreaming: false }));
    } catch (err: any) {
      if (controller.signal.aborted) {
        setSide((prev) => ({ ...prev, isStreaming: false }));
        return;
      }
      setSide((prev) => ({
        ...prev,
        isStreaming: false,
        error: err?.message || 'Error al consultar este motor',
      }));
    }
  };

  const handleStartDuel = () => {
    const cleanPrompt = promptInput.trim();
    if (!cleanPrompt) {
      onShowToast?.('Escribe una consulta o escena para iniciar el Duelo de Motores');
      return;
    }

    stopAllStreams();
    setExpandedThinkingA(false);
    setExpandedThinkingB(false);

    const engineA = DUEL_ENGINES.find((e) => e.id === engineAId) || DUEL_ENGINES[0];
    const engineB = DUEL_ENGINES.find((e) => e.id === engineBId) || DUEL_ENGINES[1];

    void Promise.all([
      runSingleSide(engineA, cleanPrompt, setSideA, abortARef),
      runSingleSide(engineB, cleanPrompt, setSideB, abortBRef),
    ]);
  };

  if (!isOpen) return null;

  const engineA = DUEL_ENGINES.find((e) => e.id === engineAId) || DUEL_ENGINES[0];
  const engineB = DUEL_ENGINES.find((e) => e.id === engineBId) || DUEL_ENGINES[1];
  const anyStreaming = sideA.isStreaming || sideB.isStreaming;

  const renderEngineColumn = (
    slotLabel: 'A' | 'B',
    engine: DuelEngineOption,
    selectedId: string,
    onSelectEngine: (id: string) => void,
    state: DuelSideState,
    otherState: DuelSideState,
    expandedThinking: boolean,
    setExpandedThinking: React.Dispatch<React.SetStateAction<boolean>>,
    isDropdownOpen: boolean,
    setIsDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const isGoldSide = slotLabel === 'A';

    return (
      <div
        className={`flex-1 flex flex-col min-w-0 rounded-2xl border transition-all duration-300 relative overflow-hidden backdrop-blur-xl ${
          isGoldSide
            ? 'bg-gradient-to-b from-[#121118]/90 via-[#0d0c12]/95 to-[#08070b]/95 border-amber-500/25 shadow-[0_10px_35px_rgba(217,119,6,0.1)]'
            : 'bg-gradient-to-b from-[#0e1219]/90 via-[#0a0e14]/95 to-[#06080d]/95 border-sky-500/25 shadow-[0_10px_35px_rgba(14,165,233,0.1)]'
        }`}
      >
        {/* Subtle Ambient Radial Glow in Column Header */}
        <div
          className={`absolute -top-16 inset-x-0 h-32 pointer-events-none opacity-40 blur-2xl transition-opacity ${
            state.isStreaming ? 'opacity-80' : 'opacity-30'
          } ${isGoldSide ? 'bg-amber-500/20' : 'bg-sky-500/20'}`}
        />

        {/* Column Header & Selector */}
        <div
          className={`flex items-center justify-between gap-2.5 px-4 py-3 border-b relative z-20 ${
            isGoldSide
              ? 'border-amber-500/20 bg-amber-500/[0.04]'
              : 'border-sky-500/20 bg-sky-500/[0.04]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 relative">
            {/* Foil Badge */}
            <span
              className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-mono font-black shrink-0 tracking-wider shadow-sm ${
                isGoldSide
                  ? 'bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-black shadow-amber-500/20'
                  : 'bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 text-white shadow-sky-500/20'
              }`}
            >
              {slotLabel}
            </span>

            {/* Custom Dropdown Control */}
            <div className="relative flex-1 min-w-0">
              <button
                type="button"
                disabled={anyStreaming}
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className={`w-full min-h-[40px] flex items-center justify-between gap-2 bg-[#08080d]/90 hover:bg-[#0f0f18] border rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition-all cursor-pointer ${
                  isDropdownOpen
                    ? isGoldSide
                      ? 'border-amber-400 ring-2 ring-amber-500/20'
                      : 'border-sky-400 ring-2 ring-sky-500/20'
                    : isGoldSide
                      ? 'border-amber-500/30 hover:border-amber-400/60'
                      : 'border-sky-500/30 hover:border-sky-400/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <span className="truncate font-sans font-bold text-zinc-100">{engine.label}</span>
                  <span
                    className={`text-[9.5px] font-mono px-2 py-0.5 rounded-full border shrink-0 font-medium ${
                      isGoldSide
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                    }`}
                  >
                    {engine.badge}
                  </span>
                </div>
                <motion.span
                  animate={{ rotate: isDropdownOpen ? 180 : 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="shrink-0 text-zinc-400"
                >
                  <ChevronDown size={14} />
                </motion.span>
              </button>

              {/* Custom Floating Options Popover Card */}
              <AnimatePresence>
                {isDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-black/20"
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute left-0 right-0 top-full mt-2 z-50 p-2 rounded-2xl bg-[#0f0f17]/95 border border-white/15 shadow-[0_25px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl space-y-1 max-h-72 overflow-y-auto smooth-scroll"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-zinc-400 border-b border-white/10 mb-1 flex items-center justify-between">
                        <span>Selecciona Motor para {slotLabel}</span>
                        <Cpu size={12} className={isGoldSide ? 'text-amber-400' : 'text-sky-400'} />
                      </div>
                      {DUEL_ENGINES.map((opt) => {
                        const isSelected = opt.id === selectedId;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              onSelectEngine(opt.id);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full flex items-start justify-between gap-2.5 p-2.5 rounded-xl text-xs text-left cursor-pointer transition-all ${
                              isSelected
                                ? isGoldSide
                                  ? 'bg-amber-500/15 border border-amber-500/40 text-amber-200 font-semibold'
                                  : 'bg-sky-500/15 border border-sky-500/40 text-sky-200 font-semibold'
                                : 'text-zinc-300 hover:bg-white/[0.08] border border-transparent'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-white truncate">{opt.label}</span>
                                {opt.isVision && <span className="text-[9px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 font-mono">Vision</span>}
                              </div>
                              <p className="text-[10px] text-zinc-400 font-sans mt-0.5 line-clamp-1">
                                {opt.tagline}
                              </p>
                            </div>
                            <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-black/40 text-zinc-400 border border-white/10 shrink-0 mt-0.5">
                              {opt.badge}
                            </span>
                          </button>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Telemetry Pills */}
          <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
            {state.ttftSeconds !== null && (
              <span className="inline-flex items-center gap-1 text-zinc-400" title="Time To First Token">
                <Timer size={11} className="text-zinc-500" />
                <span>TTFT {state.ttftSeconds}s</span>
              </span>
            )}
            {state.tokensPerSec !== null && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold ${
                  isGoldSide
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                }`}
              >
                <Zap size={10} />
                <span>{state.tokensPerSec} tok/s</span>
              </span>
            )}
          </div>
        </div>

        {/* Stream / Prose Body Arena */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3.5 min-h-[260px] max-h-[48dvh] smooth-scroll relative">
          {/* Internal Reasoning Accordion */}
          {state.thinking && (
            <div className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedThinking((prev) => !prev)}
                className="w-full min-h-[42px] px-3.5 py-2 flex items-center justify-between text-left text-xs font-mono text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2 truncate">
                  <Sparkles size={13} className={isGoldSide ? 'text-amber-400' : 'text-sky-400'} />
                  <span>
                    Razonamiento interno ({state.reasoningSeconds ? `${state.reasoningSeconds}s` : '...'})
                  </span>
                </span>
                {expandedThinking ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expandedThinking && (
                <div className="px-3.5 pb-3.5 pt-1 text-[11px] font-mono text-zinc-400 border-t border-white/10 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {state.thinking}
                </div>
              )}
            </div>
          )}

          {/* Error Notice */}
          {state.error && (
            <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-300 font-mono leading-relaxed">
              ⚠️ {state.error}
            </div>
          )}

          {/* Prose Output Text */}
          {state.text ? (
            <div className="text-xs sm:text-[13.5px] text-zinc-100 whitespace-pre-wrap leading-relaxed font-sans tracking-[0.01em]">
              {state.text}
            </div>
          ) : state.isStreaming ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-xs font-mono text-zinc-400 animate-pulse">
              <Sparkles size={18} className={isGoldSide ? 'text-amber-400' : 'text-sky-400'} />
              <span>Redactando e interpretando con {engine.label}...</span>
            </div>
          ) : (
            <div className="py-14 text-center text-xs text-zinc-500 font-mono space-y-1">
              <p>Esperando señal de inicio...</p>
              <p className="text-[10.5px] text-zinc-600">
                Pulsa &quot;Iniciar Duelo Dual&quot; para comparar prosa y ritmo.
              </p>
            </div>
          )}
        </div>

        {/* Column Footer */}
        <div
          className={`flex items-center justify-between gap-2 px-4 py-3 border-t relative z-20 ${
            isGoldSide
              ? 'border-amber-500/20 bg-amber-500/[0.03]'
              : 'border-sky-500/20 bg-sky-500/[0.03]'
          }`}
        >
          <span className="text-[10.5px] font-mono text-zinc-400 flex items-center gap-1.5">
            <BookOpen size={12} className="text-zinc-500" />
            <span>
              {state.wordCount > 0 ? `${state.wordCount.toLocaleString()} palabras` : engine.badge}
            </span>
          </span>

          <div className="flex items-center gap-2">
            {state.text && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(state.text);
                    onShowToast?.(`Respuesta de ${engine.label} copiada`);
                  }}
                  className="min-h-[38px] min-w-[38px] p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                  title="Copiar prosa"
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  disabled={anyStreaming}
                  onClick={() => {
                    onAdoptDuelResult(
                      promptInput.trim(),
                      state.text,
                      state.thinking,
                      engine.label,
                      engine.model,
                      otherState.text || undefined
                    );
                    onClose();
                  }}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
                    isGoldSide
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black shadow-amber-500/20'
                      : 'bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-300 hover:to-blue-400 text-white shadow-sky-500/20'
                  }`}
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>Elegir e Inyectar al Chat</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[140] flex items-center justify-center p-2.5 sm:p-5 bg-black/90 backdrop-blur-md select-none">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col w-full max-w-6xl max-h-[95dvh] bg-[#0a0a0f] border border-white/15 rounded-[28px] shadow-[0_30px_90px_rgba(0,0,0,0.95)] text-white overflow-hidden relative"
        >
          {/* Ambient Lighting Accents */}
          <div className="absolute -top-24 left-1/4 w-96 h-48 bg-amber-500/10 blur-[100px] pointer-events-none" />
          <div className="absolute -top-24 right-1/4 w-96 h-48 bg-sky-500/10 blur-[100px] pointer-events-none" />

          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10 bg-[#0e0e16]/80 backdrop-blur-xl shrink-0 relative z-20">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-amber-600/20 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                <Swords size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black tracking-tight text-white truncate">
                    Coliseo Editorial: Duelo Dual
                  </h2>
                  <span className="hidden sm:inline text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 font-medium">
                    Atelier Prosa
                  </span>
                </div>
                <p className="text-xs text-zinc-400 truncate mt-0.5">
                  Compara en paralelo estilo, ritmo y razonamiento de dos motores en simultáneo
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {/* Mobile View Toggle */}
              <div className="flex md:hidden items-center bg-black/60 p-1 rounded-xl border border-white/10">
                {(['split', 'a', 'b'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMobileViewMode(m)}
                    className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                      mobileViewMode === m
                        ? 'bg-amber-500 text-black'
                        : 'text-zinc-400'
                    }`}
                  >
                    {m === 'split' ? '2x' : m === 'a' ? 'Motor A' : 'Motor B'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  stopAllStreams();
                  onClose();
                }}
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer border border-transparent hover:border-white/10"
                aria-label="Cerrar duelo"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Typewriter Prompt Workbench */}
          <div className="p-4 sm:px-6 border-b border-white/10 bg-[#09090e]/90 space-y-3 shrink-0 relative z-20">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative min-w-0">
                <textarea
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Escribe o pega la escena o consulta para evaluar ambos motores en simultáneo..."
                  rows={2}
                  className="w-full bg-[#0d0d15] border border-white/15 focus:border-amber-500/60 rounded-2xl px-4 py-3 text-[15px] sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 resize-none leading-relaxed transition-all font-sans"
                />
                <div className="absolute right-3 bottom-2.5 text-[10px] font-mono text-zinc-500 pointer-events-none select-none">
                  ~{estimateTokenCount(promptInput)} tokens
                </div>
              </div>

              <div className="flex sm:flex-col justify-end gap-2 shrink-0">
                {anyStreaming ? (
                  <button
                    type="button"
                    onClick={stopAllStreams}
                    className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Square size={14} />
                    <span>Detener Duelo</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartDuel}
                    className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-black font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
                  >
                    <Swords size={15} />
                    <span>Iniciar Duelo Dual</span>
                  </button>
                )}

                {chat && chat.messages.some((m) => m.role === 'user') && (
                  <button
                    type="button"
                    onClick={() => {
                      const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
                      if (lastUser?.content) setPromptInput(lastUser.content);
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-zinc-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    title="Cargar el último turno enviado en el chat"
                  >
                    <RotateCcw size={12} />
                    <span>Cargar último turno</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Split View Arena */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 relative z-10 space-y-3">
            {/* Mobile Sticky Segmented Switcher + Live Arena Comparison Strip (LMSYS / OpenWebUI Arena Style) */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[#0e0e16]/90 border border-white/10 text-xs font-mono">
              <div className="flex items-center gap-2 min-w-0">
                <Columns size={13} className="text-amber-400 shrink-0" />
                <span className="text-zinc-300 truncate">
                  <strong className="text-amber-300">A:</strong> {engineA.label} <span className="text-zinc-600 mx-1">vs</span> <strong className="text-sky-300">B:</strong> {engineB.label}
                </span>
              </div>

              {(sideA.wordCount > 0 || sideB.wordCount > 0) && (
                <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                  <span>
                    Palabras: <strong className="text-amber-300">{sideA.wordCount}</strong> vs <strong className="text-sky-300">{sideB.wordCount}</strong>
                  </span>
                  {(sideA.tokensPerSec || sideB.tokensPerSec) && (
                    <span className="hidden sm:inline">
                      Velocidad: <strong className="text-amber-300">{sideA.tokensPerSec ?? '—'}</strong> vs <strong className="text-sky-300">{sideB.tokensPerSec ?? '—'}</strong> tok/s
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-4 h-full relative">
              {/* Central VS Badge (Desktop) */}
              <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none flex-col items-center gap-1">
                <div className="w-9 h-9 rounded-full bg-[#14141f] border border-amber-500/40 text-amber-400 font-mono font-black text-xs flex items-center justify-center shadow-[0_0_20px_rgba(217,119,6,0.3)] backdrop-blur-md">
                  VS
                </div>
              </div>

              {(mobileViewMode === 'split' || mobileViewMode === 'a') &&
                renderEngineColumn(
                  'A',
                  engineA,
                  engineAId,
                  setEngineAId,
                  sideA,
                  sideB,
                  expandedThinkingA,
                  setExpandedThinkingA,
                  isDropdownAOpen,
                  setIsDropdownAOpen
                )}

              {(mobileViewMode === 'split' || mobileViewMode === 'b') &&
                renderEngineColumn(
                  'B',
                  engineB,
                  engineBId,
                  setEngineBId,
                  sideB,
                  sideA,
                  expandedThinkingB,
                  setExpandedThinkingB,
                  isDropdownBOpen,
                  setIsDropdownBOpen
                )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
