import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Video,
  FolderOpen,
  ChevronDown,
  ChevronLeft,
  MoreVertical,
  RefreshCw,
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
import {
  compressImage,
  stitchVideoStoryboard,
  extractStoryboardFromVideoFile,
  VideoKeyframeCanvas,
} from '../utils/imageCompressor';

const DRAFT_KEY = 'kizuna_zek_draft_message';

const CADENCE_OPTIONS = [
  {
    id: 'rio',
    label: 'Ritmo Frío',
    short: 'Prosa concisa, micro-foley y silencios',
    detail: 'Oraciones cortas y pulso quirúrgico. Prioriza texturas táctiles, temperatura somática, respiración contenida y pausas compartidas.',
  },
  {
    id: 'denso',
    label: 'Subtexto Denso',
    short: 'Diálogos elípticos y dobles intenciones',
    detail: 'Tensión psicológica entre líneas. Lo importante nunca se dice en voz alta: cálculos de miradas y máscaras conversacionales.',
  },
  {
    id: 'ruptura',
    label: 'Ruptura',
    short: 'Aceleración dramática y visceral',
    detail: 'Pérdida de control y combate. Frases cortadas, lenguaje físico directo, sobrecarga bioenergética y colapso de Catarsis.',
  },
];

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
  activeModelKey?: string;
}

