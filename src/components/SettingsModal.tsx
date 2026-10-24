import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sliders,
  Brain,
  Server,
  Trash2,
  Plus,
  Save,
  Check,
  Cpu,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
  Search,
  Star,
  CheckCircle2,
  HardDrive,
  Download,
  Upload,
  FolderOpen,
  ExternalLink,
  Image,
  Camera,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Smile,
  BookOpen,
  Edit2,
  User,
  Cloud,
  Mic,
  Volume2,
} from 'lucide-react';
import { AppSettings, SmartMemory, NvidiaModelItem, Chat } from '../types';
import { buildRollingSessionSummary, synthesizeSessionSummaryWithAI } from '../utils/memoryDetector';

// 1. Sleek Optical Lens (Replaces generic eye 👁️)
const VisionLensIcon: React.FC<{ size?: number; className?: string }> = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    <circle cx="12" cy="12" r="9" opacity="0.3" strokeDasharray="2 2" />
    <path d="M2.5 12c2.8-4.8 6.5-7.5 9.5-7.5s6.7 2.7 9.5 7.5c-2.8 4.8-6.5 7.5-9.5 7.5s-6.7-2.7-9.5-7.5z" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" fillOpacity="0.2" />
    <circle cx="13.2" cy="10.8" r="0.9" fill="currentColor" />
  </svg>
);

// 2. Neural Synapse Core (Replaces generic brain 🧠)
const NeuralCoreIcon: React.FC<{ size?: number; className?: string }> = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    <rect x="4" y="4" width="16" height="16" rx="4" opacity="0.3" />
    <circle cx="9" cy="9" r="1.8" fill="currentColor" fillOpacity="0.25" />
    <circle cx="15" cy="9" r="1.8" fill="currentColor" fillOpacity="0.25" />
    <circle cx="12" cy="15" r="1.8" fill="currentColor" fillOpacity="0.25" />
    <path d="M9 9l3 6 3-6" opacity="0.75" />
    <path d="M9 9h6" opacity="0.5" strokeDasharray="1.5 1.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

