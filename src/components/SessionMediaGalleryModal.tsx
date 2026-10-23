import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Image as ImageIcon,
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
  ExternalLink,
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
  activeChatId?: string | null;
}

type AspectRatioOption = '1024*1024' | '720*1280' | '1280*720';
export type WanxModelOption =
  | 'qwen-image-3.0-pro'
  | 'qwen-image-2.1-pro'
  | 'wan2.6-image'
  | 'z-image-turbo'
  | 'wanx2.1-t2i-plus'
  | 'wanx2.1-t2i-turbo';

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

export const SessionMediaGalleryModal: React.FC<SessionMediaGalleryModalProps> = ({
  isOpen,
  onClose,
  media,
  onDeleteMedia,
  onAttachMedia,
  onAddMedia,
  alibabaApiKey,
  activeChatId,
}) => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'create'>('gallery');
  const [selectedImage, setSelectedImage] = useState<Attachment | null>(null);

  // Studio Creator State
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<WanxModelOption>('wanx2.1-t2i-plus');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioOption>('1024*1024');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [lastGeneratedImage, setLastGeneratedImage] = useState<Attachment | null>(null);
  const [generatedCount, setGeneratedCount] = useState<number>(0);
  const [usageMap, setUsageMap] = useState<ImageModelUsageMap>(getStoredImageModelCounts);

  if (!isOpen) return null;

  // Filter only valid image attachments with non-empty dataUrl
  const images = media.filter((m) =>
    Boolean(
      m.dataUrl &&
        m.dataUrl.trim() &&
        (m.type?.startsWith('image/') ||
          m.fileType === 'image' ||
          m.dataUrl.startsWith('data:') ||
          m.dataUrl.startsWith('http'))
    )
  );

  const handleGenerate = async () => {
    const rawPrompt = prompt.trim();
    if (!rawPrompt) {
      setGenerationError('Escribe una descripción para la escena antes de generar.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    try {
      let imgDataUrl = '';
      let usedModel = selectedModel;

      try {
        const response = await fetch('/api/alibaba/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: rawPrompt,
            alibabaApiKey: alibabaApiKey || '',
            model: selectedModel,
            size: selectedRatio,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          imgDataUrl = data.dataUrl || data.url || '';
          if (data.model) usedModel = data.model;
        } else {
          const errData = await response.json().catch(() => ({}));
          console.warn('[Alibaba Studio API Notice]:', errData);
          if (alibabaApiKey && errData.error) {
            setGenerationError(errData.error);
          }
        }
      } catch (srvErr: any) {
        console.warn('[Alibaba Studio API Network Error]:', srvErr);
      }

      // Universal client fallback if server endpoint failed or timed out
      if (!imgDataUrl) {
        const seed = Math.floor(Math.random() * 1000000);
        const [w, h] = selectedRatio.split('*');
        const cleanSnippet = encodeURIComponent(
          `masterpiece anime light novel illustration, dark fantasy visual novel concept art, dramatic lighting, high detail: ${rawPrompt.slice(0, 320)}`
        );
        const directUrl = `https://image.pollinations.ai/prompt/${cleanSnippet}?width=${w}&height=${h}&seed=${seed}&nologo=true&private=true&enhance=false&model=flux`;
        try {
          const directRes = await fetch(directUrl);
          if (directRes.ok) {
            const blob = await directRes.blob();
            imgDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result || ''));
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } else {
            imgDataUrl = directUrl;
          }
        } catch {
          imgDataUrl = directUrl;
        }
      }

      if (!imgDataUrl) {
        throw new Error('No se pudo generar la ilustración. Revisa tu conexión o clave.');
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

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/85 backdrop-blur-xs modal-backdrop-fluid">
        <div className="flex flex-col w-full max-w-4xl h-[92dvh] sm:h-auto sm:max-h-[88vh] bg-[#09090b] border border-[#1f1f23] rounded-t-2xl sm:rounded-xl shadow-2xl text-white overflow-hidden modal-sheet-fluid">
          {/* Mobile Drag Indicator */}
          <div className="sm:hidden w-10 h-1 bg-zinc-700/60 rounded-full mx-auto mt-2.5 mb-0.5 shrink-0" />

          {/* Top Header Row */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 sm:py-3.5 border-b border-[#18181c] bg-[#070709] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#121215] border border-[#222226] flex items-center justify-center text-zinc-300 shrink-0">
                <ImageIcon size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate">
                    La Cajita
                  </h2>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#141418] border border-[#242428] text-zinc-400 rounded shrink-0">
                    {images.length}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate hidden sm:block">
                  Galería visual y sintetizador conceptual de Jukkou no Zankyou
                </p>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-[#161619] transition-colors shrink-0"
              aria-label="Cerrar modal"
            >
              <X size={18} />
            </motion.button>
          </div>

          {/* Sub-Header: Segmented Tab Bar */}
          <div className="px-4 sm:px-6 py-2 border-b border-[#18181c] bg-[#09090b] shrink-0">
            <div className="grid grid-cols-2 max-w-xs sm:w-auto bg-[#121216] border border-[#222228] p-1 rounded-lg text-xs">
              <button
                onClick={() => setActiveTab('gallery')}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-md min-h-[36px] transition-all font-medium ${
                  activeTab === 'gallery'
                    ? 'bg-zinc-800 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Layers size={13} />
                <span>Galería ({images.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-md min-h-[36px] transition-all font-medium ${
                  activeTab === 'create'
                    ? 'bg-zinc-800 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Plus size={13} />
                <span>Crear Arte</span>
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 smooth-scroll">
            <AnimatePresence mode="wait">
              {activeTab === 'gallery' ? (
                <motion.div
                  key="gallery"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {lastGeneratedImage && lastGeneratedImage.dataUrl && lastGeneratedImage.dataUrl.trim() && (
                    <div className="mb-4 p-3 bg-[#111116] border border-[#27272f] rounded-lg flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={lastGeneratedImage.dataUrl}
                          alt="Reciente"
                          className="w-12 h-12 object-cover rounded border border-[#2b2b35] shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <Check size={13} className="text-emerald-400 shrink-0" />
                            <span className="truncate">Ilustración sintetizada con éxito</span>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-400 truncate">
                            {lastGeneratedImage.name}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onAttachMedia && (
                          <button
                            onClick={() => {
                              onAttachMedia(lastGeneratedImage);
                              onClose();
                            }}
                            className="min-h-[38px] px-3 bg-white text-black hover:bg-zinc-200 rounded font-medium text-xs transition-colors flex items-center gap-1.5"
                          >
                            <Plus size={13} />
                            <span>Adjuntar</span>
                          </button>
                        )}
                        <button
                          onClick={() => setLastGeneratedImage(null)}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-400 hover:text-white rounded hover:bg-zinc-800"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {images.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-10 sm:p-12 text-center border border-dashed border-[#1f1f23] rounded-lg">
                      <div className="w-12 h-12 rounded-full bg-[#101014] border border-[#1f1f23] flex items-center justify-center text-zinc-500 mb-3">
                        <ImageIcon size={20} />
                      </div>
                      <h3 className="text-xs font-semibold text-white mb-1">
                        La Cajita está vacía
                      </h3>
                      <p className="text-[11px] text-zinc-400 max-w-sm mb-4">
                        Aún no tienes referencias ni ilustraciones guardadas. Puedes crear una nueva pieza conceptual usando el botón "Crear Arte".
                      </p>
                      <button
                        onClick={() => setActiveTab('create')}
                        className="min-h-[44px] px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md text-xs font-medium flex items-center gap-2 transition-colors border border-zinc-700"
                      >
                        <Plus size={14} />
                        <span>Sintetizar primer concepto</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {images.map((img) => (
                        <motion.div
                          key={img.id}
                          whileHover={{ scale: 1.02 }}
                          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                          className="group relative bg-[#0e0e12] border border-[#1b1b1f] hover:border-[#333339] rounded-lg overflow-hidden flex flex-col"
                        >
                          {/* Thumbnail container */}
                          <div
                            onClick={() => setSelectedImage(img)}
                            className="aspect-square bg-black relative cursor-pointer overflow-hidden flex items-center justify-center"
                          >
                            {img.dataUrl ? (
                              <img
                                src={img.dataUrl}
                                alt={img.name}
                                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                              />
                            ) : (
                              <ImageIcon size={24} className="text-zinc-600" />
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <span className="p-2 bg-black/70 rounded text-white min-h-[36px] min-w-[36px] flex items-center justify-center">
                                <Eye size={16} />
                              </span>
                            </div>
                          </div>

                          {/* Metadata & Actions in Stidied Mobile Stacking */}
                          <div className="p-2 sm:p-2.5 flex flex-col gap-1.5 border-t border-[#18181c]">
                            <div className="flex items-center justify-between gap-1 text-[11px]">
                              <div className="font-medium text-white truncate min-w-0" title={img.name}>
                                {img.name}
                              </div>
                              <div className="text-[10px] font-mono text-zinc-500 shrink-0">
                                {typeof img.size === 'number'
                                  ? `${Math.round(img.size / 1024) || 1} KB`
                                  : img.size || ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 pt-0.5">
                              {onAttachMedia && (
                                <button
                                  onClick={() => {
                                    onAttachMedia(img);
                                    onClose();
                                  }}
                                  className="flex-1 min-h-[32px] px-2 bg-white text-black hover:bg-zinc-200 rounded font-medium text-[11px] transition-colors flex items-center justify-center gap-1"
                                  title="Adjuntar al chat actual"
                                >
                                  <Plus size={11} />
                                  <span>Adjuntar</span>
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const a = document.createElement('a');
                                  a.href = img.dataUrl || '';
                                  a.download = img.name;
                                  a.click();
                                }}
                                className="min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-400 hover:text-white rounded hover:bg-[#18181c]"
                                title="Descargar"
                              >
                                <Download size={12} />
                              </button>
                              <button
                                onClick={() => onDeleteMedia(img.id)}
                                className="min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-400 hover:text-red-400 rounded hover:bg-[#18181c]"
                                title="Eliminar"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="create"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4 sm:space-y-5 max-w-2xl mx-auto py-1"
                >
                  {/* Quota & API Usage Monitor Card - Clean Responsive Layout */}
                  <div className="p-3 sm:p-3.5 bg-[#0e0e13] border border-[#202028] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#15151c] border border-[#262632] flex items-center justify-center text-amber-400 shrink-0">
                        <Sparkles size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">Alibaba Model Studio (Singapur)</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded shrink-0">
                            {alibabaApiKey ? '✓ Clave Activa' : 'Modo Flux Gratuito'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          Ilustraciones generadas en esta sesión: <strong className="text-zinc-200">{generatedCount}</strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Engine & Model Selector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                        <Cpu size={14} className="text-zinc-400" />
                        <span>Sintetizador Visual (Alibaba Model Studio)</span>
                      </label>
                      <span className="text-[10px] font-mono text-zinc-500">
                        6 Modelos Disponibles
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {IMAGE_MODELS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedModel(m.id)}
                          className={`p-3 rounded-lg border text-left transition-all min-h-[64px] flex flex-col justify-between cursor-pointer ${
                            selectedModel === m.id
                              ? 'bg-[#181820] border-zinc-400 text-white ring-1 ring-zinc-400'
                              : 'bg-[#0f0f14] border-[#222228] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-white truncate">{m.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-zinc-800 text-zinc-300 rounded">
                                {m.badge}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#181822] text-amber-400/90 border border-amber-500/20 rounded">
                                {usageMap[m.id] ? `${usageMap[m.id]} usos` : '0 usos'}
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

                  {/* Aspect Ratio Selector with Responsive Stacking */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <Sliders size={14} className="text-zinc-400" />
                      <span>Formato & Resolución</span>
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRatio('1024*1024')}
                        className={`min-h-[50px] p-2 rounded-lg border flex flex-col items-center justify-center text-center transition-all ${
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
                        className={`min-h-[50px] p-2 rounded-lg border flex flex-col items-center justify-center text-center transition-all ${
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
                        className={`min-h-[50px] p-2 rounded-lg border flex flex-col items-center justify-center text-center transition-all ${
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
                            className="min-h-[36px] px-2.5 py-1.5 rounded-md bg-[#121217] border border-[#222229] hover:border-zinc-600 text-zinc-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors"
                          >
                            <Icon size={13} className="text-zinc-400" />
                            <span>{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Prompt Textarea with iOS Zoom Guard */}
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
                      className="w-full bg-[#0a0a0e] border border-[#24242c] focus:border-zinc-500 focus:outline-none rounded-lg p-3 text-[16px] md:text-sm text-zinc-100 placeholder:text-zinc-600 resize-none transition-colors"
                    />
                  </div>

                  {/* Error Notification */}
                  {generationError && (
                    <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-center gap-2.5 text-xs text-red-200">
                      <AlertCircle size={15} className="shrink-0 text-red-400" />
                      <span>{generationError}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2.5 pt-2 pb-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('gallery')}
                      className="min-h-[44px] px-4 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={isGenerating || !prompt.trim()}
                      className="min-h-[44px] px-5 bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-md"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 size={15} className="animate-spin text-black" />
                          <span>Sintetizando escena...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} className="text-black" />
                          <span>Sintetizar Ilustración</span>
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

      {/* Full-screen lightbox when clicked */}
      <ImageLightbox
        image={selectedImage}
        onClose={() => setSelectedImage(null)}
        onDelete={onDeleteMedia}
      />
    </>
  );
};
