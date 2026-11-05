import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  Gauge,
  Cpu,
  BookOpen,
  FileText,
  MessageSquare,
  Filter,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AppSettings, Chat, Folder, LoreFile } from '../types';
import { estimateTokenCount, MAX_SMART_2K_LORE_TOKENS } from '../utils/documentParser';
import { filterLoreByDynamicRag } from '../utils/lorebookRag';
import { buildRollingSessionSummary } from '../utils/memoryDetector';

interface TokenBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat | null;
  folder: Folder | null;
  loreFiles: LoreFile[];
  settings: AppSettings;
  onToggleDynamicLoreRag: (enabled: boolean) => void;
  onOpenFolderManager?: () => void;
  onOpenSettings?: () => void;
}

export const TokenBreakdownModal: React.FC<TokenBreakdownModalProps> = ({
  isOpen,
  onClose,
  chat,
  folder,
  loreFiles,
  settings,
  onToggleDynamicLoreRag,
  onOpenFolderManager,
  onOpenSettings,
}) => {
  const [showLoreDetails, setShowLoreDetails] = useState(true);

  const ragEnabled = settings.enableDynamicLoreRag !== false;
  const maxHistoryWindow = settings.contextDepth === 'quick' ? 6 : 15;

  const breakdown = useMemo(() => {
    if (!isOpen) {
      return {
        systemTotalTokens: 0,
        globalSysTokens: 0,
        folderSysTokens: 0,
        memoryTokens: 0,
        effectiveLoreTokens: 0,
        ragResult: {
          injectedFiles: [],
          skippedFiles: [],
          itemStatuses: [],
          totalSelectedTokens: 0,
          injectedRawTokens: 0,
          savedTokens: 0,
          activeQueryTerms: [],
          ragActive: false,
        },
        totalSavedByRagAndShield: 0,
        summaryTokens: 0,
        olderMessagesCount: 0,
        savedBySlidingWindow: 0,
        windowMessagesTokens: 0,
        recentWindowCount: 0,
        totalTurnTokens: 1,
        pctSystem: 0,
        pctLore: 0,
        pctSummary: 0,
        pctWindow: 0,
      };
    }
    // 1. System Prompt & Rules (Global System Prompt + Folder Rules + Persistent Memories)
    const globalSysTokens = estimateTokenCount(settings.globalSystemPrompt || '');
    const folderSysTokens = folder?.systemPrompt ? estimateTokenCount(folder.systemPrompt) : 0;
    const activeMemories = (settings.memories || []).filter((m) => m.enabled !== false);
    const memoryTokens = activeMemories.reduce((acc, m) => acc + estimateTokenCount(m.text), 0);
    const systemDirectiveOverhead = 140; // Style & Follow-up directives
    const systemTotalTokens = globalSysTokens + folderSysTokens + memoryTokens + systemDirectiveOverhead;

    // 2. Selected Lorebook & Dynamic RAG Filter
    const selectedLore = chat
      ? loreFiles.filter((l) => Array.isArray(chat.selectedLoreFileIds) && chat.selectedLoreFileIds.includes(l.id))
      : [];

    const lastUserMsg = chat
      ? [...chat.messages].reverse().find((m) => m.role === 'user')?.content || ''
      : '';
    const recentMsgs = chat ? chat.messages.slice(-4) : [];

    const ragResult = filterLoreByDynamicRag(
      selectedLore,
      lastUserMsg,
      recentMsgs,
      ragEnabled,
      8
    );

    const effectiveLoreTokens = Math.min(ragResult.injectedRawTokens, MAX_SMART_2K_LORE_TOKENS);
    const totalSavedByRagAndShield = Math.max(0, ragResult.totalSelectedTokens - effectiveLoreTokens);

    // 3. Session Summary (Verdad Absoluta Canónica)
    const allMessages = chat?.messages || [];
    const olderMessages =
      allMessages.length > maxHistoryWindow ? allMessages.slice(0, -maxHistoryWindow) : [];
    const validSavedSummary =
      chat?.sessionSummary && !chat.sessionSummary.includes(' [...] ') ? chat.sessionSummary : '';
    const effectiveSummaryText =
      olderMessages.length > 0
        ? validSavedSummary || buildRollingSessionSummary(olderMessages)
        : validSavedSummary;

    const summaryTokens = effectiveSummaryText
      ? estimateTokenCount(effectiveSummaryText) + 45 // System canonical truth header
      : 0;

    // 4. Sliding Window Messages (Last 15 or 6 messages)
    const recentWindowMessages = allMessages.slice(-maxHistoryWindow);
    let windowMessagesTokens = 0;
    for (const msg of recentWindowMessages) {
      windowMessagesTokens += msg.estimatedTokens || estimateTokenCount(msg.content || '');
      if (Array.isArray(msg.attachments)) {
        for (const att of msg.attachments) {
          if (att.textContent) {
            windowMessagesTokens += att.estimatedTokens || estimateTokenCount(att.textContent);
          } else if (att.fileType === 'image' || att.type?.startsWith('image/')) {
            windowMessagesTokens += 258; // Standard vision tile budget
          }
        }
      }
    }

    // Raw full history tokens (what would have been sent without sliding window)
    const olderRawTokens = olderMessages.reduce(
      (sum, m) => sum + (m.estimatedTokens || estimateTokenCount(m.content || '')),
      0
    );
    const savedBySlidingWindow = Math.max(0, olderRawTokens - summaryTokens);

    const totalTurnTokens = Math.max(
      1,
      systemTotalTokens + effectiveLoreTokens + summaryTokens + windowMessagesTokens
    );

    const pctSystem = +((systemTotalTokens / totalTurnTokens) * 100).toFixed(1);
    const pctLore = +((effectiveLoreTokens / totalTurnTokens) * 100).toFixed(1);
    const pctSummary = +((summaryTokens / totalTurnTokens) * 100).toFixed(1);
    const pctWindow = Math.max(
      0,
      +(100 - pctSystem - pctLore - pctSummary).toFixed(1)
    );

    return {
      systemTotalTokens,
      globalSysTokens,
      folderSysTokens,
      memoryTokens,
      effectiveLoreTokens,
      ragResult,
      totalSavedByRagAndShield,
      summaryTokens,
      olderMessagesCount: olderMessages.length,
      savedBySlidingWindow,
      windowMessagesTokens,
      recentWindowCount: recentWindowMessages.length,
      totalTurnTokens,
      pctSystem,
      pctLore,
      pctSummary,
      pctWindow,
    };
  }, [isOpen, chat, folder, loreFiles, settings, ragEnabled, maxHistoryWindow]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[140] flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-sm select-none">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.16 }}
          className="flex flex-col w-full max-w-2xl max-h-[90dvh] bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-[#22222a] rounded-2xl shadow-2xl text-zinc-900 dark:text-zinc-100 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-zinc-200 dark:border-[#1c1c24] bg-zinc-50 dark:bg-[#0d0d12] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
                <Gauge size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white truncate">
                  Desglose Visual de Contexto (Token Inspector)
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  Auditoría en tiempo real del presupuesto de tokens enviado en cada turno
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              aria-label="Cerrar inspector de tokens"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 smooth-scroll">
            {/* Top Summary Banner */}
            <div className="p-4 rounded-2xl bg-zinc-100/80 dark:bg-[#101016] border border-zinc-200 dark:border-[#22222c] space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                    Carga Neta del Turno Actual
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl sm:text-3xl font-bold font-mono text-zinc-900 dark:text-white">
                      {breakdown.totalTurnTokens.toLocaleString()}
                    </span>
                    <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-semibold">
                      tokens enviados al motor
                    </span>
                  </div>
                </div>
                {(breakdown.totalSavedByRagAndShield > 0 || breakdown.savedBySlidingWindow > 0) && (
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-right">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                      Cuota Ahorrada en este Turno
                    </span>
                    <span className="text-xs sm:text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300">
                      -{(breakdown.totalSavedByRagAndShield + breakdown.savedBySlidingWindow).toLocaleString()} tok
                    </span>
                  </div>
                )}
              </div>

              {/* Multi-Segment Stacked Bar */}
              <div className="space-y-1.5">
                <div className="w-full h-3.5 rounded-full bg-zinc-200 dark:bg-[#181822] overflow-hidden flex p-0.5 gap-0.5 border border-zinc-300/60 dark:border-white/5">
                  <div
                    style={{ width: `${Math.max(breakdown.pctSystem, 2)}%` }}
                    className="h-full bg-amber-500 rounded-l-full transition-all duration-300"
                    title={`System Prompt y Reglas: ${breakdown.pctSystem}%`}
                  />
                  <div
                    style={{ width: `${Math.max(breakdown.pctLore, breakdown.effectiveLoreTokens > 0 ? 2 : 0)}%` }}
                    className="h-full bg-emerald-500 transition-all duration-300"
                    title={`Lorebook Inyectado: ${breakdown.pctLore}%`}
                  />
                  <div
                    style={{ width: `${Math.max(breakdown.pctSummary, breakdown.summaryTokens > 0 ? 2 : 0)}%` }}
                    className="h-full bg-purple-500 transition-all duration-300"
                    title={`Resumen de Sesión: ${breakdown.pctSummary}%`}
                  />
                  <div
                    style={{ width: `${Math.max(breakdown.pctWindow, breakdown.windowMessagesTokens > 0 ? 2 : 0)}%` }}
                    className="h-full bg-blue-500 rounded-r-full transition-all duration-300"
                    title={`Últimos ${maxHistoryWindow} mensajes: ${breakdown.pctWindow}%`}
                  />
                </div>

                {/* Legend */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
                    <span className="truncate text-zinc-600 dark:text-zinc-300">
                      System: <strong>{breakdown.pctSystem}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
                    <span className="truncate text-zinc-600 dark:text-zinc-300">
                      Lorebook: <strong>{breakdown.pctLore}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 shrink-0" />
                    <span className="truncate text-zinc-600 dark:text-zinc-300">
                      Resumen: <strong>{breakdown.pctSummary}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0" />
                    <span className="truncate text-zinc-600 dark:text-zinc-300">
                      Últimos {maxHistoryWindow}: <strong>{breakdown.pctWindow}%</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Detailed Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 1. System Prompt y Reglas */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#1f1f29] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu size={15} className="text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                      1. System Prompt y Reglas
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                    {breakdown.pctSystem}% ({breakdown.systemTotalTokens.toLocaleString()} tok)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-[#191924] overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${Math.min(100, Math.max(breakdown.pctSystem, 4))}%` }}
                  />
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 font-mono">
                  <div>• Directiva Global: {breakdown.globalSysTokens.toLocaleString()} tok</div>
                  <div>• Reglas del Proyecto/Arco: {breakdown.folderSysTokens.toLocaleString()} tok</div>
                  <div>• Memoria Persistente: {breakdown.memoryTokens.toLocaleString()} tok</div>
                </div>
              </div>

              {/* 2. Lorebook Inyectado (RAG Ligero) */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#1f1f29] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={15} className="text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                      2. Lorebook Inyectado
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {breakdown.pctLore}% ({breakdown.effectiveLoreTokens.toLocaleString()} tok)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-[#191924] overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(100, Math.max(breakdown.pctLore, breakdown.effectiveLoreTokens > 0 ? 4 : 0))}%` }}
                  />
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 font-mono">
                  <div>
                    • Fichas activas hoy: {breakdown.ragResult.injectedFiles.length} de{' '}
                    {breakdown.ragResult.itemStatuses.length} marcadas
                  </div>
                  <div>
                    • Volumen bruto sin filtro: {breakdown.ragResult.totalSelectedTokens.toLocaleString()} tok
                  </div>
                  <div className="text-emerald-600 dark:text-emerald-400">
                    • Ahorro RAG + Escudo 2K: -{breakdown.totalSavedByRagAndShield.toLocaleString()} tok
                  </div>
                </div>
              </div>

              {/* 3. Resumen de Sesión (Verdad Absoluta Canónica) */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#1f1f29] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-purple-500 shrink-0" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                      3. Resumen de Sesión
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
                    {breakdown.pctSummary}% ({breakdown.summaryTokens.toLocaleString()} tok)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-[#191924] overflow-hidden">
                  <div
                    className="h-full bg-purple-500"
                    style={{ width: `${Math.min(100, Math.max(breakdown.pctSummary, breakdown.summaryTokens > 0 ? 4 : 0))}%` }}
                  />
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 font-mono">
                  <div>
                    • Estado: {breakdown.summaryTokens > 0 ? 'Verdad Absoluta Canónica Activa' : 'En espera (<= 15 mensajes)'}
                  </div>
                  <div>• Mensajes condensados: {breakdown.olderMessagesCount} turnos previos</div>
                  <div className="text-purple-600 dark:text-purple-400">
                    • Ahorro por compresión: -{breakdown.savedBySlidingWindow.toLocaleString()} tok
                  </div>
                </div>
              </div>

              {/* 4. Últimos 15 mensajes (Ventana Deslizante) */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-[#0e0e14] border border-zinc-200 dark:border-[#1f1f29] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={15} className="text-blue-500 shrink-0" />
                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                      4. Últimos {maxHistoryWindow} Mensajes
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                    {breakdown.pctWindow}% ({breakdown.windowMessagesTokens.toLocaleString()} tok)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-[#191924] overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${Math.min(100, Math.max(breakdown.pctWindow, breakdown.windowMessagesTokens > 0 ? 4 : 0))}%` }}
                  />
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5 font-mono">
                  <div>
                    • Mensajes literales enviados: {breakdown.recentWindowCount} de{' '}
                    {chat?.messages.length || 0} totales
                  </div>
                  <div>• Modo de ventana: {settings.contextDepth === 'quick' ? 'Rápido (6 turnos)' : 'Estándar (15 turnos)'}</div>
                  <div>• Fidelidad de prosa reciente: 100% íntegra</div>
                </div>
              </div>
            </div>

            {/* Dynamic Lorebook RAG Control Panel */}
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#0d0d13] border border-zinc-200 dark:border-[#22222c] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0 mt-0.5">
                    <Filter size={15} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                        Filtro Dinámico de Lorebook / RAG Ligero
                      </h3>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                          ragEnabled
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700'
                        }`}
                      >
                        {ragEnabled ? 'RAG Activo' : 'Inyección Total'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                      Analiza los nombres, lugares, capítulos y etiquetas semánticas mencionados en la escena actual e inyecta solo las fichas relevantes del Lorebook.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleDynamicLoreRag(!ragEnabled)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-mono font-semibold border transition-all cursor-pointer shrink-0 ${
                    ragEnabled
                      ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                      : 'bg-zinc-200 dark:bg-[#181822] hover:bg-zinc-300 dark:hover:bg-[#222230] text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-[#2c2c3a]'
                  }`}
                >
                  {ragEnabled ? 'Desactivar Filtro RAG' : 'Activar Filtro RAG'}
                </button>
              </div>

              {breakdown.ragResult.activeQueryTerms.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                    Etiquetas detectadas en escena:
                  </span>
                  {breakdown.ragResult.activeQueryTerms.map((term) => (
                    <span
                      key={term}
                      className="px-2 py-0.5 rounded-md bg-zinc-200/70 dark:bg-[#161622] border border-zinc-300 dark:border-[#272736] text-[10px] font-mono text-amber-700 dark:text-amber-300"
                    >
                      #{term}
                    </span>
                  ))}
                </div>
              )}

              {/* Collapsible Per-File RAG Inspection List */}
              {breakdown.ragResult.itemStatuses.length > 0 ? (
                <div className="pt-2 border-t border-zinc-200 dark:border-[#1c1c26]">
                  <button
                    type="button"
                    onClick={() => setShowLoreDetails((prev) => !prev)}
                    className="w-full flex items-center justify-between py-1.5 text-xs font-mono text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Layers size={13} className="text-emerald-500" />
                      <span>
                        Inspección de Fichas del Lorebook ({breakdown.ragResult.injectedFiles.length} inyectadas ·{' '}
                        {breakdown.ragResult.skippedFiles.length} en espera)
                      </span>
                    </span>
                    {showLoreDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showLoreDetails && (
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 pr-1 smooth-scroll">
                      {breakdown.ragResult.itemStatuses.map((status) => (
                        <div
                          key={status.file.id}
                          className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border text-xs ${
                            status.isInjected
                              ? 'bg-emerald-500/5 border-emerald-500/25 text-zinc-900 dark:text-zinc-100'
                              : 'bg-zinc-100/50 dark:bg-[#12121a]/60 border-zinc-200 dark:border-[#1e1e28] text-zinc-500 dark:text-zinc-400 opacity-75'
                          }`}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            {status.isInjected ? (
                              <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <Clock size={14} className="text-zinc-500 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{status.file.title}</div>
                              <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                                {status.reason}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                status.isInjected
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                              }`}
                            >
                              {status.isInjected ? 'Inyectado' : 'Ahorrado'} · ~{status.estimatedTokens.toLocaleString()} tok
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono py-2">
                  No hay fichas del Lorebook marcadas en esta conversación.
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-zinc-200 dark:border-[#1c1c24] bg-zinc-50 dark:bg-[#0d0d12] shrink-0">
            <div className="flex items-center gap-2">
              {onOpenFolderManager && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFolderManager();
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-200/80 dark:bg-[#161620] hover:bg-zinc-300 dark:hover:bg-[#1f1f2e] border border-zinc-300 dark:border-[#2a2a38] text-xs font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <BookOpen size={14} className="text-amber-500" />
                  <span>Gestionar Lorebook</span>
                </button>
              )}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-200/80 dark:bg-[#161620] hover:bg-zinc-300 dark:hover:bg-[#1f1f2e] border border-zinc-300 dark:border-[#2a2a38] text-xs font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <SlidersHorizontal size={14} className="text-purple-400" />
                  <span>Ver Resumen de Sesión</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