// 3. Technical Pipette Probe (Replaces generic dropper/test tube 🧪)
const PipetteProbeIcon: React.FC<{ size?: number; className?: string }> = ({ size = 13, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    <path d="M18.5 2.5l3 3a1.5 1.5 0 0 1 0 2.12l-1.6 1.6-5.12-5.12 1.6-1.6a1.5 1.5 0 0 1 2.12 0z" />
    <path d="M14.78 4.1l-9.5 9.5a2 2 0 0 0-.58 1.41V18.5h3.5a2 2 0 0 0 1.41-.58l9.5-9.5-4.33-4.32z" />
    <path d="M3 21l2.2-2.2" strokeWidth="2" />
    <circle cx="3.2" cy="20.8" r="1" fill="currentColor" />
  </svg>
);
import { isVisionModel } from '../utils/modelHelper';
import { exportFullBackupJSON, importFullBackupJSON } from '../utils/storage';
import {
  getGeminiApiKey,
  cleanApiKey,
  isValidGeminiApiKey,
  DEFAULT_GEMINI_API_KEY,
  testGoogleSearchGrounding,
  HTTP_429_RATE_LIMIT_NOTICE,
  getTavilyApiKey,
  isValidTavilyApiKey,
  searchWithTavily,
  testTavilyConnection,
} from '../services/apiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  onImportBackupFinished?: () => void;
  onStartPersonaWizard?: () => void;
  activeChat?: Chat | null;
  onUpdateChatSessionSummary?: (chatId: string, summary: string, summarizedCount: number) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onImportBackupFinished,
  onStartPersonaWizard,
  activeChat,
  onUpdateChatSessionSummary,
}) => {
  // =========================================================
  // 1. ALL HOOKS EVALUATED AT ABSOLUTE TOP LEVEL
  // (Zero hooks after any conditional check or early return)
  const [currentView, setCurrentView] = useState<'main' | 'personalization' | 'memory' | 'models' | 'session_summary'>('main');
  const [sessionSummaryDraft, setSessionSummaryDraft] = useState<string>('');
  const [sessionSummarySavedNotice, setSessionSummarySavedNotice] = useState<boolean>(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [isMemoryAccordionOpen, setIsMemoryAccordionOpen] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<'warmth' | 'enthusiasm' | 'formatting' | 'emoji' | null>(null);
  const [current, setCurrent] = useState<AppSettings>({ ...settings });
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryImage, setNewMemoryImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const memoryFileInputRef = useRef<HTMLInputElement>(null);
  const [isSavedNotice, setIsSavedNotice] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showGeminiApiKey, setShowGeminiApiKey] = useState(false);
  const [showAlibabaApiKey, setShowAlibabaApiKey] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [alibabaModelSearch, setAlibabaModelSearch] = useState('');
  const [onlyVisionFilter, setOnlyVisionFilter] = useState(false);
  const [onlyAlibabaVisionFilter, setOnlyAlibabaVisionFilter] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingAlibabaModels, setIsLoadingAlibabaModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [alibabaFetchError, setAlibabaFetchError] = useState<string | null>(null);

  // Backup & Storage State
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string>(() => localStorage.getItem('kizuna_drive_url') || 'https://drive.google.com/drive/my-drive');
  const backupInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Google Gemini models state
  const [isLoadingGeminiModels, setIsLoadingGeminiModels] = useState(false);
  const [geminiFetchError, setGeminiFetchError] = useState<string | null>(null);
  const [isTestingWebSearch, setIsTestingWebSearch] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    sourcesCount?: number;
  } | null>(null);

  // Tavily AI Search state
  const [tavilyApiKey, setTavilyApiKey] = useState<string>(() => {
    return localStorage.getItem('kizuna_tavily_key') || settings.tavilyApiKey || '';
  });
  const [showTavilyApiKey, setShowTavilyApiKey] = useState(false);
  const [isTestingTavily, setIsTestingTavily] = useState(false);
  const [tavilyTestResult, setTavilyTestResult] = useState<{
    success: boolean;
    message: string;
    sourcesCount?: number;
  } | null>(null);

  const DEFAULT_GEMINI_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.8-live',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];

  const [geminiModelSearch, setGeminiModelSearch] = useState('');
  const [geminiModelsList, setGeminiModelsList] = useState<string[]>(() => {
    if (settings.fetchedGeminiModels && settings.fetchedGeminiModels.length > 0) {
      const validFetched = settings.fetchedGeminiModels.filter(
        (m) => !m.startsWith('gemini-1.') && !m.startsWith('gemini-2.') && m !== 'gemini-pro'
      );
      return Array.from(new Set([...DEFAULT_GEMINI_MODELS, ...validFetched]));
    }
    return DEFAULT_GEMINI_MODELS;
  });

  // Sync state when settings prop updates
  useEffect(() => {
    const activeGeminiKey = getGeminiApiKey();
    const effectiveGeminiModel =
      !settings.geminiModel ||
      settings.geminiModel.startsWith('gemini-2.') ||
      settings.geminiModel.startsWith('gemini-1.') ||
      settings.geminiModel === 'gemini-pro'
        ? 'gemini-3.8-flash'
        : settings.geminiModel;

    const resolvedAliKey = (settings.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim();
    const resolvedAliUrl = resolvedAliKey
      ? (resolvedAliKey.startsWith('sk-ws-')
          ? 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'
          : 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1')
      : (settings.alibabaBaseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1');

    setCurrent({
      ...settings,
      geminiModel: effectiveGeminiModel,
      geminiApiKey: settings.geminiApiKey || activeGeminiKey,
      alibabaApiKey: resolvedAliKey,
      alibabaBaseUrl: resolvedAliUrl,
      alibabaModel: settings.alibabaModel || 'qwen3.8-max',
      tavilyApiKey: settings.tavilyApiKey || localStorage.getItem('kizuna_tavily_key') || '',
    });
    setTavilyApiKey(localStorage.getItem('kizuna_tavily_key') || settings.tavilyApiKey || '');
    setDriveUrl(localStorage.getItem('kizuna_drive_url') || 'https://drive.google.com/drive/my-drive');
    if (isOpen) {
      setCurrentView('main');
    }
  }, [settings, isOpen]);

  useEffect(() => {
    if (!activeChat) {
      setSessionSummaryDraft('');
      return;
    }
    const existing = activeChat.sessionSummary?.trim() || '';
    const hasLegacySlicedArtifact =
      existing.includes(' [...] ') || /Turno #\d+\s*\([^)]+\):\s*¡?Hola\b/i.test(existing);

    if (existing.length > 0 && !hasLegacySlicedArtifact) {
      setSessionSummaryDraft(existing);
    } else if (activeChat.messages && activeChat.messages.length > 0) {
      const windowLimit = current.contextDepth === 'quick' ? 6 : 15;
      const olderPool =
        activeChat.messages.length > windowLimit
          ? activeChat.messages.slice(0, -windowLimit)
          : activeChat.messages;
      const cleanSummary = buildRollingSessionSummary(olderPool);
      setSessionSummaryDraft(cleanSummary);
      if (hasLegacySlicedArtifact && onUpdateChatSessionSummary) {
        const overflowCount = Math.max(0, activeChat.messages.length - windowLimit);
        onUpdateChatSessionSummary(activeChat.id, cleanSummary, cleanSummary ? overflowCount : 0);
      }
    } else {
      setSessionSummaryDraft('');
    }
  }, [activeChat, current.contextDepth, isOpen]);

  // Dynamic model fetching callback
  const fetchNvidiaModels = useCallback(async (apiKey: string, baseUrl: string) => {
    if (!apiKey || apiKey.trim().length < 8) {
      setFetchError(null);
      return;
    }

    setIsLoadingModels(true);
    setFetchError(null);

    const cleanApiKey = apiKey.trim();
    const cleanBase = (baseUrl || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
    const directUrl = `${cleanBase}/models`;

    try {
      let res: Response | null = null;

      // 1. Primary: Use reverse proxy endpoint /api/nvidia/v1/models (Vercel rewrite & Vite dev proxy)
      try {
        res = await fetch('/api/nvidia/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cleanApiKey}`,
            'Content-Type': 'application/json',
          },
        });
      } catch {
        res = null;
      }

      // 2. Fallback to /api/nvidia/models (Express server POST route)
      if (!res || !res.ok) {
        const proxyRes = await fetch('/api/nvidia/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: cleanApiKey,
            baseUrl: cleanBase,
          }),
        }).catch(() => null);

        if (proxyRes && proxyRes.ok) {
          res = proxyRes;
        }
      }

      if (!res || !res.ok) {
        let cleanErr = `HTTP ${res?.status || 500}: Error de conexión con NVIDIA NIM.`;
        if (res) {
          try {
            const errJson = await res.json();
            if (errJson?.error) cleanErr = errJson.error;
          } catch {
            const raw = await res.text().catch(() => '');
            if (raw) cleanErr = raw;
          }
        }
        if (res?.status === 401 || cleanErr.includes('401')) {
          cleanErr = 'API Key de NVIDIA incorrecta o inválida (Error 401). Verifica tu clave en NVIDIA Build.';
        }
        setFetchError(cleanErr);
        return;
      }

      const data = await res.json();
      if (data.error && (!data.data || data.data.length === 0)) {
        let cleanErr = data.error;
        if (data.status === 401 || data.isAuthError || cleanErr.includes('401')) {
          cleanErr = 'API Key de NVIDIA incorrecta o inválida (Error 401). Verifica tu clave en NVIDIA Build.';
        }
        setFetchError(cleanErr);
        return;
      }
      const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];

      const modelItems: NvidiaModelItem[] = rawList
        .filter((m: any) => m && m.id)
        .map((m: any) => ({
          id: m.id,
          object: m.object,
          created: m.created,
          owned_by: m.owned_by,
        }))
        .sort((a: NvidiaModelItem, b: NvidiaModelItem) => a.id.localeCompare(b.id));

      if (modelItems.length === 0) {
        setFetchError('No se encontraron modelos activos asociados a esta cuenta de NVIDIA.');
        return;
      }

      setCurrent((prev) => ({
        ...prev,
        fetchedNvidiaModels: modelItems,
        customModel:
          prev.customModel && modelItems.some((m) => m.id === prev.customModel)
            ? prev.customModel
            : modelItems[0]?.id || '',
      }));
    } catch (err: any) {
      setFetchError(err?.message || 'No se pudieron recuperar los modelos de NVIDIA.');
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  // Auto-fetch when user types or pastes their API key (debounced)
  useEffect(() => {
    if (
      current.customApiKey &&
      current.customApiKey.trim().length >= 12 &&
      current.fetchedNvidiaModels.length === 0
    ) {
      const timer = setTimeout(() => {
        fetchNvidiaModels(current.customApiKey, current.customBaseUrl);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [current.customApiKey, current.customBaseUrl, current.fetchedNvidiaModels.length, fetchNvidiaModels]);

  // Dynamic Alibaba Cloud MaaS model fetching callback
  const fetchAlibabaModels = useCallback(async (apiKey: string, baseUrl: string) => {
    if (!apiKey || apiKey.trim().length < 8) {
      setAlibabaFetchError(null);
      return;
    }

    setIsLoadingAlibabaModels(true);
    setAlibabaFetchError(null);

    const cleanApiKey = apiKey.trim();
    const cleanBase = (baseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');

    try {
      let res: Response | null = null;
      try {
        res = await fetch('/api/alibaba/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: cleanApiKey,
            baseUrl: cleanBase,
          }),
        }).catch(() => null);
      } catch {
        res = null;
      }

      if (!res || !res.ok) {
        let cleanErr = `HTTP ${res?.status || 500}: Error de conexión con Alibaba Cloud MaaS.`;
        if (res) {
          try {
            const errJson = await res.json();
            if (errJson?.error) {
              cleanErr = errJson.error;
            }
          } catch {
            const raw = await res.text().catch(() => '');
            if (raw) cleanErr = raw;
          }
        }
        if (res?.status === 401 || cleanErr.includes('401') || cleanErr.includes('invalid_api_key') || cleanErr.toLowerCase().includes('incorrect api key')) {
          cleanErr = 'API Key de Alibaba Cloud incorrecta o inválida (Error 401). Verifica tu clave en Model Studio.';
        }
        setAlibabaFetchError(cleanErr);
        return;
      }

      const data = await res.json();
      if (data.error && (!data.data || data.data.length === 0)) {
        let cleanErr = data.error;
        if (data.status === 401 || data.isAuthError || cleanErr.includes('401') || cleanErr.includes('invalid_api_key')) {
          cleanErr = 'API Key de Alibaba Cloud incorrecta o inválida (Error 401). Verifica tu clave en Model Studio.';
        }
        setAlibabaFetchError(cleanErr);
        return;
      }
      const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];

      const modelItems: NvidiaModelItem[] = rawList
        .filter((m: any) => m && m.id)
        .map((m: any) => ({
          id: m.id,
          object: m.object,
          created: m.created,
          owned_by: m.owned_by,
        }))
        .sort((a: NvidiaModelItem, b: NvidiaModelItem) => a.id.localeCompare(b.id));

      if (modelItems.length === 0) {
        setAlibabaFetchError('No se encontraron modelos activos asociados a esta cuenta de Alibaba Cloud.');
        return;
      }

      setCurrent((prev) => ({
        ...prev,
        fetchedAlibabaModels: modelItems,
        alibabaModel:
          prev.alibabaModel && modelItems.some((m) => m.id === prev.alibabaModel)
            ? prev.alibabaModel
            : modelItems[0]?.id || 'qwen3.8-max',
      }));
    } catch (err: any) {
      setAlibabaFetchError(err?.message || 'No se pudieron recuperar los modelos de Alibaba Cloud.');
    } finally {
      setIsLoadingAlibabaModels(false);
    }
  }, []);

  // Auto-fetch Alibaba models when user types or pastes their API key (debounced)
  useEffect(() => {
    if (
      current.alibabaApiKey &&
      current.alibabaApiKey.trim().length >= 16 &&
      (!current.fetchedAlibabaModels || current.fetchedAlibabaModels.length === 0)
    ) {
      const timer = setTimeout(() => {
        fetchAlibabaModels(current.alibabaApiKey || '', current.alibabaBaseUrl || '');
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [current.alibabaApiKey, current.alibabaBaseUrl, current.fetchedAlibabaModels?.length, fetchAlibabaModels]);

  // Default curated Alibaba models for Singapore (ap-southeast-1)
  const defaultAlibabaPresetModels: NvidiaModelItem[] = useMemo(() => [
    { id: 'deepseek-v4-pro-0813', owned_by: 'Alibaba Singapur (1.6T MoE • 49B activos • $0.66/1M • Auditor & Diálogos)' },
    { id: 'deepseek-v4.1-flash-1017', owned_by: 'Alibaba Singapur (552B MoE • Multimodal • $0.15/1M • Co-agente y Resúmenes)' },
    { id: 'qwen3.8-max-0902', owned_by: 'Alibaba Singapur (Flagship 0902 con Thinking CoT Profundo)' },
    { id: 'qwen3.8-2.4-a95b', owned_by: 'Alibaba Singapur (Arquitectura MoE A95B • Alta Densidad y CoT)' },
    { id: 'kimi-k3', owned_by: 'Alibaba Singapur (1M Cuota Gratis • Tope de Seguridad Activo • 100K RPM)' },
    { id: 'qwen3.8-omni-flash', owned_by: 'Alibaba Singapur (Omni Multimodal • 1M Tokens • Ultra Económico)' },
    { id: 'qwen3.8-max', owned_by: 'Alibaba Singapur (SOTA con Thinking CoT)' },
    { id: 'qwen3.8-flash', owned_by: 'Alibaba Singapur (1M Contexto • Ultra-rápido con Thinking)' },
    { id: 'qwen3.8-plus', owned_by: 'Alibaba Singapur (1M Contexto Extendido y Visión)' },
    { id: 'qwen3.6-plus', owned_by: 'Alibaba Singapur (Balance y Visión)' },
    { id: 'qwen3.7-plus', owned_by: 'Alibaba Singapur (Versión 3.7 Balanceada)' },
    { id: 'qwen-plus', owned_by: 'Alibaba Singapur (1M Contexto Extendido)' },
    { id: 'qwen-turbo', owned_by: 'Alibaba Singapur (1M Contexto • Baja Latencia)' },
    { id: 'qwen-max', owned_by: 'Alibaba Singapur (Razonamiento)' },
    { id: 'qwen-vl-max', owned_by: 'Alibaba Singapur (Visión Multimodal)' },
    { id: 'qwen-vl-plus', owned_by: 'Alibaba Singapur (Visión Multimodal Ligera)' },
  ], []);

  // Filtered Alibaba models with search, favorites sorting, and vision filter
  const { favoriteAlibabaModels, otherAlibabaModels } = useMemo(() => {
    const query = alibabaModelSearch.trim().toLowerCase();
    const sourceList = (current.fetchedAlibabaModels && current.fetchedAlibabaModels.length > 0)
      ? current.fetchedAlibabaModels
      : defaultAlibabaPresetModels;

    const all = sourceList.filter((m) => {
      const matchesSearch = query
        ? m.id.toLowerCase().includes(query) ||
          (m.owned_by && m.owned_by.toLowerCase().includes(query))
        : true;
      const matchesVision = onlyAlibabaVisionFilter ? isVisionModel(m.id) : true;
      return matchesSearch && matchesVision;
    });

    const favSet = new Set(current.favoriteAlibabaModelIds || ['deepseek-v4-pro-0813', 'deepseek-v4.1-flash-1017', 'qwen3.8-max-0902', 'qwen3.8-2.4-a95b', 'kimi-k3', 'qwen3.8-omni-flash', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.8-plus', 'qwen3.7-plus', 'qwen-plus']);
    const favs: NvidiaModelItem[] = [];
    const others: NvidiaModelItem[] = [];

    for (const m of all) {
      if (favSet.has(m.id)) {
        favs.push(m);
      } else {
        others.push(m);
      }
    }

    return { favoriteAlibabaModels: favs, otherAlibabaModels: others };
  }, [current.fetchedAlibabaModels, current.favoriteAlibabaModelIds, alibabaModelSearch, onlyAlibabaVisionFilter, defaultAlibabaPresetModels]);

  // Filtered models with search, favorites sorting, and vision filter (useMemo evaluated unconditionally at top)
  const { favoriteModels, otherModels } = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    const all = current.fetchedNvidiaModels.filter((m) => {
      const matchesSearch = query
        ? m.id.toLowerCase().includes(query) ||
          (m.owned_by && m.owned_by.toLowerCase().includes(query))
        : true;
      const matchesVision = onlyVisionFilter ? isVisionModel(m.id) : true;
      return matchesSearch && matchesVision;
    });

    const favSet = new Set(current.favoriteModelIds || []);
    const favs: NvidiaModelItem[] = [];
    const others: NvidiaModelItem[] = [];

    for (const m of all) {
      if (favSet.has(m.id)) {
        favs.push(m);
      } else {
        others.push(m);
      }
    }

    return { favoriteModels: favs, otherModels: others };
  }, [current.fetchedNvidiaModels, current.favoriteModelIds, modelSearch, onlyVisionFilter]);

  // Dynamic Google Gemini Models Fetcher
  const fetchGeminiModels = useCallback(async () => {
    setIsLoadingGeminiModels(true);
    setGeminiFetchError(null);
    try {
      const activeKey = cleanApiKey(current.geminiApiKey) || getGeminiApiKey();
      const queryParam = activeKey ? `?key=${encodeURIComponent(activeKey)}` : '';
      const res = await fetch(`/api/gemini/models${queryParam}`, {
        headers: activeKey ? { 'x-gemini-api-key': activeKey } : {},
      });
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(HTTP_429_RATE_LIMIT_NOTICE);
        }
        const errText = await res.text().catch(() => '');
        if (errText.includes('429') || errText.includes('RESOURCE_EXHAUSTED')) {
          throw new Error(HTTP_429_RATE_LIMIT_NOTICE);
        }
        throw new Error(`HTTP ${res.status}: Error al obtener modelos de Google.`);
      }
      const data = await res.json();
      if (Array.isArray(data.models) && data.models.length > 0) {
        const fetchedIds = data.models.map((m: any) => m.id);
        const merged = Array.from(new Set([...DEFAULT_GEMINI_MODELS, ...fetchedIds]));
        setGeminiModelsList(merged);
        setCurrent((prev) => ({
          ...prev,
          fetchedGeminiModels: merged,
        }));
      }
    } catch (err: any) {
      console.error('Error fetching Gemini models:', err);
      const errMsg = err?.message || '';
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        setGeminiFetchError(HTTP_429_RATE_LIMIT_NOTICE);
      } else {
        setGeminiFetchError(errMsg || 'Error al conectar con Google Gemini.');
      }
    } finally {
      setIsLoadingGeminiModels(false);
    }
  }, [DEFAULT_GEMINI_MODELS]);

  // Filtered Gemini Models
  const filteredGeminiModels = useMemo(() => {
    const query = geminiModelSearch.trim().toLowerCase();
    return geminiModelsList.filter((id) => {
      const matchesSearch = query ? id.toLowerCase().includes(query) : true;
      const matchesVision = onlyVisionFilter ? isVisionModel(id) : true;
      return matchesSearch && matchesVision;
    });
  }, [geminiModelsList, geminiModelSearch, onlyVisionFilter]);

  // =========================================================
  // 2. EVENT HANDLERS & DERIVED CONSTANTS
  // =========================================================
  const handleSave = () => {
    if (current.geminiApiKey) {
      const cleanedKey = cleanApiKey(current.geminiApiKey);
      localStorage.setItem('kizuna_gemini_api_key', cleanedKey);
      localStorage.setItem('kizuna_gemini_key', cleanedKey);
    } else {
      localStorage.removeItem('kizuna_gemini_api_key');
      localStorage.removeItem('kizuna_gemini_key');
    }
    if (current.alibabaApiKey) {
      const cleanedAliKey = cleanApiKey(current.alibabaApiKey);
      localStorage.setItem('kizuna_alibaba_api_key', cleanedAliKey);
    }
    if (tavilyApiKey) {
      const cleanedTavily = cleanApiKey(tavilyApiKey);
      localStorage.setItem('kizuna_tavily_key', cleanedTavily);
    }
    localStorage.setItem('kizuna_drive_url', driveUrl.trim() || 'https://drive.google.com/drive/my-drive');
    onSaveSettings({
      ...current,
      tavilyApiKey: cleanApiKey(tavilyApiKey),
    });
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const handleTestTavily = async () => {
    setIsTestingTavily(true);
    setTavilyTestResult(null);
    try {
      const activeKey = cleanApiKey(tavilyApiKey) || getTavilyApiKey();
      if (!activeKey) {
        setTavilyTestResult({
          success: false,
          message: 'Fallo: Clave de API de Tavily ausente. Ingresa tu clave tvly-...',
        });
        return;
      }
      const data = await searchWithTavily('noticias de hoy', activeKey);
      const results = Array.isArray(data?.results) ? data.results : [];
      setTavilyTestResult({
        success: true,
        message: `¡Tavily conectado! ${results.length} fuentes encontradas`,
        sourcesCount: results.length,
      });
    } catch (err: any) {
      setTavilyTestResult({
        success: false,
        message: 'Fallo al conectar con Tavily: ' + (err?.message || String(err)),
      });
    } finally {
      setIsTestingTavily(false);
    }
  };

  const handleTestWebSearch = async () => {
    setIsTestingWebSearch(true);
    setTestResult(null);
    try {
      const activeTavily = cleanApiKey(tavilyApiKey) || getTavilyApiKey();
      if (activeTavily) {
        const data = await searchWithTavily('noticias de hoy', activeTavily);
        const results = Array.isArray(data?.results) ? data.results : [];
        setTestResult({
          success: true,
          message: `¡Tavily conectado! ${results.length} fuentes encontradas`,
          sourcesCount: results.length,
        });
        return;
      }

      const activeKey = cleanApiKey(current.geminiApiKey) || getGeminiApiKey();
      const res = await testGoogleSearchGrounding(activeKey);
      let message = res.message;
      if (message && (message.includes('429') || message.includes('RESOURCE_EXHAUSTED'))) {
        message = HTTP_429_RATE_LIMIT_NOTICE;
      }
      setTestResult({
        success: res.success,
        message,
        sourcesCount: Array.isArray(res.sources) ? res.sources.length : undefined,
      });
    } catch (err: any) {
      const errStr = err?.message || String(err);
      const is429 = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
      setTestResult({
        success: false,
        message: is429 ? HTTP_429_RATE_LIMIT_NOTICE : 'Fallo en la prueba: ' + errStr,
      });
    } finally {
      setIsTestingWebSearch(false);
    }
  };

  const handleToggleFavoriteModel = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrent((prev) => {
      const favs = prev.favoriteModelIds || [];
      const isFav = favs.includes(modelId);
      return {
        ...prev,
        favoriteModelIds: isFav ? favs.filter((id) => id !== modelId) : [...favs, modelId],
      };
    });
  };

  const handleToggleFavoriteAlibabaModel = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrent((prev) => {
      const favs = prev.favoriteAlibabaModelIds || ['qwen-3.8-max', 'qwen-3.8-flash', 'deepseek-k3'];
      const isFav = favs.includes(modelId);
      return {
        ...prev,
        favoriteAlibabaModelIds: isFav ? favs.filter((id) => id !== modelId) : [...favs, modelId],
      };
    });
  };

  const handleAddMemory = () => {
    if (!newMemoryText.trim()) return;
    const newMem: SmartMemory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: newMemoryText.trim(),
      timestamp: Date.now(),
      enabled: true,
      source: 'manual',
    };
    setCurrent((prev) => ({
      ...prev,
      memories: [newMem, ...prev.memories],
    }));
    setNewMemoryText('');
  };

  const handleToggleMemory = (id: string) => {
    setCurrent((prev) => ({
      ...prev,
      memories: prev.memories.map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      ),
    }));
  };

  const handleDeleteMemory = (id: string) => {
    setCurrent((prev) => ({
      ...prev,
      memories: prev.memories.filter((m) => m.id !== id),
    }));
  };

  const handleExportBackup = () => {
    exportFullBackupJSON();
  };

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    try {
      const text = await file.text();
      const result = importFullBackupJSON(text);
      setImportSuccess(
        `¡Copia de seguridad importada con éxito! (${result.chats.length} conversaciones, ${result.folders.length} arcos, ${result.loreFiles.length} documentos de lore).`
      );
      setTimeout(() => {
        if (onImportBackupFinished) {
          onImportBackupFinished();
        } else {
          window.location.reload();
        }
      }, 1200);
    } catch (err: any) {
      setImportError(err.message || 'Error al procesar el archivo JSON de copia de seguridad.');
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  const hasApiKey = Boolean(current.customApiKey && current.customApiKey.trim().length > 0);
  const modelsAvailable = current.fetchedNvidiaModels.length > 0;
  const hasAlibabaApiKey = Boolean(current.alibabaApiKey && current.alibabaApiKey.trim().length > 0);
  const alibabaModelsAvailable = (current.fetchedAlibabaModels && current.fetchedAlibabaModels.length > 0) || defaultAlibabaPresetModels.length > 0;

  // =========================================================
  // 3. EARLY RETURN PLACED STRICTLY AFTER ALL HOOKS
  // =========================================================
  if (!isOpen) {
    return null;
  }

  // =========================================================
  // 4. RENDER
  // =========================================================
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center md:p-6 bg-black/85 md:backdrop-blur-xs cursor-pointer"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-sheet-fluid fixed inset-0 z-50 bg-[#070709] text-white flex flex-col md:inset-auto md:relative md:w-full md:max-w-2xl md:max-h-[90vh] md:rounded-2xl md:border md:border-[#22222a] md:shadow-2xl md:bg-[#0b0b10] overflow-hidden cursor-default"
      >
        {/* Dynamic Drill-Down Header */}
        {currentView === 'main' ? (
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#18181c] bg-[#070709] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-300">
                <Sliders size={16} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white tracking-tight">
                  Ajustes
                </h2>
                <p className="text-xs text-zinc-400 hidden sm:block">
                  Personalización, memoria persistente y modelos
                </p>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onClose}
              className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
              aria-label="Cerrar ajustes"
            >
              <X size={18} />
            </motion.button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#18181c] bg-[#070709] shrink-0">
            <div className="flex items-center gap-2.5">
              <motion.button
                whileTap={{ scale: 0.9, x: -2 }}
                onClick={() => setCurrentView('main')}
                className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
                title="Volver al menú principal"
              >
                <ArrowLeft size={18} />
              </motion.button>
              <h2 className="text-base font-semibold text-white tracking-tight">
                {currentView === 'personalization'
                  ? 'Personalización'
                  : currentView === 'memory'
                  ? 'Memoria'
                  : currentView === 'session_summary'
                  ? 'Resumen de Sesión'
                  : 'Motores y Modelos'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {isSavedNotice && (
                <span className="text-xs text-emerald-400 font-mono hidden sm:inline-flex items-center gap-1">
                  <Check size={13} /> Guardado
                </span>
              )}
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleSave}
                className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-xl transition-all cursor-pointer"
                title="Guardar cambios"
              >
                <Check size={18} strokeWidth={2.5} />
              </motion.button>
            </div>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          <AnimatePresence mode="wait">
            {/* ========================================================= */}
            {/* VISTA A: 'main' (Menú Principal Drill-Down)               */}
            {/* ========================================================= */}
            {currentView === 'main' && (
              <motion.div
                key="main"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className="flex-1 overflow-y-auto p-4 space-y-4 smooth-scroll"
              >
                <div className="space-y-5 max-w-xl mx-auto">
                  {/* Perfil Superior */}
                  <div className="flex flex-col items-center justify-center py-2 select-none">
                    <div className="relative group">
                      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-white text-2xl font-bold shadow-xl border-2 border-zinc-700 tracking-wider">
                        {(() => {
                          const name = current.userProfile?.nickname || 'Aaron';
                          const parts = name.trim().split(/\s+/);
                          if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
                          return name.slice(0, 2).toUpperCase();
                        })()}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCurrentView('memory')}
                        className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[#181820] border border-white/20 text-zinc-300 hover:text-white hover:bg-orange-500 transition-all shadow-md cursor-pointer"
                        title="Editar perfil"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-white tracking-tight">
                      {current.userProfile?.nickname || 'Aaron'}
                    </h3>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5">
                      {current.userProfile?.occupation || 'Escritor'}
                    </p>
                  </div>

                  {/* Bloque 1: Mi Kizuna-Zek */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 px-1 font-semibold">
                      Mi Kizuna-Zek
                    </div>
                    <div className="bg-[#18181b] border border-white/5 rounded-[26px] p-2 divide-y divide-white/5 shadow-lg">
                      {/* Fila Personalización */}
                      <button
                        type="button"
                        onClick={() => setCurrentView('personalization')}
                        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] transition-colors rounded-2xl hover:bg-white/[0.04] cursor-pointer text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-200 shrink-0">
                            <Smile size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[15px] font-medium text-white">Personalización</div>
                            <div className="text-sm text-zinc-400 font-normal truncate">Calidez, tono de autor, listas e instrucciones permanentes</div>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 shrink-0 transition-transform group-hover:translate-x-0.5" />
                      </button>

                      {/* Fila Memoria */}
                      <button
                        type="button"
                        onClick={() => setCurrentView('memory')}
                        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] transition-colors rounded-2xl hover:bg-white/[0.04] cursor-pointer text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-200 shrink-0">
                            <BookOpen size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[15px] font-medium text-white">Memoria</div>
                            <div className="text-sm text-zinc-400 font-normal truncate">Perfil de autor, recuerdos persistentes y hechos guardados</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-zinc-400">
                            {current.memories.filter((m) => m.enabled).length}
                          </span>
                          <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </button>

                      {/* Fila Motores y Modelos */}
                      <button
                        type="button"
                        onClick={() => setCurrentView('models')}
                        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] transition-colors rounded-2xl hover:bg-white/[0.04] cursor-pointer text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-200 shrink-0">
                            <Cpu size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[15px] font-medium text-white">Motores y Modelos</div>
                            <div className="text-sm text-zinc-400 font-normal truncate">
                              {current.provider === 'gemini'
                                ? `Google Gemini (${current.geminiModel})`
                                : current.provider === 'alibaba'
                                  ? `Alibaba Cloud (${current.alibabaModel || 'qwen-3.8-max'})`
                                  : `NVIDIA NIM (${current.customModel || 'Dinámico'})`}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 shrink-0 transition-transform group-hover:translate-x-0.5" />
                      </button>

                      {/* Fila Resumen de Sesión (Debajo de Motores y Modelos) */}
                      <button
                        type="button"
                        onClick={() => setCurrentView('session_summary')}
                        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] transition-colors rounded-2xl hover:bg-white/[0.04] cursor-pointer text-left group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-200 shrink-0">
                            <Sliders size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[15px] font-medium text-white">Resumen de Sesión</div>
                            <div className="text-sm text-zinc-400 font-normal truncate">
                              {activeChat?.sessionSummary
                                ? `Compresión activa (${activeChat.summarizedUpToCount || 0} turnos condensados)`
                                : `Síntesis automática de historial (${activeChat?.messages?.length || 0} mensajes)`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-zinc-400">
                            {activeChat?.sessionSummary ? 'Activo' : 'Auto'}
                          </span>
                          <ChevronRight size={16} className="text-zinc-500 group-hover:text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Bloque 2: Espacio de Trabajo */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 px-1 font-semibold">
                      Espacio de Trabajo
                    </div>
                    <div className="bg-[#18181b] border border-white/5 rounded-[26px] p-2 divide-y divide-white/5 shadow-lg">
                  {/* Google Drive Link */}
                  <div className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                          <FolderOpen size={14} />
                        </div>
                        <span className="text-sm font-medium text-zinc-100">Enlace de Google Drive</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const targetUrl = driveUrl.trim() || 'https://drive.google.com/drive/my-drive';
                          window.open(targetUrl, '_blank', 'noopener,noreferrer');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-sky-300 hover:text-white bg-sky-500/10 hover:bg-sky-500/20 transition-colors cursor-pointer"
                      >
                        <ExternalLink size={12} />
                        <span>Abrir</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="https://drive.google.com/drive/my-drive"
                      value={driveUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDriveUrl(val);
                        localStorage.setItem('kizuna_drive_url', val.trim() || 'https://drive.google.com/drive/my-drive');
                      }}
                      className="w-full bg-[#0a0a0d] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-white/30"
                    />
                  </div>

                  {/* Copia de Seguridad */}
                  <div className="p-3.5 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <HardDrive size={14} />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-zinc-100">Copia de Seguridad</span>
                        <p className="text-[11px] text-zinc-400">Exporta o restaura <code className="text-zinc-300">kizuna_backup.json</code></p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        type="button"
                        onClick={handleExportBackup}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-black bg-white hover:bg-zinc-200 rounded-xl transition-all cursor-pointer shadow-sm"
                      >
                        <Download size={13} />
                        <span>Exportar</span>
                      </motion.button>

                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        type="button"
                        onClick={() => backupInputRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all cursor-pointer"
                      >
                        <Upload size={13} />
                        <span>Restaurar</span>
                      </motion.button>
                    </div>

                    <input
                      type="file"
                      ref={backupInputRef}
                      accept=".json"
                      onChange={handleImportBackupFile}
                      className="hidden"
                    />

                    {importError && (
                      <div className="flex items-center gap-2 p-2.5 bg-red-950/40 border border-red-900/60 rounded-xl text-xs text-red-300 font-mono">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{importError}</span>
                      </div>
                    )}

                    {importSuccess && (
                      <div className="flex items-center gap-2 p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 font-mono">
                        <CheckCircle2 size={14} className="shrink-0" />
                        <span>{importSuccess}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

            {/* ========================================================= */}
            {/* VISTA B: 'personalization' (Subpantalla de Estilo)        */}
            {/* ========================================================= */}
            {currentView === 'personalization' && (
              <motion.div
                key="personalization"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                className="flex-1 overflow-y-auto p-4 space-y-4 smooth-scroll"
              >
                <div className="space-y-5 max-w-xl mx-auto">
                  {/* Tarjeta Agrupada de Selectores Desplegables Estilo ChatGPT */}
                  <div className="bg-[#18181b] border border-white/5 rounded-[26px] p-2 divide-y divide-white/5 shadow-lg">
                    {/* 1. Calidez */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'warmth' ? null : 'warmth')}
                        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] transition-colors rounded-2xl hover:bg-white/[0.04] cursor-pointer text-left select-none"
                      >
                        <span className="text-[15px] font-medium text-white">Calidez</span>
                        <div className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300 font-normal">
                          <span>
                            {(() => {
                              const w = current.personalityConfig?.warmth || 'default';
                              if (w === 'warm') return 'Más';
                              if (w === 'cold' || w === 'neutral') return 'Menos';
                              return 'Predeterminada';
                            })()}
                          </span>
                          <motion.div
                            animate={{ rotate: openDropdown === 'warmth' ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center justify-center"
                          >
                            <ChevronDown size={15} className="text-zinc-400" />
                          </motion.div>
                        </div>
                      </button>

                      <AnimatePresence>
                        {openDropdown === 'warmth' && (
                          <>
                            <div
                              className="fixed inset-0 z-30 bg-transparent"
                              onClick={() => setOpenDropdown(null)}
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -4 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className="absolute right-2 top-full mt-1.5 z-40 w-64 bg-[#232328] border border-white/10 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md select-none"
                            >
                              {[
                                { id: 'warm', title: 'Más', description: 'Más amistosa y agradable.' },
                                { id: 'default', title: 'Predeterminada', description: 'Equilibrada y cercana.' },
                                { id: 'cold', title: 'Menos', description: 'Más profesional y objetiva.' },
                              ].map((opt) => {
                                const cur = current.personalityConfig?.warmth || 'default';
                                const isSelected =
                                  (opt.id === 'warm' && cur === 'warm') ||
                                  (opt.id === 'cold' && (cur === 'cold' || cur === 'neutral')) ||
                                  (opt.id === 'default' && (cur === 'default' || !cur));
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      const next = {
                                        ...current,
                                        personalityConfig: {
                                          ...current.personalityConfig,
                                          warmth: opt.id as any,
                                        },
                                      };
                                      setCurrent(next);
                                      onSaveSettings(next);
                                      setOpenDropdown(null);
                                    }}
                                    className="w-full flex items-center justify-between hover:bg-white/10 rounded-xl px-3 py-2 transition-colors cursor-pointer text-left group"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="text-xs font-semibold text-white">{opt.title}</div>
                                      <div className="text-[11px] text-zinc-400 leading-tight mt-0.5">{opt.description}</div>
                                    </div>
                                    {isSelected && (
                                      <Check size={15} className="text-white shrink-0" strokeWidth={2.5} />
                                    )}
                                  </button>
                                );
                              })}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* 2. Entusiasmo */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'enthusiasm' ? null : 'enthusiasm')}
                        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] transition-colors rounded-2xl hover:bg-white/[0.04] cursor-pointer text-left select-none"
                      >
                        <span className="text-[15px] font-medium text-white">Entusiasmo</span>
                        <div className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300 font-normal">
                          <span>
                            {(() => {
                              const e = current.personalityConfig?.enthusiasm || 'default';
                              if (e === 'high') return 'Más';
                              if (e === 'dry') return 'Menos';
                              return 'Predeterminada';
                            })()}
                          </span>
                          <motion.div
                            animate={{ rotate: openDropdown === 'enthusiasm' ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center justify-center"
                          >
                            <ChevronDown size={15} className="text-zinc-400" />
                          </motion.div>
                        </div>
                      </button>

                      <AnimatePresence>
                        {openDropdown === 'enthusiasm' && (
                          <>
                            <div
                              className="fixed inset-0 z-30 bg-transparent"
                              onClick={() => setOpenDropdown(null)}
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -4 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className="absolute right-2 top-full mt-1.5 z-40 w-64 bg-[#232328] border border-white/10 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md select-none"
                            >
                              {[
                                { id: 'high', title: 'Más', description: 'Más energética y entusiasta.' },
                                { id: 'default', title: 'Predeterminada', description: 'Moderado y orgánico.' },
                                { id: 'dry', title: 'Menos', description: 'Más calma y neutra.' },
                              ].map((opt) => {
                                const cur = current.personalityConfig?.enthusiasm || 'default';
                                const isSelected =
                                  (opt.id === 'high' && cur === 'high') ||
                                  (opt.id === 'dry' && cur === 'dry') ||
                                  (opt.id === 'default' && (cur === 'default' || !cur));
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      const next = {
                                        ...current,
                                        personalityConfig: {
                                          ...current.personalityConfig,
                                          enthusiasm: opt.id as any,
                                        },
                                      };
                                      setCurrent(next);
                                      onSaveSettings(next);
                                      setOpenDropdown(null);
                                    }}
                                    className="w-full flex items-center justify-between hover:bg-white/10 rounded-xl px-3 py-2 transition-colors cursor-pointer text-left group"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="text-xs font-semibold text-white">{opt.title}</div>
                                      <div className="text-[11px] text-zinc-400 leading-tight mt-0.5">{opt.description}</div>
                                    </div>
                                    {isSelected && (
                                      <Check size={15} className="text-white shrink-0" strokeWidth={2.5} />
                                    )}
                                  </button>
                                );
                              })}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* 3. Encabezados y listas */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'formatting' ? null : 'formatting')}
                        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] transition-colors rounded-2xl hover:bg-white/[0.04] cursor-pointer text-left select-none"
                      >
                        <span className="text-[15px] font-medium text-white">Encabezados y listas</span>
                        <div className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300 font-normal">
                          <span>
                            {(() => {
                              const f = current.personalityConfig?.formatting || 'default';
                              if (f === 'structured') return 'Más';
                              if (f === 'prose_only') return 'Menos';
                              return 'Predeterminada';
                            })()}
                          </span>
                          <motion.div
                            animate={{ rotate: openDropdown === 'formatting' ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center justify-center"
                          >
                            <ChevronDown size={15} className="text-zinc-400" />
                          </motion.div>
                        </div>
                      </button>

                      <AnimatePresence>
                        {openDropdown === 'formatting' && (
                          <>
                            <div
                              className="fixed inset-0 z-30 bg-transparent"
                              onClick={() => setOpenDropdown(null)}
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -4 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className="absolute right-2 top-full mt-1.5 z-40 w-64 bg-[#232328] border border-white/10 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md select-none"
                            >
                              {[
                                { id: 'structured', title: 'Más', description: 'Usa formato claro y listas.' },
                                { id: 'default', title: 'Predeterminada', description: 'Equilibrado según la escena.' },
                                { id: 'prose_only', title: 'Menos', description: 'Más párrafos en lugar de listas (solo prosa fluida).' },
                              ].map((opt) => {
                                const cur = current.personalityConfig?.formatting || 'default';
                                const isSelected =
                                  (opt.id === 'structured' && cur === 'structured') ||
                                  (opt.id === 'prose_only' && cur === 'prose_only') ||
                                  (opt.id === 'default' && (cur === 'default' || !cur));
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      const next = {
                                        ...current,
                                        personalityConfig: {
                                          ...current.personalityConfig,
                                          formatting: opt.id as any,
                                        },
                                      };
                                      setCurrent(next);
                                      onSaveSettings(next);
                                      setOpenDropdown(null);
                                    }}
                                    className="w-full flex items-center justify-between hover:bg-white/10 rounded-xl px-3 py-2 transition-colors cursor-pointer text-left group"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="text-xs font-semibold text-white">{opt.title}</div>
                                      <div className="text-[11px] text-zinc-400 leading-tight mt-0.5">{opt.description}</div>
                                    </div>
                                    {isSelected && (
                                      <Check size={15} className="text-white shrink-0" strokeWidth={2.5} />
                                    )}
                                  </button>
                                );
                              })}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* 4. Emoji */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(openDropdown === 'emoji' ? null : 'emoji')}
                        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[56px] transition-colors rounded-2xl hover:bg-white/[0.04] cursor-pointer text-left select-none"
                      >
                        <span className="text-[15px] font-medium text-white">Emoji</span>
                        <div className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300 font-normal">
                          <span>
                            {(() => {
                              const em = current.personalityConfig?.emojiUsage || 'default';
                              if (em === 'natural') return 'Más';
                              if (em === 'none' || em === 'minimal') return 'Menos';
                              return 'Predeterminada';
                            })()}
                          </span>
                          <motion.div
                            animate={{ rotate: openDropdown === 'emoji' ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center justify-center"
                          >
                            <ChevronDown size={15} className="text-zinc-400" />
                          </motion.div>
                        </div>
                      </button>

                      <AnimatePresence>
                        {openDropdown === 'emoji' && (
                          <>
                            <div
                              className="fixed inset-0 z-30 bg-transparent"
                              onClick={() => setOpenDropdown(null)}
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -4 }}
                              transition={{ duration: 0.15, ease: 'easeOut' }}
                              className="absolute right-2 top-full mt-1.5 z-40 w-64 bg-[#232328] border border-white/10 rounded-2xl p-1.5 shadow-2xl backdrop-blur-md select-none"
                            >
                              {[
                                { id: 'natural', title: 'Más', description: 'Usa más emojis con frecuencia.' },
                                { id: 'default', title: 'Predeterminada', description: 'Expresivo y natural en momentos clave.' },
                                { id: 'none', title: 'Menos', description: 'Desactivado, texto puro sin emojis.' },
                              ].map((opt) => {
                                const cur = current.personalityConfig?.emojiUsage || 'default';
                                const isSelected =
                                  (opt.id === 'natural' && cur === 'natural') ||
                                  (opt.id === 'none' && (cur === 'none' || cur === 'minimal')) ||
                                  (opt.id === 'default' && (cur === 'default' || !cur));
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => {
                                      const next = {
                                        ...current,
                                        personalityConfig: {
                                          ...current.personalityConfig,
                                          emojiUsage: opt.id as any,
                                        },
                                      };
                                      setCurrent(next);
                                      onSaveSettings(next);
                                      setOpenDropdown(null);
                                    }}
                                    className="w-full flex items-center justify-between hover:bg-white/10 rounded-xl px-3 py-2 transition-colors cursor-pointer text-left group"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="text-xs font-semibold text-white">{opt.title}</div>
                                      <div className="text-[11px] text-zinc-400 leading-tight mt-0.5">{opt.description}</div>
                                    </div>
                                    {isSelected && (
                                      <Check size={15} className="text-white shrink-0" strokeWidth={2.5} />
                                    )}
                                  </button>
                                );
                              })}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Textarea Instrucciones Personalizadas */}
                  <div className="p-4 bg-[#18181b] border border-white/5 rounded-[26px] space-y-2 shadow-lg">
                    <label className="block text-xs font-semibold text-white">
                      Instrucciones personalizadas
                    </label>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Directivas persistentes que el modelo aplicará en cada respuesta creativa o diálogo.
                    </p>
                    <textarea
                      rows={4}
                      value={current.personalityConfig?.customInstructions || ''}
                      onChange={(e) => {
                        const next = {
                          ...current,
                          personalityConfig: {
                            ...current.personalityConfig,
                            customInstructions: e.target.value,
                          },
                        };
                        setCurrent(next);
                        onSaveSettings(next);
                      }}
                      placeholder="Comparte cualquier otra cosa que quieras que Kizuna-Zek considere en sus respuestas (ritmo, silencios somáticos, evitar reportes clínicos...)"
                      className="w-full bg-[#121215] border border-white/10 rounded-xl p-3 text-[16px] md:text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 leading-relaxed resize-none"
                    />
                  </div>

                  {/* Directiva Global Activa & Taller de Directiva Global (Wizard) */}
                  <div className="p-4 bg-[#18181b] border border-white/5 rounded-[26px] space-y-3 shadow-lg">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-xs font-semibold text-white">Directiva Global Activa & Taller</div>
                        <div className="text-[11px] text-zinc-400">Edita directamente la directiva maestra o diséñala paso a paso en el Taller</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {onStartPersonaWizard && (
                          <button
                            type="button"
                            onClick={() => {
                              onSaveSettings(current);
                              onClose();
                              onStartPersonaWizard();
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 hover:text-white active:scale-95 transition-all shrink-0 cursor-pointer"
                          >
                            <span>🪄 Abrir Taller</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <textarea
                      rows={6}
                      value={current.globalSystemPrompt || ''}
                      onChange={(e) => {
                        localStorage.setItem('kizuna_custom_global_prompt', 'true');
                        const next = {
                          ...current,
                          globalSystemPrompt: e.target.value,
                          globalPersona: e.target.value,
                        };
                        setCurrent(next);
                        onSaveSettings(next);
                      }}
                      placeholder="Directiva Global del sistema..."
                      className="w-full bg-[#121215] border border-white/10 rounded-xl p-3 text-[16px] md:text-xs text-white font-mono placeholder-zinc-500 focus:outline-none focus:border-white/30 leading-relaxed resize-y"
                    />
                  </div>
                </div>
              </motion.div>
            )}

          {/* ========================================================= */}
          {/* VISTA D: 'models' (Motores y Modelos)                     */}
          {/* ========================================================= */}
          {currentView === 'models' && (
            <motion.div
              key="models"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="flex-1 overflow-y-auto p-4 space-y-4 smooth-scroll"
            >
              <div className="space-y-5 max-w-xl mx-auto">
              {/* Provider Selector: NVIDIA NIM vs Server Native */}
              <div>
                <label className="block text-xs font-medium text-[#d4d4d8] mb-2">
                  Motor de Inferencia
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrent({ ...current, provider: 'alibaba', autoModelRouting: false })}
                    className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                      current.provider === 'alibaba'
                        ? 'bg-[#141418] border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.15)]'
                        : 'bg-[#0e0e12] border-[#1f1f23] text-[#a1a1aa] hover:border-[#38383e]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-xs text-white">Alibaba Cloud MaaS</div>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-orange-500/10 text-orange-400 border border-orange-500/30 shrink-0">
                        Enterprise
                      </span>
                    </div>
                    <div className="text-[11px] text-[#71717a] mt-0.5">
                      Qwen 3.8 (Flash & Max) y DeepSeek K3
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrent({ ...current, provider: 'custom', autoModelRouting: false })}
                    className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                      current.provider === 'custom'
                        ? 'bg-[#141418] border-white text-white'
                        : 'bg-[#0e0e12] border-[#1f1f23] text-[#a1a1aa] hover:border-[#38383e]'
                    }`}
                  >
                    <div className="font-semibold text-xs">NVIDIA NIM (Dinámico)</div>
                    <div className="text-[11px] text-[#71717a] mt-0.5">
                      Modelos reales de tu cuenta con búsqueda y favoritos
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrent({ ...current, provider: 'gemini', autoModelRouting: false })}
                    className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                      current.provider === 'gemini'
                        ? 'bg-[#141418] border-white text-white'
                        : 'bg-[#0e0e12] border-[#1f1f23] text-[#a1a1aa] hover:border-[#38383e]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-xs">Google Gemini Engine</div>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#1c1c24] text-white border border-[#2e2e38] flex items-center gap-1">
                        <VisionLensIcon size={11} className="text-amber-400" />
                        <span>Visión</span>
                      </span>
                    </div>
                    <div className="text-[11px] text-[#71717a] mt-0.5">
                      1M contexto nativo (gemini-3.8-flash)
                    </div>
                  </button>
                </div>
              </div>

              {/* Alibaba Cloud Model Studio (MaaS) Configuration */}
              {current.provider === 'alibaba' && (
                <div className="p-4 bg-[#0e0e12] border border-[#1f1f23] rounded-md space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Cloud size={14} className="text-orange-500" />
                      <span>Alibaba Cloud Model Studio (MaaS)</span>
                    </div>
                    <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                      ● Workspace Empresarial Singapur
                    </span>
                  </div>

                  {/* Enterprise Highlights Banner */}
                  <div className="p-3 bg-zinc-900/60 border border-white/5 rounded-xl space-y-1.5 text-[11px] text-zinc-300">
                    <div className="flex items-center justify-between text-white font-medium">
                      <span className="flex items-center gap-1 text-orange-400">
                        ⚡ Beneficios de tu Workspace Dedicado
                      </span>
                      <span className="font-mono text-[10px] text-orange-300 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">ws-sitvcc6ml5lia10m</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      Concurrencia y aislamiento dedicados en Singapur sin error 429, compatibilidad nativa con llaves <code>sk-ws-...</code> y soporte de <strong>1M Tokens</strong> en <strong>Qwen 3.8 Omni Flash</strong>, <strong>Qwen 3.8 Flash</strong> y <strong>Qwen 3.8 Plus</strong>.
                    </p>
                  </div>

                  {/* Base URL (Accordion colapsable con opciones de Endpoint) */}
                  <details className="group border border-[#22222a] rounded-xl p-3 bg-[#0d0d12]" open>
                    <summary className="text-xs font-mono text-zinc-400 cursor-pointer flex items-center justify-between select-none">
                      <span>⚙️ Servidor Endpoint (Workspace MaaS Singapur)</span>
                      <span className="text-[10px] text-zinc-500 font-sans group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="pt-2.5 mt-2 border-t border-[#1a1a22] space-y-2">
                      <label className="block text-[11px] text-[#a1a1aa]">
                        Seleccionar Servidor Endpoint
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCurrent({
                            ...current,
                            alibabaBaseUrl: 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'
                          })}
                          className={`p-2 rounded-lg border text-left text-[11px] transition-all cursor-pointer ${
                            (!current.alibabaBaseUrl || current.alibabaBaseUrl.includes('ws-sitvcc6ml5lia10m'))
                              ? 'bg-orange-500/15 border-orange-500/50 text-white font-semibold'
                              : 'bg-[#08080a] border-[#1f1f23] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <div className="font-mono text-[11px] text-orange-400 flex items-center gap-1">
                            <span>🏢 Workspace Singapur (Predeterminado)</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            Para tu llave sk-ws-... (ws-sitvcc6ml5lia10m)
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCurrent({
                            ...current,
                            alibabaBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
                          })}
                          className={`p-2 rounded-lg border text-left text-[11px] transition-all cursor-pointer ${
                            current.alibabaBaseUrl?.includes('dashscope-intl')
                              ? 'bg-orange-500/15 border-orange-500/50 text-white font-semibold'
                              : 'bg-[#08080a] border-[#1f1f23] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <div className="font-mono text-[11px] text-orange-400 flex items-center gap-1">
                            <span>🌍 Estándar Internacional</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            Para llaves sk-... generales
                          </div>
                        </button>
                      </div>

                      <div className="pt-1">
                        <label className="block text-[10px] text-[#71717a] mb-1 font-mono">
                          URL Personalizada Endpoint Compatible-Mode
                        </label>
                        <input
                          type="text"
                          placeholder="https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
                          value={current.alibabaBaseUrl || ''}
                          onChange={(e) =>
                            setCurrent({ ...current, alibabaBaseUrl: e.target.value })
                          }
                          className="w-full bg-[#070709] border border-[#1f1f23] rounded-md px-3 py-1.5 text-[16px] md:text-xs text-white font-mono placeholder-[#52525b]"
                        />
                      </div>
                    </div>
                  </details>

                  {/* Masked Alibaba API Key Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-[#a1a1aa]">
                        Alibaba Cloud API Key (sk-...)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowAlibabaApiKey(!showAlibabaApiKey)}
                        className="text-[11px] text-[#71717a] hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {showAlibabaApiKey ? <EyeOff size={11} /> : <Eye size={11} />}
                        <span>{showAlibabaApiKey ? 'Ocultar' : 'Mostrar'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showAlibabaApiKey ? 'text' : 'password'}
                        placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={current.alibabaApiKey || ''}
                        onChange={(e) => {
                          const cleaned = cleanApiKey(e.target.value);
                          const autoUrl = cleaned.startsWith('sk-ws-')
                            ? 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'
                            : cleaned.startsWith('sk-')
                              ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
                              : current.alibabaBaseUrl;
                          setCurrent({ ...current, alibabaApiKey: cleaned, alibabaBaseUrl: autoUrl });
                        }}
                        className="w-full bg-[#070709] border border-[#1f1f23] rounded-md px-3 py-1.5 text-[16px] md:text-xs text-white font-mono placeholder-[#52525b]"
                      />
                    </div>
                  </div>

                  {/* Dynamic Model Discovery, Search & Favorites for Alibaba Cloud */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-[#a1a1aa]">
                        Selector de Modelo Activo
                      </label>
                      <motion.button
                        whileTap={{ scale: 0.93 }}
                        type="button"
                        onClick={() =>
                          fetchAlibabaModels(current.alibabaApiKey || '', current.alibabaBaseUrl || '')
                        }
                        disabled={!hasAlibabaApiKey || isLoadingAlibabaModels}
                        className="flex items-center gap-1 text-[11px] text-white hover:text-orange-400 hover:underline disabled:opacity-40 cursor-pointer"
                      >
                        <RefreshCw
                          size={11}
                          className={isLoadingAlibabaModels ? 'animate-spin' : ''}
                        />
                        <span>Cargar Modelos</span>
                      </motion.button>
                    </div>

                    {!hasAlibabaApiKey ? (
                      <div className="w-full p-2.5 bg-[#070709] border border-[#1f1f23] rounded-md text-xs text-[#71717a] font-mono italic">
                        Ingresá tu API Key de Alibaba Cloud para consultar tus modelos en vivo
                      </div>
                    ) : (
                      <div className="space-y-2 bg-[#070709] border border-[#1f1f23] rounded-md p-2.5">
                        {/* Search and Filters */}
                        <div className="space-y-2">
                          <div className="relative flex items-center">
                            <Search size={13} className="absolute left-2.5 text-[#71717a]" />
                                <input
                              type="text"
                              placeholder="Buscar modelos Qwen (qwen3.8-omni-flash, qwen3.8-max, qwen3.8-plus)..."
                              value={alibabaModelSearch}
                              onChange={(e) => setAlibabaModelSearch(e.target.value)}
                              className="w-full bg-[#101014] border border-[#1f1f23] rounded-md py-1.5 pl-8 pr-7 text-[16px] md:text-xs text-white placeholder-[#71717a] focus:outline-none focus:border-white font-mono"
                            />
                            {alibabaModelSearch && (
                              <button
                                onClick={() => setAlibabaModelSearch('')}
                                className="absolute right-2 text-[#71717a] hover:text-white"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setOnlyAlibabaVisionFilter(!onlyAlibabaVisionFilter)}
                              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border font-mono transition-colors shrink-0 cursor-pointer ${
                                onlyAlibabaVisionFilter
                                  ? 'bg-white text-black border-white font-semibold'
                                  : 'bg-[#101014] text-[#a1a1aa] border-[#222228] hover:text-white hover:border-[#383842]'
                              }`}
                            >
                              <VisionLensIcon size={14} className={onlyAlibabaVisionFilter ? "text-amber-400" : "text-zinc-400"} />
                              <span>Mostrar solo modelos con Visión</span>
                            </button>
                            <span className="text-[10px] font-mono text-[#71717a] shrink-0">
                              {favoriteAlibabaModels.length + otherAlibabaModels.length} disponibles
                            </span>
                          </div>
                        </div>

                        {/* Currently selected model summary badge */}
                        {(current.alibabaModel || 'qwen3.8-max') && (
                          <div className="flex items-center justify-between p-2 bg-[#141418] border border-[#2b2b32] rounded-md">
                            <div className="min-w-0 flex items-center gap-2">
                              <CheckCircle2 size={13} className="text-orange-500 shrink-0" />
                              <div className="truncate">
                                <span className="text-[10px] text-[#71717a] uppercase block font-mono">
                                  Modelo en uso:
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-mono font-medium text-white truncate">
                                    {current.alibabaModel || 'qwen3.8-max'}
                                  </span>
                                  {isVisionModel(current.alibabaModel || 'qwen3.8-max') && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#202028] text-white border border-[#30303c] shrink-0 inline-flex items-center gap-1">
                                      <VisionLensIcon size={11} className="text-amber-400" />
                                      <span>Visión</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleToggleFavoriteAlibabaModel(current.alibabaModel || 'qwen3.8-max', e)}
                              className="p-1 hover:text-white cursor-pointer"
                              title="Fijar en favoritos"
                            >
                              <Star
                                size={14}
                                className={
                                  (current.favoriteAlibabaModelIds || ['qwen3.8-omni-flash', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.8-plus', 'qwen-plus']).includes(current.alibabaModel || 'qwen3.8-max')
                                    ? 'fill-orange-400 text-orange-400'
                                    : 'text-[#52525b]'
                                }
                              />
                            </button>
                          </div>
                        )}

                        {/* Scrollable Model List */}
                        <div className="max-h-64 sm:max-h-56 overflow-y-auto smooth-scroll space-y-1 pr-1 pt-1">
                          {/* Favorites Section */}
                          {favoriteAlibabaModels.length > 0 && (
                            <div className="mb-2">
                              <div className="text-[10px] font-mono text-[#a1a1aa] uppercase tracking-wider px-1 pb-1 flex items-center gap-1">
                                <Star size={10} className="fill-[#a1a1aa]" />
                                <span>Modelos Favoritos ({favoriteAlibabaModels.length})</span>
                              </div>
                              <div className="space-y-1">
                                {favoriteAlibabaModels.map((m) => {
                                  const isSelected = (current.alibabaModel || 'qwen-3.8-max') === m.id;
                                  const hasVision = isVisionModel(m.id);
                                  return (
                                    <div
                                      key={m.id}
                                      onClick={() => setCurrent({ ...current, provider: 'alibaba', alibabaModel: m.id, autoModelRouting: false })}
                                      className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs font-mono transition-colors ${
                                        isSelected
                                          ? 'bg-orange-500 text-white font-semibold'
                                          : 'bg-[#121216] text-white hover:bg-[#1a1a20]'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <span className="truncate">{m.id}</span>
                                        {hasVision && (
                                          <span
                                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded shrink-0 inline-flex items-center gap-1 ${
                                              isSelected
                                                ? 'bg-black text-white'
                                                : 'bg-[#1e1e24] text-white border border-[#2b2b34]'
                                            }`}
                                          >
                                            <VisionLensIcon size={10} className="text-amber-400" />
                                            <span>Visión</span>
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => handleToggleFavoriteAlibabaModel(m.id, e)}
                                        className="p-1 shrink-0 ml-2 cursor-pointer"
                                        title="Desmarcar favorito"
                                      >
                                        <Star
                                          size={13}
                                          className={
                                            isSelected
                                              ? 'fill-white text-white'
                                              : 'fill-orange-400 text-orange-400'
                                          }
                                        />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Other Models */}
                          <div>
                            {favoriteAlibabaModels.length > 0 && (
                              <div className="text-[10px] font-mono text-[#71717a] uppercase tracking-wider px-1 pb-1">
                                Todos los Modelos ({otherAlibabaModels.length})
                              </div>
                            )}

                            {otherAlibabaModels.length === 0 && favoriteAlibabaModels.length === 0 ? (
                              <div className="p-3 text-center text-xs text-[#71717a]">
                                No se encontraron modelos con "{alibabaModelSearch}".
                              </div>
                            ) : (
                              otherAlibabaModels.map((m) => {
                                const isSelected = (current.alibabaModel || 'qwen-3.8-max') === m.id;
                                const hasVision = isVisionModel(m.id);
                                return (
                                  <div
                                    key={m.id}
                                    onClick={() => setCurrent({ ...current, provider: 'alibaba', alibabaModel: m.id, autoModelRouting: false })}
                                    className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs font-mono transition-colors ${
                                      isSelected
                                        ? 'bg-orange-500 text-white font-semibold'
                                        : 'text-[#d4d4d8] hover:bg-[#121216] hover:text-white'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      <span className="truncate">{m.id}</span>
                                      {hasVision && (
                                        <span
                                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded shrink-0 inline-flex items-center gap-1 ${
                                            isSelected
                                              ? 'bg-black text-white'
                                              : 'bg-[#18181f] text-[#d4d4d8] border border-[#272731]'
                                          }`}
                                        >
                                          <VisionLensIcon size={10} className="text-amber-400" />
                                          <span>Visión</span>
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => handleToggleFavoriteAlibabaModel(m.id, e)}
                                      className="p-1 text-[#52525b] hover:text-white shrink-0 ml-2 cursor-pointer"
                                      title="Marcar como favorito"
                                    >
                                      <Star size={13} />
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {alibabaFetchError && (
                      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-red-400">
                        <AlertCircle size={12} className="shrink-0" />
                        <span>{alibabaFetchError}</span>
                      </div>
                    )}

                    {/* Enterprise Feature: Adaptador LoRA / Modelo Personalizado de Autor */}
                    <div className="pt-3 mt-3 border-t border-[#1b1b22] space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-white flex items-center gap-1.5">
                          <span className="text-amber-400">✨</span>
                          <span>Adaptador LoRA / Modelo Personalizado de Autor</span>
                        </label>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          Bailian Enterprise
                        </span>
                      </div>
                      <p className="text-[11px] text-[#71717a] leading-relaxed">
                        Si afinaste un modelo en Model Studio (SFT) o desplegaste un adaptador LoRA con el corpus de tu novela, ingresa su ID aquí para activarlo con insignia especial.
                      </p>
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="ID de modelo o LoRA (ej. qwen3.8-max:lora-jukkou o ws-sitvcc.../mi-lora)"
                          value={current.alibabaCustomLoraModel || ''}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            setCurrent({ ...current, alibabaCustomLoraModel: val });
                          }}
                          className="w-full bg-[#070709] border border-[#1f1f23] rounded-md px-3 py-1.5 text-[16px] md:text-xs text-white font-mono placeholder-[#52525b]"
                        />
                        {current.alibabaCustomLoraModel && (
                          <div className="flex items-center justify-between p-2 bg-amber-950/20 border border-amber-800/30 rounded-md">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                                [LoRA Autor]
                              </span>
                              <span className="text-xs font-mono text-white truncate">
                                {current.alibabaCustomLoraModel}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setCurrent({
                                    ...current,
                                    alibabaModel: current.alibabaCustomLoraModel,
                                    favoriteAlibabaModelIds: Array.from(new Set([current.alibabaCustomLoraModel!, ...(current.favoriteAlibabaModelIds || [])])),
                                  });
                                }}
                                className="px-2.5 py-1 text-[11px] bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors cursor-pointer min-h-[32px] flex items-center justify-center"
                              >
                                Usar ahora
                              </button>
                              <button
                                type="button"
                                onClick={() => setCurrent({ ...current, alibabaCustomLoraModel: '' })}
                                className="p-1 text-[#71717a] hover:text-red-400 rounded transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                                title="Quitar modelo LoRA"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* NVIDIA NIM Dynamic Configuration */}
              {current.provider === 'custom' && (
                <div className="p-4 bg-[#0e0e12] border border-[#1f1f23] rounded-md space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Server size={14} />
                    <span>Conexión NVIDIA NIM</span>
                  </div>
                  {modelsAvailable && (
                    <span className="text-[10px] font-mono text-emerald-400">
                      ● {current.fetchedNvidiaModels.length} Modelos Descubiertos
                    </span>
                  )}
                </div>

                {/* Base URL (Oculto en acordeón colapsable por defecto) */}
                <details className="group border border-[#22222a] rounded-xl p-3 bg-[#0d0d12]">
                  <summary className="text-xs font-mono text-zinc-400 cursor-pointer flex items-center justify-between select-none">
                    <span>⚙️ Opciones avanzadas de Endpoint (Base URL)</span>
                    <span className="text-[10px] text-zinc-500 font-sans group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="pt-2.5 mt-2 border-t border-[#1a1a22]">
                    <label className="block text-[11px] text-[#a1a1aa] mb-1">
                      Base URL (NVIDIA NIM)
                    </label>
                    <input
                      type="text"
                      placeholder="https://integrate.api.nvidia.com/v1"
                      value={current.customBaseUrl}
                      onChange={(e) =>
                        setCurrent({ ...current, customBaseUrl: e.target.value })
                      }
                      className="w-full bg-[#070709] border border-[#1f1f23] rounded-md px-3 py-1.5 text-[16px] md:text-xs text-white font-mono placeholder-[#52525b]"
                    />
                    <p className="text-[10px] text-zinc-500 font-mono mt-1">
                      Por defecto: https://integrate.api.nvidia.com/v1
                    </p>
                  </div>
                </details>

                {/* Masked NVIDIA API Key Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-[#a1a1aa]">
                      NVIDIA API Key (Enmascarada: nvapi-...)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="text-[11px] text-[#71717a] hover:text-white flex items-center gap-1"
                    >
                      {showApiKey ? <EyeOff size={11} /> : <Eye size={11} />}
                      <span>{showApiKey ? 'Ocultar' : 'Mostrar'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="nvapi-..."
                      value={current.customApiKey}
                      onChange={(e) =>
                        setCurrent({ ...current, customApiKey: e.target.value })
                      }
                      className="w-full bg-[#070709] border border-[#1f1f23] rounded-md px-3 py-1.5 text-[16px] md:text-xs text-white font-mono placeholder-[#52525b]"
                    />
                  </div>
                </div>

                {/* Dynamic Model Discovery, Search & Favorites */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[#a1a1aa]">
                      Selector de Modelo Activo
                    </label>
                    <motion.button
                      whileTap={{ scale: 0.93 }}
                      type="button"
                      onClick={() =>
                        fetchNvidiaModels(current.customApiKey, current.customBaseUrl)
                      }
                      disabled={!hasApiKey || isLoadingModels}
                      className="flex items-center gap-1 text-[11px] text-white hover:underline disabled:opacity-40"
                    >
                      <RefreshCw
                        size={11}
                        className={isLoadingModels ? 'animate-spin' : ''}
                      />
                      <span>Cargar Modelos</span>
                    </motion.button>
                  </div>

                  {!hasApiKey ? (
                    <div className="w-full p-2.5 bg-[#070709] border border-[#1f1f23] rounded-md text-xs text-[#71717a] font-mono italic">
                      Ingresá tu API Key para cargar tus modelos
                    </div>
                  ) : isLoadingModels ? (
                    <div className="w-full p-2.5 bg-[#070709] border border-[#1f1f23] rounded-md text-xs text-white font-mono flex items-center gap-2">
                      <RefreshCw size={12} className="animate-spin text-white" />
                      <span>Consultando modelos disponibles en NVIDIA NIM...</span>
                    </div>
                  ) : modelsAvailable ? (
                    <div className="space-y-2 bg-[#070709] border border-[#1f1f23] rounded-md p-2.5">
                      {/* Sticky Search Input with fuzzy filtering & Vision Filter */}
                      <div className="space-y-1.5">
                        <div className="relative flex items-center">
                          <Search size={13} className="absolute left-2.5 text-[#71717a]" />
                          <input
                            type="text"
                            placeholder="Buscar modelo (ej. Llama, Qwen, DeepSeek, Kimi)..."
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                            className="w-full bg-[#101014] border border-[#1f1f23] rounded-md py-1.5 pl-8 pr-7 text-[16px] md:text-xs text-white placeholder-[#71717a] focus:outline-none focus:border-white font-mono"
                          />
                          {modelSearch && (
                            <button
                              onClick={() => setModelSearch('')}
                              className="absolute right-2 text-[#71717a] hover:text-white"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {/* Quick filter chip for vision models */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setOnlyVisionFilter(!onlyVisionFilter)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border font-mono transition-colors shrink-0 ${
                              onlyVisionFilter
                                ? 'bg-white text-black border-white font-semibold'
                                : 'bg-[#101014] text-[#a1a1aa] border-[#222228] hover:text-white hover:border-[#383842]'
                            }`}
                          >
                            <VisionLensIcon size={14} className={onlyVisionFilter ? "text-amber-400" : "text-zinc-400"} />
                            <span>Mostrar solo modelos con Visión</span>
                          </button>
                          <span className="text-[10px] font-mono text-[#71717a] shrink-0">
                            {favoriteModels.length + otherModels.length} disponibles
                          </span>
                        </div>
                      </div>

                      {/* Currently selected model summary badge */}
                      {current.customModel && (
                        <div className="flex items-center justify-between p-2 bg-[#141418] border border-[#2b2b32] rounded-md">
                          <div className="min-w-0 flex items-center gap-2">
                            <CheckCircle2 size={13} className="text-white shrink-0" />
                            <div className="truncate">
                              <span className="text-[10px] text-[#71717a] uppercase block font-mono">
                                Modelo en uso:
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-mono font-medium text-white truncate">
                                  {current.customModel}
                                </span>
                                {isVisionModel(current.customModel) && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#202028] text-white border border-[#30303c] shrink-0 inline-flex items-center gap-1">
                                    <VisionLensIcon size={11} className="text-amber-400" />
                                    <span>Visión</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleToggleFavoriteModel(current.customModel, e)}
                            className="p-1 hover:text-white"
                            title="Fijar en favoritos"
                          >
                            <Star
                              size={14}
                              className={
                                current.favoriteModelIds.includes(current.customModel)
                                  ? 'fill-white text-white'
                                  : 'text-[#52525b]'
                              }
                            />
                          </button>
                        </div>
                      )}

                      {/* Scrollable Model List */}
                      <div className="max-h-64 sm:max-h-56 overflow-y-auto smooth-scroll space-y-1 pr-1 pt-1">
                        {/* Favorites Section */}
                        {favoriteModels.length > 0 && (
                          <div className="mb-2">
                            <div className="text-[10px] font-mono text-[#a1a1aa] uppercase tracking-wider px-1 pb-1 flex items-center gap-1">
                              <Star size={10} className="fill-[#a1a1aa]" />
                              <span>Modelos Favoritos ({favoriteModels.length})</span>
                            </div>
                            <div className="space-y-1">
                              {favoriteModels.map((m) => {
                                const isSelected = current.customModel === m.id;
                                const hasVision = isVisionModel(m.id);
                                return (
                                  <div
                                    key={m.id}
                                    onClick={() => setCurrent({ ...current, provider: 'custom', customModel: m.id, autoModelRouting: false })}
                                    className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs font-mono transition-colors ${
                                      isSelected
                                        ? 'bg-white text-black font-semibold'
                                        : 'bg-[#121216] text-white hover:bg-[#1a1a20]'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      <span className="truncate">{m.id}</span>
                                      {hasVision && (
                                        <span
                                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded shrink-0 inline-flex items-center gap-1 ${
                                            isSelected
                                              ? 'bg-black text-white'
                                              : 'bg-[#1e1e24] text-white border border-[#2b2b34]'
                                          }`}
                                        >
                                          <VisionLensIcon size={10} className="text-amber-400" />
                                          <span>Visión</span>
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => handleToggleFavoriteModel(m.id, e)}
                                      className="p-1 shrink-0 ml-2"
                                      title="Desmarcar favorito"
                                    >
                                      <Star
                                        size={13}
                                        className={
                                          isSelected
                                            ? 'fill-black text-black'
                                            : 'fill-white text-white'
                                        }
                                      />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* All / Other Models */}
                        <div>
                          {favoriteModels.length > 0 && (
                            <div className="text-[10px] font-mono text-[#71717a] uppercase tracking-wider px-1 pb-1">
                              Todos los Modelos ({otherModels.length})
                            </div>
                          )}

                          {otherModels.length === 0 && favoriteModels.length === 0 ? (
                            <div className="p-3 text-center text-xs text-[#71717a]">
                              No se encontraron modelos con "{modelSearch}".
                            </div>
                          ) : (
                            otherModels.map((m) => {
                              const isSelected = current.customModel === m.id;
                              const hasVision = isVisionModel(m.id);
                              return (
                                <div
                                  key={m.id}
                                  onClick={() => setCurrent({ ...current, provider: 'custom', customModel: m.id, autoModelRouting: false })}
                                  className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs font-mono transition-colors ${
                                    isSelected
                                      ? 'bg-white text-black font-semibold'
                                      : 'text-[#d4d4d8] hover:bg-[#121216] hover:text-white'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="truncate">{m.id}</span>
                                    {hasVision && (
                                      <span
                                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded shrink-0 inline-flex items-center gap-1 ${
                                          isSelected
                                            ? 'bg-black text-white'
                                            : 'bg-[#18181f] text-[#d4d4d8] border border-[#272731]'
                                        }`}
                                      >
                                        <VisionLensIcon size={10} className="text-amber-400" />
                                        <span>Visión</span>
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => handleToggleFavoriteModel(m.id, e)}
                                    className="p-1 text-[#52525b] hover:text-white shrink-0 ml-2"
                                    title="Marcar como favorito"
                                  >
                                    <Star size={13} />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full p-2.5 bg-[#070709] border border-[#1f1f23] rounded-md text-xs text-[#71717a] font-mono">
                      Presiona "Cargar Modelos" para consultar la lista de NVIDIA.
                    </div>
                  )}

                  {fetchError && (
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-red-400">
                      <AlertCircle size={12} className="shrink-0" />
                      <span>{fetchError}</span>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Google Gemini Dynamic Configuration */}
              {current.provider === 'gemini' && (
                <div className="p-4 bg-[#0e0e12] border border-[#1f1f23] rounded-md space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Sparkles size={14} className="text-white" />
                      <span>Conexión Google Gemini Engine (1M Contexto)</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400">
                      ● API Servidor y Directa Activa
                    </span>
                  </div>

                  {/* Masked Google Gemini API Key Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-[#a1a1aa]">
                        Google Gemini API Key (AQ.Ab... o AIzaSy...)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowGeminiApiKey(!showGeminiApiKey)}
                        className="text-[11px] text-[#71717a] hover:text-white flex items-center gap-1"
                      >
                        {showGeminiApiKey ? <EyeOff size={11} /> : <Eye size={11} />}
                        <span>{showGeminiApiKey ? 'Ocultar' : 'Mostrar'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showGeminiApiKey ? 'text' : 'password'}
                        placeholder="AQ.Ab8RN... o AIzaSy..."
                        value={current.geminiApiKey || ''}
                        onChange={(e) => {
                          const cleaned = cleanApiKey(e.target.value);
                          setCurrent({ ...current, geminiApiKey: cleaned });
                          if (cleaned) {
                            localStorage.setItem('kizuna_gemini_api_key', cleaned);
                            localStorage.setItem('kizuna_gemini_key', cleaned);
                          }
                        }}
                        className="w-full bg-[#070709] border border-[#1f1f23] rounded-md px-3 py-1.5 text-[16px] md:text-xs text-white font-mono placeholder-[#52525b]"
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-[#71717a]">
                        Usa la clave fallback predeterminada si el campo está vacío.
                      </span>
                      {isValidGeminiApiKey(current.geminiApiKey) ? (
                        <span className="text-[10px] font-mono text-emerald-400">
                          ● Clave Activa y Válida {current.geminiApiKey?.startsWith('AQ.') ? '(Vertex Express)' : '(AI Studio)'}
                        </span>
                      ) : !current.geminiApiKey ? (
                        <span className="text-[10px] font-mono text-emerald-400">
                          ● Usando Clave del Servidor (Fallback)
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-amber-400">
                          ● Clave Incompleta / Inválida
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 1-Click Web Search Grounding Diagnostic Connection Test */}
                  <div className="pt-0.5">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      type="button"
                      onClick={handleTestWebSearch}
                      disabled={isTestingWebSearch}
                      className="w-full py-2 px-3 rounded-md bg-[#16161c] hover:bg-[#202028] border border-[#2b2b36] hover:border-neutral-500 text-xs font-mono font-medium text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isTestingWebSearch ? (
                        <>
                          <RefreshCw size={13} className="animate-spin text-blue-400" />
                          <span>Verificando conexión con Google Search...</span>
                        </>
                      ) : (
                        <>
                          <PipetteProbeIcon size={14} className={isTestingWebSearch ? "animate-pulse text-amber-400" : "text-zinc-300"} />
                          <span>Probar Conexión de Búsqueda Web</span>
                        </>
                      )}
                    </motion.button>

                    {testResult && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mt-2 p-2.5 rounded-md text-xs font-mono flex items-start gap-2 border ${
                          testResult.success
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                            : 'bg-red-950/40 border-red-500/40 text-red-200'
                        }`}
                      >
                        {testResult.success ? (
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{testResult.message}</p>
                          {testResult.sourcesCount !== undefined && testResult.sourcesCount > 0 && (
                            <p className="text-[11px] text-emerald-300/80 mt-0.5">
                              Fuentes Google recuperadas con éxito: {testResult.sourcesCount} resultados.
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Active Selected Model Summary */}
                  <div className="flex items-center justify-between p-2.5 bg-[#141418] border border-[#2b2b32] rounded-md">
                    <div className="min-w-0 flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-white shrink-0" />
                      <div className="truncate">
                        <span className="text-[10px] text-[#71717a] uppercase block font-mono">
                          Modelo Gemini Activo:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-medium text-white truncate">
                            {current.geminiModel}
                          </span>
                          {isVisionModel(current.geminiModel) && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#202028] text-white border border-[#30303c] shrink-0 inline-flex items-center gap-1">
                              <VisionLensIcon size={11} className="text-amber-400" />
                              <span>Visión</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.93 }}
                      type="button"
                      onClick={fetchGeminiModels}
                      disabled={isLoadingGeminiModels}
                      className="flex items-center gap-1 text-[11px] text-white hover:underline disabled:opacity-40"
                    >
                      <RefreshCw
                        size={11}
                        className={isLoadingGeminiModels ? 'animate-spin' : ''}
                      />
                      <span>Actualizar Modelos</span>
                    </motion.button>
                  </div>

                  {/* Search and Model Selector */}
                  <div className="space-y-2 bg-[#070709] border border-[#1f1f23] rounded-md p-2.5">
                    <div className="relative flex items-center">
                      <Search size={13} className="absolute left-2.5 text-[#71717a]" />
                      <input
                        type="text"
                        placeholder="Buscar modelo Gemini (ej. 2.5-flash, 2.5-pro, 1.5)..."
                        value={geminiModelSearch}
                        onChange={(e) => setGeminiModelSearch(e.target.value)}
                        className="w-full bg-[#101014] border border-[#1f1f23] rounded-md py-1.5 pl-8 pr-7 text-[16px] md:text-xs text-white placeholder-[#71717a] focus:outline-none focus:border-white font-mono"
                      />
                      {geminiModelSearch && (
                        <button
                          onClick={() => setGeminiModelSearch('')}
                          className="absolute right-2 text-[#71717a] hover:text-white"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="max-h-52 overflow-y-auto smooth-scroll space-y-1 pr-1 pt-1">
                      {filteredGeminiModels.length === 0 ? (
                        <div className="p-3 text-center text-xs text-[#71717a]">
                          No se encontraron modelos Gemini con "{geminiModelSearch}".
                        </div>
                      ) : (
                        filteredGeminiModels.map((mId) => {
                          const isSelected = current.geminiModel === mId;
                          const hasVision = isVisionModel(mId);
                          return (
                            <div
                              key={mId}
                              onClick={() => setCurrent({ ...current, provider: 'gemini', geminiModel: mId, autoModelRouting: false })}
                              className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs font-mono transition-colors ${
                                isSelected
                                  ? 'bg-white text-black font-semibold'
                                  : 'text-[#d4d4d8] hover:bg-[#121216] hover:text-white'
                              }`}
                            >
                              <span className="truncate">{mId}</span>
                              {hasVision && (
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded shrink-0 inline-flex items-center gap-1 ${
                                    isSelected
                                      ? 'bg-black text-white'
                                      : 'bg-[#18181f] text-[#d4d4d8] border border-[#272731]'
                                  }`}
                                >
                                  <VisionLensIcon size={10} className="text-amber-400" />
                                  <span>Visión</span>
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {geminiFetchError && (
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-red-400">
                      <AlertCircle size={12} className="shrink-0" />
                      <span>{geminiFetchError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Tavily AI Search Engine Configuration Card */}
              <div className="p-4 bg-[#0e0e12] border border-[#1f1f23] rounded-md space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Search size={14} className="text-blue-400" />
                    <span>Búsqueda Web en Tiempo Real (Tavily AI Search)</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">
                    ● Reemplaza Google Grounding (Sin HTTP 429)
                  </span>
                </div>

                <p className="text-[11px] text-[#a1a1aa] leading-relaxed">
                  Conexión directa con la API de Tavily Search para inyectar hechos, noticias y contexto reciente en Gemini y NVIDIA sin agotar la cuota de Google.
                </p>

                {/* Tavily API Key Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-[#a1a1aa]">
                      Tavily Search API Key (tvly-...)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowTavilyApiKey(!showTavilyApiKey)}
                      className="text-[11px] text-[#71717a] hover:text-white flex items-center gap-1"
                    >
                      {showTavilyApiKey ? <EyeOff size={11} /> : <Eye size={11} />}
                      <span>{showTavilyApiKey ? 'Ocultar' : 'Mostrar'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showTavilyApiKey ? 'text' : 'password'}
                      placeholder="tvly-xxxxxxxxxxxxxxxxxxxx"
                      value={tavilyApiKey}
                      onChange={(e) => {
                        const cleaned = cleanApiKey(e.target.value);
                        setTavilyApiKey(cleaned);
                        localStorage.setItem('kizuna_tavily_key', cleaned);
                      }}
                      className="w-full bg-[#070709] border border-[#1f1f23] rounded-md px-3 py-1.5 text-[16px] md:text-xs text-white font-mono placeholder-[#52525b]"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-[#71717a]">
                      Guardada localmente como <code className="text-[#a1a1aa]">kizuna_tavily_key</code>.
                    </span>
                    {isValidTavilyApiKey(tavilyApiKey) ? (
                      <span className="text-[10px] font-mono text-emerald-400">
                        ● Clave Válida (tvly-)
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-amber-400">
                        ● Clave Incompleta / Vacía
                      </span>
                    )}
                  </div>
                </div>

                {/* Diagnostic Test Button */}
                <div className="pt-0.5">
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    type="button"
                    onClick={handleTestTavily}
                    disabled={isTestingTavily}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isTestingTavily ? (
                      <>
                        <RefreshCw size={13} className="animate-spin text-amber-400" />
                        <span>Muestreando enlace...</span>
                      </>
                    ) : (
                      <>
                        <PipetteProbeIcon size={14} className={isTestingTavily ? "animate-pulse text-amber-400" : "text-zinc-600 dark:text-zinc-300"} />
                        <span>Probar Conexión con Tavily</span>
                      </>
                    )}
                  </motion.button>

                  {tavilyTestResult && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mt-2 p-2.5 rounded-md text-xs font-mono flex items-start gap-2 border ${
                        tavilyTestResult.success
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                          : 'bg-red-950/40 border-red-500/40 text-red-200'
                      }`}
                    >
                      {tavilyTestResult.success ? (
                        <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{tavilyTestResult.message}</p>
                        {tavilyTestResult.sourcesCount !== undefined && tavilyTestResult.sourcesCount > 0 && (
                          <p className="text-[11px] text-emerald-300/80 mt-0.5">
                            ¡Tavily conectado! {tavilyTestResult.sourcesCount} fuentes encontradas.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* 1M Context Depth Toggle */}
              <div className="pt-1">
                <label className="block text-xs font-medium text-[#d4d4d8] mb-1.5">
                  Profundidad de Historial (Memoria de Conversación)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrent({ ...current, contextDepth: 'full' })}
                    className={`p-3 rounded-md border text-left transition-colors ${
                      current.contextDepth !== 'quick'
                        ? 'bg-[#141418] border-white text-white'
                        : 'bg-[#0e0e12] border-[#1f1f23] text-[#a1a1aa] hover:border-[#38383e]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Historial Completo</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#202028] text-white rounded">
                        1M Tokens
                      </span>
                    </div>
                    <p className="text-[11px] text-[#71717a] mt-1">
                      Recomendado para escribir novelas. No olvida ningún giro ni detalle del lore.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrent({ ...current, contextDepth: 'quick' })}
                    className={`p-3 rounded-md border text-left transition-colors ${
                      current.contextDepth === 'quick'
                        ? 'bg-[#141418] border-white text-white'
                        : 'bg-[#0e0e12] border-[#1f1f23] text-[#a1a1aa] hover:border-[#38383e]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Modo Rápido</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#202028] text-[#a1a1aa] rounded">
                        15 Mensajes
                      </span>
                    </div>
                    <p className="text-[11px] text-[#71717a] mt-1">
                      Solo los últimos 15 mensajes. Respuestas instantáneas para prompts ligeros.
                    </p>
                  </button>
                </div>
              </div>

              {/* Max Output Tokens Quick Preset Chips: [1024] [2048] [4096] [8192 (Escenas Largas)] */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-xs font-medium text-[#d4d4d8] block">
                      Max Output Tokens (Longitud de Generación)
                    </label>
                    <span className="text-[10px] text-[#71717a]">
                      Auto-clamp activo: previene errores HTTP 400 en modelos con límites reducidos.
                    </span>
                  </div>
                  <span className="text-xs font-mono text-white px-2 py-0.5 bg-[#141418] border border-[#272731] rounded">
                    {current.maxOutputTokens} tokens
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { value: 2048, label: '2048', desc: 'Diálogos y escenas cortas' },
                    { value: 4096, label: '4096', desc: 'Escenas estándar' },
                    { value: 8192, label: '8192', desc: 'Escenas Largas (Recomendado)' },
                    { value: 16384, label: '16384', desc: 'Capítulos Completos (Máx)' },
                  ].map((chip) => {
                    const isSelected = current.maxOutputTokens === chip.value;
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => setCurrent({ ...current, maxOutputTokens: chip.value })}
                        className={`p-3 rounded-xl border transition-all text-left cursor-pointer ${
                          isSelected
                            ? 'border-amber-500/50 bg-[#171722] text-white ring-1 ring-amber-500/20'
                            : 'border-[#22222e] bg-[#101017] text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold">
                            {chip.label}
                          </span>
                          {chip.value === 8192 && (
                            <span
                              className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                                isSelected ? 'bg-amber-500/20 text-amber-300' : 'bg-[#1c1c24] text-[#a1a1aa]'
                              }`}
                            >
                              Óptimo
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-[10px] mt-1 line-clamp-1 ${
                            isSelected ? 'text-amber-200/80' : 'text-[#71717a]'
                          }`}
                        >
                          {chip.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Temperature Slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#d4d4d8]">
                    Creatividad / Temperatura
                  </label>
                  <span className="text-xs font-mono text-white px-2 py-0.5 bg-[#141418] border border-[#1f1f23] rounded">
                    {current.temperature.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.4}
                  step={0.05}
                  value={current.temperature}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      temperature: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 h-1.5 rounded-lg bg-zinc-800 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-[#71717a] mt-1">
                  <span>0.1 (Fiel y sobrio)</span>
                  <span>0.75 (Equilibrio literario)</span>
                  <span>1.4 (Exploratorio)</span>
                </div>
              </div>

              {/* Modo de Razonamiento (Chain of Thought) Selector */}
              <div className="bg-[#12121a] border border-[#232330] p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <NeuralCoreIcon size={15} className="text-amber-400" />
                  <span>Modo de Razonamiento Profundo (Chain of Thought)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  {[
                    { id: 'off', label: '⚡ Instantáneo (0s)', desc: 'Sin CoT / Mínima latencia' },
                    { id: 'light', label: '💡 Equilibrado (~3s)', desc: '1024 tokens de CoT' },
                    { id: 'deep', label: 'Profundo (CoT)', desc: 'Razonamiento completo' },
                  ].map((option) => {
                    const activeMode = current.reasoningMode || (current.enableReasoning === false ? 'off' : 'deep');
                    const isSelected = activeMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setCurrent({
                            ...current,
                            reasoningMode: option.id as 'off' | 'light' | 'deep',
                            enableReasoning: option.id !== 'off',
                            thinkingBudget: option.id === 'off' ? 0 : option.id === 'light' ? 1024 : 2048,
                          })
                        }
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-500/50 bg-[#181824] text-amber-200 ring-1 ring-amber-500/20'
                            : 'border-[#22222e] bg-[#101017] text-zinc-400 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-mono font-medium truncate flex items-center gap-1.5">
                          {option.id === 'deep' ? (
                            <>
                              <NeuralCoreIcon size={13} className="text-amber-400" />
                              <span>{option.label}</span>
                            </>
                          ) : (
                            <span>{option.label}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">
                          {option.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Motor de Voz y Audio (Qwen-Audio 3.1: ASR-Flash, TTS-Flash, TTS-Plus) */}
              <div className="bg-[#12121a] border border-[#232330] p-4 rounded-xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                    <Volume2 size={15} className="text-zinc-300" />
                    <span>Motor de Voz y Audio (Qwen-Audio 3.1)</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                    Alibaba Singapur
                  </span>
                </div>

                {/* 1. Dictado por Micrófono (ASR) */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                    <Mic size={12} className="text-zinc-400" />
                    <span>Dictado de Voz (Micrófono)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        id: 'qwen-audio-3.1-asr-flash',
                        label: 'Qwen-Audio-3.1-ASR-Flash',
                        desc: 'Transcripción inteligente con puntuación automática',
                      },
                      {
                        id: 'browser',
                        label: 'Nativo del navegador',
                        desc: 'Web Speech API local sin consumo de cuota',
                      },
                    ].map((opt) => {
                      const activeAsr = current.asrEngine || 'qwen-audio-3.1-asr-flash';
                      const isSelected = activeAsr === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setCurrent({
                              ...current,
                              asrEngine: opt.id as 'qwen-audio-3.1-asr-flash' | 'browser',
                            })
                          }
                          className={`p-2.5 min-h-[44px] rounded-lg border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-white/40 bg-[#181824] text-white'
                              : 'border-[#22222e] bg-[#101017] text-zinc-400 hover:border-zinc-700 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-mono font-medium truncate">{opt.label}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Síntesis de Lectura en Voz Alta (TTS) */}
                <div className="space-y-1.5 pt-1 border-t border-white/5">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                    <Volume2 size={12} className="text-zinc-400" />
                    <span>Lectura en Voz Alta (Botón Escuchar)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        id: 'auto',
                        label: 'Automático (Flash / Plus)',
                        desc: 'Flash para respuestas breves y Plus para escenas literarias',
                      },
                      {
                        id: 'qwen-audio-3.1-tts-flash',
                        label: 'Qwen-Audio-3.1-TTS-Flash',
                        desc: 'Lectura rápida y baja latencia por tokens',
                      },
                      {
                        id: 'qwen-audio-3.1-tts-plus',
                        label: 'Qwen-Audio-3.1-TTS-Plus',
                        desc: 'Narración de estudio y actuación vocal',
                      },
                      {
                        id: 'browser',
                        label: 'Nativo del navegador',
                        desc: 'Voz del sistema sin consumo de API',
                      },
                    ].map((opt) => {
                      const activeTts = current.ttsEngine || 'auto';
                      const isSelected = activeTts === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setCurrent({
                              ...current,
                              ttsEngine: opt.id as 'auto' | 'qwen-audio-3.1-tts-flash' | 'qwen-audio-3.1-tts-plus' | 'browser',
                            })
                          }
                          className={`p-2.5 min-h-[44px] rounded-lg border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-white/40 bg-[#181824] text-white'
                              : 'border-[#22222e] bg-[#101017] text-zinc-400 hover:border-zinc-700 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-mono font-medium truncate">{opt.label}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Directiva de Tono Vocal (Instruct TTS) */}
                {(current.ttsEngine || 'auto') !== 'browser' && (
                  <div className="space-y-1.5 pt-1 border-t border-white/5">
                    <label className="block text-[11px] font-medium text-zinc-300">
                      Directiva de actuación vocal (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Narración literaria pausada, sobria y con matices profundos"
                      value={current.ttsInstruct || ''}
                      onChange={(e) =>
                        setCurrent({
                          ...current,
                          ttsInstruct: e.target.value,
                        })
                      }
                      className="w-full bg-[#0a0a0d] border border-white/10 rounded-lg px-3 py-2 text-[16px] md:text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-white/30"
                    />
                  </div>
                )}
              </div>

              {/* Resumen de Sesión (Debajo de Modelos y Proveedores) */}
              <div className="bg-[#12121a] border border-[#232330] p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                    <Sliders size={14} className="text-zinc-300" />
                    <span>Resumen de Sesión (Compresión de Contexto)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentView('session_summary')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono text-zinc-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                  >
                    <span>Inspeccionar</span>
                    <ChevronRight size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {activeChat?.sessionSummary
                    ? `Resumen activo en "${activeChat.title}": ${activeChat.summarizedUpToCount || 0} turnos anteriores condensados sin latencia adicional.`
                    : `Se activa automáticamente al superar ${current.contextDepth === 'quick' ? 6 : 15} mensajes para conservar el contexto desde el turno #1 sin gastar tokens de más.`}
                </p>
              </div>
            </div>
          </motion.div>
        )}

          {/* ========================================================= */}
          {/* VISTA E: 'session_summary' (Inspector de Resumen Activo)  */}
          {/* ========================================================= */}
          {currentView === 'session_summary' && (
            <motion.div
              key="session_summary"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="flex-1 overflow-y-auto p-4 space-y-4 smooth-scroll"
            >
              <div className="space-y-4 max-w-xl mx-auto">
                {/* Tarjeta de Estado de Compresión */}
                <div className="bg-[#18181b] border border-white/5 rounded-[26px] p-4 space-y-3.5 shadow-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[15px] font-medium text-white">Estado del Contexto</div>
                      <div className="text-xs text-zinc-400 mt-0.5 truncate">
                        Conversación: <span className="text-zinc-200 font-medium">{activeChat?.title || 'Sin conversación seleccionada'}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 shrink-0">
                      {activeChat?.sessionSummary && sessionSummaryDraft.trim() ? 'Activo' : 'En ventana literal'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="bg-[#101014] border border-white/5 rounded-2xl p-3 min-w-0">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 truncate">Mensajes</div>
                      <div className="text-sm font-mono font-semibold text-white mt-1">
                        {activeChat?.messages?.length || 0}
                      </div>
                    </div>
                    <div className="bg-[#101014] border border-white/5 rounded-2xl p-3 min-w-0">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 truncate">Ventana</div>
                      <div className="text-sm font-mono font-semibold text-white mt-1 truncate">
                        Últimos {current.contextDepth === 'quick' ? 6 : 15}
                      </div>
                    </div>
                    <div className="bg-[#101014] border border-white/5 rounded-2xl p-3 min-w-0">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 truncate">Fuera de ventana</div>
                      <div className="text-sm font-mono font-semibold text-white mt-1">
                        {Math.max(0, (activeChat?.messages?.length || 0) - (current.contextDepth === 'quick' ? 6 : 15))}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Los últimos {current.contextDepth === 'quick' ? '6 mensajes' : '15 mensajes'} se envían íntegros al modelo. Cuando la sesión supera ese umbral, los turnos previos se condensan en este bloque sin saludos vacíos ni cortes de palabra para preservar acuerdos de canon y continuidad.
                  </p>
                </div>

                {/* Inspector / Editor del Resumen */}
                <div className="bg-[#18181b] border border-white/5 rounded-[26px] p-4 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[15px] font-medium text-white">Contenido del Resumen</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {sessionSummaryDraft.trim()
                          ? 'Este bloque se adjunta como memoria de sesión previa a los mensajes recientes.'
                          : 'Aún no hay escenas o decisiones fuera de la ventana literal para resumir.'}
                      </div>
                    </div>
                    {sessionSummarySavedNotice && (
                      <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400 shrink-0">
                        <Check size={13} /> Guardado
                      </span>
                    )}
                  </div>

                  <textarea
                    value={sessionSummaryDraft}
                    onChange={(e) => setSessionSummaryDraft(e.target.value)}
                    placeholder="La conversación actual solo contiene saludos iniciales o está íntegramente dentro de la ventana literal. Puedes redactar apuntes de sesión manualmente o pulsar «Sintetizar sesión» cuando haya contenido."
                    rows={9}
                    className="w-full bg-[#0a0a0d] border border-white/10 focus:border-white/25 rounded-2xl p-3.5 text-[16px] md:text-sm text-zinc-100 font-sans placeholder-zinc-500 focus:outline-none resize-y leading-relaxed"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!activeChat || !activeChat.messages || activeChat.messages.length === 0 || isGeneratingSummary) return;
                        setIsGeneratingSummary(true);
                        try {
                          const windowLimit = current.contextDepth === 'quick' ? 6 : 15;
                          const targetPool =
                            activeChat.messages.length > windowLimit
                              ? activeChat.messages.slice(0, -windowLimit)
                              : activeChat.messages;
                          const synthesized = await synthesizeSessionSummaryWithAI(targetPool, current);
                          setSessionSummaryDraft(synthesized);
                          if (onUpdateChatSessionSummary) {
                            const overflowCount = Math.max(0, activeChat.messages.length - windowLimit);
                            onUpdateChatSessionSummary(
                              activeChat.id,
                              synthesized,
                              synthesized ? (overflowCount > 0 ? overflowCount : targetPool.length) : 0
                            );
                            setSessionSummarySavedNotice(true);
                            setTimeout(() => setSessionSummarySavedNotice(false), 2200);
                          }
                        } finally {
                          setIsGeneratingSummary(false);
                        }
                      }}
                      disabled={!activeChat || !activeChat.messages || activeChat.messages.length === 0 || isGeneratingSummary}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
                    >
                      <RefreshCw size={13} className={isGeneratingSummary ? 'animate-spin' : ''} />
                      <span>{isGeneratingSummary ? 'Sintetizando...' : 'Sintetizar sesión'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!activeChat || !onUpdateChatSessionSummary) return;
                        const windowLimit = current.contextDepth === 'quick' ? 6 : 15;
                        const overflowCount = Math.max(0, activeChat.messages.length - windowLimit);
                        const cleanedDraft = sessionSummaryDraft.trim();
                        onUpdateChatSessionSummary(
                          activeChat.id,
                          cleanedDraft,
                          cleanedDraft ? (overflowCount > 0 ? overflowCount : activeChat.messages.length) : 0
                        );
                        setSessionSummarySavedNotice(true);
                        setTimeout(() => setSessionSummarySavedNotice(false), 2200);
                      }}
                      disabled={!activeChat || isGeneratingSummary}
                      className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl bg-white hover:bg-zinc-200 disabled:opacity-40 text-xs font-semibold text-black transition-colors cursor-pointer"
                    >
                      <Save size={13} />
                      <span>Guardar cambios</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* VISTA C: 'memory' (Subpantalla de Memoria)                */}
          {/* ========================================================= */}
          {currentView === 'memory' && (
            <motion.div
              key="memory"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="flex-1 overflow-y-auto p-4 space-y-4 smooth-scroll"
            >
              <div className="space-y-4 max-w-xl mx-auto">
                {/* Switch Activar Memoria */}
                <div className="flex items-center justify-between px-4 py-3.5 min-h-[56px] bg-[#18181b] border border-white/5 rounded-[26px] shadow-lg">
                  <div>
                    <div className="text-[15px] font-medium text-white">Activar memoria</div>
                    <div className="text-sm text-zinc-400 font-normal">Permite a Kizuna-Zek recordar hechos y detalles clave entre conversaciones</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrent({
                        ...current,
                        enableMemoryToggle: !(current.enableMemoryToggle ?? true),
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      (current.enableMemoryToggle ?? true) ? 'bg-emerald-500' : 'bg-zinc-700'
                    }`}
                    aria-label="Alternar memoria persistente"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        (current.enableMemoryToggle ?? true) ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Inputs Nativos Espaciosos de Perfil de Autor */}
                <div className="p-4 bg-[#18181b] border border-white/5 rounded-[26px] space-y-3.5 shadow-lg">
                  <div>
                    <label className="block text-xs font-semibold text-white mb-1.5">Tu apodo</label>
                    <input
                      type="text"
                      placeholder="Aaron"
                      value={current.userProfile?.nickname ?? 'Aaron'}
                      onChange={(e) =>
                        setCurrent({
                          ...current,
                          userProfile: {
                            ...current.userProfile,
                            nickname: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-[#0a0a0d] border border-white/10 rounded-xl px-3.5 py-2.5 text-[16px] md:text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white mb-1.5">Tu ocupación</label>
                    <input
                      type="text"
                      placeholder="Escritor / Creador de Jukkou no Zankyou"
                      value={current.userProfile?.occupation ?? 'Escritor / Creador de Jukkou no Zankyou'}
                      onChange={(e) =>
                        setCurrent({
                          ...current,
                          userProfile: {
                            ...current.userProfile,
                            occupation: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-[#0a0a0d] border border-white/10 rounded-xl px-3.5 py-2.5 text-[16px] md:text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white mb-1.5">Más sobre ti</label>
                    <textarea
                      rows={3}
                      placeholder="Intereses narrativos, reglas de mundo y preferencias clave de Monstereth..."
                      value={current.userProfile?.aboutMe ?? ''}
                      onChange={(e) =>
                        setCurrent({
                          ...current,
                          userProfile: {
                            ...current.userProfile,
                            aboutMe: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-[#0a0a0d] border border-white/10 rounded-xl px-3.5 py-2.5 text-[16px] md:text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-cyan-500/50 leading-relaxed"
                    />
                  </div>
                </div>

                {/* Acordeón Resumen de Memoria */}
                <div className="rounded-[26px] bg-[#18181b] border border-white/5 overflow-hidden shadow-lg">
                  <button
                    type="button"
                    onClick={() => setIsMemoryAccordionOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                        <Brain size={14} />
                      </div>
                      <div>
                        <div className="text-[15px] font-medium text-white">Resumen de memoria</div>
                        <div className="text-sm text-zinc-400 font-normal">Hechos y notas del autor guardadas en memoria persistente</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-zinc-400">
                        {current.memories.filter((m) => m.enabled).length} activas
                      </span>
                      <motion.div
                        animate={{ rotate: isMemoryAccordionOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="inline-flex items-center justify-center"
                      >
                        <ChevronDown size={16} className="text-zinc-500" />
                      </motion.div>
                    </div>
                  </button>

                  {isMemoryAccordionOpen && (
                    <div className="p-4 pt-0 space-y-3.5 border-t border-white/5">
                      {/* Add Memory Manually */}
                      <div className="flex gap-2 pt-3">
                        <input
                          type="text"
                          placeholder="e.g. Ren Mikage jamás dispara sin advertencia previa"
                          value={newMemoryText}
                          onChange={(e) => setNewMemoryText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddMemory();
                            }
                          }}
                          className="flex-1 bg-[#0a0a0d] border border-white/10 rounded-xl px-3 py-2 text-[16px] md:text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50"
                        />
                        <motion.button
                          whileTap={{ scale: 0.94 }}
                          onClick={handleAddMemory}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-black bg-white hover:bg-zinc-200 rounded-xl transition-colors shrink-0 cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Añadir</span>
                        </motion.button>
                      </div>

                      {/* Memory List */}
                      {current.memories.length === 0 ? (
                        <div className="p-6 text-center border border-dashed border-white/10 rounded-xl text-xs text-zinc-500">
                          No hay memorias guardadas todavía. Escribe "recordá que [algo]" en el chat.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {current.memories.map((mem) => (
                            <div
                              key={mem.id}
                              className={`flex items-start justify-between p-3 rounded-xl border transition-colors ${
                                mem.enabled
                                  ? 'bg-[#0e0e14] border-white/10 text-white'
                                  : 'bg-[#08080b] border-white/5 text-zinc-500'
                              }`}
                            >
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={mem.enabled}
                                  onChange={() => handleToggleMemory(mem.id)}
                                  className="mt-0.5 accent-cyan-400 cursor-pointer"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs leading-relaxed break-words">{mem.text}</p>
                                  <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 mt-1">
                                    <span>{new Date(mem.timestamp).toLocaleDateString()}</span>
                                    <span>·</span>
                                    <span>{mem.source === 'auto' ? 'Auto-detect' : 'Manual'}</span>
                                  </div>
                                </div>
                              </div>

                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleDeleteMemory(mem.id)}
                                className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors ml-2 cursor-pointer"
                                title="Eliminar memoria"
                              >
                                <Trash2 size={13} />
                              </motion.button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-[#18181c] bg-[#070709] shrink-0">
          <div>
            {isSavedNotice && (
              <span className="flex items-center gap-1 text-xs text-white font-mono">
                <Check size={14} /> Ajustes Guardados
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[#a1a1aa] hover:text-white"
            >
              Cerrar
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                handleSave();
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-black bg-white hover:bg-[#e4e4e7] rounded-md transition-colors cursor-pointer"
            >
              <Save size={13} />
              <span>Aplicar Configuración</span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};
