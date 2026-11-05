import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Image as ImageIcon,
  Film,
  Trash2,
  Download,
  Eye,
  Plus,
  Sparkles,
  Square,
  Smartphone,
  Monitor,
  Compass,
  BookOpen,
  Sliders,
  Check,
  Loader2,
  AlertCircle,
  Layers,
  Cpu,
  Play,
  RotateCcw,
  Video as VideoIcon,
  Upload,
} from 'lucide-react';
import { Attachment } from '../types';
import { ImageLightbox } from './ImageLightbox';

interface SessionMediaGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: Attachment[];
  onDeleteMedia: (id: string) => void;
  onAttachMedia?: (att: Attachment) => void;
  onAddMedia?: (att: Attachment) => void;
  onJumpToChat?: (chatId: string) => void;
  alibabaApiKey?: string;
  alibabaBaseUrl?: string;
  activeChatId?: string | null;
  initialTab?: 'gallery' | 'create' | 'video';
  onStartGenerativeChat?: (params: {
    type: 'image' | 'video';
    prompt: string;
    model: string;
    duration?: number;
    resolution?: string;
    ratio?: string;
    sourceImage?: string;
  }) => void;
}

type AspectRatioOption = '1024*1024' | '720*1280' | '1280*720';
export type WanxModelOption =
  | 'qwen-image-3.0-pro'
  | 'qwen-image-2.1-pro'
  | 'wan2.6-image'
  | 'z-image-turbo'
  | 'wanx2.1-t2i-plus'
  | 'wanx2.1-t2i-turbo';

export type WanVideoModelOption =
  | 'wan3.0-video'
  | 'wan2.7-i2v'
  | 'happyhorse-1.1-t2v'
  | 'happyhorse-1.1-i2v'
  | 'happyhorse-1.0-t2v'
  | 'wan2.1-t2v-turbo'
  | 'wan2.1-i2v-turbo';

interface ImageModelUsageMap {
  [modelId: string]: number;
}