export const ChatInput: React.FC<ChatInputProps> = React.memo(({
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

  const handleSelectCadence = (cadenceId: 'rio' | 'denso' | 'ruptura' | null | string) => {
    setSelectedCadence((prev) => (prev === cadenceId ? null : (cadenceId as any)));
  };
  const [activeInfoMode, setActiveInfoMode] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribingAsr, setIsTranscribingAsr] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isWebSearchActive, setIsWebSearchActive] = useState(isWebSearchEnabled);
  const [isToneChipsOpen, setIsToneChipsOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isToolsPopoverOpen, setIsToolsPopoverOpen] = useState(false);
  const [isDriveToolEnabled, setIsDriveToolEnabled] = useState<boolean>(() => {
    return localStorage.getItem('kizuna_drive_tool_enabled') !== 'false';
  });

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
      nextState ? 'Búsqueda web ACTIVADA' : 'Búsqueda web DESACTIVADA'
    );
  };

  const handleCondenseCurrentText = () => {
    if (!text.trim()) {
      onShowWarningToast?.('Pega o escribe primero un texto o capítulo extenso en el cuadro.');
      return;
    }
    const raw = text.trim();
    const wordCount = raw.split(/\s+/).length;
    const estTokens = Math.round(wordCount * 1.35);

    const paragraphs = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const names = Array.from(new Set(raw.match(/\b[A-Z][a-z]{2,15}\b/g) || []))
      .filter(
        (n) =>
          ![
            'El',
            'La',
            'Los',
            'Las',
            'Un',
            'Una',
            'Que',
            'Pero',
            'Por',
            'Sin',
            'Con',
            'Este',
            'Esta',
            'Cuando',
            'Durante',
            'Entonces',
            'Para',
            'Como',
          ].includes(n)
      )
      .slice(0, 6);

    const firstPara = paragraphs[0] || raw.slice(0, 250);
    const lastPara = paragraphs[paragraphs.length - 1] || raw.slice(-250);

    const condensed = `[SÍNTESIS CANÓNICA DE CAPÍTULO - ESCUDO DE CUOTA ALIBABA]
• Manuscrito original: ${raw.length.toLocaleString()} caract. (~${estTokens.toLocaleString()} tokens) -> Sintetizado a Ficha Canónica (-85% Cuota).
• Personajes en escena: ${names.length ? names.join(', ') : 'No identificados'}.
• Contexto e inicio: ${firstPara.slice(0, 220)}...
• Clímax & Estado final: ${lastPara.slice(0, 250)}...

[INSTRUCCIÓN DE CONTINUIDAD CANÓNICA AL MODELO]: Mantén estricta coherencia con los hechos y estado final de esta síntesis de capítulo sin requerir el texto crudo extenso.`;

    setText(condensed);
    onShowWarningToast?.('🛡️ ¡Texto sintetizado a Ficha Canónica! Redujiste el consumo de cuota un ~85%.');
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const backupSpeechTextRef = useRef<string>('');
  const dictationActionRef = useRef<'insert' | 'send' | 'cancel'>('insert');
  const textBeforeDictationRef = useRef<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>(() => Array(34).fill(3));

  // ChatGPT-Style In-App Live Camera Viewfinder State & Refs (60 FPS Hardware Overlay + Video Storyboard)
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [isCameraSheetOpen, setIsCameraSheetOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraCaptureMode, setCameraCaptureMode] = useState<'photo' | 'video'>('photo');
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const videoFramesBufferRef = useRef<VideoKeyframeCanvas[]>([]);
  const videoRecordTimerRef = useRef<number | null>(null);
  const [isCameraOptionsOpen, setIsCameraOptionsOpen] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isShutterFlashing, setIsShutterFlashing] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorchSupport, setHasTorchSupport] = useState(false);

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

  // Stop the real-time waveform animation loop without destroying the warm MediaStream
  const stopWaveformLoop = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }
    setWaveformBars(Array(34).fill(3));
  };

  // Mute/pause warm microphone tracks instead of calling track.stop() so browser doesn't re-prompt permission
  const pauseWarmMicStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
  };

  // Reuse existing live MediaStream if available, or acquire once per session (16kHz Mono optimized for Qwen-ASR)
  const getOrAcquireMicStream = async (): Promise<MediaStream> => {
    const existing = mediaStreamRef.current;
    if (existing && existing.active) {
      const liveTracks = existing.getAudioTracks().filter((t) => t.readyState === 'live');
      if (liveTracks.length > 0) {
        liveTracks.forEach((t) => {
          t.enabled = true;
        });
        return existing;
      }
    }
    const freshStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    mediaStreamRef.current = freshStream;
    return freshStream;
  };

  // Start real-time 60fps acoustic waveform analyzer for ChatGPT-style voice bars
  const startWaveformLoop = async (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.7;
      analyserRef.current = analyser;

      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch {}
      }
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceNodeRef.current = source;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastTick = 0;

      const updateWaveform = (now: number) => {
        if (now - lastTick >= 42) {
          lastTick = now;
          analyser.getByteFrequencyData(dataArray);

          // Compute vocal band energy (bins 1..28 cover fundamental & harmonic voice frequencies)
          let sum = 0;
          const vocalBins = Math.min(28, dataArray.length);
          for (let i = 1; i < vocalBins; i++) {
            sum += dataArray[i];
          }
          const avg = sum / Math.max(1, vocalBins - 1);
          const normalized = Math.min(1, Math.max(0, (avg - 8) / 115));

          // Convert vocal level to bar height in px (3px resting dot -> up to 24px active peak)
          const jitter = normalized > 0.04 ? (Math.random() * 0.28 + 0.86) : 1;
          const nextHeight = normalized <= 0.03
            ? 3
            : Math.max(4, Math.min(24, Math.round((3 + Math.pow(normalized, 0.78) * 21) * jitter)));

          setWaveformBars((prev) => {
            const next = prev.slice(1);
            next.push(nextHeight);
            return next;
          });
        }
        rafIdRef.current = requestAnimationFrame(updateWaveform);
      };

      rafIdRef.current = requestAnimationFrame(updateWaveform);
    } catch {}
  };

  // Stop In-App Live Camera stream cleanly
  const stopLiveCameraStream = () => {
    if (videoRecordTimerRef.current !== null) {
      window.clearInterval(videoRecordTimerRef.current);
      videoRecordTimerRef.current = null;
    }
    videoFramesBufferRef.current = [];
    setIsRecordingVideo(false);
    setRecordingSeconds(0);
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
    setIsTorchOn(false);
    setHasTorchSupport(false);
  };

  const closeLiveCameraSheet = () => {
    stopLiveCameraStream();
    setIsCameraOptionsOpen(false);
    setIsCameraSheetOpen(false);
  };

  const openLiveCameraSheet = async (preferredMode: 'environment' | 'user' = cameraFacingMode) => {
    setIsMenuOpen(false);
    setIsToneChipsOpen(false);
    setIsEmojiPickerOpen(false);
    setIsCameraOptionsOpen(false);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      cameraInputRef.current?.click();
      return;
    }

    setIsCameraSheetOpen(true);
    setIsCameraReady(false);
    stopLiveCameraStream();

    try {
      let stream: MediaStream;
      try {
        // Request 720p @ 30-60fps hardware preview stream to avoid Android Camera2 15fps Still-Capture lag on S24 FE / Redmi A5
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: preferredMode },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 60, min: 30 },
          },
          audio: false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: preferredMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      cameraStreamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof (videoTrack as any).getCapabilities === 'function') {
        try {
          const caps = (videoTrack as any).getCapabilities();
          setHasTorchSupport(Boolean(caps && caps.torch));
          // Enable continuous hardware autofocus if supported
          if (caps && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
          }
        } catch {
          setHasTorchSupport(false);
        }
      }

      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play().catch(() => {});
        setIsCameraReady(true);
      }
    } catch (err) {
      console.warn('Live viewfinder unavailable, falling back to system camera:', err);
      closeLiveCameraSheet();
      cameraInputRef.current?.click();
    }
  };

  const handleFlipCamera = () => {
    if (isRecordingVideo) return;
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextMode);
    setIsCameraOptionsOpen(false);
    openLiveCameraSheet(nextMode);
  };

  const handleToggleTorch = async () => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const nextTorch = !isTorchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorch } as any],
      });
      setIsTorchOn(nextTorch);
      setIsCameraOptionsOpen(false);
    } catch {
      onShowWarningToast?.('La linterna no está disponible en esta lente.');
    }
  };

  // Helper to grab a lightweight frame canvas from the live video element
  const grabVideoFrameCanvas = (timeSec: number): VideoKeyframeCanvas | null => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const maxDim = 960;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
    const c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) return null;
    if (cameraFacingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    return { canvas: c, timeSec };
  };

  const finalizeVideoRecording = () => {
    if (videoRecordTimerRef.current !== null) {
      window.clearInterval(videoRecordTimerRef.current);
      videoRecordTimerRef.current = null;
    }
    setIsRecordingVideo(false);

    const captured = videoFramesBufferRef.current;
    videoFramesBufferRef.current = [];

    if (!captured.length) {
      closeLiveCameraSheet();
      return;
    }

    setIsShutterFlashing(true);
    setTimeout(() => setIsShutterFlashing(false), 120);

    requestAnimationFrame(() => {
      try {
        const storyboard = stitchVideoStoryboard(
          captured,
          `video_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`
        );
        const newAtt: Attachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: storyboard.name,
          type: 'image/jpeg',
          fileType: 'image',
          size: storyboard.size,
          dataUrl: storyboard.dataUrl,
          parseStatus: 'ready',
          timestamp: Date.now(),
        };
        setAttachments((prev) => [...prev, newAtt]);
        if (onAttachSessionMedia) {
          onAttachSessionMedia(newAtt);
        }
        onShowWarningToast?.(
          `🎥 Video convertido en Secuencia HD (4 cuadros • ${formatFileSize(storyboard.size)}) apta para cualquier IA con Visión`
        );
      } catch (err) {
        console.error('Error stitching video storyboard:', err);
        onShowWarningToast?.('No se pudo procesar la secuencia de video.');
      } finally {
        closeLiveCameraSheet();
      }
    });
  };

  const handleToggleVideoRecording = () => {
    if (isRecordingVideo) {
      // Grab final frame before finishing if we have < 4 frames
      if (videoFramesBufferRef.current.length < 4) {
        const extra = grabVideoFrameCanvas(recordingSeconds);
        if (extra) videoFramesBufferRef.current.push(extra);
      }
      finalizeVideoRecording();
      return;
    }

    const currentImages = attachments.filter((a) => a.fileType === 'image');
    if (currentImages.length >= 10) {
      onShowWarningToast?.('Límite alcanzado: máximo 10 adjuntos visuales.');
      closeLiveCameraSheet();
      return;
    }

    videoFramesBufferRef.current = [];
    setRecordingSeconds(0);
    setIsRecordingVideo(true);

    // Grab Frame #1 at 0.0s immediately
    const firstFrame = grabVideoFrameCanvas(0.0);
    if (firstFrame) {
      videoFramesBufferRef.current.push(firstFrame);
    }

    const startMs = performance.now();
    videoRecordTimerRef.current = window.setInterval(() => {
      const elapsedSec = (performance.now() - startMs) / 1000;
      setRecordingSeconds(elapsedSec);

      // Grab keyframes at ~1.4s, ~2.8s, and ~4.2s (total 4 frames across 4.2 seconds)
      const count = videoFramesBufferRef.current.length;
      if (
        (count === 1 && elapsedSec >= 1.35) ||
        (count === 2 && elapsedSec >= 2.75) ||
        (count === 3 && elapsedSec >= 4.1)
      ) {
        const kf = grabVideoFrameCanvas(elapsedSec);
        if (kf) videoFramesBufferRef.current.push(kf);
      }

      if (elapsedSec >= 4.25 || videoFramesBufferRef.current.length >= 4) {
        finalizeVideoRecording();
      }
    }, 150);
  };

  const handleCaptureLivePhoto = () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const currentImages = attachments.filter((a) => a.fileType === 'image');
    if (currentImages.length >= 10) {
      onShowWarningToast?.('Límite alcanzado: máximo 10 fotos simultáneas.');
      closeLiveCameraSheet();
      return;
    }

    if (!isVisionCapable) {
      onShowWarningToast?.(
        'Aviso: El modelo seleccionado es solo texto. Seleccioná uno con la etiqueta 👁️ Visión para que pueda ver la foto.'
      );
    }

    setIsShutterFlashing(true);
    setTimeout(() => setIsShutterFlashing(false), 120);

    // Run canvas encoding on next animation frame so the shutter animation never stutters on mobile
    requestAnimationFrame(() => {
      try {
        const rawW = video.videoWidth;
        const rawH = video.videoHeight;
        const maxSafeBytes = 750 * 1024; // < 750 KB safe ceiling for Alibaba Cloud DashScope

        const encodeFrame = (maxDim: number, q: number) => {
          let w = rawW;
          let h = rawH;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, w);
          canvas.height = Math.max(1, h);
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) return null;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          if (cameraFacingMode === 'user') {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(video, 0, 0, w, h);

          const dataUrl = canvas.toDataURL('image/jpeg', q);
          const base64Str = dataUrl.split(',')[1] || '';
          const size = Math.round((base64Str.length * 3) / 4);
          canvas.width = 1;
          canvas.height = 1;
          return { dataUrl, size };
        };

        let shot = encodeFrame(1600, 0.84);
        if (shot && shot.size > maxSafeBytes) {
          shot = encodeFrame(1440, 0.72);
        }

        if (shot) {
          const newAtt: Attachment = {
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: `captura_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.jpg`,
            type: 'image/jpeg',
            fileType: 'image',
            size: shot.size,
            dataUrl: shot.dataUrl,
            parseStatus: 'ready',
            timestamp: Date.now(),
          };
          setAttachments((prev) => [...prev, newAtt]);
          if (onAttachSessionMedia) {
            onAttachSessionMedia(newAtt);
          }
        }
      } catch (err) {
        console.error('Error capturing live frame:', err);
        onShowWarningToast?.('No se pudo capturar la foto.');
      } finally {
        closeLiveCameraSheet();
      }
    });
  };

  // Clean up warm stream, live camera & AudioContext only when ChatInput unmounts
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (videoRecordTimerRef.current !== null) {
        window.clearInterval(videoRecordTimerRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Helper to apply or immediately send transcribed text depending on which button stopped dictation
  const applyDictationResult = (transcribedChunk: string) => {
    const cleanChunk = transcribedChunk.trim();
    const action = dictationActionRef.current;

    if (action === 'cancel') {
      return;
    }

    const baseText = textBeforeDictationRef.current ? textBeforeDictationRef.current.trim() : '';
    const combinedText = cleanChunk
      ? baseText
        ? `${baseText} ${cleanChunk}`
        : cleanChunk
      : baseText;

    if (action === 'send') {
      if ((!combinedText && attachments.length === 0) || isStreaming) {
        setText(combinedText);
        return;
      }
      let finalContent = combinedText;
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
    } else {
      if (cleanChunk) {
        setText(combinedText);
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 30);
      }
    }
  };

  const stopActiveDictationWithAction = (action: 'insert' | 'send' | 'cancel') => {
    dictationActionRef.current = action;
    stopWaveformLoop();

    if (recognitionRef.current) {
      try {
        if (action === 'cancel') {
          recognitionRef.current.abort?.();
        } else {
          recognitionRef.current.stop();
        }
      } catch {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    } else {
      pauseWarmMicStream();
    }

    if (action === 'cancel') {
      audioChunksRef.current = [];
      backupSpeechTextRef.current = '';
      setText(textBeforeDictationRef.current);
    }

    setIsListening(false);
  };

  const toggleListening = async () => {
    if (isTranscribingAsr) return;

    if (isListening) {
      stopActiveDictationWithAction('insert');
      return;
    }

    dictationActionRef.current = 'insert';
    textBeforeDictationRef.current = text;

    let alibabaApiKey = '';
    let asrEngine: 'qwen-audio-3.1-asr-flash' | 'browser' = 'qwen-audio-3.1-asr-flash';
    try {
      const rawSettings = localStorage.getItem('kizuna_zek_settings_v2') || localStorage.getItem('kizuna_zek_v2_settings');
      const parsed = rawSettings ? JSON.parse(rawSettings) : {};
      alibabaApiKey = (parsed.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim();
      if (parsed.asrEngine === 'browser') {
        asrEngine = 'browser';
      }
    } catch {}

    const useQwenAsr = Boolean(alibabaApiKey) && asrEngine === 'qwen-audio-3.1-asr-flash' && typeof MediaRecorder !== 'undefined';
    const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

    // 1. Qwen-Audio-3.1-ASR-Flash Intelligent Dictation Path (Single persistent MediaStream, no dual SpeechRecognition prompt)
    if (useQwenAsr && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      try {
        // Pre-warm server -> Alibaba DashScope TCP/TLS connection while user speaks
        fetch('/api/alibaba/asr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warmup: true, alibabaApiKey }),
        }).catch(() => {});

        const stream = await getOrAcquireMicStream();
        await startWaveformLoop(stream);
        audioChunksRef.current = [];
        backupSpeechTextRef.current = '';

        const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
        // 24 kbps Opus mono voice encoding: ~5.5x smaller packet size (~3KB/s) with crystal-clear speech fidelity
        const recorder = preferredMime
          ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 24000 })
          : new MediaRecorder(stream, { audioBitsPerSecond: 24000 });

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            audioChunksRef.current.push(ev.data);
          }
        };

        recorder.onstop = async () => {
          const mimeType = recorder.mimeType || 'audio/webm';
          pauseWarmMicStream();
          stopWaveformLoop();

          const currentAction = dictationActionRef.current;
          const chunks = audioChunksRef.current;
          audioChunksRef.current = [];

          if (currentAction === 'cancel' || !chunks.length) {
            return;
          }

          const audioBlob = new Blob(chunks, { type: mimeType });
          if (audioBlob.size < 300) return;

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
                applyDictationResult(String(data.text).trim());
                return;
              }
            }
          } catch {} finally {
            setIsTranscribingAsr(false);
          }
        };

        // Flush Opus frames every 200ms while speaking so stop() has 0ms encoding lag
        recorder.start(200);
        mediaRecorderRef.current = recorder;
        setIsListening(true);
        return;
      } catch (err: any) {
        stopWaveformLoop();
        setIsListening(false);
        const errStr = String(err?.message || err?.name || err || '');
        if (isInsideIframe && (errStr.includes('NotAllowedError') || errStr.includes('Permission'))) {
          onShowWarningToast?.('El dictado por voz no está permitido en este marco incorporado. Abre la app en una nueva pestaña para usar el micrófono.');
          return;
        }
      }
    }

    // 2. Native Browser Web Speech API Fallback (with persistent warm stream for live waveform)
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const msg = 'Tu navegador no soporta el reconocimiento de voz nativo (Web Speech API).';
      if (onShowWarningToast) onShowWarningToast(msg);
      else alert(msg);
      return;
    }

    try {
      if (isInsideIframe && typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        throw new Error('IFRAME_BLOCKED');
      }

      if (typeof navigator.mediaDevices?.getUserMedia === 'function') {
        const stream = await getOrAcquireMicStream();
        await startWaveformLoop(stream);
      } else {
        throw new Error('NOT_SUPPORTED');
      }

      backupSpeechTextRef.current = '';
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'es-ES';

      rec.onresult = (e: any) => {
        let finalTranscript = '';
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i] && e.results[i][0]) {
            finalTranscript += e.results[i][0].transcript + ' ';
          }
        }
        backupSpeechTextRef.current = finalTranscript.trim();
      };

      rec.onerror = (e: any) => {
        stopWaveformLoop();
        pauseWarmMicStream();
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
        stopWaveformLoop();
        pauseWarmMicStream();
        setIsListening(false);
        if (dictationActionRef.current !== 'cancel' && backupSpeechTextRef.current.trim()) {
          applyDictationResult(backupSpeechTextRef.current.trim());
          backupSpeechTextRef.current = '';
        }
      };

      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
    } catch (err: any) {
      stopWaveformLoop();
      pauseWarmMicStream();
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
  const [isLaunchingSend, setIsLaunchingSend] = useState(false);

  // Process selected or dropped files (images, .txt, .md, .json)
  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsParsing(true);

    try {
      for (const file of Array.from(files)) {
        const isVideo =
          file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);
        const isImage =
          file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name);

        if (isVideo) {
          setIsCompressing(true);
          try {
            const storyboard = await extractStoryboardFromVideoFile(file);
            const newAtt: Attachment = {
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: storyboard.name,
              type: 'image/jpeg',
              fileType: 'image',
              size: storyboard.size,
              dataUrl: storyboard.dataUrl,
              parseStatus: 'ready',
              timestamp: Date.now(),
            };
            setAttachments((prev) => [...prev, newAtt]);
            if (onAttachSessionMedia) {
              onAttachSessionMedia(newAtt);
            }
            onShowWarningToast?.(
              `🎥 Video (${formatFileSize(file.size)}) convertido en Secuencia HD de 4 cuadros (${formatFileSize(storyboard.size)}) para que cualquier IA lo vea`
            );
          } catch (err) {
            console.error('Video storyboard error:', err);
            onShowWarningToast?.(`No se pudo extraer la secuencia del video ${file.name}`);
          } finally {
            setIsCompressing(false);
          }
          continue;
        }

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
            let finalSize = file.size;
            try {
              const compressed = await compressImage(file, 2044, 0.86);
              dataUrl = compressed.dataUrl;
              finalSize = compressed.size;
              if (file.size > 1.2 * 1024 * 1024) {
                onShowWarningToast?.(
                  `📸 Foto optimizada sin pérdida de nitidez (${formatFileSize(file.size)} → ${formatFileSize(compressed.size)} 2K ViT-Sharp)`
                );
              }
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
              name: file.name || `foto_${Date.now()}.jpg`,
              type: 'image/jpeg',
              fileType: 'image',
              size: finalSize,
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
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (docInputRef.current) docInputRef.current.value = '';
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
        'Aviso: El modelo seleccionado es solo texto. Seleccioná uno con soporte de Visión para que pueda analizar la imagen.'
      );
    }

    let finalContent = text.trim();
    if (selectedCadence && cadenceDirectives[selectedCadence]) {
      finalContent = `[DIRECTIVA DE CADENCIA NARRATIVA: ${cadenceDirectives[selectedCadence]}]\n\n${finalContent}`;
    }

    setIsLaunchingSend(true);
    setTimeout(() => setIsLaunchingSend(false), 320);

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
    const anyPopoverOpen = isMenuOpen || isToneChipsOpen || isEmojiPickerOpen;
    const plusItems = [
      {
        id: 'photos',
        label: 'Fotos',
        sub: 'Galería',
        icon: <ImageIcon size={17} />,
        onClick: () => {
          setIsMenuOpen(false);
          imageInputRef.current?.click();
        },
      },
      {
        id: 'camera',
        label: 'Cámara',
        sub: 'En vivo',
        icon: <Camera size={17} />,
        onClick: () => {
          openLiveCameraSheet();
        },
      },
      {
        id: 'files',
        label: 'Archivos',
        sub: 'PDF / DOCX',
        icon: <FileText size={17} />,
        onClick: () => {
          setIsMenuOpen(false);
          docInputRef.current?.click();
        },
      },
      {
        id: 'manuscript',
        label: 'Manuscrito',
        sub: 'Texto largo',
        icon: <FileUp size={17} />,
        onClick: () => {
          setIsMenuOpen(false);
          if (onOpenTextImportModal) onOpenTextImportModal();
        },
      },
      ...(onOpenGoogleDrive
        ? [
            {
              id: 'drive',
              label: 'Google Drive',
              sub: 'Capítulos',
              icon: <CloudDownload size={17} />,
              onClick: () => {
                setIsMenuOpen(false);
                onOpenGoogleDrive();
              },
            },
          ]
        : []),
      ...(onOpenMediaGallery || onAttachSessionMedia
        ? [
            {
              id: 'cajita',
              label: 'La Cajita',
              sub: 'Estudio',
              icon: <FolderOpen size={17} />,
              onClick: () => {
                setIsMenuOpen(false);
                if (onOpenMediaGallery) onOpenMediaGallery();
              },
            },
          ]
        : []),
    ];

    return (
      <div className="relative">
        <motion.button
          whileTap={{ scale: 0.88 }}
          type="button"
          onClick={() => {
            if (anyPopoverOpen) {
              setIsMenuOpen(false);
              setIsToneChipsOpen(false);
              setIsEmojiPickerOpen(false);
            } else {
              setIsMenuOpen(true);
            }
          }}
          className={`w-8 h-8 sm:w-9 sm:h-9 min-w-[32px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] rounded-full transition-colors duration-200 shrink-0 flex items-center justify-center cursor-pointer select-none ${
            anyPopoverOpen
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-black shadow-lg'
              : 'bg-zinc-200/80 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-300/80 dark:bg-[#1e1e28] dark:text-zinc-200 dark:hover:text-white dark:hover:bg-[#292938]'
          }`}
          title={anyPopoverOpen ? 'Cerrar menú (×)' : 'Opciones de adjuntos e imágenes (+)'}
          aria-label="Adjuntar archivo o imagen"
        >
          <motion.span
            animate={{ rotate: anyPopoverOpen ? 45 : 0, scale: anyPopoverOpen ? 1.08 : 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 16, mass: 0.7 }}
            className="flex items-center justify-center origin-center"
          >
            <Plus size={18} strokeWidth={2.3} />
          </motion.span>
        </motion.button>

        {/* Signature Staggered Cascade ("Fila India" de abajo hacia arriba) + Spring Bounce + Scale Fade */}
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
                initial={{ opacity: 0, y: 20, scale: 0.84 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 390, damping: 20, mass: 0.72 }}
                className="fixed left-3 right-3 bottom-20 sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:mb-3 z-50 sm:w-[258px] max-w-[calc(100vw-24px)] p-2 rounded-[26px] bg-white/95 dark:bg-[#13131a]/95 border border-zinc-200 dark:border-white/12 shadow-[0_14px_38px_rgba(0,0,0,0.14)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.78)] backdrop-blur-2xl select-none origin-bottom-left"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-1">
                  {plusItems.map((item, idx) => {
                    // Bottom-to-top cascade ("fila india"): the item closest to the + button (last in list) animates first
                    const reverseOrder = plusItems.length - 1 - idx;
                    const staggerDelay = reverseOrder * 0.042;
                    return (
                      <motion.button
                        key={item.id}
                        initial={{ opacity: 0, y: 18, scale: 0.82 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.88 }}
                        transition={{
                          type: 'spring',
                          stiffness: 380,
                          damping: 18,
                          mass: 0.68,
                          delay: staggerDelay,
                        }}
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        onClick={item.onClick}
                        className="flex items-center gap-3.5 px-2.5 py-2 min-h-[44px] rounded-2xl hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition-colors text-left group cursor-pointer origin-center"
                      >
                        <motion.div
                          initial={{ opacity: 0, scale: 0.45 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            type: 'spring',
                            stiffness: 420,
                            damping: 17,
                            delay: staggerDelay + 0.02,
                          }}
                          className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-center shrink-0 text-zinc-700 dark:text-zinc-100 group-hover:bg-zinc-200/80 dark:group-hover:bg-white/[0.14] group-hover:scale-105 transition-all origin-center"
                        >
                          {item.icon}
                        </motion.div>
                        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                          <span className="text-[14.5px] font-medium text-zinc-800 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white truncate">
                            {item.label}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono shrink-0">{item.sub}</span>
                        </div>
                      </motion.button>
                    );
                  })}
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
                <FileText size={14} className="text-amber-400 shrink-0" />
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
            className="fixed left-3 right-3 bottom-20 sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:mb-3 z-50 sm:w-72 max-w-[calc(100vw-24px)] origin-bottom-left bg-white/95 dark:bg-[#16161e]/95 border border-zinc-200 dark:border-white/[0.08] rounded-[24px] p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.65)] backdrop-blur-2xl text-zinc-900 dark:text-white space-y-1.5"
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
                  label: 'Ritmo Frío',
                  short: 'Prosa concisa, micro-foley y silencios',
                  detail: 'Oraciones cortas y pulso quirúrgico. Prioriza texturas táctiles, temperatura somática, respiración contenida y pausas compartidas. Elimina cualquier melodrama o exceso lírico.'
                },
                {
                  id: 'denso',
                  label: 'Subtexto Denso',
                  short: 'Diálogos elípticos y dobles intenciones',
                  detail: 'Tensión psicológica entre líneas. Lo importante nunca se dice en voz alta: cálculos de miradas, intenciones veladas, omisiones deliberadas y máscaras conversacionales.'
                },
                {
                  id: 'ruptura',
                  label: 'Ruptura',
                  short: 'Aceleración dramática y visceral',
                  detail: 'Pérdida de control y combate. Frases cortadas, lenguaje físico directo, sobrecarga bioenergética y colapso de Catarsis sin porcentajes numéricos.'
                },
              ].map((cad, idx, arr) => {
                const isSelected = selectedCadence === cad.id;
                const isInfoActive = activeInfoMode === cad.id;
                const staggerDelay = (arr.length - 1 - idx) * 0.045;

                return (
                  <motion.div
                    key={cad.id}
                    initial={{ opacity: 0, y: 16, scale: 0.84 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 18, mass: 0.68, delay: staggerDelay }}
                    className={`rounded-xl border transition-all origin-center ${
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
                  </motion.div>
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

  const renderToolsPopover = () => (
    <AnimatePresence>
      {isToolsPopoverOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setIsToolsPopoverOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 430, damping: 28, mass: 0.75 }}
            className="fixed left-3 right-3 bottom-20 sm:absolute sm:bottom-full sm:left-0 sm:right-auto sm:mb-3 z-50 sm:w-80 max-w-[calc(100vw-24px)] origin-bottom-left bg-white/95 dark:bg-[#14141c]/95 border border-zinc-200 dark:border-white/[0.1] rounded-[24px] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.75)] backdrop-blur-2xl text-zinc-900 dark:text-white space-y-2.5 max-h-[72dvh] overflow-y-auto smooth-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1.5 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-white/10">
              <span>Modos y Herramientas</span>
              <button
                type="button"
                onClick={() => setIsToolsPopoverOpen(false)}
                className="hover:text-black dark:hover:text-white cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            {/* Fila rápida: Grimorio Web + Docs en Contexto */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleToggleWebSearch}
                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                  isWebSearchActive
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                    : 'bg-zinc-50 dark:bg-[#1a1a24] border-zinc-200 dark:border-white/[0.07] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <GrimoireBookButton
                    asDiv
                    isActive={isWebSearchActive}
                    isFetching={isStreaming && isWebSearchActive}
                    className="p-0 border-0 bg-transparent min-w-[16px] min-h-[16px] !p-0 pointer-events-none"
                  />
                  <span className="text-[11px] font-semibold truncate">Grimorio Web</span>
                </div>
                <span className="text-[9px] font-mono uppercase opacity-80">
                  {isWebSearchActive ? 'ON' : 'OFF'}
                </span>
              </button>

              {onOpenLoreSelector && (
                <button
                  type="button"
                  onClick={() => {
                    setIsToolsPopoverOpen(false);
                    onOpenLoreSelector();
                  }}
                  className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                    activeLoreFilesCount > 0
                      ? 'bg-amber-500/12 border-amber-500/35 text-amber-700 dark:text-amber-300'
                      : 'bg-zinc-50 dark:bg-[#1a1a24] border-zinc-200 dark:border-white/[0.07] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <BookOpen size={13} className={activeLoreFilesCount > 0 ? 'text-amber-400 shrink-0' : 'text-zinc-400 shrink-0'} />
                    <span className="text-[11px] font-semibold truncate">Lore / Docs</span>
                  </div>
                  <span className="text-[10px] font-mono opacity-85">
                    {activeLoreFilesCount}/{totalLoreFilesCount}
                  </span>
                </button>
              )}
            </div>

            {/* Cadencia Narrativa */}
            <div className="p-2.5 rounded-2xl bg-zinc-50 dark:bg-[#1a1a24] border border-zinc-200 dark:border-white/[0.07] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-amber-400" />
                  <span>Cadencia Narrativa</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsToolsPopoverOpen(false);
                    setIsToneChipsOpen(true);
                  }}
                  className="text-[10px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  Ver detalles →
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {CADENCE_OPTIONS.map((cad) => {
                  const isSelected = selectedCadence === cad.id;
                  return (
                    <button
                      key={cad.label}
                      type="button"
                      onClick={() => handleSelectCadence(cad.id)}
                      className={`px-2 py-1.5 rounded-xl text-[11px] font-medium text-left truncate border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black border-transparent font-semibold'
                          : 'bg-white dark:bg-black/30 text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-white/5 hover:bg-zinc-100 dark:hover:bg-white/10'
                      }`}
                    >
                      {cad.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Extensión Google Drive & Google Docs */}
            <div className="p-2.5 rounded-2xl bg-zinc-50 dark:bg-[#1a1a24] border border-zinc-200 dark:border-sky-500/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-sky-500/15 border border-sky-500/35 flex items-center justify-center text-sky-400 shrink-0">
                    <CloudDownload size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                      @Google Drive & Docs
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                      Crear, editar, renombrar y borrar archivos
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isDriveToolEnabled;
                    setIsDriveToolEnabled(next);
                    localStorage.setItem('kizuna_drive_tool_enabled', String(next));
                  }}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border transition-colors cursor-pointer ${
                    isDriveToolEnabled
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {isDriveToolEnabled ? 'ACTIVA' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1 pt-1">
                {onOpenGoogleDrive && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsPopoverOpen(false);
                      onOpenGoogleDrive();
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-left text-[11px] font-semibold text-sky-700 dark:text-sky-300 flex items-center justify-between cursor-pointer"
                  >
                    <span>Abrir Gestor y Editor de Google Drive</span>
                    <span>→</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setText('@Google Docs: Creá un nuevo documento en mi Google Drive llamado "" con el siguiente contenido: ');
                    setIsToolsPopoverOpen(false);
                    setTimeout(() => textareaRef.current?.focus(), 20);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-black/35 hover:bg-zinc-200 dark:hover:bg-white/10 text-left text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  + Pedirle que cree un Google Doc nuevo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setText('@Google Docs: Entrá a mi documento "" en Google Drive y reemplazá / agregá lo siguiente: ');
                    setIsToolsPopoverOpen(false);
                    setTimeout(() => textareaRef.current?.focus(), 20);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-black/35 hover:bg-zinc-200 dark:hover:bg-white/10 text-left text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  ✎ Pedirle que modifique un Google Doc
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setText('@Google Drive: Mové a la papelera o renombrá el archivo "" en mi Google Drive.');
                    setIsToolsPopoverOpen(false);
                    setTimeout(() => textareaRef.current?.focus(), 20);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-black/35 hover:bg-zinc-200 dark:hover:bg-white/10 text-left text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  🗑️ Pedirle que renombre o borre un archivo
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-3 md:pb-5 select-none relative">
      {/* Hidden File Inputs for Noir Attachment Popover */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept=".txt,.md,.json,.docx,.pdf,image/*,video/*"
        onChange={handleUnifiedFileUpload}
        className="hidden"
      />
      <input
        type="file"
        ref={imageInputRef}
        multiple
        accept="image/*,video/*"
        onChange={handleUnifiedFileUpload}
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
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

      {/* Clean OpenWebUI / Gemini Active-Only Mode Chips (hidden when default so screen stays clean) */}
      {(isWebSearchActive || selectedCadence || text.length > 1800) && (
        <div className="flex items-center gap-1.5 overflow-x-auto smooth-scroll no-scrollbar pb-1 px-1 mb-1 select-none text-xs">
          {isWebSearchActive && (
            <button
              type="button"
              onClick={handleToggleWebSearch}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[11px] font-medium cursor-pointer hover:bg-amber-500/25 transition-colors shrink-0"
              title="Desactivar Grimorio Web"
            >
              <span>Grimorio Web • ON</span>
              <X size={11} />
            </button>
          )}

          {selectedCadence && (
            <button
              type="button"
              onClick={() => handleSelectCadence(null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-200/80 dark:bg-white/[0.1] border border-zinc-300 dark:border-white/25 text-zinc-800 dark:text-white text-[11px] font-medium cursor-pointer hover:opacity-85 transition-opacity shrink-0"
              title="Quitar cadencia narrativa"
            >
              <Sparkles size={11} className="text-amber-400" />
              <span className="uppercase font-mono text-[10px]">{selectedCadence}</span>
              <X size={11} />
            </button>
          )}

          {text.length > 1800 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              type="button"
              onClick={handleCondenseCurrentText}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-amber-500/15 border-amber-500/40 text-amber-300 text-[11px] font-medium cursor-pointer shrink-0"
              title="Escudo de Cuota: Condensar capítulo extenso a Ficha Canónica para ahorrar 85% de tokens"
            >
              <Zap size={12} className="text-amber-400" />
              <span>Escudo Cuota (-{Math.round((1 - 400 / (text.length / 4)) * 100)}%)</span>
            </motion.button>
          )}
        </div>
      )}

      {/* Quick-Action Editorial Chips on Focus when Empty (Gemini / Linear Style, Zero Childish Emojis) */}
      {isFocused && !text.trim() && attachments.length === 0 && !isStreaming && (
        <div className="flex items-center gap-1.5 overflow-x-auto smooth-scroll no-scrollbar pb-1.5 px-1 mb-0.5 select-none animate-noir-enter">
          {[
            { label: 'Continuar escena', prompt: 'Continúa la escena manteniendo el pulso somático, el subtexto y el ritmo actual: ' },
            { label: 'Pulir diálogo', prompt: 'Analiza y pule este diálogo para afilar el subtexto sin perder la voz de cada personaje: ' },
            { label: 'Auditar canon', prompt: 'Verifica la coherencia de esta escena contra el canon de Monstereth y La Cajita: ' },
            { label: 'Síntesis rápida', prompt: 'Hazme una síntesis directa y estructurada de los puntos clave: ' },
          ].map((chip) => (
            <button
              key={chip.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setText(chip.prompt);
                setTimeout(() => textareaRef.current?.focus(), 10);
              }}
              className="px-2.5 py-1 rounded-full bg-zinc-100/90 dark:bg-[#13131a] hover:bg-zinc-200 dark:hover:bg-[#1d1d27] border border-zinc-200/80 dark:border-white/[0.08] hover:border-zinc-300 dark:hover:border-white/[0.18] text-[11px] font-mono text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors shrink-0 cursor-pointer"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

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
              onShowWarningToast?.('Texto arrastrado añadido a Docs en Contexto');
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
          isStreaming
            ? 'kz-composer-streaming-aura bg-[#14141d]'
            : isFocused || isMenuOpen
              ? 'input-noir-focused bg-[#14141d] border-white/25 shadow-[0_8px_30px_rgba(0,0,0,0.45)]'
              : 'bg-[#0d0d12] border-[#24242d]'
        } ${
          isDragOver ? 'ring-2 ring-white/30 bg-[#14141c]' : ''
        } ${
          isLaunchingSend ? '-translate-y-[2px] scale-[0.992]' : ''
        }`}
      >
        {/* Floating Popovers for Cadence, Emojis & Workspace Tools */}
        {renderCadencePopover()}
        {renderEmojiPopover()}
        {renderToolsPopover()}

        <div className="w-full flex flex-col justify-between">
          {/* Smart Quota Shield Indicator when typed/pasted text > 1800 characters */}
          {text.trim().length > 1800 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between gap-2 px-3 py-1.5 mb-2 bg-amber-50 dark:bg-[#121218] border border-amber-300 dark:border-amber-500/35 rounded-2xl text-xs text-amber-900 dark:text-amber-200 shadow-sm dark:shadow-md"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Zap size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="font-mono text-[11px] truncate text-amber-800 dark:text-amber-300">
                  Escudo de Cuota: {text.length.toLocaleString()} caract. (~{Math.round(text.length / 4)} tokens)
                </span>
              </div>
              <button
                type="button"
                onClick={handleCondenseCurrentText}
                className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 dark:bg-amber-500/20 dark:hover:bg-amber-500/35 border border-amber-500/40 text-amber-900 dark:text-amber-200 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer active:scale-95 shrink-0"
                title="Sintetizar texto a Ficha de Canon para ahorrar 85% de tokens de API"
              >
                <Sparkles size={12} className="text-amber-600 dark:text-amber-300" />
                <span>Sintetizar a Canon (-85% Cuota)</span>
              </button>
            </motion.div>
          )}

          {renderAttachmentsPreview()}

          {/* Fila única: Modo Grabación de Voz con Ondas estilo ChatGPT vs Entrada de Texto normal */}
          {isListening || isTranscribingAsr ? (
            <motion.div
              key="chatgpt-voice-waveform-bar"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-between gap-2.5 w-full min-h-[38px] py-0.5"
            >
              {/* Far Left: Botón (X) para cancelar y descartar grabación */}
              <button
                type="button"
                onClick={() => stopActiveDictationWithAction('cancel')}
                disabled={isTranscribingAsr}
                className="w-[38px] h-[38px] min-w-[38px] min-h-[38px] rounded-full bg-zinc-200/80 md:hover:bg-zinc-300/80 active:bg-zinc-300 dark:bg-white/[0.1] dark:md:hover:bg-white/[0.18] dark:active:bg-white/[0.24] text-zinc-700 hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer touch-manipulation disabled:opacity-40"
                title="Cancelar grabación"
                aria-label="Cancelar grabación"
              >
                <X size={18} strokeWidth={2.2} />
              </button>

              {/* Center: Ondas acústicas reactivas en tiempo real estilo ChatGPT */}
              <div className="flex-1 min-w-0 h-[34px] px-2 flex items-center justify-center overflow-hidden select-none">
                {isTranscribingAsr ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 font-medium tracking-wide">
                    <Loader2 size={14} className="animate-spin text-zinc-700 dark:text-white/80" />
                    <span>Transcribiendo...</span>
                  </div>
                ) : (
                  <div className="w-full max-w-[440px] flex items-center justify-between gap-[3px] h-[28px] px-1">
                    {waveformBars.map((barHeight, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${barHeight}px` }}
                        className={`w-[2.5px] rounded-full transition-[height,opacity] duration-75 ease-out shrink-0 ${
                          barHeight > 4
                            ? 'bg-zinc-900 dark:bg-white opacity-95'
                            : 'bg-zinc-400 dark:bg-white/45 opacity-70'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Far Right: Detener e insertar en caja (■) + Enviar directo (↑) */}
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stopActiveDictationWithAction('insert')}
                  disabled={isTranscribingAsr}
                  className="w-[38px] h-[38px] min-w-[38px] min-h-[38px] rounded-full bg-zinc-200/80 md:hover:bg-zinc-300/80 active:bg-zinc-300 dark:bg-white/[0.14] dark:md:hover:bg-white/[0.22] dark:active:bg-white/[0.28] text-zinc-900 dark:text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer touch-manipulation disabled:opacity-40"
                  title="Detener y pasar texto al cuadro de escritura"
                  aria-label="Detener grabación y editar texto"
                >
                  <Square size={12} fill="currentColor" className="pointer-events-none" />
                </button>

                <motion.button
                  whileTap={{ scale: 0.91 }}
                  type="button"
                  onClick={() => stopActiveDictationWithAction('send')}
                  disabled={isTranscribingAsr}
                  className="primary-voice-send-btn w-[38px] h-[38px] min-w-[38px] min-h-[38px] rounded-full bg-zinc-900 text-white md:hover:bg-zinc-800 active:bg-zinc-700 dark:bg-white dark:text-black dark:md:hover:bg-zinc-200 dark:active:bg-zinc-300 flex items-center justify-center shrink-0 transition-colors cursor-pointer shadow-sm touch-manipulation disabled:opacity-50"
                  title="Detener y enviar mensaje"
                  aria-label="Enviar mensaje por voz"
                >
                  <ArrowUp size={17} strokeWidth={2.6} className="pointer-events-none" />
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-1.5 w-full">
              {/* Far Left: Botón (+) + Botón unificado de Herramientas/Modos + Reloj de Arena (Pensar más) */}
              <div className="shrink-0 flex items-center gap-0.5 sm:gap-1">
                {renderPlusButton()}

                {/* Botón unificado de Modos y Herramientas (Grimorio, Cadencia, Lore, Drive) */}
                <motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => {
                    setIsToolsPopoverOpen((v) => !v);
                    setIsToneChipsOpen(false);
                    setIsMenuOpen(false);
                    setIsEmojiPickerOpen(false);
                  }}
                  className={`relative p-1.5 sm:p-2 w-8 h-8 sm:w-9 sm:h-9 min-w-[32px] sm:min-w-[36px] min-h-[32px] sm:min-h-[36px] rounded-full transition-colors flex items-center justify-center cursor-pointer ${
                    isToolsPopoverOpen || isWebSearchActive || selectedCadence
                      ? 'bg-zinc-200 dark:bg-white/[0.12] text-zinc-900 dark:text-white'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/[0.06]'
                  }`}
                  title="Herramientas, Grimorio Web, Cadencia y Google Drive"
                >
                  <motion.span
                    animate={{ rotate: isToolsPopoverOpen ? 25 : 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                    className="flex items-center justify-center"
                  >
                    <Sparkles size={16} />
                  </motion.span>
                  {(isWebSearchActive || selectedCadence || isDriveToolEnabled) && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </motion.button>

                {/* Reloj de Arena 1-toque (Pensar más) */}
                {renderHourglassButton()}
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
                      : 'Escribe un mensaje...'
                  }
                  rows={1}
                  disabled={isParsing}
                  className="w-full bg-transparent text-[16px] md:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 resize-none px-2 py-1.5 focus:outline-none min-h-[38px] max-h-40 leading-relaxed transition-[height,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-x-hidden overflow-y-auto"
                />
              </div>

              {/* Far Right: Botones contextuales estilo ChatGPT sin parpadeo blanco y con transición suave */}
              <div className="shrink-0 flex items-center gap-1">
                <AnimatePresence initial={false}>
                  {!isStreaming && (
                    <motion.button
                      key="mic-dictation-btn"
                      initial={{ opacity: 0, scale: 0.75, width: 0 }}
                      animate={{ opacity: 1, scale: 1, width: 38 }}
                      exit={{ opacity: 0, scale: 0.75, width: 0 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      type="button"
                      onClick={toggleListening}
                      className="h-[38px] rounded-full shrink-0 flex items-center justify-center cursor-pointer select-none overflow-hidden touch-manipulation transition-colors duration-150 bg-transparent text-zinc-500 dark:text-zinc-400 md:hover:text-zinc-900 dark:md:hover:text-white md:hover:bg-zinc-200/70 dark:md:hover:bg-white/[0.07] active:bg-zinc-200 dark:active:bg-white/[0.12] active:text-zinc-900 dark:active:text-white"
                      title="Dictado por voz"
                    >
                      <Mic size={18} strokeWidth={2} className="pointer-events-none shrink-0" />
                    </motion.button>
                  )}
                </AnimatePresence>

                {/* Círculo primario persistente (Ondas Acústicas <-> Flecha Enviar <-> Detener) */}
                <motion.button
                  key="primary-circle-action-btn"
                  whileTap={{ scale: 0.91 }}
                  type="button"
                  disabled={!isStreaming && (Boolean(text.trim()) || attachments.length > 0) && isParsing}
                  onClick={() => {
                    if (isStreaming) {
                      onStopGeneration?.();
                    } else if (text.trim() || attachments.length > 0) {
                      handleSend();
                    } else if (onStartVoiceCall) {
                      onStartVoiceCall();
                    } else {
                      toggleListening();
                    }
                  }}
                  className="primary-voice-send-btn w-[38px] h-[38px] min-w-[38px] min-h-[38px] rounded-full bg-zinc-900 text-white md:hover:bg-zinc-800 active:bg-zinc-700 dark:bg-white dark:text-black dark:md:hover:bg-zinc-200 dark:active:bg-zinc-300 transition-colors duration-150 cursor-pointer select-none shadow-sm shrink-0 flex items-center justify-center touch-manipulation relative overflow-hidden"
                  title={
                    isStreaming
                      ? 'Detener generación'
                      : text.trim() || attachments.length > 0
                      ? 'Enviar mensaje'
                      : 'Modo de Voz en Vivo (Qwen Omni-Realtime)'
                  }
                  aria-label={
                    isStreaming
                      ? 'Detener generación'
                      : text.trim() || attachments.length > 0
                      ? 'Enviar mensaje'
                      : 'Iniciar modo de voz en vivo'
                  }
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {isStreaming ? (
                      <motion.span
                        key="icon-stop"
                        initial={{ opacity: 0, scale: 0.65 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.65 }}
                        transition={{ duration: 0.14, ease: 'easeOut' }}
                        className="flex items-center justify-center pointer-events-none"
                      >
                        <Square size={13} fill="currentColor" />
                      </motion.span>
                    ) : text.trim() || attachments.length > 0 ? (
                      <motion.span
                        key="icon-send"
                        initial={{ opacity: 0, scale: 0.65, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.72, y: -14 }}
                        transition={{ type: 'spring', stiffness: 450, damping: 24, mass: 0.65 }}
                        className="flex items-center justify-center pointer-events-none"
                      >
                        <ArrowUp size={17} strokeWidth={2.6} />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="icon-voice-waves"
                        initial={{ opacity: 0, scale: 0.65 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.65 }}
                        transition={{ duration: 0.14, ease: 'easeOut' }}
                        className="flex items-center justify-center pointer-events-none"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="4" y1="10" x2="4" y2="14" />
                          <line x1="8" y1="6" x2="8" y2="18" />
                          <line x1="12" y1="3" x2="12" y2="21" />
                          <line x1="16" y1="7" x2="16" y2="17" />
                          <line x1="20" y1="10" x2="20" y2="14" />
                        </svg>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ChatGPT-Style In-App Live Camera & Video Viewfinder Bottom Sheet (60 FPS Hardware Overlay Optimized) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isCameraSheetOpen && (
              <div className="fixed inset-0 z-[9999] flex flex-col justify-end select-none">
                {/* Pure GPU Translucent Backdrop (No backdrop-blur so Android HWC keeps 60 FPS video overlay) */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => {
                    if (!isRecordingVideo) closeLiveCameraSheet();
                  }}
                  className="absolute inset-0 bg-black/75"
                />

                {/* Rounded Viewfinder Bottom Card (Pure GPU translateY without scale rasterization lag) */}
                <motion.div
                  initial={{ opacity: 0, y: 56 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 56 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="relative z-10 w-full max-w-[540px] mx-auto px-1.5 pb-2 pt-1 transform-gpu will-change-transform"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    onDoubleClick={handleFlipCamera}
                    className="relative w-full h-[68vh] sm:h-[72vh] max-h-[680px] min-h-[400px] rounded-[32px] overflow-hidden bg-[#0c0c10] border border-white/10 shadow-2xl transform-gpu"
                  >
                    {/* Live 60 FPS Hardware Video Feed */}
                    <video
                      ref={(el) => {
                        cameraVideoRef.current = el;
                        if (el && cameraStreamRef.current && el.srcObject !== cameraStreamRef.current) {
                          el.srcObject = cameraStreamRef.current;
                          el.play().catch(() => {});
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={() => setIsCameraReady(true)}
                      className={`w-full h-full object-cover transform-gpu transition-opacity duration-150 ${
                        isCameraReady ? 'opacity-100' : 'opacity-0'
                      } ${cameraFacingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                    />

                    {/* Top Recording Timer Pill when recording video */}
                    {isRecordingVideo && (
                      <div className="absolute top-5 inset-x-0 flex justify-center z-20 pointer-events-none">
                        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-600/95 text-white text-xs font-mono font-bold shadow-lg">
                          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                          <span>
                            REC 00:0{Math.min(4, Math.floor(recordingSeconds))}s / 00:04s ({videoFramesBufferRef.current.length}/4 cuadros)
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Loading Shimmer while sensor wakes up */}
                    {!isCameraReady && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0c10] text-zinc-400">
                        <div className="w-12 h-12 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center animate-pulse">
                          <Camera size={22} className="text-zinc-300" />
                        </div>
                        <span className="text-xs font-mono text-zinc-500">Activando lente a 60 FPS...</span>
                      </div>
                    )}

                    {/* White Shutter Flash Effect */}
                    <AnimatePresence>
                      {isShutterFlashing && (
                        <motion.div
                          initial={{ opacity: 0.85 }}
                          animate={{ opacity: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="absolute inset-0 bg-white z-30 pointer-events-none"
                        />
                      )}
                    </AnimatePresence>

                    {/* Floating 3-Dots Options Menu (Flip Camera / Torch / System 8K Camera) */}
                    <AnimatePresence>
                      {isCameraOptionsOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setIsCameraOptionsOpen(false)}
                          />
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-24 right-6 z-30 w-56 p-1.5 rounded-2xl bg-[#14141c] border border-white/15 shadow-2xl flex flex-col gap-1"
                          >
                            <button
                              type="button"
                              onClick={handleFlipCamera}
                              className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl hover:bg-white/10 active:bg-white/15 text-left text-zinc-100 text-sm font-medium transition-colors cursor-pointer"
                            >
                              <RefreshCw size={16} className="text-zinc-300 shrink-0" />
                              <span>
                                {cameraFacingMode === 'environment'
                                  ? 'Cambiar a cámara frontal'
                                  : 'Cambiar a cámara trasera'}
                              </span>
                            </button>

                            {hasTorchSupport && (
                              <button
                                type="button"
                                onClick={handleToggleTorch}
                                className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl hover:bg-white/10 active:bg-white/15 text-left text-zinc-100 text-sm font-medium transition-colors cursor-pointer"
                              >
                                <Zap
                                  size={16}
                                  className={isTorchOn ? 'text-amber-400 shrink-0' : 'text-zinc-300 shrink-0'}
                                />
                                <span>{isTorchOn ? 'Apagar linterna' : 'Encender linterna'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                closeLiveCameraSheet();
                                cameraInputRef.current?.click();
                              }}
                              className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl hover:bg-white/10 active:bg-white/15 text-left text-zinc-300 text-xs font-mono transition-colors cursor-pointer border-t border-white/10 mt-0.5 pt-2.5"
                            >
                              <Camera size={15} className="text-zinc-400 shrink-0" />
                              <span>Abrir app de cámara nativa (8K)</span>
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>

                    {/* Mode Switcher Pill: [ 📸 Foto | 🎥 Video (Universal IA) ] */}
                    {!isRecordingVideo && (
                      <div className="absolute bottom-[106px] inset-x-0 flex justify-center z-20">
                        <div className="inline-flex items-center p-1 rounded-full bg-black/75 border border-white/15 shadow-lg">
                          <button
                            type="button"
                            onClick={() => setCameraCaptureMode('photo')}
                            className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                              cameraCaptureMode === 'photo'
                                ? 'bg-white text-black font-semibold'
                                : 'text-zinc-300 hover:text-white'
                            }`}
                          >
                            <Camera size={13} />
                            <span>Foto</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCameraCaptureMode('video')}
                            className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                              cameraCaptureMode === 'video'
                                ? 'bg-red-500 text-white font-semibold'
                                : 'text-zinc-300 hover:text-white'
                            }`}
                          >
                            <Video size={13} />
                            <span>Video (IA)</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ChatGPT-Style Bottom Controls Bar: [ < ]   [ ( O ) ]   [ ⋮ ] */}
                    <div className="absolute bottom-6 inset-x-0 px-7 flex items-center justify-between z-20">
                      {/* Left: Back / Close Button (<) */}
                      <button
                        type="button"
                        onClick={closeLiveCameraSheet}
                        className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-black/70 hover:bg-black/85 active:scale-90 border border-white/15 flex items-center justify-center text-white shadow-lg transition-transform cursor-pointer"
                        title="Volver al chat"
                        aria-label="Cerrar cámara"
                      >
                        <ChevronLeft size={24} strokeWidth={2.4} />
                      </button>

                      {/* Center: Shutter Circle (White for Photo, Red/Stop for Video) */}
                      {cameraCaptureMode === 'photo' ? (
                        <button
                          type="button"
                          disabled={!isCameraReady}
                          onClick={handleCaptureLivePhoto}
                          className="w-[72px] h-[72px] min-w-[72px] min-h-[72px] rounded-full bg-white ring-[5px] ring-black/45 active:scale-90 shadow-xl flex items-center justify-center transition-transform cursor-pointer disabled:opacity-50"
                          title="Sacar foto instantánea"
                          aria-label="Sacar foto"
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={!isCameraReady}
                          onClick={handleToggleVideoRecording}
                          className="w-[72px] h-[72px] min-w-[72px] min-h-[72px] rounded-full bg-transparent ring-[5px] ring-white active:scale-90 shadow-xl flex items-center justify-center transition-transform cursor-pointer disabled:opacity-50"
                          title={
                            isRecordingVideo
                              ? 'Detener y armar secuencia de video'
                              : 'Grabar clip de video (4s) apto para cualquier IA'
                          }
                          aria-label="Grabar video"
                        >
                          <div
                            className={`transition-all duration-200 ${
                              isRecordingVideo
                                ? 'w-7 h-7 rounded-md bg-red-500 animate-pulse'
                                : 'w-[58px] h-[58px] rounded-full bg-red-500'
                            }`}
                          />
                        </button>
                      )}

                      {/* Right: 3-Dots Options Button (⋮) */}
                      <button
                        type="button"
                        disabled={isRecordingVideo}
                        onClick={() => setIsCameraOptionsOpen((prev) => !prev)}
                        className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-black/70 hover:bg-black/85 active:scale-90 border border-white/15 flex items-center justify-center text-white shadow-lg transition-transform cursor-pointer disabled:opacity-40"
                        title="Opciones de cámara (Girar lente / Linterna / Cámara nativa)"
                        aria-label="Opciones de cámara"
                      >
                        <MoreVertical size={22} strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.isStreaming === next.isStreaming &&
    prev.activeLoreFilesCount === next.activeLoreFilesCount &&
    prev.totalLoreFilesCount === next.totalLoreFilesCount &&
    prev.isVisionCapable === next.isVisionCapable &&
    prev.isWebSearchEnabled === next.isWebSearchEnabled &&
    prev.reasoningMode === next.reasoningMode &&
    prev.activeModelKey === next.activeModelKey
  );
});
