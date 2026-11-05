import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Feather, ArrowDown, Check, Zap, BookOpen, ShieldAlert, Settings } from 'lucide-react';
import { Chat, Folder, LoreFile, Message, Attachment } from '../types';
import { ChatMessage } from './ChatMessage';

interface ChatAreaProps {
  chat: Chat | null;
  folder: Folder | null;
  loreFiles: LoreFile[];
  isStreaming: boolean;
  isAuditingLore?: boolean;
  toastMessage: string | null;
  onRegenerate: () => void;
  onContinueMessage?: (messageId?: string) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onSelectVariant?: (messageId: string, variantIndex: number) => void;
  onAuditScene: (targetText?: string) => void;
  onIllustrateScene?: (messageContent: string, messageId: string) => Promise<void> | void;
  onGenerateVideoScene?: (messageContent: string, messageId: string) => Promise<void> | void;
  onOpenImageLightbox: (attachment: Attachment) => void;
  onQuickPrompt: (promptText: string) => void;
  onOpenFolderManager: () => void;
  onShowToast: (text: string) => void;
  onApplyGlobalPersona?: (text: string) => void;
  onOpenSettings?: () => void;
  onSwitchProvider?: (provider: 'gemini' | 'custom' | 'alibaba', modelId?: string) => void;
  onOpenDocumentPreview?: (item: any) => void;
  searchHighlightQuery?: string;
  activeModelKey?: string;
}

import { HourglassAvatarGreeting } from './HourglassAvatarGreeting';

export interface ChatAreaHandle {
  scrollToBottom: () => void;
}