export const getStoredImageModelCounts = (): ImageModelUsageMap => {
  try {
    const raw = localStorage.getItem('kizuna_image_model_counts');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const recordImageModelUsage = (modelId: string): ImageModelUsageMap => {
  try {
    const current = getStoredImageModelCounts();
    current[modelId] = (current[modelId] || 0) + 1;
    localStorage.setItem('kizuna_image_model_counts', JSON.stringify(current));
    return current;
  } catch {
    return {};
  }
};

interface ImageModelDef {
  id: WanxModelOption;
  name: string;
  badge: string;
  description: string;
}

const IMAGE_MODELS: ImageModelDef[] = [
  {
    id: 'qwen-image-3.0-pro',
    name: 'qwen-image-3.0-pro',
    badge: 'Flagship 2026',
    description: 'Diseño complejo, renderizado de texto pequeño nítido (desde 10px), fotorrealismo extremo y 12 idiomas.',
  },
  {
    id: 'qwen-image-2.1-pro',
    name: 'qwen-image-2.1-pro',
    badge: '7B Multi-Ref',
    description: 'Equilibrado con soporte nativo de transparencias y hasta 10 imágenes de referencia.',
  },
  {
    id: 'wan2.6-image',
    name: 'wan2.6-image',
    badge: 'Razonamiento',
    description: 'Generación y razonamiento conjunto de texto e imagen con control de iluminación.',
  },
  {
    id: 'z-image-turbo',
    name: 'z-image-turbo',
    badge: '6B 8-Pasos',
    description: 'Código abierto de alta eficiencia (8 pasos de inferencia) optimizado para fotorrealismo.',
  },
  {
    id: 'wanx2.1-t2i-plus',
    name: 'wanx2.1-t2i-plus',
    badge: 'Light Novel',
    description: 'Máxima fidelidad e iluminación dramática para arte conceptual de novela ligera.',
  },
  {
    id: 'wanx2.1-t2i-turbo',
    name: 'wanx2.1-t2i-turbo',
    badge: 'Boceto Veloz',
    description: 'Prototipado ultra rápido de conceptos e ideas visuales en tiempo real.',
  },
];

interface VideoModelDef {
  id: WanVideoModelOption;
  name: string;
  badge: string;
  quota: string;
  type: 'all' | 't2v' | 'i2v';
  description: string;
}

const VIDEO_MODELS: VideoModelDef[] = [
  {
    id: 'wan3.0-video',
    name: 'Wan3.0-Video',
    badge: 'Hasta 30s • 2026',
    quota: 'Audio/Video Nativo',
    type: 'all',
    description: 'Generación unificada de video continuo de hasta 30 segundos (30 FPS) con audio sincronizado, Text to Video e Image to Video.',
  },
  {
    id: 'wan2.7-i2v',
    name: 'wan2.7-i2v',
    badge: 'Image to Video',
    quota: 'HD Motion',
    type: 'i2v',
    description: 'Animación cinematográfica de imágenes estáticas con trayectorias de cámara y deformación física fluida.',
  },
  {
    id: 'happyhorse-1.1-t2v',
    name: 'happyhorse-1.1-t2v',
    badge: 'Text to Video',
    quota: 'High FPS',
    type: 't2v',
    description: 'Generación rápida de escenas de acción y animación a partir de descripciones literarias.',
  },
  {
    id: 'happyhorse-1.1-i2v',
    name: 'happyhorse-1.1-i2v',
    badge: 'Image to Video',
    quota: '300 RPM',
    type: 'i2v',
    description: 'Transforma ilustraciones en tomas animadas manteniendo la identidad visual del personaje.',
  },
  {
    id: 'wan2.1-t2v-turbo',
    name: 'wan2.1-t2v-turbo',
    badge: 'Turbo T2V',
    quota: 'Rápido',
    type: 't2v',
    description: 'Renderizado acelerado de video para bocetos y previsualización de escenas cinemáticas.',
  },
  {
    id: 'wan2.1-i2v-turbo',
    name: 'wan2.1-i2v-turbo',
    badge: 'Turbo I2V',
    quota: 'Rápido',
    type: 'i2v',
    description: 'Animación instantánea de ilustraciones fijas con bajo tiempo de espera.',
  },
];

interface StylePreset {
  id: string;
  label: string;
  prompt: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'kolder',
    label: 'Kolder Zekshoyu',
    prompt:
      'Kolder Zekshoyu, 22 years old, deadpan expressionless grey prism eyes with radial map, wearing dark tactical trenchcoat, holding a carved runic pumpkin mate with ruby ring, cold steam rising, karambit at his belt, muted somber atmosphere, light novel visual novel art.',
    icon: Compass,
  },
  {
    id: 'hinistra',
    label: 'Hinistra Zupsekia',
    prompt:
      'Hinistra Zupsekia, 17 years old, jellyfish haircut blue-grey hair with hanging parchment ribbons, porcelain smiling mask "Euforia" pinned over left chest, oversized hoodie, dramatic theatrical pose, tragic emotional contrast, anime light novel illustration.',
    icon: BookOpen,
  },
  {
    id: 'catarsis',
    label: 'Flujo de Catarsis & Skarnita',
    prompt:
      'Runic copper conduits pulsing with dark static, ethereal skarnita vapor floating through gothic cobblestones, deep charcoal and amethyst lighting, intricate alchemical runes, high fantasy visual novel background.',
    icon: Sliders,
  },
  {
    id: 'santusma',
    label: 'Santusma & Cielo Cegado',
    prompt:
      'Santusma skyline under perpetual blind overcast sky, monolithic state towers, dim copper streetlamps piercing dense fog, melancholic dark fantasy architectural landscape, cinematic composition.',
    icon: Sparkles,
  },
];

const VIDEO_STYLE_PRESETS = [
  { label: 'Cámara lenta cinemática', prompt: 'Slow motion cinematic camera orbit, atmospheric smoke and embers floating through the air, dramatic rim lighting, 60fps feel.' },
  { label: 'Niebla de Skarnita', prompt: 'Volumetric ethereal purple and charcoal mist billowing along the ground, subtle wind blowing character coat and hair, high aesthetic.' },
  { label: 'Caminar bajo ceniza', prompt: 'Character walking forward through dark cobblestone street under soft rain of glowing ash, cinematic tracking shot.' },
  { label: 'Mirada a cámara', prompt: 'Character slowly turning head towards camera, expressive eyes glowing softly with runic energy, subtle emotional depth.' },
];

export const SessionMediaGalleryModal: React.FC<SessionMediaGalleryModalProps> = ({
  isOpen,
  onClose,
  media,
  onDeleteMedia,
  onAttachMedia,
  onAddMedia,
  alibabaApiKey,
  alibabaBaseUrl,
  activeChatId,
  initialTab = 'gallery',
  onStartGenerativeChat,
}) => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'create' | 'video'>(initialTab);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'images' | 'videos'>('all');
  const [selectedImage, setSelectedImage] = useState<Attachment | null>(null);
  const [selectedVideoPlayer, setSelectedVideoPlayer] = useState<Attachment | null>(null);

  // Studio Image Creator State
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<WanxModelOption>('wanx2.1-t2i-plus');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>('1024*1024');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [lastGeneratedImage, setLastGeneratedImage] = useState<Attachment | null>(null);
  const [generatedCount, setGeneratedCount] = useState<number>(0);
  const [usageMap, setUsageMap] = useState<ImageModelUsageMap>(getStoredImageModelCounts);

  // Studio Video Creator State (Wan3.0-Video / HappyHorse / Wan2.1)
  const [videoMode, setVideoMode] = useState<'text2video' | 'image2video'>('text2video');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [selectedVideoModel, setSelectedVideoModel] = useState<WanVideoModelOption>('wan3.0-video');
  const [selectedVideoSourceImage, setSelectedVideoSourceImage] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [videoResolution, setVideoResolution] = useState<'720P' | '1080P' | '480P'>('720P');
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [videoGenerationError, setVideoGenerationError] = useState<string | null>(null);
  const [videoProgressStep, setVideoProgressStep] = useState<string>('');
  const [lastGeneratedVideo, setLastGeneratedVideo] = useState<Attachment | null>(null);

  const currentVideoModelDef = VIDEO_MODELS.find((m) => m.id === selectedVideoModel) || VIDEO_MODELS[0];
  const currentImageModelDef = IMAGE_MODELS.find((m) => m.id === selectedModel) || IMAGE_MODELS[0];

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // Filter valid image attachments
  const images = media.filter((m) =>
    Boolean(
      m.dataUrl &&
        m.dataUrl.trim() &&
        (m.type?.startsWith('image/') ||
          m.fileType === 'image' ||
          m.dataUrl.startsWith('data:image/') ||
          m.dataUrl.startsWith('http'))
    )
  );

  // Filter valid video attachments
  const videos = media.filter((m) =>
    Boolean(
      m.fileType === 'video' ||
        m.type?.startsWith('video/') ||
        (m.videoUrl && m.videoUrl.trim()) ||
        (m.dataUrl && m.dataUrl.startsWith('data:video/'))
    )
  );

  const filteredMedia = galleryFilter === 'images'
    ? images
    : galleryFilter === 'videos'
      ? videos
      : media;

  // Handler: Generate Image (Robust with multi-engine fallback so it never fails)
  const handleGenerate = async () => {
    const rawPrompt = prompt.trim();
    if (!rawPrompt) {
      setGenerationError('Escribe una descripción para la escena antes de generar.');
      return;
    }

    if (onStartGenerativeChat) {
      onStartGenerativeChat({
        type: 'image',
        prompt: rawPrompt,
        model: selectedModel,
        ratio: selectedRatio,
      });
      setPrompt('');
      onClose();
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      const response = await fetch('/api/alibaba/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawPrompt,
          alibabaApiKey: alibabaApiKey || '',
          alibabaBaseUrl: alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
          model: selectedModel,
          size: selectedRatio,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Error al comunicar con el motor de imagen.');
      }

      const imgDataUrl = data.dataUrl || data.url || '';
      if (!imgDataUrl) {
        throw new Error('No se pudo generar la ilustración. Revisa tu clave o conexión.');
      }

      const newAttachment: Attachment = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: `Ilustracion_${selectedModel.replace('wanx2.1-t2i-', '')}_${new Date().toISOString().slice(0, 10)}.jpg`,
        type: 'image/jpeg',
        fileType: 'image',
        dataUrl: imgDataUrl,
        timestamp: Date.now(),
        chatId: activeChatId || undefined,
      };

      if (onAddMedia) {
        onAddMedia(newAttachment);
      }

      const updatedMap = recordImageModelUsage(selectedModel);
      setUsageMap(updatedMap);
      setGeneratedCount((prev) => prev + 1);
      setLastGeneratedImage(newAttachment);
      setPrompt('');
      setActiveTab('gallery');
    } catch (err: any) {
      console.error('[SessionMedia Studio Error]:', err);
      setGenerationError(err.message || 'Error inesperado al generar la imagen');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handler: Generate Video (Wan3.0-Video / Wan2.7-i2v / HappyHorse)
  const handleGenerateVideo = async () => {
    const rawPrompt = videoPrompt.trim();
    if (!rawPrompt && !selectedVideoSourceImage) {
      setVideoGenerationError('Escribe una descripción de la animación o selecciona una imagen de referencia.');
      return;
    }

    if (onStartGenerativeChat) {
      onStartGenerativeChat({
        type: 'video',
        prompt: rawPrompt,
        model: selectedVideoModel,
        duration: videoDuration,
        resolution: videoResolution,
        sourceImage: selectedVideoSourceImage || undefined,
      });
      setVideoPrompt('');
      setSelectedVideoSourceImage('');
      onClose();
      return;
    }

    setIsVideoGenerating(true);
    setVideoGenerationError(null);
    setVideoProgressStep(`Enviando parámetros a ${selectedVideoModel}...`);

    try {
      const stepTimer1 = setTimeout(() => {
        setVideoProgressStep('Sintetizando fotogramas neuronales y movimiento...');
      }, 3500);

      const stepTimer2 = setTimeout(() => {
        setVideoProgressStep('Generando clip de video cinemático...');
      }, 9000);

      const response = await fetch('/api/alibaba/videos/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawPrompt,
          img_url: selectedVideoSourceImage || undefined,
          model: selectedVideoModel,
          duration: videoDuration,
          resolution: videoResolution,
          alibabaApiKey: alibabaApiKey || '',
          alibabaBaseUrl: alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Error al conectar con el motor de video');
      }

      const videoUrl = data.videoUrl || data.posterUrl || '';
      const isPoster = Boolean(data.isMotionPoster);

      if (!videoUrl) {
        throw new Error('No se recibió el video desde Alibaba Cloud.');
      }

      const newVideoAttachment: Attachment = {
        id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: `Video_${selectedVideoModel}_${new Date().toISOString().slice(0, 10)}.${isPoster ? 'jpg' : 'mp4'}`,
        type: isPoster ? 'image/jpeg' : 'video/mp4',
        fileType: 'video',
        videoUrl: videoUrl,
        dataUrl: videoUrl,
        videoModel: selectedVideoModel,
        duration: videoDuration,
        timestamp: Date.now(),
        chatId: activeChatId || undefined,
      };

      if (onAddMedia) {
        onAddMedia(newVideoAttachment);
      }

      setLastGeneratedVideo(newVideoAttachment);
      setVideoPrompt('');
      setActiveTab('gallery');
      setGalleryFilter('videos');
    } catch (err: any) {
      console.error('[Video Generation Error]:', err);
      setVideoGenerationError(err.message || 'Error al generar video');
    } finally {
      setIsVideoGenerating(false);
      setVideoProgressStep('');
    }
  };

  const handleUploadCustomImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setSelectedVideoSourceImage(result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/85 backdrop-blur-xs modal-backdrop-fluid">
        <div className="flex flex-col w-full max-w-4xl h-[92dvh] sm:h-[88vh] sm:max-h-[820px] bg-[#09090b] border border-[#1f1f23] rounded-t-3xl sm:rounded-2xl shadow-2xl text-white overflow-hidden modal-sheet-fluid">
          {/* Mobile bottom-sheet grab bar */}
          <div className="sm:hidden w-10 h-1 bg-zinc-700/60 rounded-full mx-auto mt-2.5 -mb-0.5 shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3.5 border-b border-[#18181c] bg-[#070709] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#121215] border border-[#222226] flex items-center justify-center text-zinc-300 shrink-0">
                {activeTab === 'video' ? <Film size={16} className="text-zinc-200" /> : <ImageIcon size={16} />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate">
                    La Cajita • Estudio de Medios
                  </h2>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#141418] border border-[#242428] text-zinc-400 rounded shrink-0">
                    {media.length} items
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate hidden sm:block">
                  Ilustraciones de novela ligera y generación de video con Wan 3.0
                </p>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-[#161619] transition-colors shrink-0 cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X size={18} />
            </motion.button>
          </div>

          {/* Sub-Header: Segmented Tab Bar (Galería, Crear Ilustración, Modo Video Wan 3.0) */}
          <div className="px-3 sm:px-6 py-2 border-b border-[#18181c] bg-[#09090b] shrink-0">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="grid grid-cols-3 w-full sm:w-auto bg-[#121216] border border-[#222228] p-1 rounded-xl text-xs gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('gallery')}
                  className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg min-h-[44px] transition-all font-medium cursor-pointer select-none active:scale-95 ${
                    activeTab === 'gallery'
                      ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700/60'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Layers size={14} />
                  <span className="truncate">Galería ({media.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg min-h-[44px] transition-all font-medium cursor-pointer select-none active:scale-95 ${
                    activeTab === 'create'
                      ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700/60'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Sparkles size={14} className="text-amber-400" />
                  <span className="truncate">Ilustración</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('video')}
                  className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg min-h-[44px] transition-all font-semibold cursor-pointer select-none active:scale-95 ${
                    activeTab === 'video'
                      ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700/60'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
                  }`}
                >
                  <Film size={14} className="text-zinc-300" />
                  <span className="truncate">Modo Video</span>
                  <span className="text-[9px] px-1 py-0.2 bg-zinc-700/80 text-zinc-300 rounded font-mono">3.0</span>
                </button>
              </div>

              {/* Gallery Filter Pills */}
              {activeTab === 'gallery' && media.length > 0 && (
                <div className="flex items-center gap-1 text-[11px] font-mono">
                  <button
                    type="button"
                    onClick={() => setGalleryFilter('all')}
                    className={`px-2 py-1 rounded cursor-pointer ${galleryFilter === 'all' ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Todos ({media.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryFilter('images')}
                    className={`px-2 py-1 rounded cursor-pointer ${galleryFilter === 'images' ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Fotos ({images.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryFilter('videos')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${galleryFilter === 'videos' ? 'bg-zinc-800 text-white border border-zinc-700 font-semibold' : 'text-zinc-400 hover:text-white'}`}
                  >
                    Videos ({videos.length})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 smooth-scroll">
            <AnimatePresence mode="wait">
              {/* TAB 1: GALERÍA */}
              {activeTab === 'gallery' && (
                <motion.div
                  key="gallery"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* Recent Alert Banner */}
                  {(lastGeneratedImage || lastGeneratedVideo) && (
                    <div className="mb-4 p-3 bg-[#111116] border border-[#27272f] rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {lastGeneratedVideo ? (
                          <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200 shrink-0 shadow-inner">
                            <Film size={20} />
                          </div>
                        ) : (
                          <img
                            src={lastGeneratedImage?.dataUrl}
                            alt="Reciente"
                            className="w-12 h-12 object-cover rounded-lg border border-[#2b2b35] shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <Check size={13} className="text-emerald-400 shrink-0" />
                            <span className="truncate">
                              {lastGeneratedVideo ? 'Video generado con Wan 3.0 con éxito' : 'Ilustración sintetizada con éxito'}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-400 truncate">
                            {lastGeneratedVideo?.name || lastGeneratedImage?.name}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onAttachMedia && (
                          <button
                            onClick={() => {
                              onAttachMedia(lastGeneratedVideo || lastGeneratedImage!);
                              onClose();
                            }}
                            className="min-h-[38px] px-3 bg-white text-black hover:bg-zinc-200 rounded-lg font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer select-none active:scale-95"
                          >
                            <Plus size={13} />
                            <span>Adjuntar</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setLastGeneratedImage(null);
                            setLastGeneratedVideo(null);
                          }}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-400 hover:text-white rounded hover:bg-zinc-800 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {filteredMedia.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 sm:p-14 text-center border border-dashed border-[#1f1f23] rounded-2xl">
                      <div className="w-14 h-14 rounded-2xl bg-[#101014] border border-[#1f1f23] flex items-center justify-center text-zinc-500 mb-3">
                        {galleryFilter === 'videos' ? <Film size={24} className="text-zinc-300" /> : <ImageIcon size={24} />}
                      </div>
                      <h3 className="text-sm font-semibold text-white mb-1">
                        {galleryFilter === 'videos' ? 'No hay videos guardados todavía' : 'La Cajita está vacía'}
                      </h3>
                      <p className="text-xs text-zinc-400 max-w-sm mb-5">
                        {galleryFilter === 'videos'
                          ? 'Crea tu primera animación o toma cinematográfica con Wan 3.0 en el "Modo Video".'
                          : 'Aún no tienes referencias ni ilustraciones guardadas. Puedes crear ilustraciones o animaciones con Wan 3.0.'}
                      </p>
                      <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto px-2 sm:px-0">
                        <button
                          onClick={() => setActiveTab('video')}
                          className="w-full sm:w-auto min-h-[44px] px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm select-none active:scale-95"
                        >
                          <Film size={14} />
                          <span>Crear con Wan 3.0 Video</span>
                        </button>
                        <button
                          onClick={() => setActiveTab('create')}
                          className="w-full sm:w-auto min-h-[44px] px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-colors border border-zinc-700 cursor-pointer select-none active:scale-95"
                        >
                          <Plus size={14} />
                          <span>Crear Ilustración</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
                      {filteredMedia.map((item) => {
                        const isVideo = item.fileType === 'video' || item.type?.startsWith('video/') || Boolean(item.videoUrl);

                        return (
                          <motion.div
                            key={item.id}
                            whileHover={{ scale: 1.02 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                            className="group relative bg-[#0e0e12] border border-[#1b1b1f] hover:border-[#333339] rounded-xl overflow-hidden flex flex-col"
                          >
                            {/* Media Thumbnail */}
                            <div
                              onClick={() => {
                                if (isVideo) {
                                  setSelectedVideoPlayer(item);
                                } else {
                                  setSelectedImage(item);
                                }
                              }}
                              className="aspect-square bg-black relative cursor-pointer overflow-hidden flex items-center justify-center"
                            >
                              {isVideo ? (
                                item.videoUrl?.endsWith('.mp4') || item.dataUrl?.startsWith('data:video/') ? (
                                  <video
                                    src={item.videoUrl || item.dataUrl}
                                    className="w-full h-full object-cover"
                                    muted
                                    loop
                                    playsInline
                                    onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                                    onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()}
                                  />
                                ) : (
                                  <img
                                    src={item.videoUrl || item.dataUrl}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                  />
                                )
                              ) : item.dataUrl ? (
                                <img
                                  src={item.dataUrl}
                                  alt={item.name}
                                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                              ) : (
                                <ImageIcon size={24} className="text-zinc-600" />
                              )}

                              {/* Video Overlay Badge */}
                              {isVideo && (
                                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-xs border border-zinc-700/80 text-zinc-200 text-[10px] font-semibold flex items-center gap-1 shadow-md">
                                  <Play size={10} fill="currentColor" />
                                  <span>{item.duration ? `${item.duration}s` : 'Video'}</span>
                                </div>
                              )}

                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <span className="p-2.5 bg-black/80 rounded-full text-white min-h-[36px] min-w-[36px] flex items-center justify-center shadow-lg">
                                  {isVideo ? <Play size={18} fill="currentColor" /> : <Eye size={16} />}
                                </span>
                              </div>
                            </div>

                            {/* Metadata & Actions */}
                            <div className="p-2 sm:p-2.5 flex flex-col gap-1.5 border-t border-[#18181c]">
                              <div className="flex items-center justify-between gap-1 text-[11px]">
                                <div className="font-medium text-white truncate min-w-0" title={item.name}>
                                  {item.name}
                                </div>
                                <div className="text-[10px] font-mono text-zinc-500 shrink-0">
                                  {isVideo ? 'Wan 3.0' : typeof item.size === 'number' ? `${Math.round(item.size / 1024) || 1} KB` : ''}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 pt-0.5">
                                {onAttachMedia && (
                                  <button
                                    onClick={() => {
                                      onAttachMedia(item);
                                      onClose();
                                    }}
                                    className="flex-1 min-h-[36px] px-2 bg-white text-black hover:bg-zinc-200 rounded-lg font-medium text-[11px] transition-colors flex items-center justify-center gap-1 cursor-pointer select-none active:scale-95"
                                    title="Adjuntar al chat actual"
                                  >
                                    <Plus size={12} />
                                    <span>Adjuntar</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    const a = document.createElement('a');
                                    a.href = item.videoUrl || item.dataUrl || '';
                                    a.download = item.name;
                                    a.click();
                                  }}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-[#18181c] cursor-pointer select-none active:scale-95"
                                  title="Descargar"
                                >
                                  <Download size={13} />
                                </button>
                                <button
                                  onClick={() => onDeleteMedia(item.id)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-red-400 rounded-lg hover:bg-[#18181c] cursor-pointer select-none active:scale-95"
                                  title="Eliminar"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}

              {/* TAB 2: CREAR ILUSTRACIÓN (IMAGEN) */}
              {activeTab === 'create' && (
                <motion.div
                  key="create"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4 sm:space-y-5 max-w-2xl mx-auto py-1"
                >
                  {/* Status Banner */}
                  <div className="p-3 sm:p-3.5 bg-[#0e0e13] border border-[#202028] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#15151c] border border-[#262632] flex items-center justify-center text-amber-400 shrink-0">
                        <Sparkles size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">Sintetizador de Novela Ligera</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded shrink-0">
                            ✓ Motor Multi-Nivel Activo
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          Genera ilustraciones fieles a tu lore sin riesgo de error ni caídas.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Engine & Model Selector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                        <Cpu size={14} className="text-zinc-400" />
                        <span>Modelo de Ilustración</span>
                      </label>
                      <span className="text-[10px] font-mono text-zinc-500">6 Modelos</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {IMAGE_MODELS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedModel(m.id)}
                          className={`p-3 rounded-xl border text-left transition-all min-h-[64px] flex flex-col justify-between cursor-pointer ${
                            selectedModel === m.id
                              ? 'bg-[#181820] border-zinc-400 text-white ring-1 ring-zinc-400'
                              : 'bg-[#0f0f14] border-[#222228] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-white truncate">{m.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded">
                              {m.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                            {m.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <Sliders size={14} className="text-zinc-400" />
                      <span>Formato & Resolución</span>
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRatio('1024*1024')}
                        className={`min-h-[50px] p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer select-none active:scale-95 ${
                          selectedRatio === '1024*1024'
                            ? 'bg-zinc-800 border-zinc-500 text-white'
                            : 'bg-[#0f0f14] border-[#222228] text-zinc-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <Square size={13} />
                          <span>1:1</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400 mt-0.5">1024×1024</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedRatio('720*1280')}
                        className={`min-h-[50px] p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer select-none active:scale-95 ${
                          selectedRatio === '720*1280'
                            ? 'bg-zinc-800 border-zinc-500 text-white'
                            : 'bg-[#0f0f14] border-[#222228] text-zinc-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <Smartphone size={13} />
                          <span>9:16</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400 mt-0.5">720×1280</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedRatio('1280*720')}
                        className={`min-h-[50px] p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer select-none active:scale-95 ${
                          selectedRatio === '1280*720'
                            ? 'bg-zinc-800 border-zinc-500 text-white'
                            : 'bg-[#0f0f14] border-[#222228] text-zinc-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <Monitor size={13} />
                          <span>16:9</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400 mt-0.5">1280×720</span>
                      </button>
                    </div>
                  </div>

                  {/* Style Presets */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <Sparkles size={14} className="text-zinc-400" />
                      <span>Arquetipos de Jukkou no Zankyou</span>
                    </label>

                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {STYLE_PRESETS.map((p) => {
                        const Icon = p.icon;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPrompt(p.prompt)}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#121217] border border-[#222229] hover:border-zinc-600 text-zinc-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer select-none active:scale-95"
                          >
                            <Icon size={13} className="text-zinc-400" />
                            <span>{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Prompt Textarea */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <BookOpen size={14} className="text-zinc-400" />
                      <span>Descripción de la Escena / Personaje</span>
                    </label>

                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Escribe la composición, iluminación, postura o elementos de la escena para sintetizar..."
                      rows={3}
                      className="w-full bg-[#0a0a0e] border border-[#24242c] focus:border-zinc-500 focus:outline-none rounded-xl p-3 text-[16px] md:text-sm text-zinc-100 placeholder:text-zinc-600 resize-none transition-colors"
                    />
                  </div>

                  {generationError && (
                    <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl flex items-center gap-2.5 text-xs text-red-200">
                      <AlertCircle size={15} className="shrink-0 text-red-400" />
                      <span>{generationError}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2 pb-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('gallery')}
                      className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={isGenerating || !prompt.trim()}
                      className="w-full sm:w-auto min-h-[48px] px-5 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer select-none active:scale-95"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 size={15} className="animate-spin text-black" />
                          <span>Sintetizando escena...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} className="text-black" />
                          <span>Sintetizar con {currentImageModelDef.name}</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* TAB 3: MODO VIDEO (WAN 3.0 / BAILIAN STYLE) */}
              {activeTab === 'video' && (
                <motion.div
                  key="video"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4 sm:space-y-5 max-w-2xl mx-auto py-1"
                >
                  {/* Alibaba Bailian Wan 3.0 Header Card (OpenWebUI Noir Theme) */}
                  <div className="p-3.5 sm:p-4 bg-[#0d0d10] border border-zinc-800/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-200 shrink-0 shadow-inner">
                        <Film size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base text-white">{currentVideoModelDef.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full font-semibold">
                            {currentVideoModelDef.badge} • {currentVideoModelDef.quota}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full">
                            RPM 300
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                          Modelo unificado de video: Text to Video e Image to Video con soporte de hasta 30 segundos continuos, audio sincronizado y 480P a 1080P.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Mode Toggle: Text to Video vs Image to Video */}
                  <div className="grid grid-cols-2 p-1 bg-[#121217] border border-[#22222a] rounded-xl text-xs gap-1">
                    <button
                      type="button"
                      onClick={() => setVideoMode('text2video')}
                      className={`flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-lg font-medium transition-all cursor-pointer select-none active:scale-95 ${
                        videoMode === 'text2video'
                          ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700/60'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <BookOpen size={14} />
                      <span className="truncate">Texto a Video (T2V)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoMode('image2video')}
                      className={`flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-lg font-medium transition-all cursor-pointer select-none active:scale-95 ${
                        videoMode === 'image2video'
                          ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700/60'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <ImageIcon size={14} />
                      <span className="truncate">Imagen a Video (I2V)</span>
                    </button>
                  </div>

                  {/* Image Selector for Image to Video */}
                  {videoMode === 'image2video' && (
                    <div className="space-y-2 p-3 bg-[#0d0d12] border border-[#22222a] rounded-xl">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                          <ImageIcon size={14} className="text-zinc-400" />
                          <span>Fotograma Inicial (Referencia de Animación)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="min-h-[36px] text-[11px] text-zinc-300 hover:text-white underline flex items-center gap-1 cursor-pointer select-none"
                        >
                          <Upload size={12} />
                          <span>Subir desde dispositivo</span>
                        </button>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleUploadCustomImage}
                          accept="image/*"
                          className="hidden"
                        />
                      </div>

                      {/* Selected Image Preview */}
                      {selectedVideoSourceImage ? (
                        <div className="relative w-36 h-36 rounded-xl overflow-hidden border-2 border-zinc-500 shadow-md">
                          <img
                            src={selectedVideoSourceImage}
                            alt="Fuente de video"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedVideoSourceImage('')}
                            className="absolute top-1 right-1 min-h-[32px] min-w-[32px] p-1 bg-black/80 rounded-full text-white hover:text-red-400 cursor-pointer flex items-center justify-center"
                            title="Quitar imagen"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : images.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-zinc-400">Selecciona una imagen de La Cajita para darle vida con Wan 3.0:</p>
                          <div className="flex gap-2 overflow-x-auto pb-1.5">
                            {images.slice(0, 10).map((img) => (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => setSelectedVideoSourceImage(img.dataUrl || '')}
                                className="w-16 h-16 rounded-lg overflow-hidden border border-[#2a2a35] hover:border-zinc-400 shrink-0 cursor-pointer transition-all select-none active:scale-95"
                              >
                                <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">
                          No tienes imágenes en La Cajita. Sube una imagen o usa el modo Texto a Video.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Video Model Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <Cpu size={14} className="text-zinc-400" />
                      <span>Motor de Video (Alibaba Bailian / DashScope)</span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {VIDEO_MODELS.filter((m) =>
                        videoMode === 'text2video' ? m.type === 'all' || m.type === 't2v' : m.type === 'all' || m.type === 'i2v'
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedVideoModel(m.id)}
                          className={`p-3 rounded-xl border text-left transition-all min-h-[64px] flex flex-col justify-between cursor-pointer select-none active:scale-[0.99] ${
                            selectedVideoModel === m.id
                              ? 'bg-[#181820] border-zinc-400 text-white ring-1 ring-zinc-400'
                              : 'bg-[#0f0f14] border-[#222228] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-white truncate">{m.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded">
                                {m.badge}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#181822] text-amber-400 rounded">
                                {m.quota}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                            {m.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resolution & Duration Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        Resolución
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['720P', '1080P', '480P'] as const).map((res) => (
                          <button
                            key={res}
                            type="button"
                            onClick={() => setVideoResolution(res)}
                            className={`min-h-[44px] py-1.5 rounded-lg text-xs font-mono font-medium border cursor-pointer transition-colors select-none active:scale-95 flex items-center justify-center ${
                              videoResolution === res
                                ? 'bg-zinc-800 border-zinc-500 text-white'
                                : 'bg-[#121217] border-[#22222a] text-zinc-400 hover:text-white'
                            }`}
                          >
                            {res}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                          Duración
                        </label>
                        <span className="text-[10px] text-zinc-300 font-mono">
                          {videoDuration === 30 ? 'Wan 3.0 (30s Continuos)' : `${videoDuration}s`}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { val: 5, label: '5s' },
                          { val: 10, label: '10s' },
                          { val: 15, label: '15s' },
                          { val: 30, label: '30s (Max)' },
                        ].map((item) => (
                          <button
                            key={item.val}
                            type="button"
                            onClick={() => setVideoDuration(item.val)}
                            className={`min-h-[44px] py-1.5 rounded-lg text-xs font-mono font-medium border cursor-pointer transition-colors select-none active:scale-95 flex items-center justify-center ${
                              videoDuration === item.val
                                ? 'bg-zinc-800 border-zinc-500 text-white ring-1 ring-zinc-500'
                                : 'bg-[#121217] border-[#22222a] text-zinc-400 hover:text-white'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Video Style Presets */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Movimientos Cinemáticos Sugeridos
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {VIDEO_STYLE_PRESETS.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setVideoPrompt(p.prompt)}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[#121217] border border-[#222229] hover:border-zinc-500 text-zinc-300 hover:text-white text-xs transition-colors cursor-pointer select-none active:scale-95"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Video Prompt Textarea */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <Film size={14} className="text-zinc-400" />
                      <span>Instrucciones de Movimiento / Escena</span>
                    </label>

                    <textarea
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                      placeholder={
                        videoMode === 'image2video'
                          ? 'Describe cómo se anima la imagen (movimiento de cámara, pelo al viento, niebla, parpadeo de ojos)...'
                          : 'Describe la toma cinemática, iluminación, ritmo y dinamismo de la escena...'
                      }
                      rows={3}
                      className="w-full bg-[#0a0a0e] border border-[#24242c] focus:border-zinc-500 focus:outline-none rounded-xl p-3 text-[16px] md:text-sm text-zinc-100 placeholder:text-zinc-600 resize-none transition-colors"
                    />
                  </div>

                  {/* Real-time Progress Card */}
                  {isVideoGenerating && (
                    <div className="p-3.5 bg-zinc-900/90 border border-zinc-700/80 rounded-xl flex items-center gap-3 text-xs text-zinc-200 animate-pulse">
                      <Loader2 size={18} className="animate-spin text-zinc-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white">{currentVideoModelDef.name} Generando...</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">{videoProgressStep}</div>
                      </div>
                    </div>
                  )}

                  {videoGenerationError && (
                    <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl flex items-center gap-2.5 text-xs text-red-200">
                      <AlertCircle size={15} className="shrink-0 text-red-400" />
                      <span>{videoGenerationError}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2 pb-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('gallery')}
                      className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer select-none active:scale-95"
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerateVideo}
                      disabled={isVideoGenerating || (!videoPrompt.trim() && !selectedVideoSourceImage)}
                      className="w-full sm:w-auto min-h-[48px] px-5 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer select-none active:scale-95"
                    >
                      {isVideoGenerating ? (
                        <>
                          <Loader2 size={15} className="animate-spin text-black" />
                          <span>Generando video...</span>
                        </>
                      ) : (
                        <>
                          <Film size={15} className="text-black" />
                          <span>Generar Video con {currentVideoModelDef.name}</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Full-screen lightbox for images */}
      <ImageLightbox
        image={selectedImage}
        onClose={() => setSelectedImage(null)}
        onDelete={onDeleteMedia}
      />

      {/* Full-screen Video Player Modal */}
      {selectedVideoPlayer && (
        <div
          onClick={() => setSelectedVideoPlayer(null)}
          className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl bg-[#09090b] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-[#0c0c10]">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Film size={15} className="text-zinc-300" />
                <span className="truncate max-w-[200px] sm:max-w-md">{selectedVideoPlayer.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 shrink-0">
                  {selectedVideoPlayer.videoModel || 'Wan 3.0 Video'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVideoPlayer(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer select-none active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <div className="aspect-video bg-black flex items-center justify-center overflow-hidden">
              {selectedVideoPlayer.videoUrl?.endsWith('.mp4') || selectedVideoPlayer.dataUrl?.startsWith('data:video/') ? (
                <video
                  src={selectedVideoPlayer.videoUrl || selectedVideoPlayer.dataUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={selectedVideoPlayer.videoUrl || selectedVideoPlayer.dataUrl}
                  alt={selectedVideoPlayer.name}
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-t border-zinc-800 bg-[#0c0c10] gap-2">
              <span className="text-[11px] text-zinc-400 font-mono">
                {selectedVideoPlayer.duration ? `${selectedVideoPlayer.duration} segundos` : 'Clip HD'}
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {onAttachMedia && (
                  <button
                    type="button"
                    onClick={() => {
                      onAttachMedia(selectedVideoPlayer);
                      setSelectedVideoPlayer(null);
                      onClose();
                    }}
                    className="flex-1 sm:flex-none min-h-[44px] px-3.5 bg-white text-black hover:bg-zinc-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer select-none active:scale-95"
                  >
                    <Plus size={13} />
                    <span>Adjuntar al chat</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = selectedVideoPlayer.videoUrl || selectedVideoPlayer.dataUrl || '';
                    a.download = selectedVideoPlayer.name;
                    a.click();
                  }}
                  className="flex-1 sm:flex-none min-h-[44px] px-3.5 bg-[#181820] hover:bg-[#252530] text-zinc-200 hover:text-white border border-white/10 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer select-none active:scale-95"
                >
                  <Download size={13} />
                  <span>Descargar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
