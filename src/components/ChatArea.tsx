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
  onOpenImageLightbox: (attachment: Attachment) => void;
  onQuickPrompt: (promptText: string) => void;
  onOpenFolderManager: () => void;
  onShowToast: (text: string) => void;
  onApplyGlobalPersona?: (text: string) => void;
  onOpenSettings?: () => void;
  onSwitchProvider?: (provider: 'gemini' | 'custom' | 'alibaba', modelId?: string) => void;
  onOpenDocumentPreview?: (item: any) => void;
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
        onOpenImageLightbox,
        onQuickPrompt,
        onOpenFolderManager,
        onShowToast,
        onApplyGlobalPersona,
        onOpenSettings,
        onSwitchProvider,
        onOpenDocumentPreview,
      },
      ref
    ) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const bottomRef = useRef<HTMLDivElement>(null);
      const [showScrollBottom, setShowScrollBottom] = useState(false);

      const callbacksRef = useRef({
        onRegenerate,
        onContinueMessage,
        onEditMessage,
        onDeleteMessage,
        onSelectVariant,
        onAuditScene,
        onIllustrateScene,
        onOpenImageLightbox,
        onQuickPrompt,
        onShowToast,
        onApplyGlobalPersona,
        onOpenSettings,
        onSwitchProvider,
      });
      callbacksRef.current = {
        onRegenerate,
        onContinueMessage,
        onEditMessage,
        onDeleteMessage,
        onSelectVariant,
        onAuditScene,
        onIllustrateScene,
        onOpenImageLightbox,
        onQuickPrompt,
        onShowToast,
        onApplyGlobalPersona,
        onOpenSettings,
        onSwitchProvider,
      };

      const stableRegenerate = React.useCallback(() => callbacksRef.current.onRegenerate(), []);
      const stableContinueMessage = React.useCallback((id?: string) => callbacksRef.current.onContinueMessage?.(id), []);
      const stableEditMessage = React.useCallback((id: string, text: string) => callbacksRef.current.onEditMessage(id, text), []);
      const stableDeleteMessage = React.useCallback((id: string) => callbacksRef.current.onDeleteMessage(id), []);
      const stableSelectVariant = React.useCallback((id: string, idx: number) => callbacksRef.current.onSelectVariant?.(id, idx), []);
      const stableAuditScene = React.useCallback((text?: string) => callbacksRef.current.onAuditScene(text), []);
      const stableIllustrateScene = React.useCallback((content: string, id: string) => callbacksRef.current.onIllustrateScene?.(content, id), []);
      const stableOpenImageLightbox = React.useCallback((att: Attachment) => callbacksRef.current.onOpenImageLightbox(att), []);
      const stableQuickPrompt = React.useCallback((text: string) => callbacksRef.current.onQuickPrompt(text), []);
      const stableShowToast = React.useCallback((text: string) => callbacksRef.current.onShowToast(text), []);
      const stableApplyGlobalPersona = React.useCallback((text: string) => callbacksRef.current.onApplyGlobalPersona?.(text), []);
      const stableOpenSettings = React.useCallback(() => callbacksRef.current.onOpenSettings?.(), []);
      const stableSwitchProvider = React.useCallback((prov: 'gemini' | 'custom', mod?: string) => callbacksRef.current.onSwitchProvider?.(prov, mod), []);

      const scrollToBottom = React.useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        setShowScrollBottom(false);
      }, []);

      React.useImperativeHandle(ref, () => ({
        scrollToBottom,
      }));

      // Listen to virtual keyboard opening via visualViewport
      useEffect(() => {
        const handleResize = () => {
          if (!showScrollBottom && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        };
        if (typeof window !== 'undefined' && window.visualViewport) {
          window.visualViewport.addEventListener('resize', handleResize, { passive: true });
          return () => window.visualViewport?.removeEventListener('resize', handleResize);
        }
      }, [showScrollBottom]);

      // Monitor scroll distance from bottom with passive touch listener
      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const handleScroll = () => {
          const { scrollTop, scrollHeight, clientHeight } = container;
          const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
          setShowScrollBottom(distanceFromBottom > 160);
        };
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
          container.removeEventListener('scroll', handleScroll);
        };
      }, []);

      // Auto-scroll to bottom on streaming unless user has deliberately scrolled up
      useEffect(() => {
        if (!showScrollBottom && containerRef.current) {
          if (isStreaming) {
            // Direct property assignment prevents layout thrashing and 120Hz frame drops:
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          } else {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }, [chat?.messages, isStreaming, showScrollBottom]);

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

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden smooth-scroll flex flex-col relative select-text touch-pan-y pb-4 sm:pb-5 w-full max-w-full"
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
            className="sticky top-3 z-40 mx-auto max-w-md px-4 py-2 bg-[#0e0e12] border border-white/20 text-white rounded-lg shadow-2xl flex items-center gap-2.5 text-xs"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="truncate flex-1 font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State / Animated Hourglass Avatar & Typewriter Greeting */}
      {chat.messages.length === 0 ? (
        <HourglassAvatarGreeting
          userName="Aaron"
          folder={folder}
          activeLoreFilesCount={activeLoreFiles.length}
          onOpenFolderManager={onOpenFolderManager}
          onQuickPrompt={onQuickPrompt}
          onAuditScene={onAuditScene}
        />
      ) : (
        <div className="w-full pb-2 pt-2">
          {chat.messages.map((msg, idx) => {
            const isLastAssistant = !isStreaming && msg.role === 'assistant' && idx === chat.messages.length - 1;
            const isInterrupted = Boolean(msg.isInterrupted);
            const isOlderMessage = idx < chat.messages.length - 2;

            return (
              <div key={msg.id} className={`animate-noir-enter ${isOlderMessage ? 'message-virtualized' : ''}`}>
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
                  onQuickPrompt={stableQuickPrompt}
                  onSelectFollowUp={stableQuickPrompt}
                  onOpenImageLightbox={stableOpenImageLightbox}
                  onShowToast={stableShowToast}
                  isPersonaWizardChat={chat?.title === '🪄 Taller de Directiva Global'}
                  onApplyGlobalPersona={stableApplyGlobalPersona}
                  onOpenSettings={stableOpenSettings}
                  onSwitchProvider={stableSwitchProvider}
                  onOpenDocumentPreview={onOpenDocumentPreview}
                />
              </div>
            );
          })}

          <div ref={bottomRef} />
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
            className="fixed bottom-24 right-6 sm:right-10 z-40 p-2.5 bg-[#121216] hover:bg-[#1c1c22] border border-[#26262a] text-white rounded-full shadow-2xl transition-colors flex items-center gap-1.5 text-xs font-mono"
            title="Ir al último mensaje"
          >
            <ArrowDown size={14} />
            <span className="hidden sm:inline">Final</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}));
