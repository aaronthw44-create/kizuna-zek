import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Copy,
  Check,
  RotateCcw,
  Edit3,
  FileText,
  File,
  FileCheck,
  AlertCircle,
  Eye,
  BookOpen,
  Trash2,
  FileCode,
  Globe,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Lightbulb,
  Zap,
  Volume2,
  VolumeX,
  Palette,
  Loader2,
  Sparkles,
  Timer,
  Gauge,
  CloudUpload,
} from 'lucide-react';
import { RunicSealIcon } from './RunicSealIcon';
import { LivingInkDrop } from './LivingInkDrop';
import { Message, Attachment, LoreFile } from '../types';
import { saveTextToGoogleDriveDoc, extractCleanDraftWithDeepSeek } from '../services/googleDriveService';

interface ChatMessageProps {
  message: Message;
  isLastAssistant: boolean;
  isInterrupted?: boolean;
  availableLoreFiles?: LoreFile[];
  onRegenerate?: () => void;
  onContinueMessage?: (messageId?: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onSelectVariant?: (messageId: string, variantIndex: number) => void;
  onAuditScene?: (targetText?: string) => void;
  onIllustrateScene?: (messageContent: string, messageId: string) => Promise<void> | void;
  onQuickPrompt?: (promptText: string) => void;
  onOpenImageLightbox: (attachment: Attachment) => void;
  onShowToast?: (text: string) => void;
  isPersonaWizardChat?: boolean;
  onApplyGlobalPersona?: (text: string) => void;
  onSelectFollowUp?: (text: string) => void;
  onOpenSettings?: () => void;
  onSwitchProvider?: (provider: 'gemini' | 'custom', modelId?: string) => void;
  onOpenDocumentPreview?: (item: any) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = React.memo(({
  message,
  isLastAssistant,
  isInterrupted = false,
  availableLoreFiles = [],
  onRegenerate,
  onContinueMessage,
  onEditMessage,
  onDeleteMessage,
  onSelectVariant,
  onAuditScene,
  onIllustrateScene,
  onQuickPrompt,
  onOpenImageLightbox,
  onShowToast,
  isPersonaWizardChat = false,
  onApplyGlobalPersona,
  onSelectFollowUp,
  onOpenSettings,
  onSwitchProvider,
  onOpenDocumentPreview,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [isThoughtOpen, setIsThoughtOpen] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingTts, setIsLoadingTts] = useState(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isIllustrating, setIsIllustrating] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [isDriveSaved, setIsDriveSaved] = useState(false);
  const [apkDownloadModal, setApkDownloadModal] = useState<{
    active: boolean;
    step: string;
    progress: number;
    fileName: string;
    webViewLink?: string;
    isComplete?: boolean;
  } | null>(null);

  const cleanMessageContentForExport = (raw: string): string => {
    return (raw || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<<<FOLLOW_UP>>>[\s\S]*$/gi, '')
      .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
      .trim();
  };

  const downloadSceneLocally = (content: string, titleHint?: string) => {
    try {
      const cleanContent = cleanMessageContentForExport(content);
      const fileName = `${(titleHint || 'Escena_Kizuna').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.md`;
      const blob = new Blob([cleanContent], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Fallback download error:', e);
    }
  };

  const handleSaveToDrive = async () => {
    if (isSavingToDrive || !message.content.trim()) return;
    setIsSavingToDrive(true);
    setApkDownloadModal({
      active: true,
      step: '⚡ DeepSeek V4.1 Flash procesando borrador...',
      progress: 25,
      fileName: 'Analizando manuscrito...',
    });

    let key = '';
    try {
      const rawSettings = localStorage.getItem('kizuna_zek_v2_settings');
      const parsed = rawSettings ? JSON.parse(rawSettings) : {};
      key = (parsed.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim();
    } catch {}

    let cleanTitle = 'Escena_Kizuna';
    let cleanContent = cleanMessageContentForExport(message.content);

    try {
      // 1. Run DeepSeek V4.1 Flash to extract strictly clean manuscript prose without AI filler
      const extracted = await extractCleanDraftWithDeepSeek(message.content, key);
      cleanTitle = extracted.title || cleanTitle;
      cleanContent = extracted.content || cleanContent;

      setApkDownloadModal({
        active: true,
        step: '☁️ Sincronizando y guardando en Google Drive...',
        progress: 65,
        fileName: `${cleanTitle}.docx`,
      });

      // 2. Upload Google Doc to Drive
      const docTitle = `${cleanTitle} (Kizuna)`;
      const result = await saveTextToGoogleDriveDoc(docTitle, cleanContent);
      setIsDriveSaved(true);

      setApkDownloadModal({
        active: true,
        step: '✅ ¡Manuscrito sincronizado con Google Drive!',
        progress: 100,
        fileName: result.name,
        webViewLink: result.webViewLink,
        isComplete: true,
      });

      onShowToast?.(`✓ Guardado en tu Google Drive: "${result.name}"`);
      setTimeout(() => setIsDriveSaved(false), 3500);
    } catch (err: any) {
      console.warn('Google Drive save notice:', err);
      downloadSceneLocally(cleanContent, cleanTitle || 'Escena');
      const isNetworkOrPopup = (err?.message || '').includes('bloqueó') || (err?.code || '').includes('network') || (err?.message || '').includes('network');

      setApkDownloadModal({
        active: true,
        step: '💾 Manuscrito descargado (.md)',
        progress: 100,
        fileName: `${cleanTitle}.md`,
        isComplete: true,
      });

      if (isNetworkOrPopup) {
        onShowToast?.(`💾 Descargado como "${cleanTitle}.md" (popup bloqueado).`);
      } else {
        onShowToast?.(`💾 Descargado localmente como "${cleanTitle}.md".`);
      }
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const handleIllustrate = async () => {
    if (!onIllustrateScene || isIllustrating || !message.content.trim()) return;
    setIsIllustrating(true);
    try {
      await onIllustrateScene(message.content, message.id);
    } catch (e: any) {
      console.warn('Illustration error:', e);
    } finally {
      setIsIllustrating(false);
    }
  };

  useEffect(() => {
    return () => {
      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.src = '';
        } catch {}
        ttsAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const isUser = message.role === 'user';

  // Helper to extract internal reasoning (<think>...</think>, Think>..., *thinking*..., etc.) from message content
  const parseMessageContent = (content: string = '', messageThinking?: string) => {
    let thinking = messageThinking ? messageThinking.trim() : null;
    let prose = content || '';
    let isStillThinking = false;

    if (!prose.trim()) {
      let activeThinkingState = false;
      if (!isUser && !message.isStreaming && thinking) {
        prose =
          '*(El modelo completó su proceso reflexivo. Pulsa en Regenerar si no comenzó a redactar la respuesta).*';
      } else if (message.isStreaming && thinking) {
        activeThinkingState = true;
      }
      return { thinking, prose, isStillThinking: activeThinkingState };
    }

    // Quick check to skip heavy regex routines when text contains no thinking tags or appended docs
    const hasCandidateTag =
      prose.includes('<think') ||
      prose.includes('Think>') ||
      prose.includes('thought>') ||
      prose.includes('*thinking') ||
      prose.includes('<tool_call') ||
      prose.includes('<|tool_call|>') ||
      prose.includes('The user is the developer') ||
      prose.includes('[DOCUMENTO ADJUNTO:');

    if (!hasCandidateTag) {
      if (!prose.trim() && !isUser) {
        if (!message.isStreaming) {
          prose =
            '*(El modelo completó su proceso reflexivo. Pulsa en Regenerar si no comenzó a redactar la respuesta).*';
        }
      }
      return { thinking, prose, isStillThinking };
    }

    // Strip out raw appended document blocks if they leaked into message.content
    prose = prose.replace(/\[DOCUMENTO ADJUNTO:[\s\S]*/gi, '').trim();

    if (/(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)/i.test(prose)) {
      const closeMatch = prose.match(/([\s\S]*?)(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)([\s\S]*)/i);
      if (closeMatch) {
        const preTag = closeMatch[1];
        const postTag = closeMatch[2];
        const openMatch = preTag.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
        if (openMatch) {
          const prefix = preTag.slice(0, preTag.toLowerCase().indexOf(openMatch[0].toLowerCase()));
          const extracted = openMatch[1].trim();
          if (extracted) thinking = thinking ? `${thinking}\n${extracted}` : extracted;
          prose = (prefix + postTag);
        } else {
          // Orphan closing tag (e.g. Stepfun Step-5 / models emitting reasoning without opening <think>):
          // Everything before </think> is reasoning text!
          const extracted = preTag.trim();
          if (extracted) thinking = thinking ? `${thinking}\n${extracted}` : extracted;
          prose = postTag;
        }
      }
    } else {
      // Bulletproof reasoning regex catching unclosed tags, meta-deliberation patterns, and broken tags
      const thinkingRegex =
        /(?:<think>|Think>|thought>|\*+thinking\*+|^The user is the developer[\s\S]*?)([\s\S]*?)(?:<\/think>|<\/thought>|<\/|\n\n(?=[A-Z¡¿])|$)/i;

      const match = thinkingRegex.exec(prose);

      if (match) {
        const fullMatch = match[0];
        const capturedThinking = match[1] ? match[1].trim() : '';

        // Check if explicit closing tag or section break boundary was matched
        const hasClosingTag =
          /<\/think>|<\/thought>|\*+\/thinking\*+|\n\n---/i.test(fullMatch) ||
          /\n\n(?=[A-Z¡¿])/.test(fullMatch);

        if (capturedThinking) {
          thinking = thinking ? `${thinking}\n${capturedThinking}` : capturedThinking;
        }

        // Remove the captured thinking block from prose
        prose = prose.replace(fullMatch, '');

        // If no explicit closing tag was found and we matched until end of string, it is actively streaming reasoning
        if (!hasClosingTag && (!fullMatch || fullMatch.endsWith(capturedThinking))) {
          isStillThinking = true;
        }
      }
    }

    // Completely strip any residual or leaked occurrences of tags/labels or orphaned tags from visible prose
    prose = prose
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
      .replace(/<tool_call>[\s\S]*$/gi, '')
      .replace(/<\/?tool_call>/gi, '')
      .replace(/<\|tool_call\|>[\s\S]*?(?:<\|\/tool_call\|>|$)/gi, '')
      .replace(/<\|\/?tool_call\|>/gi, '')
      .replace(/[\wÀ-ÿ]*\.\<\/think\>/gi, '')
      .replace(/[\wÀ-ÿ]*\<\/think\>/gi, '')
      .replace(/[\wÀ-ÿ]*\<\/thought\>/gi, '')
      .replace(/(?:<think>|Think>|thought>|\*+thinking\*+|Thinking:)/gi, '')
      .replace(/(?:<\/think>|<\/thought>|\*+\/thinking\*+)/gi, '')
      .replace(/<\/?think>?/gi, '')
      .replace(/<\/?thought>?/gi, '')
      .replace(/<\/?$/gi, '')
      .replace(/<\/$/gi, '')
      .trim();

    // Fallback for empty responses (or responses that consisted solely of thinking / orphaned tags)
    if (!prose.trim() && !isUser) {
      if (!message.isStreaming) {
        prose =
          '*(El modelo completó su proceso reflexivo. Pulsa en Regenerar si no comenzó a redactar la respuesta).*';
      }
    }

    return { thinking, prose, isStillThinking };
  };

  const thoughtContainerRef = useRef<HTMLDivElement>(null);
  const { thinking, prose, isStillThinking, cleanDisplayContent, match } = React.useMemo(() => {
    const followUpRegex = /<<<FOLLOW_UP>>>([\s\S]*?)(?:<<<END_FOLLOW_UP>>>|$)/;
    const foundMatch = message.content.match(followUpRegex);
    const rawClean = message.content.replace(/<<<FOLLOW_UP>>>[\s\S]*$/i, '').trim();
    const parsedClean = parseMessageContent(rawClean, message.thinking);
    return {
      thinking: parsedClean.thinking,
      prose: parsedClean.prose,
      isStillThinking: parsedClean.isStillThinking,
      cleanDisplayContent: parsedClean.prose,
      match: foundMatch,
    };
  }, [message.content, message.thinking, message.isStreaming]);
  const thoughtContent = (message.thought || thinking || message.thinking || '').trim();
  const hasThoughts = Boolean(thoughtContent);
  const isThinking = Boolean(
    message.isStreaming && !prose.trim()
  );
  const thinkingDuration = message.thinkingDuration || message.reasoningDurationSeconds || (thinkingSeconds > 0 ? thinkingSeconds : 1.8);

  const getThinkingStatusText = (userPromptText: string = '', isWebActive: boolean = false, seconds: number = 0) => {
    const p = userPromptText.toLowerCase();
    const modelIdentifier = `${message.modelId || ''} ${message.modelName || ''}`.toLowerCase();
    const hasAlibabaSrc = message.webSearchSources?.some((s: any) => s.sourceEngine === 'alibaba');
    const hasGoogleSrc = message.webSearchSources?.some((s: any) => s.sourceEngine === 'google');
    const hasTavilySrc = message.webSearchSources?.some((s: any) => s.sourceEngine === 'tavily');

    if (isWebActive || Boolean(message.webSearch) || p.includes('busca') || p.includes('noticia') || p.includes('internet')) {
      if (hasAlibabaSrc || modelIdentifier.includes('qwen')) {
        return 'Consultando a internet con Quark Search...';
      }
      if (hasTavilySrc || modelIdentifier.includes('kimi') || modelIdentifier.includes('deepseek')) {
        return 'Consultando a Tavily...';
      }
      if (hasGoogleSrc || modelIdentifier.includes('gemini')) {
        return 'Consultando a internet con Google Search...';
      }
      return 'Consultando a internet con Google Search...';
    }
    if (p.includes('kolder') || p.includes('hinistra') || p.includes('lore') || p.includes('monstereth') || p.includes('catarsis') || p.includes('tedriot')) {
      return 'Contrastando lore y registros de Monstereth...';
    }
    if (p.includes('escribe') || p.includes('capítulo') || p.includes('escena') || p.includes('continúa') || p.includes('diálogo')) {
      return 'Afinando pulso narrativo y subtexto...';
    }
    if (p.includes('código') || p.includes('bug') || p.includes('función') || p.includes('componente') || p.includes('react')) {
      return 'Analizando arquitectura y lógica...';
    }
    if (seconds > 18) {
      return 'Desgranando matices complejos...';
    }
    return 'Calibrando respuesta...';
  };

  useEffect(() => {
    if (isThinking && isThoughtOpen && thoughtContainerRef.current) {
      thoughtContainerRef.current.scrollTop = thoughtContainerRef.current.scrollHeight;
    }
  }, [thoughtContent, isThinking, isThoughtOpen]);

  // cleanDisplayContent and match are already memoized above

  const isResponseCutOff = React.useMemo(() => {
    if (isUser || message.isStreaming || message.error) return false;
    const trimmedProse = cleanDisplayContent.trim();
    if (!trimmedProse || trimmedProse.startsWith('*(El modelo completó su proceso reflexivo')) return false;

    // 1. Explicit interruption or token ceiling (finish_reason === 'length' / 'MAX_TOKENS' / user stop)
    if (isInterrupted || message.isInterrupted) return true;

    // 2. If the model already emitted <<<FOLLOW_UP>>> at the end, the main response finished normally
    if (/<<<FOLLOW_UP>>>/i.test(message.content)) return false;

    // 3. Unclosed markdown code fence (odd number of ```)
    const codeFences = trimmedProse.match(/```/g);
    if (codeFences && codeFences.length % 2 !== 0) return true;

    // 4. Syntactic cut-off check on longer responses (> 60 chars) without <<<FOLLOW_UP>>>
    if (trimmedProse.length > 60) {
      const strippedEnd = trimmedProse.replace(/[*_~`]+$/, '').trimEnd();
      if (!strippedEnd) return false;
      const endsNormally =
        /[.!?…:;"'»”)\]}—–-]$/.test(strippedEnd) ||
        /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(strippedEnd.slice(-2));
      if (!endsNormally && /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9,\(\[«“]$/.test(strippedEnd)) {
        return true;
      }
    }

    return false;
  }, [isUser, message.isStreaming, message.error, message.content, message.isInterrupted, isInterrupted, cleanDisplayContent]);

  const handleToggleSpeak = async () => {
    if (typeof window === 'undefined') return;
    if (isLoadingTts) return;

    if (isSpeaking) {
      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.currentTime = 0;
        } catch {}
        ttsAudioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      return;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Clean text of markdown, code blocks, and markdown markers for clear speech
    const cleanSpeechText = cleanDisplayContent
      .replace(/```[\s\S]*?```/g, ' [Bloque de código omitido] ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~]/g, '')
      .trim();

    if (!cleanSpeechText) return;

    let alibabaApiKey = '';
    let ttsEngine: 'auto' | 'qwen-audio-3.1-tts-flash' | 'qwen-audio-3.1-tts-plus' | 'browser' = 'auto';
    let ttsVoice = 'Cherry';
    let ttsInstruct = '';
    try {
      const rawSettings = localStorage.getItem('kizuna_zek_v2_settings');
      const parsed = rawSettings ? JSON.parse(rawSettings) : {};
      alibabaApiKey = (parsed.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim();
      if (parsed.ttsEngine) ttsEngine = parsed.ttsEngine;
      if (parsed.ttsVoice) ttsVoice = parsed.ttsVoice;
      if (parsed.ttsInstruct) ttsInstruct = parsed.ttsInstruct;
    } catch {}

    // 1. Qwen-Audio 3.1 TTS (Flash / Plus / Auto) Path
    if (alibabaApiKey && ttsEngine !== 'browser') {
      setIsLoadingTts(true);
      try {
        const res = await fetch('/api/alibaba/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleanSpeechText.slice(0, 2500),
            alibabaApiKey,
            model: ttsEngine,
            voice: ttsVoice,
            instruct: ttsInstruct,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const srcUrl = data.audioDataUrl || data.audioUrl;
          if (srcUrl && !data.fallback) {
            const audio = new Audio(srcUrl);
            ttsAudioRef.current = audio;
            audio.onended = () => {
              setIsSpeaking(false);
              ttsAudioRef.current = null;
            };
            audio.onerror = () => {
              setIsSpeaking(false);
              ttsAudioRef.current = null;
            };
            setIsLoadingTts(false);
            setIsSpeaking(true);
            await audio.play();
            return;
          }
        }
      } catch {
        // Fall through to native Web Speech API
      } finally {
        setIsLoadingTts(false);
      }
    }

    // 2. Native Browser SpeechSynthesis Fallback
    if (!window.speechSynthesis) return;

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice =
      voices.find(v => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium'))) ||
      voices.find(v => v.lang.startsWith('es')) ||
      null;

    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    if (spanishVoice) utterance.voice = spanishVoice;
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    utterance.pitch = 0.98;

    let keepAliveTimer: any = null;
    utterance.onstart = () => {
      setIsSpeaking(true);
      keepAliveTimer = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);
    };

    const cleanup = () => {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      setIsSpeaking(false);
    };

    utterance.onend = cleanup;
    utterance.onerror = cleanup;

    window.speechSynthesis.speak(utterance);
  };

  let dynamicFollowUps: string[] = [];
  if (match && match[1]) {
    dynamicFollowUps = match[1]
      .split('\n')
      .map(line => line.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').trim())
      .filter(Boolean);
  } else if (!message.isStreaming) {
    const questionsFound = cleanDisplayContent.match(/¿[^?]+\?/g);
    if (questionsFound && questionsFound.length > 0) {
      dynamicFollowUps = questionsFound.slice(0, 3).map(q => q.replace(/[¿?]/g, '').trim());
    }
  }

  const prevIsThinkingRef = React.useRef(isThinking);
  useEffect(() => {
    if (prevIsThinkingRef.current && !isThinking) {
      setIsThoughtOpen(false);
    }
    prevIsThinkingRef.current = isThinking;
  }, [isThinking]);

  // Live timer for reasoning seconds counter
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isThinking) {
      const startTime = message.timestamp || Date.now();
      const updateTimer = () => {
        const elapsed = Math.max(0.1, (Date.now() - startTime) / 1000);
        setThinkingSeconds(+elapsed.toFixed(1));
      };
      updateTimer();
      interval = setInterval(updateTimer, 250);
    } else if (!message.isStreaming) {
      if (message.reasoningDurationSeconds !== undefined && !isNaN(message.reasoningDurationSeconds) && message.reasoningDurationSeconds > 0) {
        setThinkingSeconds(message.reasoningDurationSeconds);
      } else if (hasThoughts) {
        if (thinkingSeconds === 0) {
          const words = thoughtContent.split(/\s+/).length;
          const estSecs = +(Math.max(0.4, words / 15)).toFixed(1);
          setThinkingSeconds(estSecs);
        }
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isThinking, message.isStreaming, message.timestamp, message.reasoningDurationSeconds, hasThoughts, thoughtContent]);

  // Word & character stats calculation (strictly on prose, excluding thought tokens)
  const wordCount = prose.trim() ? prose.trim().split(/\s+/).length : 0;
  const charCount = prose.length;

  const handleCopy = () => {
    navigator.clipboard.writeText(prose || message.content);
    setCopied(true);
    if (onShowToast) {
      onShowToast('Copiado al portapapeles');
    }
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && onEditMessage) {
      onEditMessage(message.id, editContent.trim());
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (onDeleteMessage) {
      onDeleteMessage(message.id);
    }
    setShowDeleteConfirm(false);
  };

  // Rich Markdown Parser using react-markdown and remark-gfm
  const renderFormattedContent = (content: string) => {
    if (!content) return null;

    let sanitizedContent = content;
    if (
      content.includes('<think') ||
      content.includes('Think>') ||
      content.includes('thought>') ||
      content.includes('*thinking') ||
      content.includes('<tool_call') ||
      content.includes('<|tool_call|>')
    ) {
      sanitizedContent = content
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<tool_call>[\s\S]*$/gi, '')
        .replace(/<\/?tool_call>/gi, '')
        .replace(/<\|tool_call\|>[\s\S]*?(?:<\|\/tool_call\|>|$)/gi, '')
        .replace(/<\|\/?tool_call\|>/gi, '')
        .replace(/(?:<think>|Think>|thought>|\*+thinking\*+)([\s\S]*?)(?:<\/think>|<\/thought>|$)/gi, '')
        .replace(/<\/?think>?/gi, '')
        .replace(/<\/?thought>?/gi, '');
    }
    sanitizedContent = sanitizedContent.trim();

    if (!sanitizedContent) return null;

    return (
      <div className="prose-noir select-text text-[16px] sm:text-[16.5px] leading-[1.72] tracking-[0.01em] text-zinc-900 dark:text-zinc-100 space-y-3 break-words overflow-hidden max-w-full">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mt-4 mb-2 tracking-tight border-b border-zinc-200 dark:border-[#262626] pb-1 break-words">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white mt-3.5 mb-1.5 tracking-tight break-words">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mt-3 mb-1 break-words">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-base font-semibold text-zinc-800 dark:text-[#f4f4f5] mt-2 mb-1 break-words">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="text-[16px] sm:text-[16.5px] leading-[1.72] text-zinc-900 dark:text-zinc-100 mb-3 last:mb-0 font-normal break-words max-w-full">
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-zinc-900 dark:text-white break-words">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic text-zinc-700 dark:text-[#d4d4d8] break-words">{children}</em>
            ),
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto max-w-full rounded-md border border-[#262626] bg-[#09090b]">
                <table className="w-full text-left border-collapse text-xs md:text-sm">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-[#161618] text-white font-semibold border-b border-[#262626]">
                {children}
              </thead>
            ),
            th: ({ children }) => (
              <th className="p-2.5 text-xs md:text-sm font-semibold text-white border-r border-[#262626] last:border-r-0 break-words">
                {children}
              </th>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-[#262626]">{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="odd:bg-[#0c0c0e] even:bg-[#121214] hover:bg-[#18181c] transition-colors">
                {children}
              </tr>
            ),
            td: ({ children }) => (
              <td className="p-2.5 text-xs md:text-sm text-[#EDEDED] border-r border-[#262626] last:border-r-0 break-words">
                {children}
              </td>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 space-y-1 text-[15px] text-zinc-800 dark:text-[#EDEDED] my-2 max-w-full">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 space-y-1 text-[15px] text-zinc-800 dark:text-[#EDEDED] my-2 max-w-full">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed text-[15px] text-zinc-800 dark:text-[#EDEDED] break-words max-w-full">{children}</li>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-orange-500 pl-3.5 py-1.5 my-3 bg-orange-500/5 dark:bg-[#121216] text-zinc-800 dark:text-zinc-300 italic text-sm sm:text-[15px] rounded-r-lg break-words max-w-full">
                {children}
              </blockquote>
            ),
            code: ({ className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !String(children).includes('\n');
              const codeString = String(children).replace(/\n$/, '');

              if (isInline) {
                return (
                  <code
                    className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-[#16161a] border border-zinc-200 dark:border-[#26262c] text-[11px] font-mono text-zinc-900 dark:text-[#f4f4f5]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              return (
                <div className="my-3 rounded-md border border-zinc-200 dark:border-[#1f1f23] bg-zinc-900 dark:bg-[#070709] overflow-hidden text-white">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 dark:bg-[#0e0e12] border-b border-zinc-700 dark:border-[#18181c] text-[11px] font-mono text-zinc-300 dark:text-[#71717a]">
                    <span>{match ? match[1] : 'texto'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(codeString);
                        if (onShowToast) onShowToast('Código copiado al portapapeles');
                      }}
                      className="hover:bg-white/10 hover:text-white px-2 py-0.5 rounded text-xs font-mono transition-colors cursor-pointer"
                      title="Copiar código"
                    >
                      Copiar
                    </button>
                  </div>
                  <pre className="p-3 overflow-x-auto text-xs font-mono text-zinc-100 dark:text-[#e4e4e7] leading-relaxed">
                    <code>{children}</code>
                  </pre>
                </div>
              );
            },
            hr: () => <hr className="my-4 border-zinc-200 dark:border-[#262626]" />,
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-500 dark:text-orange-400 underline underline-offset-2 hover:text-orange-600 transition-colors"
              >
                {children}
              </a>
            ),
          }}
        >
          {sanitizedContent}
        </ReactMarkdown>
      </div>
    );
  };

  const formattedContentMemo = React.useMemo(() => {
    return renderFormattedContent(cleanDisplayContent);
  }, [cleanDisplayContent]);

  const hasGoogleSources = message.webSearchSources?.some((s: any) => s.sourceEngine === 'google');
  const hasAlibabaSources = message.webSearchSources?.some((s: any) => s.sourceEngine === 'alibaba');

  return (
    <div
      className={`contain-message group w-full py-5 px-3 sm:px-6 md:px-8 transition-colors ${
        isUser ? 'bg-transparent' : 'bg-zinc-900/20 dark:bg-zinc-900/20 border-y border-zinc-200/50 dark:border-zinc-800/40'
      }`}
    >
      <div className="max-w-3xl lg:max-w-4xl mx-auto flex gap-3 md:gap-4">
        {/* Role Avatar Badge */}
        <div className="shrink-0 mt-0.5">
          {isUser ? (
            <div className="w-6 h-6 rounded-md bg-[#141418] border border-[#222226] flex items-center justify-center text-[10px] font-mono font-medium text-white">
              U
            </div>
          ) : (
            <div className="w-6 h-6 rounded-md bg-[#ffffff] text-black flex items-center justify-center text-[10px] font-mono font-bold tracking-tight shadow-xs">
              KZ
            </div>
          )}
        </div>

        {/* Message Content Container */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Header row: Author + Timestamp + Lore Indicators */}
          <div className="flex items-center justify-between text-xs sm:text-[13px] font-mono text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                {isUser ? 'Usuario' : 'Kizuna-Zek'}
              </span>
              <span>·</span>
              <span className="text-zinc-500 dark:text-zinc-400">{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

              {/* Clean model name label (no robot emoji) */}
              {!isUser && (message.modelName || message.modelId) && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center text-[10px] font-mono font-medium px-1.5 py-0.5 bg-zinc-100 dark:bg-[#121218] border border-zinc-300 dark:border-[#272736] text-zinc-800 dark:text-zinc-300 rounded-md">
                    {message.modelName || message.modelId}
                  </span>
                </>
              )}

              {/* Show loaded lore badge if recorded on assistant turn */}
              {!isUser && message.selectedLoreIds && message.selectedLoreIds.length > 0 && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-[#101014] border border-[#1f1f23] text-neutral-400 rounded-md">
                  <BookOpen size={9} />
                  <span>{message.selectedLoreIds.length} Lore Refs</span>
                </span>
              )}
            </div>


          </div>

          {/* Attached Media/Files if any */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 pb-2">
              {message.attachments.map((att) => {
                const isImg = Boolean(
                  att.dataUrl &&
                    att.dataUrl.trim() &&
                    (att.type?.startsWith('image/') ||
                      att.fileType === 'image' ||
                      att.dataUrl.startsWith('data:image/'))
                );

                if (isImg && att.dataUrl) {
                  return (
                    <div
                      key={att.id || att.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenImageLightbox) onOpenImageLightbox(att);
                      }}
                      className="group/img relative w-24 h-24 sm:w-28 sm:h-28 rounded-md border border-[#1f1f23] overflow-hidden bg-black cursor-pointer hover:border-[#38383e] transition-all"
                    >
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye size={14} className="text-white" />
                      </div>
                    </div>
                  );
                } else {
                  const formatSize = (s?: number | string) => {
                    if (!s) return null;
                    if (typeof s === 'string') return s;
                    if (s < 1024) return `${s} B`;
                    if (s < 1024 * 1024) return `${(s / 1024).toFixed(1)} KB`;
                    return `${(s / (1024 * 1024)).toFixed(1)} MB`;
                  };
                  const sizeLabel = formatSize(att.size);

                  // Robust document content resolution fallback for Vercel & persistent sessions
                  let resolvedContent = att.content || att.textContent || '';
                  if (!resolvedContent && availableLoreFiles && availableLoreFiles.length > 0) {
                    const foundLore = availableLoreFiles.find(
                      (f) =>
                        f.filename === att.name ||
                        f.title === att.name ||
                        f.filename?.toLowerCase() === att.name.toLowerCase()
                    );
                    if (foundLore && foundLore.content) {
                      resolvedContent = foundLore.content;
                    }
                  }
                  if (!resolvedContent && message.content.includes('[DOCUMENTO ADJUNTO:')) {
                    const docPos = message.content.indexOf('[DOCUMENTO ADJUNTO:');
                    if (docPos !== -1) {
                      const tail = message.content.slice(docPos);
                      resolvedContent = tail.replace(/^\[DOCUMENTO ADJUNTO:[^\]]*\]\s*/i, '').trim();
                    }
                  }

                  return (
                    <div
                      key={att.id || att.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenDocumentPreview) {
                          onOpenDocumentPreview({
                            title: att.name,
                            content: resolvedContent,
                            fileType: att.fileType || 'txt',
                            dataUrl: att.dataUrl || '',
                            size: att.size,
                            wordCount: att.wordCount,
                            estimatedTokens: att.estimatedTokens,
                            sourceLabel: 'Mensaje de Chat',
                          });
                        }
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 bg-[#0c0c10] border border-[#22222a] hover:border-[#383844] rounded-lg text-xs text-white max-w-sm transition-all shadow-sm group/file cursor-pointer hover:bg-[#121218] pointer-events-auto"
                      title="Click para ver vista previa en Kizuna-Zek"
                    >
                      <div className="w-8 h-8 rounded-md bg-[#16161f] border border-[#282834] flex items-center justify-center shrink-0 text-neutral-300">
                        <FileText size={16} className="text-[#d4d4d8] group-hover/file:text-white transition-colors" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-[12px] text-white">
                            {att.name}
                          </span>
                          {sizeLabel && (
                            <span className="text-[10px] font-mono text-[#71717a] shrink-0">
                              ({sizeLabel})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-amber-400/90 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.2 rounded">
                            <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                            Documento adjunto en contexto
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          )}

          {/* Inline Edit Form for User Message */}
          {isEditing ? (
            <div className="space-y-2 pt-1">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={4}
                className="w-full bg-[#0e0e12] border border-[#38383e] rounded-md p-2.5 text-xs text-white font-mono focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setIsEditing(false)}
                  className="px-2.5 py-1 text-xs text-[#a1a1aa] hover:text-white"
                >
                  Cancelar
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-xs font-semibold text-black bg-white hover:bg-[#e4e4e7] rounded-md cursor-pointer"
                >
                  Guardar y Reenviar
                </motion.button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Indicador en vivo durante el pensamiento */}
              {!isUser && message.isStreaming && isThinking && (
                <div className="flex items-center gap-2 flex-wrap py-1.5 text-xs text-zinc-400 font-mono animate-pulse select-none">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,210,255,0.8)]" />
                  <span>{getThinkingStatusText(editContent || '', Boolean(message.webSearch || message.webSearchSources?.length), thinkingSeconds)}</span>
                  {(message.modelName || message.modelId) && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">
                      <span>✦</span>
                      <span>{message.modelName || message.modelId}</span>
                    </span>
                  )}
                  <span className="text-zinc-500 font-mono text-[11px]">({thinkingSeconds.toFixed(1)}s)</span>
                </div>
              )}

              {/* Streaming Skeleton Loader when initialized before first text chunk */}
              {!prose.trim() && !isUser && message.isStreaming && !hasThoughts && !isThinking && (
                <div className="space-y-2 py-2 max-w-md animate-pulse">
                  <div className="h-3.5 bg-neutral-800 rounded-md w-3/4" />
                  <div className="h-3.5 bg-neutral-800/80 rounded-md w-full" />
                  <div className="h-3.5 bg-neutral-800/60 rounded-md w-1/2" />
                </div>
              )}

              {/* Main Prose Content */}
              {(prose || isUser) && (
                <div className="prose-noir select-text">
                  {formattedContentMemo}

                  {/* Gently glowing silver/white cursor dot tracking active token streaming */}
                  {message.isStreaming && (
                    <span className="inline-flex items-center gap-2 ml-1.5 align-middle">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></span>
                      </span>
                      {message.tokensPerSecond !== undefined && message.tokensPerSecond > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-300 bg-zinc-900/90 border border-zinc-700/60 px-1.5 py-0.5 rounded select-none">
                          <Gauge size={10} className="text-emerald-400 shrink-0" />
                          <span>{message.tokensPerSecond.toFixed(1)} tok/s</span>
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )}

              {/* Botón para continuar respuesta únicamente cuando el modelo se corta o no termina su respuesta */}
              {isResponseCutOff && (onContinueMessage || onQuickPrompt) && (
                <div className="mt-3 pt-1 flex items-center gap-2 flex-wrap animate-noir-enter">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (onContinueMessage) {
                        onContinueMessage(message.id);
                      } else if (onQuickPrompt) {
                        const words = prose.trim().split(/\s+/);
                        const lastWords = words.slice(-25).join(' ');
                        onQuickPrompt(`Continúa exactamente desde este punto sin repetir lo anterior: "${lastWords}"`);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 active:scale-95 transition-all cursor-pointer shadow-sm"
                    title="Continuar redactando en este mismo mensaje desde la última palabra donde se cortó"
                  >
                    <Zap size={14} className="text-amber-400 shrink-0" />
                    <span>Continuar respuesta</span>
                  </motion.button>
                  <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                    Respuesta incompleta · retoma sin repetir
                  </span>
                </div>
              )}

              {/* Bitácora de razonamiento colapsable al pie de la respuesta */}
              {!isUser && !message.isStreaming && (hasThoughts || Boolean(message.autoRouteReason)) && (
                <div className="mt-4 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/40">
                  <button
                    type="button"
                    onClick={() => setIsThoughtOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 flex-wrap px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-sans font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-900/60 hover:bg-zinc-200 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer select-none"
                  >
                    <Brain size={13} className="text-amber-400 shrink-0" />
                    <span>
                      {isThoughtOpen
                        ? 'Ocultar pensamiento'
                        : `Pensado durante ${thinkingDuration.toFixed(1)}s`}
                    </span>
                    {(message.modelName || message.modelId) && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[11px] font-medium font-sans">
                        <Sparkles size={11} className="text-amber-400 shrink-0" />
                        <span>{message.modelName || message.modelId}</span>
                      </span>
                    )}
                    <ChevronDown
                      size={13}
                      className={`transition-transform duration-200 ${isThoughtOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isThoughtOpen && (
                    <div
                      ref={thoughtContainerRef}
                      className="mt-2.5 p-4 rounded-2xl bg-zinc-100 dark:bg-[#151518] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-200 shadow-xl space-y-3.5 select-text font-sans"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/5 pb-2">
                        <span className="text-[12px] font-sans text-zinc-600 dark:text-zinc-400 font-semibold flex items-center gap-1.5">
                          <Brain size={13} className="text-amber-400" />
                          <span>Proceso de pensamiento · {message.modelName || message.modelId || 'Modelo Activo'}</span>
                        </span>
                        <span className="text-[11px] font-sans text-zinc-400 font-medium">{thinkingDuration.toFixed(1)}s</span>
                      </div>

                      {/* Línea de tiempo vertical con las etapas */}
                      <div className="relative pl-3.5 border-l-2 border-amber-500/40 dark:border-amber-500/30 space-y-3 my-1 font-sans">
                        {message.autoRouteReason && (
                          <div className="space-y-1 pb-2 border-b border-zinc-200/60 dark:border-white/5">
                            <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-sans">
                              <Sparkles size={12} className="text-amber-400 shrink-0" />
                              <span>Enrutador Inteligente (Modo Automático)</span>
                            </h4>
                            <p className="text-[13px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans font-normal">
                              {message.autoRouteReason}
                            </p>
                          </div>
                        )}
                        <div className="space-y-1">
                          <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 font-sans">
                            Razonamiento Interno del Modelo
                          </h4>
                          {thoughtContent ? (
                            <p className="text-[13.5px] sm:text-[14px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans font-normal whitespace-pre-wrap max-h-72 overflow-y-auto">
                              {thoughtContent}
                            </p>
                          ) : (
                            <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 italic font-sans font-normal">
                              Respuesta directa: El modelo respondió en modo instantáneo sin requerir cadena de pensamiento extendida.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Cierre limpio de verificación */}
                      <div className="pt-2 border-t border-zinc-200 dark:border-white/5 flex items-center justify-between text-[11px] font-sans text-zinc-600 dark:text-zinc-400">
                        <div className="flex items-center gap-1.5 text-amber-500 font-semibold">
                          <Check size={12} className="text-amber-400" />
                          <span>Respuesta completada</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-500 font-semibold">
                          <Sparkles size={11} className="text-amber-400" />
                          <span>{message.modelName || message.modelId || "Qwen 3.8 Max 0902"}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Collapsible Accordion for Web Search Sources */}
          {!isUser && message.webSearchSources && message.webSearchSources.length > 0 && (
            <div className="mt-3 bg-zinc-100 dark:bg-[#151518] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-200 rounded-2xl overflow-hidden select-none">
              <button
                type="button"
                onClick={() => setIsSourcesOpen(!isSourcesOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-mono text-zinc-700 dark:text-neutral-400 hover:text-zinc-900 dark:hover:text-white transition-colors bg-zinc-200/50 dark:bg-[#0e0e12]/80 hover:bg-zinc-200/80 dark:hover:bg-[#141419]"
              >
                <div className="flex items-center gap-2">
                  <Globe size={13} className="text-orange-500" />
                  <span className="font-semibold text-zinc-900 dark:text-white">
                    {hasGoogleSources 
                      ? 'Google Search' 
                      : hasAlibabaSources 
                      ? 'Quark Search (Alibaba)' 
                      : 'Tavily Search'}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-500 border-orange-500/20">
                    {message.webSearchSources.length} enlaces
                  </span>
                </div>
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 text-zinc-500 dark:text-neutral-400 ${
                    isSourcesOpen ? 'rotate-180 text-zinc-900 dark:text-white' : ''
                  }`}
                />
              </button>

              <AnimatePresence>
                {isSourcesOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="px-3.5 py-2.5 space-y-2 border-t border-zinc-200 dark:border-[#18181f] bg-zinc-50 dark:bg-[#07070a]"
                  >
                    {message.webSearchSources.map((src, sIdx) => (
                      <div key={sIdx} className="flex flex-col gap-0.5 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono text-zinc-500 dark:text-neutral-400">[{sIdx + 1}]</span>
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-zinc-800 dark:text-zinc-200 hover:text-orange-500 dark:hover:text-orange-400 hover:underline truncate inline-flex items-center gap-1 max-w-[90%]"
                          >
                            <span className="truncate">{src.title}</span>
                            <ExternalLink size={10} className="shrink-0 text-zinc-400" />
                          </a>
                        </div>
                        {src.snippet && (
                          <p className="text-[11px] text-zinc-600 dark:text-neutral-400 line-clamp-2 pl-4">
                            {src.snippet}
                          </p>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Error Notice with Actionable Recovery */}
          {message.error && (
            <div className="p-3.5 bg-red-950/20 dark:bg-red-950/30 border border-red-900/40 dark:border-red-900/50 rounded-xl text-xs space-y-3 animate-noir-enter select-text">
              <div className="flex items-start gap-2.5 text-red-600 dark:text-red-300">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-500" />
                <span className="leading-relaxed font-normal">{message.error}</span>
              </div>

              {(message.error.includes('429') || message.error.includes('cuota') || message.error.includes('límite') || message.error.includes('Gemini')) && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-red-900/20 dark:border-red-900/40">
                  {onSwitchProvider && (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchProvider('custom', 'moonshotai/kimi-k3');
                        if (onRegenerate) onRegenerate();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 dark:bg-emerald-500/20 hover:bg-emerald-700 dark:hover:bg-emerald-500/30 text-white dark:text-emerald-300 border border-emerald-600/60 dark:border-emerald-500/40 text-[11px] font-semibold transition-all cursor-pointer active:scale-95 shadow-sm"
                    >
                      <Zap size={12} className="text-white dark:text-emerald-400" />
                      <span>Cambiar a NVIDIA NIM (Kimi K3) y reintentar</span>
                    </button>
                  )}
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 text-[11px] font-medium transition-all cursor-pointer active:scale-95"
                    >
                      <span>Configurar Clave API en Ajustes ⚙️</span>
                    </button>
                  )}
                  {onRegenerate && (
                    <button
                      type="button"
                      onClick={onRegenerate}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-850 hover:bg-zinc-200 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 text-[11px] font-medium transition-all cursor-pointer active:scale-95"
                    >
                      <RotateCcw size={11} />
                      <span>Reintentar</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!isUser && !message.isStreaming && dynamicFollowUps.length > 0 && (
            <div className="mt-4 pt-3 border-t border-zinc-800/60 animate-noir-enter">
              <p className="text-xs font-semibold text-zinc-400 mb-2 tracking-wide">
                Follow up
              </p>
              <div className="flex flex-col gap-1.5">
                {dynamicFollowUps.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectFollowUp?.(item)}
                    className="flex items-start gap-2.5 text-left text-sm text-zinc-700 dark:text-zinc-200 hover:text-amber-600 dark:hover:text-amber-400 transition-colors group w-full py-2 cursor-pointer font-medium min-h-[44px]"
                  >
                    <span className="text-amber-500 font-mono text-sm shrink-0 mt-0.5">↳</span>
                    <span className="leading-snug text-sm sm:text-[14.5px]">{item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isPersonaWizardChat && !isUser && cleanDisplayContent && !message.isStreaming && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => onApplyGlobalPersona?.(cleanDisplayContent)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer shadow-md"
              >
                <Check size={13} className="text-emerald-400" /> ✅ Aplicar a Directiva Global
              </button>
            </div>
          )}

          {/* Discreet, Elegant Bottom Bar (Actions + Faint Text Metrics) */}
          {!message.isStreaming && !isEditing && (
            <div className="mt-3 pt-2 border-t border-zinc-800/40 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-zinc-500">
              {/* Left: Action icon buttons */}
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap opacity-95 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
                {message.variants && message.variants.length > 1 && (
                  <div className="flex items-center gap-0.5 font-mono text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 shrink-0 shadow-xs mr-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVariant?.(message.id, (message.activeVariantIndex ?? 0) - 1);
                      }}
                      disabled={(message.activeVariantIndex ?? 0) <= 0}
                      className="p-1 min-h-[28px] min-w-[28px] flex items-center justify-center hover:text-white disabled:opacity-25 transition-colors cursor-pointer active:scale-90"
                      title="Versión anterior"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="text-[10px] text-zinc-300 font-semibold px-1 min-w-[24px] text-center">
                      {(message.activeVariantIndex ?? 0) + 1}/{message.variants.length}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVariant?.(message.id, (message.activeVariantIndex ?? 0) + 1);
                      }}
                      disabled={(message.activeVariantIndex ?? 0) >= message.variants.length - 1}
                      className="p-1 min-h-[28px] min-w-[28px] flex items-center justify-center hover:text-white disabled:opacity-25 transition-colors cursor-pointer active:scale-90"
                      title="Versión siguiente"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Copiar"
                >
                  <Copy size={13} />
                </button>

                {/* TTS Speaker Read Aloud Button */}
                <button
                  type="button"
                  onClick={handleToggleSpeak}
                  disabled={isLoadingTts}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono select-none ${
                    isSpeaking
                      ? 'text-amber-400 bg-amber-500/15 border border-amber-500/30 animate-pulse'
                      : isLoadingTts
                      ? 'text-zinc-300 bg-white/5 border border-white/10'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                  title={
                    isLoadingTts
                      ? 'Sintetizando voz con Qwen-Audio 3.1...'
                      : isSpeaking
                      ? 'Detener lectura de escena'
                      : 'Narrar en voz alta (Qwen-Audio 3.1 TTS)'
                  }
                >
                  {isLoadingTts ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-zinc-300 shrink-0" />
                      <span className="hidden sm:inline text-[10px] text-zinc-300">Sintetizando</span>
                    </>
                  ) : isSpeaking ? (
                    <>
                      <VolumeX size={13} className="text-amber-400 shrink-0" />
                      <span className="hidden sm:inline text-[10px] text-amber-300">Detener</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={13} className="shrink-0" />
                      <span className="hidden sm:inline text-[10px]">Escuchar</span>
                    </>
                  )}
                </button>

                {/* Scene Illustration (Wanx / Imagen -> La Cajita) */}
                {!isUser && onIllustrateScene && (
                  <button
                    type="button"
                    onClick={handleIllustrate}
                    disabled={isIllustrating}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono select-none disabled:opacity-50"
                    title="Ilustrar escena con Wanx y guardar en La Cajita"
                  >
                    {isIllustrating ? (
                      <>
                        <Loader2 size={13} className="animate-spin text-amber-400 shrink-0" />
                        <span className="hidden sm:inline text-[10px] text-amber-300">Ilustrando...</span>
                      </>
                    ) : (
                      <>
                        <Palette size={13} className="shrink-0" />
                        <span className="hidden sm:inline text-[10px]">Ilustrar</span>
                      </>
                    )}
                  </button>
                )}

                {/* Google Drive Save as Doc */}
                {!isUser && (
                  <button
                    type="button"
                    onClick={handleSaveToDrive}
                    disabled={isSavingToDrive}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono select-none disabled:opacity-50 ${
                      isDriveSaved
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : 'text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10'
                    }`}
                    title={isDriveSaved ? "Guardado en Google Drive" : "Guardar en Google Drive como Google Doc"}
                  >
                    {isSavingToDrive ? (
                      <>
                        <Loader2 size={13} className="animate-spin text-blue-400 shrink-0" />
                        <span className="hidden sm:inline text-[10px] text-blue-300">Guardando...</span>
                      </>
                    ) : isDriveSaved ? (
                      <>
                        <Check size={13} className="text-emerald-400 shrink-0" />
                        <span className="hidden sm:inline text-[10px] text-emerald-400">En Drive</span>
                      </>
                    ) : (
                      <>
                        <CloudUpload size={13} className="shrink-0" />
                        <span className="hidden sm:inline text-[10px]">Drive</span>
                      </>
                    )}
                  </button>
                )}

                {onAuditScene && (
                  <button
                    type="button"
                    onClick={() => onAuditScene(message.content)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Auditar"
                  >
                    <ShieldAlert size={13} />
                  </button>
                )}
                {!isUser && isLastAssistant && onRegenerate && (
                  <button
                    type="button"
                    onClick={onRegenerate}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Regenerar"
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
                {onDeleteMessage && (
                  showDeleteConfirm ? (
                    <div className="flex items-center gap-1.5 bg-red-950/80 border border-red-800 px-2 py-0.5 rounded-lg text-xs animate-noir-enter select-none">
                      <span className="text-[11px] text-red-300 font-medium">¿Eliminar?</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete();
                        }}
                        className="text-[11px] text-red-400 hover:text-red-200 font-bold px-2.5 py-1 min-h-[32px] flex items-center justify-center cursor-pointer select-none active:scale-95"
                      >
                        Sí
                      </button>
                      <span className="text-zinc-600 font-mono">/</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(false);
                        }}
                        className="text-[11px] text-zinc-400 hover:text-white font-bold px-2.5 py-1 min-h-[32px] flex items-center justify-center cursor-pointer select-none active:scale-95"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm(true);
                      }}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Eliminar mensaje"
                    >
                      <Trash2 size={13} />
                    </button>
                  )
                )}

              </div>

              {/* Right: Word & Token counters (single clean line, never wrap) */}
              {!isUser && (wordCount > 0 || message.estimatedTokens || message.ttftSeconds !== undefined || message.tokensPerSecond !== undefined || (message.cachedTokens !== undefined && message.cachedTokens > 0)) && (
                <div className="text-[10px] font-mono text-zinc-500 whitespace-nowrap ml-auto shrink-0 flex items-center gap-1.5 pt-0.5">
                  {message.cachedTokens !== undefined && message.cachedTokens > 0 && (
                    <>
                      <span className="text-emerald-400 font-mono inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20" title={`Implicit Cache Hit en Alibaba Cloud (-90% costo en ${message.cachedTokens} tokens)`}>
                        <Zap size={10} className="shrink-0" />
                        <span>Caché: {(message.cachedTokens / 1000).toFixed(1)}k (-90%)</span>
                      </span>
                      <span>·</span>
                    </>
                  )}
                  {message.ttftSeconds !== undefined && (
                    <>
                      <span className="text-amber-400/90 font-mono inline-flex items-center gap-1" title="Time To First Token (Latencia hasta el 1er token)">
                        <Timer size={10} className="shrink-0" />
                        <span>TTFT: {message.ttftSeconds.toFixed(1)}s</span>
                      </span>
                      <span>·</span>
                    </>
                  )}
                  {message.tokensPerSecond !== undefined && message.tokensPerSecond > 0 && (
                    <>
                      <span
                        className={`font-mono inline-flex items-center gap-1 ${
                          message.tokensPerSecond >= 45
                            ? 'text-emerald-400/95'
                            : message.tokensPerSecond >= 20
                            ? 'text-cyan-400/90'
                            : 'text-amber-400/90'
                        }`}
                        title={`Velocidad real de escritura: ${message.tokensPerSecond.toFixed(1)} tokens/seg (cronometrado desde el 1er al último token)`}
                      >
                        <Gauge size={10} className="shrink-0" />
                        <span>{message.tokensPerSecond.toFixed(1)} tok/s</span>
                      </span>
                      <span>·</span>
                    </>
                  )}
                  {wordCount > 0 && <span>{wordCount} palabras</span>}
                  {wordCount > 0 && <span>·</span>}
                  <span>{message.estimatedTokens || wordCount * 2} tokens</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* APK / Play Store Style Download Progress Modal */}
      <AnimatePresence>
        {apkDownloadModal?.active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none"
          >
            <div className="w-full max-w-sm bg-[#09090b] border border-[#272730] rounded-3xl p-5 shadow-2xl space-y-4 text-white relative overflow-hidden">
              {/* Glow Header Accent */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500" />

              {/* APK / App Icon Header */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-cyan-500/20 to-blue-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 shadow-inner">
                  <CloudUpload className={`w-6 h-6 ${apkDownloadModal.isComplete ? 'text-emerald-400' : 'text-cyan-400 animate-bounce'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold">
                      APK / Drive Package
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white truncate mt-0.5">
                    {apkDownloadModal.fileName || 'Kizuna_Manuscrito.docx'}
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-400 truncate">
                    {apkDownloadModal.step}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-zinc-400">
                    {apkDownloadModal.isComplete ? 'Descargado y Guardado' : 'Procesando paquete...'}
                  </span>
                  <span className="font-bold text-emerald-400">{apkDownloadModal.progress}%</span>
                </div>
                <div className="h-2.5 w-full bg-[#181820] rounded-full overflow-hidden border border-[#262632] p-0.5">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-blue-500 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: `${apkDownloadModal.progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Sub-status Indicator */}
              <div className="p-3 rounded-2xl bg-[#121218] border border-[#1f1f2a] text-xs font-mono space-y-1">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Sparkles size={13} className="text-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-amber-300">Filtro DeepSeek V4.1 Flash activo</span>
                </div>
                <p className="text-[10px] text-zinc-400 leading-tight pl-5">
                  Extrayendo prosa y estructura limpia sin saludos ni comentarios meta.
                </p>
              </div>

              {/* Action Footer */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {apkDownloadModal.webViewLink && (
                  <a
                    href={apkDownloadModal.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 active:scale-95 transition-all shadow-md cursor-pointer"
                  >
                    <ExternalLink size={13} />
                    <span>Abrir en Drive</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setApkDownloadModal(null)}
                  className="px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-medium bg-[#1a1a22] hover:bg-[#252530] text-zinc-300 active:scale-95 transition-colors cursor-pointer"
                >
                  {apkDownloadModal.isComplete ? 'Listo' : 'Cerrar'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.thinking === nextProps.message.thinking &&
    prevProps.message.error === nextProps.message.error &&
    prevProps.message.reasoningDurationSeconds === nextProps.message.reasoningDurationSeconds &&
    prevProps.message.ttftSeconds === nextProps.message.ttftSeconds &&
    prevProps.message.cachedTokens === nextProps.message.cachedTokens &&
    prevProps.message.tokensPerSecond === nextProps.message.tokensPerSecond &&
    prevProps.message.tokensPerSecond === nextProps.message.tokensPerSecond &&
    prevProps.message.estimatedTokens === nextProps.message.estimatedTokens &&
    prevProps.message.isStreaming === nextProps.message.isStreaming &&
    prevProps.message.isInterrupted === nextProps.message.isInterrupted &&
    prevProps.isInterrupted === nextProps.isInterrupted &&
    prevProps.isLastAssistant === nextProps.isLastAssistant &&
    prevProps.message.activeVariantIndex === nextProps.message.activeVariantIndex &&
    (prevProps.message.variants?.length || 0) === (nextProps.message.variants?.length || 0) &&
    (prevProps.message.attachments?.length || 0) === (nextProps.message.attachments?.length || 0) &&
    (prevProps.availableLoreFiles?.length || 0) === (nextProps.availableLoreFiles?.length || 0)
  );
});
