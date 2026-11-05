import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Zap,
  Globe,
  Copy,
  Check,
  X,
  BookOpen,
  Cpu,
  Shield,
  Layers,
  ArrowRight,
  ExternalLink,
  Building2,
  MapPin,
  Server,
  Feather,
  Terminal,
  Award,
  Play,
  Code,
  Lock,
  ChevronRight,
  Bookmark,
  Sparkle
} from 'lucide-react';

interface CompanyLandingModalProps {
  isOpen: boolean;
  onClose: () => void;
  appSharedUrl?: string;
  isStandalone?: boolean;
}

export const CompanyLandingModal: React.FC<CompanyLandingModalProps> = ({
  isOpen,
  onClose,
  appSharedUrl = typeof window !== 'undefined' ? window.location.href : '',
  isStandalone = false,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tech' | 'catalyst' | 'novel'>('overview');

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://kizu.steycopstudios.com';
  const isCustomDomain = typeof window !== 'undefined' && window.location.hostname.includes('steycopstudios.com');
  const displayWebsite = isCustomDomain 
    ? `https://${window.location.hostname}?view=landing` 
    : 'https://kizu.steycopstudios.com';

  const catalystData = {
    companyName: 'Kizuna-Zek AI Studio',
    companyWebsite: displayWebsite,
    companyHq: 'Argentina',
  };

  const copyToClipboard = (text: string, fieldKey: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 overflow-y-auto selection:bg-amber-500/30 selection:text-amber-900 dark:selection:text-amber-200">
        {/* Universal Top Navigation Header */}
        <header className="sticky top-0 z-50 w-full border-b border-zinc-200 dark:border-zinc-800/80 bg-white/95 dark:bg-[#09090b]/90 backdrop-blur-xl px-4 md:px-8 py-3.5 flex items-center justify-between shadow-sm dark:shadow-2xl">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-red-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold shadow-lg shadow-amber-500/10">
              <BookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">Kizuna-Zek</span>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
                  AI Studio
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 hidden sm:block">Alibaba Cloud Model Studio Enterprise Partner</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 text-xs font-medium bg-zinc-100 dark:bg-zinc-900/80 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'overview'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Visión & Producto
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tech')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'tech'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Arquitectura Técnica
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('novel')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'novel'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Obra Canon
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('catalyst')}
              className={`px-4 py-2 rounded-lg flex items-center space-x-1.5 transition-all ${
                activeTab === 'catalyst'
                  ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold border border-amber-500/40 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Alibaba Catalyst Grant</span>
            </button>
          </nav>

          {/* Right Action Button */}
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs flex items-center space-x-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <span>Abrir App Studio</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Mobile Nav Bar */}
        <div className="md:hidden flex items-center justify-around border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/95 dark:bg-zinc-950 px-2 py-2 text-[11px] font-medium sticky top-[65px] z-40">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`min-h-[40px] px-2.5 py-1.5 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-zinc-900 text-white dark:bg-zinc-800 dark:text-white font-bold shadow-xs' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Visión
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tech')}
            className={`min-h-[40px] px-2.5 py-1.5 rounded-lg transition-colors ${activeTab === 'tech' ? 'bg-zinc-900 text-white dark:bg-zinc-800 dark:text-white font-bold shadow-xs' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Arquitectura
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('novel')}
            className={`min-h-[40px] px-2.5 py-1.5 rounded-lg transition-colors ${activeTab === 'novel' ? 'bg-zinc-900 text-white dark:bg-zinc-800 dark:text-white font-bold shadow-xs' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            Lore
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('catalyst')}
            className={`min-h-[40px] px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition-colors ${activeTab === 'catalyst' ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold border border-amber-500/40' : 'text-zinc-600 dark:text-zinc-400'}`}
          >
            <Award className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Catalyst</span>
          </button>
        </div>

        {/* Hero & Main Body Section */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-8 md:py-12 space-y-12">
          {activeTab === 'overview' && (
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
              {/* Hero Banner */}
              <div className="relative p-8 md:p-14 rounded-3xl bg-gradient-to-b from-amber-50/70 via-white to-zinc-100/90 dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-950 border border-zinc-200 dark:border-zinc-800 text-center space-y-6 overflow-hidden shadow-xl dark:shadow-2xl">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-64 bg-amber-500/10 blur-3xl pointer-events-none rounded-full" />

                <span className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/35 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-semibold tracking-wide">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Plataforma de Escritura Literaria Asistida por IA</span>
                </span>

                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight text-zinc-900 dark:text-white max-w-4xl mx-auto leading-tight">
                  Kizuna-Zek AI Studio
                </h1>

                <p className="text-sm md:text-base text-zinc-700 dark:text-zinc-300 max-w-2xl mx-auto leading-relaxed">
                  Redefiniendo la narrativa de novela ligera, drama psicológico y fantasía oscura mediante la integración con <strong className="text-amber-700 dark:text-amber-300 font-bold">Alibaba Cloud Model Studio (`qwen3.8-max`)</strong>, razonamiento continuo y protección inteligente de contexto.
                </p>

                <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm flex items-center space-x-2 shadow-xl shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    <span>Ingresar al Taller de Escritura</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('catalyst')}
                    className="min-h-[48px] px-6 py-3 rounded-xl bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-200 font-semibold text-sm border border-zinc-300 dark:border-zinc-800 flex items-center space-x-2 transition-all cursor-pointer shadow-xs"
                  >
                    <Award className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                    <span>Ver Postulación Alibaba Catalyst ($120K)</span>
                  </button>
                </div>
              </div>

              {/* Etymology & Identity Card */}
              <div className="p-6 md:p-8 rounded-2xl bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-xs">
                <div className="flex items-center space-x-3">
                  <Bookmark className="w-6 h-6 text-amber-500 dark:text-amber-400" />
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Origen y Simbolismo del Nombre</h3>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  <strong>Kizuna-Zek</strong> (abreviada coloquialmente como <strong>"Kizu"</strong>) combina el concepto japonés <strong>Kizuna (絆)</strong>, que representa los vínculos indelebles y anclas emocionales entre personas, con el apellido del protagonista de la obra principal, <strong>Kolder Zekshoyu</strong>.
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Asimismo, el acrónimo <strong>"Kizu" (傷)</strong> significa <em>"herida"</em> en japonés, haciendo alegoría al trasfondo de drama psicológico, la extirpación límbica y los traumas no resueltos que impulsan la narrativa de los personajes.
                </p>
              </div>

              {/* Key Product Pillars Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-xs">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Shield className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">2K Token Shield</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Compresión automática del lore a un máximo de ~2,000 tokens de alta densidad. Minimiza latencia y costos sin perder continuidad en tramas complejas.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-xs">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Cpu className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Razonamiento Chain-of-Thought</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Captura directa de los procesos de pensamiento del modelo ("💧 Pensado durante..."), aislados en contenedores colapsables para no entorpecer la lectura.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-xs">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <Feather className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Suite Editorial Completa</h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Exportación a EPUB, sincronización en nube con Firestore, biblioteca de Lore en tiempo real e integración con Google Drive.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'tech' && (
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-xs">
                <div className="flex items-center space-x-3">
                  <Terminal className="w-6 h-6 text-amber-500 dark:text-amber-400" />
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Arquitectura de Servidor & Alibaba Cloud Integration</h3>
                </div>

                <div className="bg-zinc-100 dark:bg-zinc-950 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-800 dark:text-zinc-300 space-y-2 overflow-x-auto">
                  <p className="text-amber-700 dark:text-amber-400 font-semibold">// Alibaba Cloud Model Studio Configuration (SSE Proxy)</p>
                  <p><span className="text-zinc-500">Endpoint:</span> https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1</p>
                  <p><span className="text-zinc-500">Primary LLM:</span> qwen3.8-max (enable_thinking: true)</p>
                  <p><span className="text-zinc-500">Secondary Engine:</span> Google Gemini 3.6 Flash API</p>
                  <p><span className="text-zinc-500">Microservice Fallback:</span> StepFun on NVIDIA NIM Microservices</p>
                  <p><span className="text-zinc-500">Keep-Alive KV Cache:</span> Active 15-minute ping interval</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2 shadow-xs">
                  <h4 className="text-sm font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Compresión 2K Lore Shield</h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    En lugar de saturar el contexto con cientos de miles de tokens de capítulos antiguos, el motor de Kizuna-Zek comprime automáticamente las fichas narrativas manteniendo la coherencia sin disparar los costos de facturación.
                  </p>
                </div>

                <div className="p-6 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2 shadow-xs">
                  <h4 className="text-sm font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Sanitización de Streaming SSE</h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Filtro en tiempo real contra fragmentos huérfanos de tokens de parada (&lt;,&nbsp;&lt;|im_end|&gt;) asegurando un flujo de texto limpio y apto para exportación profesional.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'novel' && (
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="p-8 rounded-3xl bg-white dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 space-y-6 shadow-xs">
                <div className="flex items-center space-x-3">
                  <BookOpen className="w-7 h-7 text-amber-500 dark:text-amber-400" />
                  <div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Jukkou no Zankyou (El Teatro que Faltó)</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Obra Insignia de Drama Psicológico y Fantasía Oscura</p>
                  </div>
                </div>

                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  La narrativa central sobre la cual está calibrado el motor de Kizuna-Zek explora las repercusiones de la Guerra del Círculo Vicioso y la lobotomía límbica como herramienta de control estatal.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
                    <span className="px-2.5 py-1 rounded-md bg-amber-500/15 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-500/30">
                      Protagonista
                    </span>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Kolder Zekshoyu (22 años)</h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      "El Vacío Funcional". Sometido a la extirpación quirúrgica completa de su sistema límbico a los 9 años. Carece de ira, miedo o afecto biológico. Opera mediante un pragmatismo frío y terrenal, portando un mate rúnico y un karambit táctico.
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
                    <span className="px-2.5 py-1 rounded-md bg-blue-500/15 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-bold border border-blue-500/30">
                      Co-Protagonista
                    </span>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Hinistra Zupsekia (17 años)</h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      "La Marioneta del Relato". Encarnación de Gurasha (Prisma de la Euforia). Utiliza la declamación trágica y operística para ocultar un TEPT severo causado por la persecución social.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'catalyst' && (
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-amber-100/80 via-amber-50 to-white dark:from-amber-950/40 dark:via-amber-900/20 dark:to-zinc-900 border border-amber-500/40 dark:border-amber-500/30 relative overflow-hidden">
                <div className="flex items-start space-x-4">
                  <Award className="w-8 h-8 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-1" />
                  <div>
                    <h2 className="text-xl font-bold text-amber-900 dark:text-amber-200">
                      Alibaba Cloud AI Catalyst Program ($120,000 USD Grant)
                    </h2>
                    <p className="text-xs md:text-sm text-zinc-700 dark:text-zinc-300 mt-1 leading-relaxed">
                      Usa estos tres valores oficiales para completar el formulario de postulación al programa de aceleración e infraestructura de Alibaba Cloud.
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Field 1 */}
                <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 flex flex-col justify-between shadow-xs">
                  <div>
                    <div className="flex items-center space-x-2 text-zinc-600 dark:text-zinc-400 text-xs font-semibold mb-2">
                      <Building2 className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                      <span>1. Your company name</span>
                    </div>
                    <div className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 select-all">
                      {catalystData.companyName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(catalystData.companyName, 'name')}
                    className="min-h-[44px] w-full px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold flex items-center justify-center space-x-2 transition-colors border border-zinc-300 dark:border-zinc-700/50 cursor-pointer"
                  >
                    {copiedField === 'name' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                        <span>Copiar Nombre</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Field 2 */}
                <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 flex flex-col justify-between shadow-xs">
                  <div>
                    <div className="flex items-center space-x-2 text-zinc-600 dark:text-zinc-400 text-xs font-semibold mb-2">
                      <Globe className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                      <span>2. Company website</span>
                    </div>
                    <div className="text-xs font-mono font-bold text-zinc-800 dark:text-zinc-200 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 truncate select-all" title={catalystData.companyWebsite}>
                      {catalystData.companyWebsite}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(catalystData.companyWebsite, 'website')}
                    className="min-h-[44px] w-full px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold flex items-center justify-center space-x-2 transition-colors border border-zinc-300 dark:border-zinc-700/50 cursor-pointer"
                  >
                    {copiedField === 'website' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                        <span>Copiar URL Pública</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Field 3 */}
                <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 flex flex-col justify-between shadow-xs">
                  <div>
                    <div className="flex items-center space-x-2 text-zinc-600 dark:text-zinc-400 text-xs font-semibold mb-2">
                      <MapPin className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                      <span>3. Company HQ location</span>
                    </div>
                    <div className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 select-all">
                      {catalystData.companyHq}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(catalystData.companyHq, 'hq')}
                    className="min-h-[44px] w-full px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold flex items-center justify-center space-x-2 transition-colors border border-zinc-300 dark:border-zinc-700/50 cursor-pointer"
                  >
                    {copiedField === 'hq' ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                        <span>Copiar Ubicación</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </main>

        {/* Universal Footer */}
        <footer className="border-t border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 px-6 py-6 text-xs text-zinc-500 dark:text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Kizuna-Zek AI Studio • Official Enterprise Web Instance</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center space-x-2 transition-colors cursor-pointer"
          >
            <span>Ingresar al Studio App</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </footer>
      </div>
    </AnimatePresence>
  );
};
