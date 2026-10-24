import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  ArrowUp,
  Square,
  X,
  Image as ImageIcon,
  FileText,
  Brain,
  BookOpen,
  FileUp,
  Loader2,
  Mic,
  MicOff,
  Camera,
  FolderOpen,
  ChevronDown,
  Sparkles,
  Smile,
  HelpCircle,
  Zap,
  CloudDownload,
} from 'lucide-react';
import { GrimoireBookButton } from './GrimoireBookButton';
import { Attachment } from '../types';
import { detectSmartMemory } from '../utils/memoryDetector';
import { parseDocumentFile } from '../utils/documentParser';
import { compressImage } from '../utils/imageCompressor';

const DRAFT_KEY = 'kizuna_zek_draft_message';

interface ChatInputProps {
  onSendMessage: (content: string, attachments: Attachment[], webSearch?: boolean) => void;
  onStopGeneration?: () => void;
  isStreaming: boolean;
  activeLoreFilesCount: number;
  totalLoreFilesCount: number;
  onOpenLoreSelector?: () => void;
  onOpenMediaGallery?: () => void;
  onOpenTextImportModal?: () => void;
  onOpenImageLightbox?: (attachment: Attachment) => void;
  onAttachSessionMedia?: (attachment: Attachment) => void;
  onAddLoreAttachment?: (attachment: Attachment) => void;
  onAttachDocumentToContext?: (doc: {
    title: string;
    filename: string;
    content: string;
    fileType: string;
    size: number;
  }) => void;
  isVisionCapable?: boolean;
  isWebSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  reasoningMode?: 'off' | 'light' | 'deep';
  onCycleReasoningMode?: () => void;
  onShowWarningToast?: (msg: string) => void;
  onFocusInput?: () => void;
  onInspectUI?: () => void;
  onOpenKZShortcuts?: () => void;
  onRegisterAttach?: (handler: (att: Attachment) => void) => void;
  onOpenGoogleDrive?: () => void;
  onStartVoiceCall?: () => void;
  onOpenDocumentPreview?: (item: any) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onStopGeneration,
  isStreaming,
  activeLoreFilesCount,
  totalLoreFilesCount,
  onOpenLoreSelector,
  onOpenMediaGallery,
  onOpenTextImportModal,
  onOpenImageLightbox,
  onAttachSessionMedia,
  onAddLoreAttachment,
  onAttachDocumentToContext,
  isVisionCapable = true,
  isWebSearchEnabled = false,
  onToggleWebSearch,
  reasoningMode = 'deep',
  onCycleReasoningMode,
  onShowWarningToast,
  onFocusInput,
  onInspectUI,
  onOpenKZShortcuts,
  onRegisterAttach,
  onOpenGoogleDrive,
  onStartVoiceCall,
  onOpenDocumentPreview,
}) => {
  useEffect(() => {
    if (onRegisterAttach) {
      onRegisterAttach((att: Attachment) => {
        setAttachments((prev) => [...prev, att]);
      });
    }
  }, [onRegisterAttach]);
  // Restore persistent draft on mount
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) || '';
    } catch {
      return '';
    }
  });

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [selectedCadence, setSelectedCadence] = useState<'rio' | 'denso' | 'ruptura' | null>(null);
  const [activeInfoMode, setActiveInfoMode] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribingAsr, setIsTranscribingAsr] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isWebSearchActive, setIsWebSearchActive] = useState(isWebSearchEnabled);
  const [isToneChipsOpen, setIsToneChipsOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  const handleInsertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart || text.length;
      const end = textarea.selectionEnd || text.length;
      const nextText = text.slice(0, start) + emoji + text.slice(end);
      setText(nextText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 15);
    } else {
      setText((prev) => prev + emoji);
    }
  };

  useEffect(() => {
    setIsWebSearchActive(isWebSearchEnabled);
  }, [isWebSearchEnabled]);

  const handleToggleWebSearch = () => {
    const nextState = !isWebSearchActive;
    setIsWebSearchActive(nextState);
    if (onToggleWebSearch) onToggleWebSearch();
    onShowWarningToast?.(
      nextState ? '🌐 Búsqueda web ACTIVADA' : '🌐 Búsqueda web DESACTIVADA'
    );
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const backupSpeechTextRef = useRef<string>('');

  // Expanded state if focused, has text, has attachments, or upload menu is open
  const isExpanded = isFocused || text.trim().length > 0 || attachments.length > 0 || isMenuOpen;

  const cadenceDirectives = {
    rio: 'Prosa de oraciones cortas, foco en micro-foley, regulación somática y silencios.',
    denso: 'Diálogo elíptico, dobles intenciones y motivaciones ocultas.',
    ruptura: 'Aceleración dramática, lenguaje visceral y colapso de Catarsis.',
  };

  const cadenceInfoDetails: Record<string, { title: string; desc: string }> = {
    'ritmo-frio': {
      title: 'Ritmo Frío',
      desc: 'Prosa concisa y quirúrgica. Enfoque sensorial en micro-foley, regulación somática, pausas y silencios compartidos. Suprime el melodrama.',
    },
    'subtexto-denso': {
      title: 'Subtexto Denso',
      desc: 'Diálogos elípticos y dobles intenciones. Lo crucial ocurre entre líneas: cálculos fríos, motivaciones veladas y omisiones deliberadas.',
    },
    'ruptura': {
      title: 'Ruptura / Tensión',
      desc: 'Aceleración dramática y visceral. Frases cortadas, sobrecarga somática y desborde de Catarsis.',
    },
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const toggleListening = async () => {
    if (isTranscribingAsr) return;

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      } else if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      setIsListening(false);
      return;
    }

    let alibabaApiKey = '';
    let asrEngine: 'qwen-audio-3.1-asr-flash' | 'browser' = 'qwen-audio-3.1-asr-flash';
    try {
      const rawSettings = localStorage.getItem('kizuna_zek_v2_settings');
      const parsed = rawSettings ? JSON.parse(rawSettings) : {};
      alibabaApiKey = (parsed.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim();
      if (parsed.asrEngine === 'browser') {
        asrEngine = 'browser';
      }
    } catch {}

    const useQwenAsr = Boolean(alibabaApiKey) && asrEngine === 'qwen-audio-3.1-asr-flash' && typeof MediaRecorder !== 'undefined';
    const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

    // 1. Qwen-Audio-3.1-ASR-Flash Intelligent Dictation Path
    if (useQwenAsr && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];
        backupSpeechTextRef.current = '';

        const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
        const recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            audioChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          const mimeType = recorder.mimeType || 'audio/webm';
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
          }
          const chunks = audioChunksRef.current;
          audioChunksRef.current = [];
          if (!chunks.length) return;

          const audioBlob = new Blob(chunks, { type: mimeType });
          if (audioBlob.size < 400) return;

          setIsTranscribingAsr(true);
          try {
            const base64Audio = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result || ''));
              reader.onerror = reject;
              reader.readAsDataURL(audioBlob);
            });

            const res = await fetch('/api/alibaba/asr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Audio,
                mimeType,
                alibabaApiKey,
                language: 'es',
              }),
            });

            if (res.ok) {
              const data = await res.json();
              if (data.text && String(data.text).trim()) {
                const cleanChunk = String(data.text).trim();
                setText((prev) => {
                  const cleanPrev = prev ? prev.trim() : '';
                  return cleanPrev ? `${cleanPrev} ${cleanChunk}` : cleanChunk;
                });
                return;
              }
            }

            // Fallback to parallel browser transcript if ASR endpoint returned fallback
            if (backupSpeechTextRef.current.trim()) {
              const fallbackChunk = backupSpeechTextRef.current.trim();
              setText((prev) => {
                const cleanPrev = prev ? prev.trim() : '';
                return cleanPrev ? `${cleanPrev} ${fallbackChunk}` : fallbackChunk;
              });
            }
          } catch {
            if (backupSpeechTextRef.current.trim()) {
              const fallbackChunk = backupSpeechTextRef.current.trim();
              setText((prev) => {
                const cleanPrev = prev ? prev.trim() : '';
                return cleanPrev ? `${cleanPrev} ${fallbackChunk}` : fallbackChunk;
              });
            }
          } finally {
            setIsTranscribingAsr(false);
          }
        };

        // Optional silent background Web Speech backup in case offline
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          try {
            const backupRec = new SpeechRecognition();
            backupRec.continuous = true;
            backupRec.interimResults = false;
            backupRec.lang = 'es-ES';
            backupRec.onresult = (e: any) => {
              let chunk = '';
              for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i]?.[0]) chunk += e.results[i][0].transcript + ' ';
              }
              if (chunk.trim()) {
                backupSpeechTextRef.current = `${backupSpeechTextRef.current} ${chunk.trim()}`.trim();
              }
            };
            backupRec.start();
            recognitionRef.current = backupRec;
          } catch {}
        }

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsListening(true);
        return;
      } catch (err: any) {
        setIsListening(false);
        const errStr = String(err?.message || err?.name || err || '');
        if (isInsideIframe && (errStr.includes('NotAllowedError') || errStr.includes('Permission'))) {
          onShowWarningToast?.('El dictado por voz no está permitido en este marco incorporado. Abre la app en una nueva pestaña para usar el micrófono.');
          return;
        }
      }
    }

    // 2. Native Browser Web Speech API Fallback
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const msg = 'Tu navegador no soporta el reconocimiento de voz nativo (Web Speech API).';
      if (onShowWarningToast) onShowWarningToast(msg);
      else alert(msg);
      return;
    }

    try {
      if (isInsideIframe && !navigator.mediaDevices?.getUserMedia) {
        throw new Error('IFRAME_BLOCKED');
      }

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } else {
        throw new Error('NOT_SUPPORTED');
      }

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'es-ES';

      rec.onresult = (e: any) => {
        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i] && e.results[i][0]) {
            transcript += e.results[i][0].transcript;
          }
        }
        const cleanChunk = transcript.trim();
        if (cleanChunk) {
          setText((prev) => {
            const cleanPrev = prev ? prev.trim() : '';
            if (!cleanPrev) return cleanChunk;
            return `${cleanPrev} ${cleanChunk}`;
          });
        }
      };

      rec.onerror = (e: any) => {
        setIsListening(false);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          if (isInsideIframe) {
            const warningMsg =
              'El dictado por voz no está permitido en este marco incorporado. Abre la app en una nueva pestaña para usar el micrófono.';
            if (onShowWarningToast) onShowWarningToast(warningMsg);
            else alert(warningMsg);
          } else {
            const msg = 'Permiso de micrófono denegado en el navegador.';
            if (onShowWarningToast) onShowWarningToast(msg);
            else alert(msg);
          }
        }
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
    } catch (err: any) {
      setIsListening(false);

      const errStr = String(err?.message || err?.name || err || '');
      const isBlockedByIframe =
        errStr.includes('IFRAME_BLOCKED') ||
        errStr.includes('NotAllowedError') ||
        errStr.includes('SecurityError') ||
        errStr.includes('Permission denied') ||
        errStr.includes('Permission dismissed') ||
        errStr.includes('iframe');

      if (isBlockedByIframe && isInsideIframe) {
        const warningMsg =
          'El dictado por voz no está permitido en este marco incorporado. Abre la app en una nueva pestaña para usar el micrófono.';
        if (onShowWarningToast) onShowWarningToast(warningMsg);
        else alert(warningMsg);
        return;
      }

      const msg = 'No se pudo acceder al micrófono. Por favor verifica los permisos de tu navegador.';
      if (onShowWarningToast) onShowWarningToast(msg);
      else alert(msg);
    }
  };

  const [detectedMemoryFact, setDetectedMemoryFact] = useState<string | null>(null);

  // Automatically save draft and evaluate smart memory on typing pause (debounced 300ms to save mobile CPU/battery)
  useEffect(() => {
    if (!text) {
      setDetectedMemoryFact(null);
    }
    const timer = setTimeout(() => {
      try {
        if (text) {
          localStorage.setItem(DRAFT_KEY, text);
          setDetectedMemoryFact(detectSmartMemory(text));
        } else {
          localStorage.removeItem(DRAFT_KEY);
          setDetectedMemoryFact(null);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  // Close upload menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-resize textarea smoothly based on content without stiff jump on focus/menu open
  useEffect(() => {
    if (textareaRef.current) {
      if (!text) {
        textareaRef.current.style.height = '38px';
        return;
      }
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 38), 160)}px`;
    }
  }, [text]);

  const [isDragOver, setIsDragOver] = useState(false);

  // Process selected or dropped files (images, .txt, .md, .json)
  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsParsing(true);

    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name);

        if (isImage) {
          if (!isVisionCapable) {
            onShowWarningToast?.(
              'Aviso: El modelo seleccionado es solo texto. Seleccioná uno con la etiqueta 👁️ Visión para que pueda ver la imagen.'
            );
          }

          const currentImages = attachments.filter((a) => a.fileType === 'image');
          if (currentImages.length >= 10) {
            onShowWarningToast?.('Límite alcanzado: máximo 10 fotos simultáneas.');
            continue;
          }

          setIsCompressing(true);
          try {
            let dataUrl = '';
            try {
              const compressed = await compressImage(file, 1440, 0.82);
              dataUrl = compressed.dataUrl;
            } catch {
              dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
            }

            const newAtt: Attachment = {
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              type: file.type || 'image/jpeg',
              fileType: 'image',
              size: file.size,
              dataUrl,
              parseStatus: 'ready',
              timestamp: Date.now(),
            };
            setAttachments((prev) => [...prev, newAtt]);
            if (onAttachSessionMedia) {
              onAttachSessionMedia(newAtt);
            }
          } catch (err: any) {
            console.error('Image processing error:', err);
            onShowWarningToast?.(`Error al procesar la imagen ${file.name}`);
          } finally {
            setIsCompressing(false);
          }
        } else {
          // Text files (.txt, .md, .json) or Word / PDF
          const isTextFile = /\.(txt|md|markdown|json)$/i.test(file.name) || file.type.startsWith('text/') || file.type === 'application/json';
          let textContent = '';
          let detectedType: any = file.name.endsWith('.md') ? 'md' : file.name.endsWith('.json') ? 'json' : 'txt';

          if (isTextFile) {
            // Read file contents using FileReader
            try {
              textContent = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string) || '');
                reader.onerror = reject;
                reader.readAsText(file, 'UTF-8');
              });
            } catch (readErr: any) {
              console.error('FileReader error:', readErr);
              onShowWarningToast?.(`Error al leer archivo ${file.name}`);
              continue;
            }
          } else {
            // Other document formats (.docx, .pdf, .doc)
            try {
              const parsed = await parseDocumentFile(file);
              textContent = parsed.text;
              detectedType = parsed.fileType;
            } catch (parseErr: any) {
              console.error('Document parsing error:', parseErr);
              onShowWarningToast?.(`Error al procesar ${file.name}: ${parseErr.message || 'Formato no soportado'}`);
              continue;
            }
          }

          if (textContent) {
            const title = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            const cleanTitle = title.charAt(0).toUpperCase() + title.slice(1);

            // Automatically attach it to the active session's context ("Docs en Contexto" counter updates to 1)
            if (onAttachDocumentToContext) {
              onAttachDocumentToContext({
                title: cleanTitle,
                filename: file.name,
                content: textContent,
                fileType: detectedType,
                size: file.size,
              });
            }

            // Also attach preview badge above input bar
            const newAtt: Attachment = {
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              type: file.type || 'text/plain',
              fileType: detectedType,
              size: file.size,
              content: textContent,
              textContent,
              estimatedTokens: Math.max(1, Math.round(textContent.length / 3.8)),
              parseStatus: 'ready',
              timestamp: Date.now(),
            };
            setAttachments((prev) => [...prev, newAtt]);
          }
        }
      }
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUnifiedFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = () => {
    if ((!text.trim() && attachments.length === 0) || isStreaming) return;

    const hasImage = attachments.some(
      (a) => a.type?.startsWith('image/') || a.fileType === 'image'
    );
    if (hasImage && !isVisionCapable) {
      onShowWarningToast?.(
        'Aviso: El modelo seleccionado es solo texto. Seleccioná uno con la etiqueta 👁️ Visión para que pueda ver la imagen.'
      );
    }

    let finalContent = text.trim();
    if (selectedCadence && cadenceDirectives[selectedCadence]) {
      finalContent = `[DIRECTIVA DE CADENCIA NARRATIVA: ${cadenceDirectives[selectedCadence]}]\n\n${finalContent}`;
    }

    onSendMessage(finalContent, attachments, isWebSearchActive);
    setText('');
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setAttachments([]);
    setIsFocused(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
    }
  };

  const handleVrFocus = () => {
    setIsFocused(true);
    onFocusInput?.();
    setTimeout(() => onFocusInput?.(), 120);
    if (typeof window !== 'undefined' && /OculusBrowser|Quest/i.test(navigator.userAgent)) {
      setTimeout(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setIsMenuOpen(false);
      setIsToneChipsOpen(false);
      setIsEmojiPickerOpen(false);
      return;
    }

    const isMobile =
      typeof window !== 'undefined' &&
      (('ontouchstart' in window && window.innerWidth < 768) ||
        (navigator.maxTouchPoints > 0 && window.innerWidth < 768));

    if (e.key === 'Enter') {
      if (e.shiftKey) {
        return;
      }
      if (isMobile) {
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  const renderPlusButton = () => {
    return (
      <div className="relative">
        <motion.button
          whileTap={{ scale: 0.92 }}
          type="button"
          onClick={() => {
            setIsMenuOpen(!isMenuOpen);
            setIsToneChipsOpen(false);
            setIsEmojiPickerOpen(false);
          }}
          className={`w-9 h-9 min-w-[36px] min-h-[36px] rounded-full transition-colors duration-200 shrink-0 flex items-center justify-center cursor-pointer select-none ${
            isMenuOpen
              ? 'bg-white text-black shadow-lg'
              : 'bg-[#1e1e28] text-zinc-200 hover:text-white hover:bg-[#292938]'
          }`}
          title="Opciones de adjuntos e imágenes (+)"
          aria-label="Adjuntar archivo o imagen"
        >
          <motion.span
            animate={{ rotate: isMenuOpen ? 45 : 0, scale: isMenuOpen ? 1.05 : 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            className="flex items-center justify-center"
          >
            <Plus size={18} strokeWidth={2.3} />
          </motion.span>
        </motion.button>

        {/* ChatGPT-Style Vertical Floating Menu with Real Spring Physics & Glassmorphism */}
        <AnimatePresence>
          {isMenuOpen && (
            <>
              {/* Invisible Click-Outside Backdrop */}
              <div
                className="fixed inset-0 z-40 bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                }}
              />

              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: 18, scale: 0.84 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 430, damping: 28, mass: 0.75 }}
                className="absolute bottom-full left-0 mb-3 z-50 w-[256px] max-w-[88vw] p-2 rounded-[28px] bg-[#16161e]/95 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.75)] backdrop-blur-2xl select-none origin-bottom-left"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-1">
                  {/* 1. Fotos / Imágenes */}
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28, delay: 0.01 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      imageInputRef.current?.click();
                    }}
                    className="flex items-center gap-3.5 px-2.5 py-2 min-h-[44px] rounded-2xl hover:bg-white/[0.08] transition-colors text-left group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0 text-zinc-100 group-hover:bg-white/[0.14] group-hover:scale-105 transition-all">
                      <ImageIcon size={17} />
                    </div>
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-medium text-zinc-100 group-hover:text-white truncate">Fotos</span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">PNG / JPG</span>
                    </div>
                  </motion.button>

                  {/* 2. Archivos / Documentos */}
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28, delay: 0.025 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      docInputRef.current?.click();
                    }}
                    className="flex items-center gap-3.5 px-2.5 py-2 min-h-[44px] rounded-2xl hover:bg-white/[0.08] transition-colors text-left group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0 text-zinc-100 group-hover:bg-white/[0.14] group-hover:scale-105 transition-all">
                      <FileText size={17} />
                    </div>
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-medium text-zinc-100 group-hover:text-white truncate">Archivos</span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">PDF / DOCX</span>
                    </div>
                  </motion.button>

                  {/* 3. Manuscrito / Docs */}
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28, delay: 0.04 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (onOpenTextImportModal) onOpenTextImportModal();
                    }}
                    className="flex items-center gap-3.5 px-2.5 py-2 min-h-[44px] rounded-2xl hover:bg-white/[0.08] transition-colors text-left group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0 text-zinc-100 group-hover:bg-white/[0.14] group-hover:scale-105 transition-all">
                      <FileUp size={17} />
                    </div>
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-medium text-zinc-100 group-hover:text-white truncate">Manuscrito</span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">Texto largo</span>
                    </div>
                  </motion.button>

                  {/* 4. Google Drive */}
                  {onOpenGoogleDrive && (
                    <motion.button
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 28, delay: 0.055 }}
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenGoogleDrive();
                      }}
                      className="flex items-center gap-3.5 px-2.5 py-2 min-h-[44px] rounded-2xl hover:bg-white/[0.08] transition-colors text-left group cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0 text-zinc-100 group-hover:bg-white/[0.14] group-hover:scale-105 transition-all">
                        <CloudDownload size={17} />
                      </div>
                      <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                        <span className="text-[14.5px] font-medium text-zinc-100 group-hover:text-white truncate">Google Drive</span>
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">Capítulos</span>
                      </div>
                    </motion.button>
                  )}

                  {/* 5. Cadencia Narrativa */}
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28, delay: 0.07 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsToneChipsOpen(true);
                    }}
                    className={`flex items-center gap-3.5 px-2.5 py-2 min-h-[44px] rounded-2xl transition-colors text-left group cursor-pointer ${
                      selectedCadence
                        ? 'bg-white/[0.12] text-white'
                        : 'hover:bg-white/[0.08] text-zinc-100'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0 text-zinc-100 group-hover:bg-white/[0.14] group-hover:scale-105 transition-all">
                      <Sparkles size={17} />
                    </div>
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-medium group-hover:text-white truncate">Cadencia</span>
                      <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                        {selectedCadence ? `• ${selectedCadence}` : 'Ritmo'}
                      </span>
                    </div>
                  </motion.button>

                  {/* 6. Emojis */}
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28, delay: 0.085 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsEmojiPickerOpen(true);
                    }}
                    className="flex items-center gap-3.5 px-2.5 py-2 min-h-[44px] rounded-2xl hover:bg-white/[0.08] transition-colors text-left group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0 text-zinc-100 group-hover:bg-white/[0.14] group-hover:scale-105 transition-all">
                      <Smile size={17} />
                    </div>
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-medium text-zinc-100 group-hover:text-white truncate">Emojis</span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">Reacciones</span>
                    </div>
                  </motion.button>

                  {/* 7. Inspeccionar UI / Cámara */}
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 28, delay: 0.1 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      if (onInspectUI) {
                        onInspectUI();
                      } else if (onOpenMediaGallery) {
                        onOpenMediaGallery();
                      }
                    }}
                    className="flex items-center gap-3.5 px-2.5 py-2 min-h-[44px] rounded-2xl hover:bg-white/[0.08] transition-colors text-left group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0 text-zinc-100 group-hover:bg-white/[0.14] group-hover:scale-105 transition-all">
                      <Camera size={17} />
                    </div>
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                      <span className="text-[14.5px] font-medium text-zinc-100 group-hover:text-white truncate">Inspeccionar UI</span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">Visión</span>
                    </div>
                  </motion.button>

                  {/* 8. Abrir Galería de Sesión si está disponible */}
                  {(onOpenMediaGallery || onAttachSessionMedia) && (
                    <motion.button
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 28, delay: 0.115 }}
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        if (onOpenMediaGallery) onOpenMediaGallery();
                      }}
                      className="flex items-center gap-3.5 px-2.5 py-2 min-h-[44px] rounded-2xl hover:bg-white/[0.08] transition-colors text-left group cursor-pointer border-t border-white/5 mt-0.5 pt-2"
                    >
                      <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.08] flex items-center justify-center shrink-0 text-zinc-100 group-hover:bg-white/[0.14] group-hover:scale-105 transition-all">
                        <FolderOpen size={17} />
                      </div>
                      <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                        <span className="text-[14.5px] font-medium text-zinc-100 group-hover:text-white truncate">Abrir Galería</span>
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">Sesión</span>
                      </div>
                    </motion.button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderBookSearchButton = () => (
    <div className="flex items-center justify-center shrink-0">
      <GrimoireBookButton
        isActive={isWebSearchActive}
        isFetching={isStreaming && isWebSearchActive}
        onClick={handleToggleWebSearch}
        className="p-1.5 sm:p-2 min-w-[32px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] shrink-0"
        title={`Búsqueda Web en Vivo (Grimorio): ${
          isWebSearchActive ? 'ACTIVADA' : 'DESACTIVADA'
        }`}
      />
    </div>
  );

  const renderMicButton = () => (
    <motion.button
      whileTap={{ scale: 0.95 }}
      type="button"
      onClick={toggleListening}
      disabled={isTranscribingAsr}
      className={`p-2 min-w-[44px] min-h-[44px] rounded-xl transition-all shrink-0 flex items-center justify-center cursor-pointer select-none active:scale-95 ${
        isListening
          ? 'bg-red-500/20 text-red-400 animate-pulse border border-red-500/30'
          : isTranscribingAsr
          ? 'bg-white/10 text-zinc-200 border border-white/15'
          : 'text-zinc-400 hover:text-white hover:bg-white/5'
      }`}
      title={
        isTranscribingAsr
          ? 'Transcribiendo con Qwen-Audio-3.1-ASR-Flash...'
          : isListening
          ? 'Escuchando... Toca para finalizar y transcribir'
          : 'Dictado por voz (Qwen-Audio-3.1-ASR-Flash)'
      }
      aria-label="Dictado por voz"
    >
      {isTranscribingAsr ? (
        <Loader2 size={18} className="animate-spin text-zinc-200" />
      ) : isListening ? (
        <MicOff size={18} strokeWidth={2.2} />
      ) : (
        <Mic size={18} strokeWidth={2.2} />
      )}
    </motion.button>
  );

  const renderSendButton = () => (
    <div className="shrink-0 flex items-center justify-center">
      {isStreaming ? (
        <motion.button
          whileTap={{ scale: 0.92 }}
          type="button"
          onClick={onStopGeneration}
          className="p-2 min-w-[36px] min-h-[36px] rounded-full bg-white text-black flex items-center justify-center hover:bg-[#e4e4e7] transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
          title="Detener generación"
          aria-label="Detener generación"
        >
          <Square size={13} fill="black" />
        </motion.button>
      ) : (
        <motion.button
          whileTap={{ scale: 0.92 }}
          type="button"
          onClick={handleSend}
          disabled={(!text.trim() && attachments.length === 0) || isParsing}
          className="p-2 min-w-[36px] min-h-[36px] rounded-full bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm active:scale-95 shrink-0 flex items-center justify-center"
          title="Enviar mensaje (Enter)"
          aria-label="Enviar mensaje"
        >
          <ArrowUp size={16} strokeWidth={2.5} />
        </motion.button>
      )}
    </div>
  );

  const renderAttachmentsPreview = () => (
    attachments.length > 0 ? (
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10 overflow-x-auto smooth-scroll">
        {attachments.filter((a) => a.fileType === 'image').length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1c1c22] border border-[#2e2e38] rounded-md text-[10px] font-mono text-[#d4d4d8] shrink-0">
            <ImageIcon size={11} className="text-white" />
            <span className="font-semibold text-white">
              {attachments.filter((a) => a.fileType === 'image').length}/10 fotos
            </span>
          </div>
        )}

        {(isCompressing || isParsing) && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1c1c22] border border-[#2e2e38] rounded-md text-[10px] font-mono text-white shrink-0">
            <Loader2 size={11} className="animate-spin text-white" />
            <span>Procesando archivo...</span>
          </div>
        )}

        {attachments.map((att) => {
          const isImage = (att.fileType === 'image' || Boolean(att.type?.startsWith('image/'))) && Boolean(att.dataUrl || (att as any).url);

          const handleThumbnailClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (isImage && onOpenImageLightbox && (att.dataUrl || (att as any).url)) {
              onOpenImageLightbox({
                id: `preview_${Date.now()}`,
                name: att.name || 'Vista previa',
                type: att.type || 'image/jpeg',
                dataUrl: att.dataUrl || (att as any).url || '',
                size: typeof att.size === 'number' ? att.size : 0,
                timestamp: Date.now(),
              });
            } else if (onOpenDocumentPreview) {
              onOpenDocumentPreview({
                title: att.name,
                content: att.content || (att as any).textContent || '',
                fileType: att.fileType || 'txt',
                dataUrl: att.dataUrl || '',
                size: att.size,
                wordCount: att.wordCount,
                estimatedTokens: att.estimatedTokens,
                sourceLabel: 'Adjunto de Chat',
              });
            }
          };

          return (
            <div
              key={att.id}
              onClick={handleThumbnailClick}
              className="group/att relative flex items-center gap-2 bg-[#141419] border border-white/15 hover:border-amber-400/40 rounded-full px-3 py-1.5 shrink-0 max-w-xs transition-all shadow-sm cursor-pointer hover:bg-[#1a1a24] active:scale-95"
              title="Click para ver vista previa en Kizuna-Zek"
            >
              {isImage && att.dataUrl && att.dataUrl.trim() ? (
                <img
                  src={att.dataUrl}
                  alt={att.name}
                  className="w-6 h-6 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="text-amber-400 shrink-0">📄</span>
              )}

              <div className="min-w-0 flex-1 flex items-center gap-1.5 text-xs">
                <span className="text-white font-mono truncate font-medium max-w-[140px]">
                  {att.name}
                </span>
                <span className="text-[#71717a] font-mono text-[10px]">
                  • {typeof att.size === 'number' ? formatFileSize(att.size) : att.size || ''}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAttachment(att.id);
                }}
                className="p-1.5 text-xs text-[#71717a] hover:text-red-400 transition-colors cursor-pointer ml-1 font-mono font-medium flex items-center gap-0.5 select-none active:scale-95"
                title="Quitar archivo"
              >
                (✕ Quitar)
              </button>
            </div>
          );
        })}
      </div>
    ) : null
  );

  const isReasoningDeep = reasoningMode === 'deep';
  const isReasoningLight = reasoningMode === 'light';
  const isReasoningActive = isReasoningDeep || isReasoningLight;

  const renderHourglassButton = () => {
    if (!onCycleReasoningMode) return null;

    return (
      <button
        type="button"
        onClick={onCycleReasoningMode}
        className={`p-1.5 sm:p-2 min-w-[32px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] rounded-xl transition-all shrink-0 flex items-center justify-center cursor-pointer active:scale-95 select-none ${
          isReasoningDeep
            ? 'text-orange-500 bg-orange-500/10 border border-orange-500/30'
            : isReasoningLight
              ? 'text-amber-400 bg-amber-500/10 border border-amber-500/30'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'
        }`}
        title={
          isReasoningDeep
            ? 'Pensar más: PROFUNDO (CoT exhaustivo) • Toca para desactivar'
            : isReasoningLight
              ? 'Pensar más: EQUILIBRADO (~3s CoT ágil) • Toca para activar modo profundo'
              : 'Pensar más: DESACTIVADO (0s • Respuesta directa) • Toca para activar'
        }
        aria-label="Alternar modo Pensar más con reloj de arena"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 ${isReasoningActive ? 'animate-hourglass-flip' : ''} ${isStreaming && isReasoningActive ? 'hourglass-streaming' : ''}`}
        >
          {/* Marco exterior del reloj */}
          <path
            d="M6 3H18M6 21H18M7.5 3V6.5C7.5 8.985 9.515 11 12 11C14.485 11 16.5 8.985 16.5 6.5V3M7.5 21V17.5C7.5 15.015 9.515 13 12 13C14.485 13 16.5 15.015 16.5 17.5V21"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Bulbo superior de arena */}
          <path
            d="M9 5.5H15C15 7.5 13.5 9 12 9C10.5 9 9 7.5 9 5.5Z"
            fill="currentColor"
            className={isReasoningActive ? 'animate-sand-top' : ''}
          />
          {/* Hilo de arena fluyendo */}
          <line
            x1="12"
            y1="9.5"
            x2="12"
            y2="14.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeDasharray="1 1.5"
            className={isReasoningActive ? 'animate-sand-stream' : 'opacity-40'}
          />
          {/* Bulbo inferior de arena acumulándose */}
          <path
            d="M9 19.5H15C15 17.5 13.5 16 12 16C10.5 16 9 17.5 9 19.5Z"
            fill="currentColor"
            className={isReasoningActive ? 'animate-sand-bottom' : 'opacity-60'}
          />
        </svg>
      </button>
    );
  };

  const renderCadencePopover = () => (
    <AnimatePresence>
      {isToneChipsOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setIsToneChipsOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 430, damping: 28, mass: 0.75 }}
            className="absolute bottom-full left-0 mb-3 z-50 w-72 max-w-[min(300px,90vw)] origin-bottom-left bg-white/95 dark:bg-[#16161e]/95 border border-zinc-200 dark:border-white/[0.08] rounded-[24px] p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.65)] backdrop-blur-2xl text-zinc-900 dark:text-white space-y-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-[#1c1c24]">
              <span>Estilos de Cadencia</span>
              {selectedCadence ? (
                <button
                  type="button"
                  onClick={() => setSelectedCadence(null)}
                  className="text-amber-400 hover:underline cursor-pointer"
                >
                  Limpiar (Sin estilo)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsToneChipsOpen(false)}
                  className="hover:text-black dark:hover:text-white cursor-pointer"
                >
                  Cerrar
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {[
                {
                  id: 'rio',
                  label: '❄️ Ritmo Frío',
                  short: 'Prosa concisa, micro-foley y silencios',
                  detail: 'Oraciones cortas y pulso quirúrgico. Prioriza texturas táctiles, temperatura somática, respiración contenida y pausas compartidas. Elimina cualquier melodrama o exceso lírico.'
                },
                {
                  id: 'denso',
                  label: '📜 Subtexto Denso',
                  short: 'Diálogos elípticos y dobles intenciones',
                  detail: 'Tensión psicológica entre líneas. Lo importante nunca se dice en voz alta: cálculos de miradas, intenciones veladas, omisiones deliberadas y máscaras conversacionales.'
                },
                {
                  id: 'ruptura',
                  label: '⚡ Ruptura',
                  short: 'Aceleración dramática y visceral',
                  detail: 'Pérdida de control y combate. Frases cortadas, lenguaje físico directo, sobrecarga bioenergética y colapso de Catarsis sin porcentajes numéricos.'
                },
              ].map((cad) => {
                const isSelected = selectedCadence === cad.id;
                const isInfoActive = activeInfoMode === cad.id;

                return (
                  <div
                    key={cad.id}
                    className={`rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-300'
                        : 'bg-zinc-50 dark:bg-[#16161f] border-zinc-200 dark:border-[#242430] text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCadence(isSelected ? null : (cad.id as any));
                          setIsToneChipsOpen(false);
                        }}
                        className="flex-1 text-left cursor-pointer"
                      >
                        <div className="font-semibold text-xs flex items-center gap-1.5">
                          <span>{cad.label}</span>
                          {isSelected && <span className="text-[10px] font-mono text-amber-500">✓ Activo</span>}
                        </div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                          {cad.short}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveInfoMode(isInfoActive ? null : cad.id);
                        }}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ml-1.5 ${
                          isInfoActive
                            ? 'bg-amber-500/20 text-amber-500'
                            : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-[#20202c]'
                        }`}
                        title="¿Qué hace este estilo?"
                        aria-label="Ver explicación del estilo"
                      >
                        <HelpCircle size={14} />
                      </button>
                    </div>

                    <AnimatePresence>
                      {isInfoActive && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="px-2.5 pb-2.5 pt-1 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 border-t border-zinc-200 dark:border-[#22222d] font-sans"
                        >
                          <p className="bg-white/80 dark:bg-black/30 p-2 rounded-lg border border-zinc-200 dark:border-white/5">
                            {cad.detail}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  const EMOJI_PALETTE = [
    { cat: 'Expresiones & Gestos', items: ['😌', '😊', '😉', '😂', '😭', '☕', '🧉', '✨', '🔥', '💡', '💧', '🌿'] },
    { cat: 'Escritura & Novela', items: ['🎭', '🗡️', '📖', '🖋️', '📜', '🥀', '🖤', '🪞', '⚡', '🩸', '⏳', '🏛️'] },
    { cat: 'Dinámicas & Pulso', items: ['✍️', '🔍', '⚙️', '🛡️', '🎯', '💭', '🤝', '👍', '👏', '👋', '👀', '💯'] },
  ];

  const renderEmojiPopover = () => (
    <AnimatePresence>
      {isEmojiPickerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setIsEmojiPickerOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 430, damping: 28, mass: 0.75 }}
            className="absolute bottom-full left-0 mb-3 z-50 w-72 max-w-[min(300px,90vw)] origin-bottom-left bg-white/95 dark:bg-[#16161e]/95 border border-zinc-200 dark:border-white/[0.08] rounded-[24px] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.65)] backdrop-blur-2xl text-zinc-900 dark:text-white space-y-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-[#1c1c24]">
              <span>Selector de Emojis</span>
              <button
                type="button"
                onClick={() => setIsEmojiPickerOpen(false)}
                className="hover:text-black dark:hover:text-white cursor-pointer"
              >
                Cerrar
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto smooth-scroll pr-1">
              {EMOJI_PALETTE.map((group) => (
                <div key={group.cat}>
                  <div className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 mb-1">
                    {group.cat}
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {group.items.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => handleInsertEmoji(em)}
                        className="h-8 w-8 flex items-center justify-center text-base rounded-lg hover:bg-zinc-100 dark:hover:bg-[#1f1f28] active:scale-90 transition-transform cursor-pointer"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-4 md:pb-6 select-none relative">
      {/* Hidden File Inputs for Noir Attachment Popover */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept=".txt,.md,.json,.docx,.pdf,image/*"
        onChange={handleUnifiedFileUpload}
        className="hidden"
      />
      <input
        type="file"
        ref={imageInputRef}
        multiple
        accept="image/*"
        onChange={handleUnifiedFileUpload}
        className="hidden"
      />
      <input
        type="file"
        ref={docInputRef}
        multiple
        accept=".txt,.md,.json,.docx,.pdf,.doc,text/plain"
        onChange={handleUnifiedFileUpload}
        className="hidden"
      />

      {/* Upper status ribbon - Memory indicator */}
      {!isFocused && !text.trim() && attachments.length === 0 && detectedMemoryFact && (
        <div className="flex items-center justify-between px-1 mb-1 text-[11px] font-mono">
          <div className="flex items-center gap-2">
            <motion.span
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-1.5 text-white bg-[#141418] border border-[#27272c] px-2 py-0.5 rounded-md"
            >
              <Brain size={11} className="text-white" />
              <span>Memoria detectada:</span>
              <span className="text-[#a1a1aa] truncate max-w-xs italic">
                "{detectedMemoryFact}"
              </span>
            </motion.span>
          </div>
        </div>
      )}

      {/* Kimi-Style Top Scrollable Action Pill Strip (Monochromatic Noir) */}
      <div className="flex items-center gap-2 overflow-x-auto smooth-scroll no-scrollbar pb-0.5 px-0.5 mb-1 select-none text-xs">
        {/* 1. Grimorio Web Search Pill */}
        <button
          type="button"
          onClick={handleToggleWebSearch}
          className={`kimi-pill-btn ${isWebSearchActive ? 'kimi-pill-active' : ''} flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all shrink-0 font-medium cursor-pointer active:scale-95 border ${
            isWebSearchActive
              ? 'bg-white/[0.1] border-white/30 text-white shadow-sm'
              : 'bg-[#111115] border-[#22222a] text-zinc-400 hover:text-zinc-200 hover:bg-[#17171e]'
          }`}
          title={`Búsqueda Web (Grimorio): ${isWebSearchActive ? 'ACTIVADA' : 'DESACTIVADA'}`}
        >
          <GrimoireBookButton
            asDiv
            isActive={isWebSearchActive}
            isFetching={isStreaming && isWebSearchActive}
            className="p-0 border-0 bg-transparent min-w-[18px] min-h-[18px] !p-0 pointer-events-none"
          />
          <span>Grimorio Web</span>
          {isWebSearchActive && <span className="text-[10px] text-zinc-300 font-mono">• ON</span>}
        </button>

        {/* 2. Pensar más (Reloj de Arena Animado) Pill */}
        {onCycleReasoningMode && (
          <button
            type="button"
            onClick={onCycleReasoningMode}
            className={`kimi-pill-btn ${isReasoningActive ? 'kimi-pill-active' : ''} flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all shrink-0 font-medium cursor-pointer active:scale-95 border ${
              isReasoningDeep
                ? 'bg-white/[0.1] border-white/30 text-white shadow-sm'
                : isReasoningLight
                  ? 'bg-white/[0.06] border-white/20 text-zinc-200'
                  : 'bg-[#111115] border-[#22222a] text-zinc-400 hover:text-zinc-200 hover:bg-[#17171e]'
            }`}
            title={
              isReasoningDeep
                ? 'Pensar más: PROFUNDO (Razonamiento CoT activo) • Toca para cambiar'
                : isReasoningLight
                  ? 'Pensar más: ÁGIL (Razonamiento ligero) • Toca para cambiar'
                  : 'Pensar más: DESACTIVADO (Respuesta directa) • Toca para activar'
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={`shrink-0 ${isReasoningActive ? 'animate-hourglass-flip' : ''} ${isStreaming && isReasoningActive ? 'hourglass-streaming' : ''}`}
            >
              {/* Marco exterior del reloj */}
              <path
                d="M6 3H18M6 21H18M7.5 3V6.5C7.5 8.985 9.515 11 12 11C14.485 11 16.5 8.985 16.5 6.5V3M7.5 21V17.5C7.5 15.015 9.515 13 12 13C14.485 13 16.5 15.015 16.5 17.5V21"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Bulbo superior de arena drenándose */}
              <path
                d="M9 5.5H15C15 7.5 13.5 9 12 9C10.5 9 9 7.5 9 5.5Z"
                fill="currentColor"
                className={isReasoningActive ? 'animate-sand-top' : 'opacity-80'}
              />
              {/* Hilo de arena cayendo en el centro */}
              <line
                x1="12"
                y1="9.5"
                x2="12"
                y2="15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray="1.2 1.8"
                className={isReasoningActive ? 'animate-sand-stream' : 'opacity-25'}
              />
              {/* Bulbo inferior de arena acumulándose */}
              <path
                d="M9 19.5H15C15 17.5 13.5 16 12 16C10.5 16 9 17.5 9 19.5Z"
                fill="currentColor"
                className={isReasoningActive ? 'animate-sand-bottom' : 'opacity-40'}
              />
            </svg>
            <span>Pensar más</span>
            {isReasoningDeep ? (
              <span className="text-[10px] text-zinc-300 font-mono">• ON</span>
            ) : isReasoningLight ? (
              <span className="text-[10px] text-zinc-400 font-mono">• Ágil</span>
            ) : null}
          </button>
        )}

        {/* 3. Cadencia Pill */}
        <button
          type="button"
          onClick={() => {
            setIsToneChipsOpen(!isToneChipsOpen);
            setIsMenuOpen(false);
            setIsEmojiPickerOpen(false);
          }}
          className={`kimi-pill-btn ${selectedCadence ? 'kimi-pill-active' : ''} flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all shrink-0 font-medium cursor-pointer active:scale-95 border ${
            selectedCadence
              ? 'bg-white/[0.1] border-white/30 text-white'
              : 'bg-[#111115] border-[#22222a] text-zinc-400 hover:text-zinc-200 hover:bg-[#17171e]'
          }`}
        >
          <Sparkles size={13} className={selectedCadence ? 'text-white' : 'text-zinc-400'} />
          <span>Cadencia</span>
          {selectedCadence && (
            <span className="text-[10px] text-zinc-300 font-mono uppercase">• {selectedCadence}</span>
          )}
        </button>

        {/* 4. Auditar Lore Pill */}
        {onInspectUI && (
          <button
            type="button"
            onClick={onInspectUI}
            className="kimi-pill-btn flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#111115] border border-[#22222a] text-zinc-400 hover:text-zinc-200 hover:bg-[#17171e] transition-all shrink-0 font-medium cursor-pointer active:scale-95"
          >
            <Camera size={13} className="text-zinc-400" />
            <span>Auditar Lore</span>
          </button>
        )}

        {/* 5. Docs / Lore en Contexto Pill (Unified Mobile & PC Quick Access) */}
        {onOpenLoreSelector && (
          <button
            type="button"
            onClick={onOpenLoreSelector}
            className={`kimi-pill-btn flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all shrink-0 font-medium cursor-pointer active:scale-95 border ${
              activeLoreFilesCount > 0
                ? 'bg-white/[0.08] border-white/25 text-white'
                : 'bg-[#111115] border-[#22222a] text-zinc-400 hover:text-zinc-200 hover:bg-[#17171e]'
            }`}
            title="Gestionar Documentos y Lore en Contexto"
          >
            <BookOpen size={13} className={activeLoreFilesCount > 0 ? 'text-amber-400' : 'text-zinc-400'} />
            <span>Docs</span>
            <span className="text-[10px] font-mono text-zinc-300">
              {activeLoreFilesCount}/{totalLoreFilesCount}
            </span>
          </button>
        )}

        {/* 6. La Cajita (Galería de Sesión) Pill */}
        {onOpenMediaGallery && (
          <button
            type="button"
            onClick={onOpenMediaGallery}
            className="kimi-pill-btn flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#111115] border border-[#22222a] text-zinc-400 hover:text-zinc-200 hover:bg-[#17171e] transition-all shrink-0 font-medium cursor-pointer active:scale-95"
            title="Abrir La Cajita (Galería Multimedia de Sesión)"
          >
            <ImageIcon size={13} className="text-zinc-400" />
            <span>Cajita</span>
          </button>
        )}

        {/* 7. Llamada Omni Live Pill */}
        {onStartVoiceCall && (
          <button
            type="button"
            onClick={onStartVoiceCall}
            className="kimi-pill-btn flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#111115] border border-[#22222a] text-zinc-400 hover:text-zinc-200 hover:bg-[#17171e] transition-all shrink-0 font-medium cursor-pointer active:scale-95"
            title="Iniciar Llamada de Voz en Vivo (Omni Live)"
          >
            <span className="text-xs">📞</span>
            <span>Llamada Omni</span>
          </button>
        )}
      </div>

      {/* Main Kimi-Style Single Round Pill Container */}
      <div
        ref={containerRef}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
            return;
          }
          const droppedText = e.dataTransfer.getData('text/plain');
          if (droppedText && droppedText.trim()) {
            if (droppedText.length > 300 && onAttachDocumentToContext) {
              const previewTitle =
                droppedText.trim().split('\n')[0].replace(/^[#*\s-]+/, '').slice(0, 32).trim() ||
                'Capítulo Arrastrado';
              onAttachDocumentToContext({
                title: previewTitle,
                filename: `${previewTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.md`,
                content: droppedText.trim(),
                fileType: 'md',
                size: new Blob([droppedText]).size,
              });
              onShowWarningToast?.('📄 Texto arrastrado añadido a Docs en Contexto');
            } else {
              setText((prev) => (prev ? `${prev}\n${droppedText}` : droppedText));
            }
          }
        }}
        onBlur={(e) => {
          if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
            setIsFocused(false);
          }
        }}
        className={`w-full max-w-3xl mx-auto chat-input-container-fluid relative rounded-[32px] px-2.5 py-1.5 sm:px-3.5 sm:py-2 flex flex-col justify-between gap-1 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] shadow-xl border ${
          isFocused || isMenuOpen
            ? 'input-noir-focused bg-[#14141d] border-white/25 shadow-[0_8px_30px_rgba(0,0,0,0.45)]'
            : 'bg-[#0d0d12] border-[#24242d]'
        } ${
          isDragOver ? 'ring-2 ring-white/30 bg-[#14141c]' : ''
        }`}
      >
        {/* Floating Popovers for Cadence & Emojis */}
        {renderCadencePopover()}
        {renderEmojiPopover()}

        <div className="w-full flex flex-col justify-between">
          {renderAttachmentsPreview()}

          {/* Fila única de entrada limpia estilo Kimi */}
          <div className="flex items-center gap-2 w-full">
            {/* Far Left: Botón (+) redondo en badge como Kimi */}
            <div className="shrink-0 flex items-center">
              {renderPlusButton()}
            </div>

            {/* Center: Áreas de texto super amplia sin interferencias */}
            <div className="flex-1 min-w-0 w-full flex items-center">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onInput={(e) => {
                  const target = e.currentTarget;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
                }}
                onKeyDown={handleKeyDown}
                onFocus={handleVrFocus}
                onBlur={() => setIsFocused(false)}
                placeholder={
                  isParsing
                    ? 'Extrayendo...'
                    : 'Pregunta cualquier cosa...'
                }
                rows={1}
                disabled={isParsing}
                className="w-full bg-transparent text-[16px] md:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 resize-none px-2 py-1.5 focus:outline-none min-h-[38px] max-h-40 leading-relaxed transition-[height,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-x-hidden overflow-y-auto"
              />
            </div>

            {/* Far Right: Botón contextual único estilo Kimi */}
            <div className="shrink-0 flex items-center">
              {isStreaming ? (
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  type="button"
                  onClick={onStopGeneration}
                  className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-full bg-white text-black flex items-center justify-center hover:bg-[#e4e4e7] transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                  title="Detener generación"
                >
                  <Square size={13} fill="black" />
                </motion.button>
              ) : text.trim() || attachments.length > 0 ? (
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  type="button"
                  onClick={handleSend}
                  disabled={isParsing}
                  className="w-9 h-9 min-w-[36px] min-h-[36px] rounded-full bg-white hover:bg-zinc-200 text-black transition-all cursor-pointer shadow-sm active:scale-95 shrink-0 flex items-center justify-center"
                  title="Enviar mensaje"
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  type="button"
                  onClick={toggleListening}
                  className={`w-9 h-9 min-w-[36px] min-h-[36px] rounded-full transition-all shrink-0 flex items-center justify-center cursor-pointer select-none active:scale-95 ${
                    isListening
                      ? 'bg-red-500/20 text-red-400 animate-pulse border border-red-500/30'
                      : 'bg-[#1e1e28] text-zinc-300 hover:text-white hover:bg-[#292938]'
                  }`}
                  title={isListening ? 'Escuchando... Toca para detener' : 'Dictado por voz'}
                >
                  {isListening ? <MicOff size={16} strokeWidth={2.2} /> : <Mic size={16} strokeWidth={2.2} />}
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
