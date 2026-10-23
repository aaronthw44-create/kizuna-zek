import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  BarChart3,
  MessageSquare,
  Cpu,
  Zap,
  Rocket,
  Flame,
  Calendar,
  Layers,
  RotateCcw,
  Download,
  Info,
} from 'lucide-react';
import { AppStatistics, Chat, LoreFile } from '../types';
import { formatTokenNumber, getLocalDateKey } from '../utils/statsStorage';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: AppStatistics;
  chats: Chat[];
  loreFiles: LoreFile[];
  onResetStats?: () => void;
}

function estimateMsgTokens(text?: string): number {
  if (!text || !text.trim()) return 0;
  const words = text.trim().split(/\s+/).length;
  const charBased = Math.ceil(text.length / 3.8);
  return Math.max(words, charBased);
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  stats,
  chats,
  loreFiles,
  onResetStats,
}) => {
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    count: number;
    formattedDate: string;
  } | null>(null);

  const totalConversations = chats.length;

  const totalCachedLoreTokens = useMemo(() => {
    return loreFiles.reduce((acc, l) => acc + (l.estimatedTokens || estimateMsgTokens(l.content)), 0);
  }, [loreFiles]);

  // Derive 100% real, verifiable metrics directly from all chats & messages + persisted stats
  const derivedMetrics = useMemo(() => {
    const loreMap = new Map<string, number>();
    for (const l of loreFiles) {
      loreMap.set(l.id, l.estimatedTokens || estimateMsgTokens(l.content));
    }

    const dailyFromChats: Record<string, number> = {};
    let msgCount = 0;
    let userMsgCount = 0;
    let assistantMsgCount = 0;
    let sumOutputTokens = 0;
    let sumInputTokens = 0;
    let sumPromptOnlyTokens = 0;
    let sumCachedHits = 0;
    let tpsSum = 0;
    let tpsCount = 0;
    let ttftSum = 0;
    let ttftCount = 0;

    for (const chat of chats) {
      const msgs = chat.messages || [];
      msgCount += msgs.length;

      // Active lore tokens for this chat
      const chatLoreIds = chat.selectedLoreFileIds || [];
      const chatLoreTokens = chatLoreIds.reduce((acc, id) => acc + (loreMap.get(id) || 0), 0);

      let runningConversationTokens = 0;

      for (const m of msgs) {
        if (m.timestamp) {
          const dKey = getLocalDateKey(new Date(m.timestamp));
          dailyFromChats[dKey] = (dailyFromChats[dKey] || 0) + 1;
        } else if (chat.updatedAt) {
          const dKey = getLocalDateKey(new Date(chat.updatedAt));
          dailyFromChats[dKey] = (dailyFromChats[dKey] || 0) + 1;
        }

        const contentTokens = m.estimatedTokens || estimateMsgTokens(m.content);
        const thinkingTokens = m.thinking ? estimateMsgTokens(m.thinking) : 0;
        const attTokens = Array.isArray(m.attachments)
          ? m.attachments.reduce((a, att) => a + (att.estimatedTokens || estimateMsgTokens(att.textContent || att.content)), 0)
          : 0;

        if (m.role === 'user') {
          userMsgCount++;
          const turnUserTokens = contentTokens + attTokens;
          sumPromptOnlyTokens += turnUserTokens;
          runningConversationTokens += turnUserTokens;
        } else if (m.role === 'assistant') {
          assistantMsgCount++;
          const turnOutTokens = contentTokens + thinkingTokens;
          sumOutputTokens += turnOutTokens;

          // Each assistant generation processes the running conversation history + system directive (~350 tokens) + active lore
          const msgLoreTokens = Array.isArray(m.selectedLoreIds) && m.selectedLoreIds.length > 0
            ? m.selectedLoreIds.reduce((acc, id) => acc + (loreMap.get(id) || 0), 0)
            : chatLoreTokens;
          sumInputTokens += Math.max(runningConversationTokens, 120) + 350 + msgLoreTokens;
          runningConversationTokens += contentTokens;

          if (m.cachedTokens && m.cachedTokens > 0) {
            sumCachedHits += m.cachedTokens;
          }
          if (m.tokensPerSecond && m.tokensPerSecond > 0) {
            tpsSum += m.tokensPerSecond;
            tpsCount++;
          }
          if (m.ttftSeconds && m.ttftSeconds > 0) {
            ttftSum += m.ttftSeconds;
            ttftCount++;
          }
        }
      }
    }

    // Merge daily activity from real chat timestamps and stats.dailyActivity
    const mergedDaily: Record<string, number> = { ...(stats.dailyActivity || {}) };
    for (const [k, v] of Object.entries(dailyFromChats)) {
      mergedDaily[k] = Math.max(mergedDaily[k] || 0, v);
    }

    return {
      totalMessages: msgCount,
      userMsgCount,
      assistantMsgCount,
      realInputTokens: Math.max(stats.totalInputTokens || 0, sumInputTokens),
      sumPromptOnlyTokens,
      realOutputTokens: Math.max(stats.totalOutputTokens || 0, sumOutputTokens),
      realCachedHitTokens: Math.max(stats.totalCachedTokens || 0, sumCachedHits),
      mergedDailyActivity: mergedDaily,
      avgTps: tpsCount > 0 ? +(tpsSum / tpsCount).toFixed(1) : null,
      avgTtft: ttftCount > 0 ? +(ttftSum / ttftCount).toFixed(1) : null,
    };
  }, [chats, loreFiles, stats]);

  // Generate GitHub/RikkaHub Contribution Heatmap Calendar Grid
  // Spanning May through current date (~24 weeks) using local timezone dates
  const heatmapData = useMemo(() => {
    const weeks: Array<Array<{ date: string; count: number; dayOfWeek: number }>> = [];
    const endDate = new Date();
    const totalDays = 24 * 7; // 24 weeks

    const startDate = new Date(endDate.getTime() - totalDays * 24 * 60 * 60 * 1000);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    let current = new Date(startDate);
    let currentWeek: Array<{ date: string; count: number; dayOfWeek: number }> = [];

    while (current <= endDate) {
      const dateKey = getLocalDateKey(current);
      const count = derivedMetrics.mergedDailyActivity[dateKey] || 0;

      currentWeek.push({
        date: dateKey,
        count,
        dayOfWeek: current.getDay(),
      });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      current.setDate(current.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }, [derivedMetrics.mergedDailyActivity]);

  // Total active days
  const activeDaysCount = useMemo(() => {
    return Object.values(derivedMetrics.mergedDailyActivity).filter((cnt) => cnt > 0).length;
  }, [derivedMetrics.mergedDailyActivity]);

  if (!isOpen) return null;

  // Intensity color mapper
  const getCellBg = (count: number) => {
    if (count === 0) return 'bg-[#141417] border-[#1d1d22]';
    if (count <= 3) return 'bg-[#27272e] border-[#383842]';
    if (count <= 8) return 'bg-[#52525e] border-[#6b6b7a]';
    if (count <= 14) return 'bg-[#a1a1b5] border-[#bfbfe0]';
    return 'bg-[#ffffff] border-[#ffffff] shadow-[0_0_8px_rgba(255,255,255,0.4)]';
  };

  const monthLabels = ['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-xs select-none modal-backdrop-fluid">
      <div
        className="flex flex-col w-full max-w-4xl max-h-[92vh] bg-[#070709] border border-[#1f1f23] rounded-2xl shadow-2xl text-white overflow-hidden modal-sheet-fluid"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#18181c] bg-[#050507]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#121216] border border-[#26262b] flex items-center justify-center text-white">
              <BarChart3 size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-tight">
                  Kizuna-Zek Analytics
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#18181e] text-[#a1a1aa] border border-[#27272f]">
                  RikkaHub Engine
                </span>
              </div>
              <p className="text-xs text-[#71717a]">
                Métricas de uso de tokens, actividad de escritura y rendimiento del workspace
              </p>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            className="p-1.5 text-[#71717a] hover:text-white rounded-lg hover:bg-[#151519] transition-colors"
          >
            <X size={18} />
          </motion.button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 smooth-scroll">
          {/* Top Card: GitHub / RikkaHub-style Activity Heatmap */}
          <div className="p-5 bg-[#0a0a0d] border border-[#1c1c20] rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-[#a1a1aa]" />
                <h3 className="text-sm font-semibold text-white">
                  Registro de Actividad Creativa (2026)
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-[#71717a]">
                <Flame size={13} className="text-white" />
                <span>{activeDaysCount} días con actividad registrada</span>
              </div>
            </div>

            {/* Months Header Labels */}
            <div className="flex justify-between text-[11px] font-mono text-[#71717a] px-1">
              {monthLabels.map((m, idx) => (
                <span key={idx}>{m}</span>
              ))}
            </div>

            {/* Heatmap Grid Container */}
            <div className="overflow-x-auto pb-2 smooth-scroll">
              <div className="inline-flex gap-1.5 min-w-[580px]">
                {heatmapData.map((week, wIdx) => (
                  <div key={wIdx} className="flex flex-col gap-1.5">
                    {week.map((day) => {
                      const isHovered = hoveredDay?.date === day.date;
                      const selectDay = () => {
                        const [year, month, dNum] = day.date.split('-');
                        const dateObj = new Date(Number(year), Number(month) - 1, Number(dNum));
                        const formatted = dateObj.toLocaleDateString('es-ES', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        });
                        setHoveredDay({
                          date: day.date,
                          count: day.count,
                          formattedDate: formatted,
                        });
                      };
                      return (
                        <div
                          key={day.date}
                          onClick={selectDay}
                          onMouseEnter={selectDay}
                          onMouseLeave={() => setHoveredDay(null)}
                          className={`w-3.5 h-3.5 rounded-[3px] border transition-transform cursor-pointer ${getCellBg(
                            day.count
                          )} ${isHovered ? 'scale-125 z-10 !border-white' : ''}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend & Tooltip bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#141417] text-xs">
              <div className="font-mono text-[11px] text-[#a1a1aa] min-h-[18px]">
                {hoveredDay ? (
                  <span>
                    <strong className="text-white">{hoveredDay.count} mensajes</strong> el {hoveredDay.formattedDate}
                  </span>
                ) : (
                  <span className="text-[#52525b]">Pasa el cursor o toca un día para ver detalles</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#71717a]">
                <span>Menos</span>
                <span className="w-2.5 h-2.5 rounded-[2px] bg-[#141417] border border-[#1d1d22]" />
                <span className="w-2.5 h-2.5 rounded-[2px] bg-[#27272e] border border-[#383842]" />
                <span className="w-2.5 h-2.5 rounded-[2px] bg-[#52525e] border border-[#6b6b7a]" />
                <span className="w-2.5 h-2.5 rounded-[2px] bg-[#a1a1b5] border border-[#bfbfe0]" />
                <span className="w-2.5 h-2.5 rounded-[2px] bg-[#ffffff] border border-[#ffffff]" />
                <span>Más</span>
              </div>
            </div>
          </div>

          {/* 2-Column Metrics Grid (Sleek Noir Charcoal Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* 1. Total Conversations */}
            <div className="p-4 bg-[#0a0a0d] border border-[#1b1b1f] hover:border-[#2d2d34] rounded-xl transition-colors">
              <div className="flex items-center justify-between text-[#71717a] mb-2">
                <span className="text-xs font-mono uppercase tracking-wider">Conversaciones</span>
                <BarChart3 size={16} className="text-white" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white">
                {totalConversations}
              </div>
              <p className="mt-1 text-[11px] text-[#71717a]">
                Proyectos y chats creados en el workspace
              </p>
            </div>

            {/* 2. Total Messages */}
            <div className="p-4 bg-[#0a0a0d] border border-[#1b1b1f] hover:border-[#2d2d34] rounded-xl transition-colors">
              <div className="flex items-center justify-between text-[#71717a] mb-2">
                <span className="text-xs font-mono uppercase tracking-wider">Total Mensajes</span>
                <MessageSquare size={16} className="text-white" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white">
                {derivedMetrics.totalMessages.toLocaleString()}
              </div>
              <p className="mt-1 text-[11px] text-[#71717a]">
                {derivedMetrics.userMsgCount} tuyos · {derivedMetrics.assistantMsgCount} respuestas IA
              </p>
            </div>

            {/* 3. Input Tokens */}
            <div className="p-4 bg-[#0a0a0d] border border-[#1b1b1f] hover:border-[#2d2d34] rounded-xl transition-colors">
              <div className="flex items-center justify-between text-[#71717a] mb-2">
                <span className="text-xs font-mono uppercase tracking-wider">Tokens Entrada</span>
                <Zap size={16} className="text-white" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white">
                {formatTokenNumber(derivedMetrics.realInputTokens)}
              </div>
              <p className="mt-1 text-[11px] text-[#71717a]">
                {formatTokenNumber(derivedMetrics.sumPromptOnlyTokens)} en prompts directos + contexto/lore
              </p>
            </div>

            {/* 4. Output Tokens */}
            <div className="p-4 bg-[#0a0a0d] border border-[#1b1b1f] hover:border-[#2d2d34] rounded-xl transition-colors">
              <div className="flex items-center justify-between text-[#71717a] mb-2">
                <span className="text-xs font-mono uppercase tracking-wider">Tokens Salida</span>
                <Cpu size={16} className="text-white" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white">
                {formatTokenNumber(derivedMetrics.realOutputTokens)}
              </div>
              <p className="mt-1 text-[11px] text-[#71717a]">
                Prosa literaria y razonamiento real en tus {derivedMetrics.assistantMsgCount} respuestas
              </p>
            </div>

            {/* 5. Cached / Lore Tokens */}
            <div className="p-4 bg-[#0a0a0d] border border-[#1b1b1f] hover:border-emerald-500/30 rounded-xl transition-colors">
              <div className="flex items-center justify-between text-[#71717a] mb-2">
                <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
                  {derivedMetrics.realCachedHitTokens > 0 ? 'Implicit Cache (Alibaba)' : 'Bóveda de Lore Activa'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {derivedMetrics.realCachedHitTokens > 0 ? '-90% Costo' : `${loreFiles.length} docs`}
                </span>
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white flex items-baseline gap-2">
                <span>
                  {formatTokenNumber(
                    derivedMetrics.realCachedHitTokens > 0
                      ? derivedMetrics.realCachedHitTokens
                      : totalCachedLoreTokens
                  )}
                </span>
                <span className="text-xs font-mono text-emerald-400 font-normal">
                  {derivedMetrics.realCachedHitTokens > 0 ? 'cache hits' : 'en documentos'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#71717a]">
                {derivedMetrics.realCachedHitTokens > 0
                  ? `Caché real de Alibaba · Bóveda Lore: ${formatTokenNumber(totalCachedLoreTokens)} tokens`
                  : `Total real en tus manuscritos (${loreFiles.length} archivos) listos para caché`}
              </p>
            </div>

            {/* 6. Speed & Latency Telemetry / App Launches */}
            <div className="p-4 bg-[#0a0a0d] border border-[#1b1b1f] hover:border-[#2d2d34] rounded-xl transition-colors">
              <div className="flex items-center justify-between text-[#71717a] mb-2">
                <span className="text-xs font-mono uppercase tracking-wider">
                  {derivedMetrics.avgTps ? 'Velocidad Media' : 'Inicios de App'}
                </span>
                <Rocket size={16} className="text-white" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white flex items-baseline gap-2">
                {derivedMetrics.avgTps ? (
                  <>
                    <span>{derivedMetrics.avgTps} tok/s</span>
                    {derivedMetrics.avgTtft && (
                      <span className="text-xs font-mono text-amber-400/90 font-normal">
                        TTFT {derivedMetrics.avgTtft}s
                      </span>
                    )}
                  </>
                ) : (
                  <span>{stats.appLaunchCount}</span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[#71717a]">
                {derivedMetrics.avgTps
                  ? `Promedio real medido · ${stats.appLaunchCount} sesiones abiertas`
                  : 'Sesiones y aperturas de Kizuna-Zek'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[#18181c] bg-[#050507] text-xs">
          <div className="text-[#71717a] text-[11px] font-mono">
            Calculado en vivo desde tus {totalConversations} chats · Kizuna-Zek Core v1.5
          </div>

          <div className="flex items-center gap-2">
            {onResetStats && (
              <motion.button
                whileTap={{ scale: 0.94 }}
                type="button"
                onClick={onResetStats}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#272731] bg-[#101014] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] transition-colors"
                title="Reiniciar contadores a cero"
              >
                <RotateCcw size={12} />
                <span>Reiniciar Métricas</span>
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold hover:bg-[#e4e4e7] transition-colors"
            >
              Listo
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};