export const ChatArea = React.memo(
  React.forwardRef<ChatAreaHandle, ChatAreaProps>(
    (
      {
        chat,
        folder,
        loreFiles,
        isStreaming,
        isAuditingLore = false,
        toastMessage,
        onRegenerate,
        onContinueMessage,
        onEditMessage,
        onDeleteMessage,
        onSelectVariant,
        onAuditScene,
        onIllustrateScene,
        onGenerateVideoScene,
        onOpenImageLightbox,
        onQuickPrompt,
        onOpenFolderManager,
        onShowToast,
        onApplyGlobalPersona,
        onOpenSettings,
        onSwitchProvider,
        onOpenDocumentPreview,
        searchHighlightQuery,
      },
      ref
    ) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const bottomRef = useRef<HTMLDivElement>(null);
      const [showScrollBottom, setShowScrollBottom] = useState(false);
      const [visibleCount, setVisibleCount] = useState(24);
      const showScrollBottomRef = useRef(false);
      const lastChatIdRef = useRef<string | null>(null);
      const prevMsgCountRef = useRef<number>(0);
      const streamScrollRafRef = useRef<number | null>(null);

      const callbacksRef = useRef({
        onRegenerate,
        onContinueMessage,
        onEditMessage,
        onDeleteMessage,
        onSelectVariant,
        onAuditScene,
        onIllustrateScene,
        onGenerateVideoScene,
        onOpenImageLightbox,
        onQuickPrompt,
        onShowToast,
        onApplyGlobalPersona,
        onOpenSettings,
        onSwitchProvider,
        onOpenDocumentPreview,
      });
      callbacksRef.current = {
        onRegenerate,
        onContinueMessage,
        onEditMessage,
        onDeleteMessage,
        onSelectVariant,
        onAuditScene,
        onIllustrateScene,
        onGenerateVideoScene,
        onOpenImageLightbox,
        onQuickPrompt,
        onShowToast,
        onApplyGlobalPersona,
        onOpenSettings,
        onSwitchProvider,
        onOpenDocumentPreview,
      };

      const stableRegenerate = React.useCallback(() => callbacksRef.current.onRegenerate(), []);
      const stableContinueMessage = React.useCallback((id?: string) => callbacksRef.current.onContinueMessage?.(id), []);
      const stableEditMessage = React.useCallback((id: string, text: string) => callbacksRef.current.onEditMessage(id, text), []);
      const stableDeleteMessage = React.useCallback((id: string) => callbacksRef.current.onDeleteMessage(id), []);
      const stableSelectVariant = React.useCallback((id: string, idx: number) => callbacksRef.current.onSelectVariant?.(id, idx), []);
      const stableAuditScene = React.useCallback((text?: string) => callbacksRef.current.onAuditScene(text), []);
      const stableIllustrateScene = React.useCallback((content: string, id: string) => callbacksRef.current.onIllustrateScene?.(content, id), []);
      const stableGenerateVideoScene = React.useCallback((content: string, id: string) => callbacksRef.current.onGenerateVideoScene?.(content, id), []);
      const stableOpenImageLightbox = React.useCallback((att: Attachment) => callbacksRef.current.onOpenImageLightbox(att), []);
      const stableQuickPrompt = React.useCallback((text: string) => callbacksRef.current.onQuickPrompt(text), []);
      const stableShowToast = React.useCallback((text: string) => callbacksRef.current.onShowToast(text), []);
      const stableApplyGlobalPersona = React.useCallback((text: string) => callbacksRef.current.onApplyGlobalPersona?.(text), []);
      const stableOpenSettings = React.useCallback(() => callbacksRef.current.onOpenSettings?.(), []);
      const stableSwitchProvider = React.useCallback((prov: 'gemini' | 'custom' | 'alibaba', mod?: string) => callbacksRef.current.onSwitchProvider?.(prov, mod), []);
      const stableOpenDocumentPreview = React.useCallback((item: any) => callbacksRef.current.onOpenDocumentPreview?.(item), []);

      const scrollToBottom = React.useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        setShowScrollBottom(false);
      }, []);

      React.useImperativeHandle(ref, () => ({
        scrollToBottom,
      }));

      // Listen to virtual keyboard opening via visualViewport (only when input is focused and height shrinks significantly)
      useEffect(() => {
        let lastHeight = typeof window !== 'undefined' && window.visualViewport ? window.visualViewport.height : 0;
        const handleResize = () => {
          if (!window.visualViewport || !containerRef.current) return;
          const currentHeight = window.visualViewport.height;
          const heightDelta = lastHeight - currentHeight;
          lastHeight = currentHeight;
          const activeTag = document.activeElement?.tagName;
          const isInputFocused = activeTag === 'TEXTAREA' || activeTag === 'INPUT';
          if (heightDelta > 100 && isInputFocused && !showScrollBottomRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        };
        if (typeof window !== 'undefined' && window.visualViewport) {
          window.visualViewport.addEventListener('resize', handleResize, { passive: true });
          return () => window.visualViewport?.removeEventListener('resize', handleResize);
        }
      }, []);

      // Monitor scroll distance from bottom with passive rAF listener and hysteresis to prevent threshold flickering
      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let rafId: number | null = null;
        const handleScroll = () => {
          if (rafId !== null) return;
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (!containerRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            // Hysteresis: turn ON above 240px, turn OFF below 120px so resting near 180px never flickers
            const prevFar = showScrollBottomRef.current;
            const nextFar = prevFar ? distanceFromBottom > 120 : distanceFromBottom > 240;
            if (nextFar !== prevFar) {
              showScrollBottomRef.current = nextFar;
              setShowScrollBottom(nextFar);
            }
          });
        };
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
          if (rafId !== null) cancelAnimationFrame(rafId);
          container.removeEventListener('scroll', handleScroll);
        };
      }, [chat?.id]);

      // Stable scroll-to-bottom without feedback loops or synchronous forced reflows
      useEffect(() => {
        const container = containerRef.current;
        if (!container || !chat) return;

        const isChatSwitch = lastChatIdRef.current !== chat.id;
        const msgCount = chat.messages.length;
        const isNewMessageAdded = msgCount > prevMsgCountRef.current;

        lastChatIdRef.current = chat.id;
        prevMsgCountRef.current = msgCount;

        if (isChatSwitch) {
          // Reset windowing to latest 24 messages on chat switch to keep mobile DOM light and cool
          setVisibleCount(24);
          showScrollBottomRef.current = false;
          setShowScrollBottom(false);
          requestAnimationFrame(() => {
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          });
          return;
        }

        if (!showScrollBottomRef.current && isNewMessageAdded) {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        } else if (!showScrollBottomRef.current && isStreaming) {
          if (streamScrollRafRef.current === null) {
            streamScrollRafRef.current = requestAnimationFrame(() => {
              streamScrollRafRef.current = null;
              if (containerRef.current && !showScrollBottomRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight;
              }
            });
          }
        }
      }, [chat?.id, chat?.messages, isStreaming]);

      if (!chat) {
        return (
          <div className="flex-1 flex items-center justify-center p-6 text-center text-[#71717a]">
            <div className="max-w-md space-y-3">
              <div className="w-10 h-10 mx-auto rounded-md bg-[#0e0e12] border border-[#1f1f23] flex items-center justify-center text-white font-mono text-sm">
                KZ
              </div>
              <h2 className="text-sm font-semibold text-white">No hay conversación seleccionada</h2>
              <p className="text-xs text-[#a1a1aa]">
                Selecciona una sesión en la barra lateral o crea un nuevo arco.
              </p>
            </div>
          </div>
        );
      }

      const activeLoreFiles = loreFiles.filter((l) =>
        chat.selectedLoreFileIds.includes(l.id)
      );

      const totalMessagesCount = chat.messages.length;
      const shouldWindowMessages = !searchHighlightQuery && totalMessagesCount > visibleCount;
      const hiddenMessagesCount = shouldWindowMessages ? totalMessagesCount - visibleCount : 0;
      const renderedMessages = shouldWindowMessages
        ? chat.messages.slice(-visibleCount)
        : chat.messages;

      return (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden smooth-scroll flex flex-col relative select-none touch-pan-y pb-4 sm:pb-5 w-full max-w-full"
        >
          {/* Slim Top Lore Scanner Indicator (Non-occluding) */}
          {isAuditingLore && (
            <div className="pointer-events-none sticky top-0 left-0 right-0 z-30 h-[2px] bg-gradient-to-r from-transparent via-amber-400/80 to-transparent shadow-[0_0_10px_rgba(245,158,11,0.6)]" />
          )}

          {/* Toast Notification (Memory stored / Copied to clipboard) */}
          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="sticky top-3 z-40 mx-auto max-w-md px-4 py-2 bg-zinc-900 dark:bg-[#0e0e12] border border-zinc-700 dark:border-white/20 text-white rounded-lg shadow-xl dark:shadow-2xl flex items-center gap-2.5 text-xs"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="truncate flex-1 font-medium">{toastMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty State or Message Stream with Smooth Chapter-Switch Editorial Transition */}
          <div key={chat.id} className="w-full flex-1 flex flex-col animate-noir-enter">
            {totalMessagesCount === 0 ? (
              <HourglassAvatarGreeting
                userName="Aaron"
                folder={folder}
                activeLoreFilesCount={activeLoreFiles.length}
                onOpenFolderManager={onOpenFolderManager}
                onQuickPrompt={onQuickPrompt}
                onAuditScene={onAuditScene}
              />
            ) : (
              <div className="w-full pb-3 pt-3 sm:pt-4">
                {hiddenMessagesCount > 0 && (
                  <div className="max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 md:px-8 pt-1 pb-3 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((prev) => prev + 24)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-zinc-100 dark:bg-[#111116] hover:bg-zinc-200 dark:hover:bg-[#181820] border border-zinc-200/80 dark:border-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer select-none shadow-xs"
                    >
                      Mostrar mensajes anteriores ({hiddenMessagesCount} más)
                    </button>
                    {hiddenMessagesCount > 24 && (
                      <button
                        type="button"
                        onClick={() => setVisibleCount(totalMessagesCount)}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-transparent hover:bg-zinc-100 dark:hover:bg-white/[0.04] border border-transparent hover:border-zinc-200/60 dark:hover:border-white/[0.06] text-xs font-mono text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer select-none"
                      >
                        Ver todos
                      </button>
                    )}
                  </div>
                )}

                {renderedMessages.map((msg, idx) => {
                  const isLastAssistant =
                    !isStreaming &&
                    msg.role === 'assistant' &&
                    idx === renderedMessages.length - 1;
                  const isInterrupted = Boolean(msg.isInterrupted);

                  return (
                    <div id={`msg-${msg.id}`} key={msg.id}>
                      <ChatMessage
                        message={msg}
                        isLastAssistant={isLastAssistant}
                        isInterrupted={Boolean(isInterrupted)}
                        availableLoreFiles={loreFiles}
                        onRegenerate={stableRegenerate}
                        onContinueMessage={stableContinueMessage}
                        onEditMessage={stableEditMessage}
                        onDeleteMessage={stableDeleteMessage}
                        onSelectVariant={stableSelectVariant}
                        onAuditScene={stableAuditScene}
                        onIllustrateScene={stableIllustrateScene}
                        onGenerateVideoScene={stableGenerateVideoScene}
                        onQuickPrompt={stableQuickPrompt}
                        onSelectFollowUp={stableQuickPrompt}
                        onOpenImageLightbox={stableOpenImageLightbox}
                        onShowToast={stableShowToast}
                        isPersonaWizardChat={chat?.title === 'Taller de Directiva Global' || chat?.title === '🪄 Taller de Directiva Global'}
                        onApplyGlobalPersona={stableApplyGlobalPersona}
                        onOpenSettings={stableOpenSettings}
                        onSwitchProvider={stableSwitchProvider}
                        onOpenDocumentPreview={stableOpenDocumentPreview}
                        searchHighlightQuery={searchHighlightQuery}
                      />
                    </div>
                  );
                })}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Minimalist Turn Navigation Rail on Right Edge (OpenWebUI / Claude Style) */}
          {renderedMessages.length >= 4 && (
            <div
              className="hidden sm:flex fixed right-1.5 top-1/2 -translate-y-1/2 z-30 flex-col items-end gap-1.5 py-2 px-1 rounded-full opacity-35 hover:opacity-100 transition-opacity duration-200 select-none"
              aria-label="Navegación rápida de turnos"
            >
              {renderedMessages.slice(-18).map((msg, i) => {
                const isUsr = msg.role === 'user';
                const cleanPreview = (msg.content || '')
                  .replace(/<think>[\s\S]*?<\/think>/gi, '')
                  .replace(/[#*_`~>\n]+/g, ' ')
                  .trim()
                  .slice(0, 48);
                return (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`msg-${msg.id}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    title={`${isUsr ? 'Tú' : 'Kizuna-Zek'}: ${cleanPreview || `Turno ${i + 1}`}`}
                    className="group/rail flex items-center justify-end py-0.5 px-1 cursor-pointer focus:outline-none"
                  >
                    <span
                      className={`block h-[2.5px] rounded-full transition-all duration-150 ${
                        isUsr
                          ? 'w-2.5 group-hover/rail:w-4 bg-zinc-400 dark:bg-zinc-500 group-hover/rail:bg-amber-400'
                          : 'w-3.5 group-hover/rail:w-5 bg-zinc-500 dark:bg-zinc-300 group-hover/rail:bg-white'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {/* Floating "Scroll to Bottom" Button */}
          <AnimatePresence>
            {showScrollBottom && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                whileTap={{ scale: 0.9 }}
                onClick={scrollToBottom}
                className="fixed bottom-20 sm:bottom-24 right-4 sm:right-8 z-30 p-2 sm:p-2.5 bg-white/95 dark:bg-[#121216]/95 backdrop-blur-md hover:bg-zinc-100 dark:hover:bg-[#1c1c22] border border-zinc-200 dark:border-white/15 text-zinc-800 dark:text-white rounded-full shadow-lg dark:shadow-2xl transition-all flex items-center gap-1.5 text-xs font-mono cursor-pointer active:scale-95"
                title="Ir al último mensaje"
              >
                <ArrowDown size={14} />
                <span className="hidden sm:inline">Final</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      );
    }
  ),
  (prev, next) => {
    return (
      prev.chat === next.chat &&
      prev.folder === next.folder &&
      prev.loreFiles.length === next.loreFiles.length &&
      prev.isStreaming === next.isStreaming &&
      prev.isAuditingLore === next.isAuditingLore &&
      prev.toastMessage === next.toastMessage &&
      prev.searchHighlightQuery === next.searchHighlightQuery &&
      prev.activeModelKey === next.activeModelKey
    );
  }
);
