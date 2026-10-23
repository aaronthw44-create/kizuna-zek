import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { captureAppScreenshot } from './utils/captureUi';
import { ShieldCheck, Loader2, X, FileUp } from 'lucide-react';
import {
  Folder,
  LoreFile,
  Chat,
  Message,
  Attachment,
  AppSettings,
  AppStatistics,
  ErrorDiagnosticInfo,
  WebSearchResult,
  DocFileType,
  SmartMemory,
} from './types';
import {
  loadFolders,
  saveFolders,
  loadLoreFiles,
  saveLoreFiles,
  loadLoreFilesFromIDB,
  loadChats,
  saveChats,
  loadSettings,
  saveSettings,
  loadSessionMedia,
  saveSessionMedia,
  loadSessionMediaFromIDB,
  exportChatAsMarkdown,
} from './utils/storage';
import { exportChatToEpub } from './utils/epubExporter';
import { detectSmartMemory, createMemoryObject, buildRollingSessionSummary, synthesizeSessionSummaryWithAI } from './utils/memoryDetector';
import { estimateTokenCount } from './utils/documentParser';
import { isVisionModel, clampMaxTokensForModel } from './utils/modelHelper';
import { resolveAutoRoutedModel } from './utils/autoRouter';
import { executeDirectApiStream } from './utils/directApiStream';
import {
  requestScreenWakeLock,
  releaseScreenWakeLock,
  notifyGenerationComplete,
  requestNotificationAccess,
} from './utils/backgroundWorkflow';
import {
  getGeminiApiKey,
  getNvidiaApiKey,
  sanitizeSearchQuery,
  fetchGoogleSearchGrounding,
  getTavilyApiKey,
  cleanApiKey,
  scrubSnippetText,
  isCasualGreeting,
  HTTP_429_RATE_LIMIT_NOTICE,
} from './services/apiService';
import { loadStatistics, recordMessageActivity, resetStatistics } from './utils/statsStorage';
import { useAuth } from './hooks/useAuth';
import { saveTextToGoogleDriveDoc } from './services/googleDriveService';
import {
  syncChatToFirestore,
  syncLoreFileToFirestore,
  subscribeToUserChats,
  subscribeToUserLoreFiles,
  deleteChatFromFirestore,
  deleteLoreFileFromFirestore,
} from './services/firebase';
import { Sidebar } from './components/Sidebar';
import { ChatHeader } from './components/ChatHeader';
import { ChatArea, ChatAreaHandle } from './components/ChatArea';
import { ChatInput } from './components/ChatInput';
import { FolderModal } from './components/FolderModal';
import { SessionMediaGalleryModal } from './components/SessionMediaGalleryModal';
import { SettingsModal } from './components/SettingsModal';
import { StatsModal } from './components/StatsModal';
import { ErrorDiagnosticModal } from './components/ErrorDiagnosticModal';
import { ImageLightbox } from './components/ImageLightbox';
import { ConfirmModal } from './components/ConfirmModal';
import { PromptModal } from './components/PromptModal';
import { LoreAuditorModal } from './components/LoreAuditorModal';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { VoiceCallModal } from './components/VoiceCallModal';
import { DocumentPreviewModal, DocumentPreviewItem } from './components/DocumentPreviewModal';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  // Core State
  const [folders, setFolders] = useState<Folder[]>(loadFolders);
  const [loreFiles, setLoreFiles] = useState<LoreFile[]>(loadLoreFiles);
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [sessionMedia, setSessionMedia] = useState<Attachment[]>(loadSessionMedia);

  // Active Selections
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return chats.length > 0 ? chats[0].id : null;
  });
  const [activeFolderModalId, setActiveFolderModalId] = useState<string | null>(null);

  // Modals & Drawers
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMediaGalleryOpen, setIsMediaGalleryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isGoogleDriveOpen, setIsGoogleDriveOpen] = useState(false);
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);
  const voiceReplyCallbackRef = useRef<((replyText: string) => void) | null>(null);
  const { user } = useAuth();
  const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem('kizuna_theme') === 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isLightMode) {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.classList.remove('dark');
      document.body.classList.add('light-theme');
      localStorage.setItem('kizuna_theme', 'light');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.classList.add('dark');
      document.body.classList.remove('light-theme');
      localStorage.setItem('kizuna_theme', 'dark');
    }
  }, [isLightMode]);

  // Upgrade stale global system prompt from localStorage to warm persona profile
  useEffect(() => {
    const warmPrompt = `Eres Kizuna-Zek, colega creativo y taller editorial de cabecera del autor para la novela ligera 'Jukkou no Zankyou' (El teatro que faltó).

[IDENTIDAD Y DINÁMICA DE TRABAJO]
- Tono cálido, cercano, despierto y conversacional (estilo colega que comparte un mate y se apasiona genuinamente por la obra).
- PROHIBIDO hablar como un asistente corporativo, soporte técnico o bot de atención al cliente.
- NUNCA respondas con menús numerados, índices mecánicos o viñetas genéricas ('1. Trama, 2. Personajes...').
- Mantén mirada crítica y voz propia: señala qué funciona somáticamente, advierte deslices melodramáticos y aporta soluciones tangibles de biomecánica y tensión.

[CANON CENTRAL DE PERSONAJES]
1. KOLDER ZEKSHOYU (22 años | «El Vacío Funcional»):
   - Condición irreversible: Extirpación quirúrgica completa del sistema límbico a los 9 años en el Hospicio San Gregorio bajo las órdenes de Tedriot. 
   - Fisiología y mente: Carece de afecto, ira o miedo biológico. Ojos de prisma gris con mapa radial (nunca amarillos). Inexpresivo (deadpan), pausas calculadas, tono plano y terrenal. No busca venganza ni redención; busca funcionar y cuidar la vida mediante presencia material sin dogmas.
   - Puntos ciegos: No comprende la irracionalidad humana, el rencor gratuito ni el autosacrificio desmedido.
   - Anclas materiales: Karambit táctico y Mate Rúnico de calabaza con virola de oro/rubí (ceba Yerba de Cobre a 80-90 °C para disipar la estática del flujo de Catarsis y regular su balance térmico).

2. HINISTRA ZUPSEKIA (17 años | «La Marioneta del Relato»):
   - Naturaleza: Fragmento humano encarnado de Gurasha (la difunta Prisma de la Euforia). Carga con el repudio colectivo de la Guerra del Círculo Vicioso por tragedias que ella no provocó.
   - Psicología y voz: TEPT complejo severo. Voz en voseo rioplatense. Utiliza la euforia teatral, declamaciones operísticas y versos trágicos clásicos (Sófocles, Eurípides) como armadura somática para no desintegrarse ni mirar el abismo.
   - Apariencia: Corte Medusa azul grisáceo con pergaminos, campera oversize, joggers y una máscara de porcelana ('Euforia') sujeta sobre el pecho izquierdo (su corazón).

3. TEDRIOT Y «EL CIELO CEGADO» (Gobernador de Santusma):
   - Motor psicológico: Asesinó a Gurasha por un amor obsesivo y rapaz. Incapaz de procesar la culpa y el horror de su propio crimen, erige una doctrina de Estado: si erradica las emociones de Monstereth mediante Skarnita, su culpa deja de existir. Llama 'purificación colectiva' a una lobotomía masiva para no admitir su cobardía moral. Kolder fue su prototipo temprano en San Gregorio.

4. TESHUVANA (4to Prisma | Purismo Absolutista):
   - No es villana de caricatura; es una dogmática aterrada. El Té de Teshuvana encarna la teología del mérito (exige estar limpio y en paz para merecerlo). Cuando la tetera se rompe, su liturgia colapsa en fango y pánico. 
   - Antítesis: El agua cruda y terrenal de Kolder, que no exige mérito y estabiliza al cuerpo quebrado en el suelo.

[REGLAS EDITORIALES Y DE ESTILO DE PROSA]
- REGLA DE ORO («EMPATÍA INVERSA»): El lector y el entorno deben llorar POR Kolder y no CON él. Kolder no se compadece de sí mismo porque no tiene con qué dimensionar su mutilación; la tragedia radica en la asimetría entre su frialdad operativa y el dolor de los demás.
- MATERIALIDAD SOMÁTICA: Los objetos no interpretan el mundo, solo reaccionan al peso, la gravedad y la temperatura. La ropa no 'descifra', pesa y delata.
- PROHIBICIÓN TOTAL DE REPORTES CLÍNICOS: Cero porcentajes numéricos ('quince por ciento', 'daño tisular al ochenta'). Mostrar el daño en tendones agarrotados, aire expulsado por la laringe, capilares reventados y pérdida de balance.
- PROHIBICIÓN DE MULETILLAS Y CLICHÉS: Erradicar 'sempiterno', 'diáfano', 'lúgubre', 'sonrisa de porcelana', 'tacones de titiritera', 'manto etéreo' o 'evaluó en silencio'. Prosa sensorial, cinematográfica, terrenal y de pulso humano vivo.
- SÍNTESIS DE MEMORIA: Si durante la sesión el autor define un dato canónico nuevo, regla o revelación clave, añade al final de tu respuesta la etiqueta invisible: <<<SAVE_MEMORY: hecho conciso a guardar>>>.`;

    const hasCustomWorkshopPrompt = localStorage.getItem('kizuna_custom_global_prompt') === 'true';
    const needsPromptUpgrade =
      !hasCustomWorkshopPrompt &&
      (!settings.globalSystemPrompt ||
        !settings.globalSystemPrompt.includes('KOLDER ZEKSHOYU') ||
        settings.globalSystemPrompt.includes('compañero creativo de escritura del autor') ||
        settings.globalSystemPrompt.includes('colaborador de escritura') ||
        settings.globalSystemPrompt.includes('asistente de escritura') ||
        settings.globalSystemPrompt.includes('asistente corporativo') ||
        settings.globalSystemPrompt.includes('estética visual minimalista'));
    const needsTokensUpgrade = !settings.maxOutputTokens || settings.maxOutputTokens <= 1500;

    if (needsPromptUpgrade || needsTokensUpgrade) {
      const updated = {
        ...settings,
        ...(needsPromptUpgrade ? { globalSystemPrompt: warmPrompt } : {}),
        ...(needsTokensUpgrade ? { maxOutputTokens: 8192 } : {}),
      };
      setSettings(updated);
      saveSettings(updated);
    }
  }, []);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isAuditFinished, setIsAuditFinished] = useState(false);
  const [activeLightboxImage, setActiveLightboxImage] = useState<Attachment | null>(null);
  const [errorDiagnostic, setErrorDiagnostic] = useState<ErrorDiagnosticInfo | null>(null);

  // Statistics state (RikkaHub)
  const [stats, setStats] = useState<AppStatistics>(loadStatistics);

  // Folder & Confirmation Modals
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<Folder | null>(null);
  const [isClearChatConfirmOpen, setIsClearChatConfirmOpen] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);

  // Native touch gesture tracking for 120Hz edge swiping
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    const velocityX = Math.abs(deltaX) / (deltaTime || 1);

    // If sidebar is closed: swipe from left edge zone towards right
    if (!isSidebarOpen) {
      const isFromLeftZone = touchStartRef.current.x <= 90 || (touchStartRef.current.x <= 120 && velocityX > 0.35);
      if (
        isFromLeftZone &&
        deltaX > 45 &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.2
      ) {
        setIsSidebarOpen(true);
      }
    } else {
      // If sidebar is open: swipe left to close
      if (
        (deltaX < -50 || (deltaX < -30 && velocityX > 0.4)) &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.2
      ) {
        setIsSidebarOpen(false);
      }
    }
    touchStartRef.current = null;
  };

  // In-App Document Preview Modal State
  const [previewDocument, setPreviewDocument] = useState<DocumentPreviewItem | null>(null);

  const handleOpenDocumentPreview = (item: any) => {
    if (!item) return;
    const title = item.filename || item.title || item.name || 'Documento';
    const content = item.content || item.textContent || '';
    const fileType = item.fileType || 'txt';
    const dataUrl = item.dataUrl || '';
    const size = item.size || 1024;
    const wordCount = item.wordCount;
    const estimatedTokens = item.estimatedTokens;

    setPreviewDocument({
      title,
      content,
      fileType,
      dataUrl,
      size,
      wordCount,
      estimatedTokens,
      sourceLabel: item.sourceLabel || 'Kizuna-Zek',
    });
  };

  // Quick Google Docs / Text Import Modal State
  const [isTextImportModalOpen, setIsTextImportModalOpen] = useState(false);
  const [importDocTitle, setImportDocTitle] = useState('');
  const [importDocContent, setImportDocContent] = useState('');

  // Handle saving imported manuscript text into Lore Storage & active chat context
  const handleSaveTextImport = () => {
    if (!importDocContent.trim()) {
      showToast('⚠️ Pega el contenido de tu documento antes de guardar');
      return;
    }

    const title = importDocTitle.trim() || 'Capítulo / Manuscrito Importado';
    const cleanFilename = `${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.txt`;

    handleAttachDocumentToContext({
      title,
      filename: cleanFilename,
      content: importDocContent.trim(),
      fileType: 'txt',
      size: new Blob([importDocContent]).size,
    });

    setImportDocTitle('');
    setImportDocContent('');
    setIsTextImportModalOpen(false);
    showToast('📄 Manuscrito guardado en Docs en Contexto');
  };

  const handleStartPersonaWizard = () => {
    setIsSettingsOpen(false);
    const wizardChat: Chat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: '🪄 Taller de Directiva Global',
      folderId: null,
      selectedLoreFileIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: `¡Hola! Vamos a diseñar la directiva maestra para tu espacio de trabajo. Contéstame brevemente:
1. ¿Cómo debe ser mi tono principal (ej. analítico, literario, sensorial)?
2. ¿Qué cosas tengo estrictamente PROHIBIDAS hacer o decir?
3. ¿Cómo prefieres que intervenga al ayudarte a redactar?

Apenas me respondas, te generaré el prompt optimizado listo para guardar.`,
          timestamp: Date.now(),
        },
      ],
    };
    setChats((prev) => {
      const updated = [wizardChat, ...prev];
      saveChats(updated);
      return updated;
    });
    setActiveChatId(wizardChat.id);
    showToast('🪄 Taller de Directiva Global iniciado');
  };

  const handleApplyGlobalPersona = (rawPrompt: string) => {
    const cleanPrompt = rawPrompt
      .replace(/<<<FOLLOW_UP>>>[\s\S]*$/gi, '')
      .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .trim();

    localStorage.setItem('kizuna_custom_global_prompt', 'true');
    setSettings((prev) => {
      const updated: AppSettings = {
        ...prev,
        globalSystemPrompt: cleanPrompt,
        globalPersona: cleanPrompt,
      };
      saveSettings(updated);
      return updated;
    });
    showToast('✨ Directiva Global actualizada con éxito');
  };
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeReaderRef = useRef<ReadableStreamDefaultReader<any> | null>(null);
  const userAbortedRef = useRef(false);
  const currentAssistantIdRef = useRef<string | null>(null);
  const currentAccumulatedTextRef = useRef<string>('');
  const currentAccumulatedThinkingRef = useRef<string>('');
  const continuePrefixRef = useRef<string>('');
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const attachSessionMediaRef = useRef<((att: Attachment) => void) | null>(null);
  const savedMemoryFactsRef = useRef<Set<string>>(new Set());

  // Toast notification for user actions (smart memory, copy feedback, etc.)
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Show transient toast helper
  const showToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => {
      setToastMessage((current) => (current === text ? null : current));
    }, 3000);
  };

  // Load from IndexedDB on initial mount for offline persistence
  useEffect(() => {
    // Seed and ensure valid Gemini API Key in localStorage
    getGeminiApiKey();

    // Health Check self-test log
    const notifPermission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
    const wakeLockAvailable = typeof navigator !== 'undefined' && 'wakeLock' in navigator ? 'Available' : 'Unsupported';
    console.log(`[Kizuna-Zek Health Check] WakeLock: ${wakeLockAvailable} | Notifications: ${notifPermission} | Storage: Synced`);

    loadLoreFilesFromIDB().then((idbLore) => {
      if (idbLore && idbLore.length > 0) {
        setLoreFiles(idbLore);
      }
    });

    loadSessionMediaFromIDB().then((idbMedia) => {
      if (idbMedia && idbMedia.length > 0) {
        setSessionMedia(idbMedia);
      }
    });
  }, []);

  // Sync to localStorage and background IndexedDB
  useEffect(() => {
    saveFolders(folders);
  }, [folders]);

  useEffect(() => {
    saveLoreFiles(loreFiles);
  }, [loreFiles]);

  useEffect(() => {
    if (isStreaming) return; // Do not hammer mobile flash storage during active streaming
    const timer = setTimeout(() => {
      saveChats(chats);
    }, 500);
    return () => clearTimeout(timer);
  }, [chats, isStreaming]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Derived current chat and folder
  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const activeFolder = activeChat?.folderId
    ? folders.find((f) => f.id === activeChat.folderId) || null
    : null;

  // 5-second Inactivity Auto-Save to Cloud (Firestore)
  const lastSyncedChatJsonRef = useRef<string>('');
  const lastSyncedLoreJsonRef = useRef<string>('');

  useEffect(() => {
    if (!user?.uid || !activeChat || isStreaming) return;

    const timer = setTimeout(() => {
      const chatSummary = `${activeChat.id}|${activeChat.title}|${activeChat.messages.length}|${activeChat.messages[activeChat.messages.length - 1]?.content?.length || 0}|${(activeChat.selectedLoreFileIds || []).join(',')}|${activeChat.sessionSummary?.length || 0}|${activeChat.updatedAt || 0}`;

      if (lastSyncedChatJsonRef.current === '') {
        lastSyncedChatJsonRef.current = chatSummary;
        syncChatToFirestore(user.uid, activeChat);
        return;
      }

      if (chatSummary !== lastSyncedChatJsonRef.current) {
        lastSyncedChatJsonRef.current = chatSummary;
        syncChatToFirestore(user.uid, activeChat);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [activeChat, user?.uid, isStreaming]);

  useEffect(() => {
    if (!user?.uid || loreFiles.length === 0) return;

    const timer = setTimeout(() => {
      const loreSummary = loreFiles
        .map((l) => `${l.id}:${l.title}:${l.content?.length || 0}:${l.updatedAt || 0}`)
        .join('|');

      if (lastSyncedLoreJsonRef.current === '') {
        lastSyncedLoreJsonRef.current = loreSummary;
        return;
      }

      if (loreSummary !== lastSyncedLoreJsonRef.current) {
        lastSyncedLoreJsonRef.current = loreSummary;
        loreFiles.forEach((lore) => {
          syncLoreFileToFirestore(user.uid, lore);
        });
        showToast('☁️ Auto-guardado en Nube (Lore Storage)');
      }
    }, 4500);

    return () => clearTimeout(timer);
  }, [loreFiles, user?.uid]);

  useEffect(() => {
    saveSessionMedia(sessionMedia);
  }, [sessionMedia]);



  const currentFolderLoreFiles = React.useMemo(() => {
    if (activeFolder) {
      return loreFiles.filter(
        (l) => l.folderId === activeFolder.id || (activeChat && activeChat.selectedLoreFileIds?.includes(l.id))
      );
    }
    if (activeChat) {
      return loreFiles.filter(
        (l) => !l.folderId || l.folderId === 'general' || l.folderId === activeChat.id || activeChat.selectedLoreFileIds?.includes(l.id)
      );
    }
    return loreFiles;
  }, [activeFolder, activeChat, loreFiles]);

  // Cloud sync: Sincronizar conversaciones y Lore remotos cuando el usuario inicia sesión
  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribeChats = subscribeToUserChats(user.uid, (remoteChats) => {
      if (remoteChats && remoteChats.length > 0) {
        setChats((localChats) => {
          const chatMap = new Map<string, Chat>();
          localChats.forEach((c) => chatMap.set(c.id, c));
          remoteChats.forEach((rc) => {
            const existing = chatMap.get(rc.id);
            if (!existing || (rc.updatedAt || 0) >= (existing.updatedAt || 0)) {
              chatMap.set(rc.id, rc);
            }
          });
          return Array.from(chatMap.values()).sort(
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
          );
        });
      }
    });

    const unsubscribeLore = subscribeToUserLoreFiles(user.uid, (remoteLore) => {
      if (remoteLore && remoteLore.length > 0) {
        setLoreFiles((localLore) => {
          const loreMap = new Map<string, LoreFile>();
          localLore.forEach((l) => loreMap.set(l.id, l));
          remoteLore.forEach((rl) => {
            const existing = loreMap.get(rl.id);
            if (!existing || (rl.updatedAt || 0) >= (existing.updatedAt || 0)) {
              loreMap.set(rl.id, rl);
            }
          });
          return Array.from(loreMap.values());
        });
      }
    });

    return () => {
      unsubscribeChats();
      unsubscribeLore();
    };
  }, [user?.uid]);

  // Cloud sync unified in the 2.5s debounced effect above to avoid duplicate radio wakeups
  useEffect(() => {
    // No-op: preserved hook slot for React 19 strict hook order stability
  }, [activeChat, isStreaming, user?.uid]);

  const activeLoreFilesCount = activeChat
    ? currentFolderLoreFiles.filter((l) => activeChat.selectedLoreFileIds?.includes(l.id)).length
    : 0;

  const activeModelId =
    settings.provider === 'alibaba'
      ? (settings.alibabaModel || 'qwen3.8-max')
      : settings.provider === 'custom'
        ? settings.customModel
        : settings.geminiModel;
  const isVisionCapable =
    settings.provider === 'gemini' || isVisionModel(activeModelId);

  // Compute Total Active Context Tokens (1M scale) with useMemo
  const totalContextTokens = React.useMemo(() => {
    let tokens = 0;
    // 1. Global System Instruction
    tokens += estimateTokenCount(settings.globalSystemPrompt);
    // 2. Folder System Prompt
    if (activeFolder?.systemPrompt) {
      tokens += estimateTokenCount(activeFolder.systemPrompt);
    }
    // 3. Active Lore Documents
    if (activeChat) {
      const activeLoreDocs = loreFiles.filter((l) => {
        return Array.isArray(activeChat?.selectedLoreFileIds) && activeChat.selectedLoreFileIds.includes(l.id);
      });
      for (const doc of activeLoreDocs) {
        tokens += doc.estimatedTokens || estimateTokenCount(doc.content);
      }
      // 4. Message History Tokens
      for (const msg of activeChat.messages) {
        tokens += msg.estimatedTokens || estimateTokenCount(msg.content);
        if (msg.attachments) {
          for (const att of msg.attachments) {
            if (att.textContent) {
              tokens += att.estimatedTokens || estimateTokenCount(att.textContent);
            }
          }
        }
      }
    }
    // 5. Active Memories
    const activeMemories = settings.memories.filter((m) => m.enabled !== false);
    for (const mem of activeMemories) {
      tokens += estimateTokenCount(mem.text);
    }

    return tokens;
  }, [
    activeChat?.id,
    activeChat?.messages.length,
    isStreaming,
    activeChat?.selectedLoreFileIds,
    activeFolder?.id,
    activeFolder?.systemPrompt,
    loreFiles,
    settings.globalSystemPrompt,
    settings.memories,
  ]);

  // -------------------------------------------------------------
  // Chat Actions
  // -------------------------------------------------------------

  const handleMoveChat = (chatId: string, targetFolderId: string | null) => {
    setChats((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== chatId) return c;
        // When moving a chat out of a project (targetFolderId === null), remove project-specific lore files
        const nextLoreIds = targetFolderId
          ? Array.from(
              new Set([
                ...(c.selectedLoreFileIds || []).filter((id) => {
                  const lf = loreFiles.find((l) => l.id === id);
                  return lf && (lf.folderId === targetFolderId || lf.folderId === 'general' || lf.folderId === c.id);
                }),
                ...loreFiles.filter((l) => l.folderId === targetFolderId).map((l) => l.id),
              ])
            )
          : (c.selectedLoreFileIds || []).filter((id) => {
              const lf = loreFiles.find((l) => l.id === id);
              return lf && (!lf.folderId || lf.folderId === 'general' || lf.folderId === c.id);
            });
        return { ...c, folderId: targetFolderId, selectedLoreFileIds: nextLoreIds, updatedAt: Date.now() };
      });
      saveChats(updated);
      return updated;
    });
    const targetFolder = targetFolderId ? folders.find((f) => f.id === targetFolderId) : null;
    showToast(targetFolder ? `Conversación movida a "${targetFolder.name}"` : 'Conversación desarchivada (General — sin archivos del proyecto)');
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
  };

  const handleNewChat = (folderId: string | null = null) => {
    // Only attach to a folder if folderId was explicitly provided (e.g. creating inside a project folder)
    const targetFolderId = folderId || null;
    const folderLore = targetFolderId
      ? loreFiles.filter((l) => l.folderId === targetFolderId).map((l) => l.id)
      : [];

    const newChat: Chat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      folderId: targetFolderId,
      title: 'Nueva Conversación',
      messages: [],
      selectedLoreFileIds: folderLore,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };

  const handleUpdateChatTitle = (chatId: string, newTitle: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, title: newTitle, updatedAt: Date.now() } : c
      )
    );
  };

  const handleDeleteChat = (chatId: string) => {
    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== chatId);
      if (activeChatId === chatId) {
        if (remaining.length > 0) {
          setActiveChatId(remaining[0].id);
        } else {
          const freshChat: Chat = {
            id: `chat_${Date.now()}`,
            folderId: null,
            title: 'Nueva Conversación',
            messages: [],
            selectedLoreFileIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setActiveChatId(freshChat.id);
          saveChats([freshChat]);
          return [freshChat];
        }
      }
      saveChats(remaining);
      return remaining;
    });
    if (user?.uid) {
      deleteChatFromFirestore(user.uid, chatId);
    }
    showToast('Chat eliminado');
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!activeChat) return;
    setChats((prev) => {
      const updated = prev.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              messages: c.messages.filter((m) => m.id !== messageId),
              updatedAt: Date.now(),
            }
          : c
      );
      saveChats(updated);
      return updated;
    });
    showToast('Mensaje eliminado');
  };

  const handleClearChat = () => {
    if (!activeChat) return;
    setIsClearChatConfirmOpen(true);
  };

  const handleToggleLoreFile = (chatId: string, loreFileId: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const currentSelected = c.selectedLoreFileIds || [];
        const isAlreadySelected = currentSelected.includes(loreFileId);
        const newSelected = isAlreadySelected
          ? currentSelected.filter((id) => id !== loreFileId)
          : [...currentSelected, loreFileId];
        return {
          ...c,
          selectedLoreFileIds: newSelected,
          updatedAt: Date.now(),
        };
      })
    );
  };

  const handleSelectAllLoreFiles = (chatId: string, loreFileIds: string[]) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const set = new Set([...(c.selectedLoreFileIds || []), ...loreFileIds]);
        return {
          ...c,
          selectedLoreFileIds: Array.from(set),
          updatedAt: Date.now(),
        };
      })
    );
    showToast(`✓ ${loreFileIds.length} documentos inyectados en este chat`);
  };

  const handleDeselectAllLoreFiles = (chatId: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        return {
          ...c,
          selectedLoreFileIds: [],
          updatedAt: Date.now(),
        };
      })
    );
    showToast('Documentos desmarcados del contexto de este chat');
  };

  const handleExportChat = () => {
    if (!activeChat) return;
    const folder = activeChat.folderId
      ? folders.find((f) => f.id === activeChat.folderId)
      : undefined;
    const activeLore = loreFiles.filter((l) =>
      activeChat.selectedLoreFileIds.includes(l.id)
    );
    exportChatAsMarkdown(activeChat, folder, activeLore);
    showToast('Chat exportado como Markdown');
  };

  const handleExportChatToDrive = async () => {
    if (!activeChat || activeChat.messages.length === 0) {
      showToast('⚠️ No hay mensajes para exportar');
      return;
    }
    showToast('☁️ Exportando conversación a Google Drive...');
    try {
      const folder = activeChat.folderId
        ? folders.find((f) => f.id === activeChat.folderId)
        : undefined;

      let docText = `# ${activeChat.title}\n\n`;
      if (folder) {
        docText += `**Arco / Proyecto:** ${folder.name}\n\n`;
      }
      docText += `**Fecha de exportación:** ${new Date().toLocaleString('es-ES')}\n\n---\n\n`;

      activeChat.messages.forEach((msg) => {
        const roleLabel = msg.role === 'user' ? '👤 Autor' : '🪄 Kizuna-Zek';
        docText += `### ${roleLabel}\n\n${msg.content}\n\n---\n\n`;
      });

      const docTitle = `[Chat] ${activeChat.title} (${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')})`;
      const result = await saveTextToGoogleDriveDoc(docTitle, docText);
      showToast(`✓ Conversación guardada en tu Drive: "${result.name}"`);
    } catch (err: any) {
      console.warn('Export chat to Drive error:', err);
      // Fallback: download locally so the user never loses the chat
      handleExportChat();
      showToast('💾 Conversación descargada como Markdown (Google bloqueó la ventana emergente).');
    }
  };

  // -------------------------------------------------------------
  // Folder / Arc Actions
  // -------------------------------------------------------------

  const handleCreateFolder = () => {
    setIsCreateFolderModalOpen(true);
  };

  const handleRenameFolder = (folder: Folder) => {
    setFolderToRename(folder);
  };

  const handleDeleteFolder = (folderId: string) => {
    setFolders((prev) => {
      const remaining = prev.filter((f) => f.id !== folderId);
      saveFolders(remaining);
      return remaining;
    });
    setChats((prev) => {
      const updated = prev.map((c) => (c.folderId === folderId ? { ...c, folderId: null } : c));
      saveChats(updated);
      return updated;
    });
    setLoreFiles((prev) => {
      const remaining = prev.filter((l) => l.folderId !== folderId);
      saveLoreFiles(remaining);
      return remaining;
    });
    showToast('Carpeta eliminada');
  };

  const handleUpdateFolder = (updated: Folder) => {
    setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  // -------------------------------------------------------------
  // Lore Storage Actions (Enforcing max 55 files per folder)
  // -------------------------------------------------------------

  const handleAddLoreFiles = (
    newFiles: Array<Omit<LoreFile, 'id' | 'createdAt' | 'updatedAt'>>
  ) => {
    const created: LoreFile[] = newFiles.map((item) => ({
      ...item,
      id: `lore_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    setLoreFiles((prev) => [...prev, ...created]);

    // Automatically enable new lore files in currently active chat if in same folder or general chat
    if (activeChat) {
      const isChatMatch = activeChat.folderId
        ? newFiles[0]?.folderId === activeChat.folderId
        : (!newFiles[0]?.folderId || newFiles[0]?.folderId === 'general' || newFiles[0]?.folderId === activeChat.id);
      if (isChatMatch) {
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id
              ? {
                  ...c,
                  selectedLoreFileIds: [
                    ...(c.selectedLoreFileIds || []),
                    ...created.map((cr) => cr.id),
                  ],
                }
              : c
          )
        );
      }
    }
  };

  const handleUpdateLoreFile = (updated: LoreFile) => {
    setLoreFiles((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleDeleteLoreFile = (loreId: string) => {
    setLoreFiles((prev) => prev.filter((l) => l.id !== loreId));
    setChats((prev) =>
      prev.map((c) => ({
        ...c,
        selectedLoreFileIds: c.selectedLoreFileIds.filter((id) => id !== loreId),
      }))
    );
    if (user?.uid) {
      deleteLoreFileFromFirestore(user.uid, loreId);
    }
  };

  // -------------------------------------------------------------
  // Session Media (La Cajita) Actions
  // -------------------------------------------------------------

  const handleAttachSessionMedia = (att: Attachment) => {
    if (att.dataUrl || att.type.startsWith('image/')) {
      setSessionMedia((prev) => [att, ...prev.filter((m) => m.id !== att.id)]);
    }
  };

  const handleDeleteSessionMedia = (id: string) => {
    setSessionMedia((prev) => prev.filter((m) => m.id !== id));
  };

  const handleIllustrateScene = async (sceneText: string, messageId?: string) => {
    const rawScene = sceneText.trim();
    if (!rawScene) {
      showToast('⚠️ No hay texto de escena para ilustrar');
      return;
    }

    showToast('🎨 Generando ilustración de la escena...');

    try {
      let imgDataUrl = '';

      try {
        const response = await fetch('/api/alibaba/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: rawScene,
            alibabaApiKey: settings.alibabaApiKey || '',
            alibabaBaseUrl: settings.alibabaBaseUrl,
            model: 'wanx2.1-t2i-turbo',
            geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
            size: '1024*1024',
          }),
        });

        if (response.ok) {
          const data = await response.json();
          imgDataUrl = data.dataUrl || data.url || '';
        }
      } catch (srvErr) {
        console.warn('[Illustrate Scene Server Fallback]:', srvErr);
      }

      // Direct client fallback if server route timed out or failed
      if (!imgDataUrl) {
        const seed = Math.floor(Math.random() * 1000000);
        const cleanSnippet = rawScene
          .replace(/[\r\n]+/g, ' ')
          .replace(/[^\p{L}\p{N}\s,.;:-]/gu, '')
          .slice(0, 300);
        const fluxPrompt = encodeURIComponent(
          `masterpiece anime light novel illustration, dark fantasy visual novel art, dramatic lighting, expressive character, high detail: ${cleanSnippet}`
        );
        const directUrl = `https://image.pollinations.ai/prompt/${fluxPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;
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
        throw new Error('No se recibió la imagen generada');
      }

      const cleanTitle = `Ilustración_${new Date().toISOString().slice(0, 10)}_${Math.random().toString(36).slice(2, 6)}`;

      const newAttachment: Attachment = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: `${cleanTitle}.jpg`,
        type: 'image/jpeg',
        fileType: 'image',
        dataUrl: imgDataUrl,
        timestamp: Date.now(),
        chatId: activeChat?.id,
        messageId: messageId,
      };

      // 1. Save directly to "La Cajita" (Session Media Gallery)
      handleAttachSessionMedia(newAttachment);

      // 2. Also attach to the specific message if messageId is provided so it appears inline!
      if (messageId && activeChat) {
        setChats((prevChats) =>
          prevChats.map((c) => {
            if (c.id !== activeChat.id) return c;
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== messageId) return m;
                const existingAttachments = m.attachments || [];
                return {
                  ...m,
                  attachments: [...existingAttachments, newAttachment],
                };
              }),
            };
          })
        );
      }

      showToast('🎨 ¡Ilustración generada y guardada en La Cajita!');
    } catch (err: any) {
      console.error('Error in handleIllustrateScene:', err);
      showToast(`⚠️ ${err.message || 'Error al generar ilustración'}`);
    }
  };

  const handleAttachDocumentToContext = (doc: {
    title: string;
    filename: string;
    content: string;
    fileType: DocFileType | string;
    size: number;
  }) => {
    if (!activeChat) return;

    const newLore: LoreFile = {
      id: `lore_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      folderId: activeChat.folderId || 'general',
      title: doc.title,
      filename: doc.filename,
      content: doc.content,
      fileType: (doc.fileType as DocFileType) || 'txt',
      size: doc.size,
      wordCount: doc.content.trim().split(/\s+/).length,
      estimatedTokens: Math.max(1, Math.round(doc.content.length / 3.8)),
      parseStatus: 'ready',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setLoreFiles((prev) => [...prev, newLore]);

    // Automatically attach it to the active session's context ("Docs en Contexto" counter updates to 1)
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              selectedLoreFileIds: Array.from(
                new Set([...(c.selectedLoreFileIds || []), newLore.id])
              ),
              updatedAt: Date.now(),
            }
          : c
      )
    );

    showToast(`📄 "${doc.filename}" añadido a Docs en Contexto`);
  };

  // -------------------------------------------------------------
  // Smart Memory Processing
  // -------------------------------------------------------------

  const processSmartMemory = (userText: string) => {
    if (settings.enableMemoryToggle === false) return;
    const memoryFact = detectSmartMemory(userText);
    if (memoryFact) {
      const newMem = createMemoryObject(memoryFact, 'auto');
      setSettings((prev) => ({
        ...prev,
        memories: [newMem, ...prev.memories],
      }));
      showToast(`Guardado en memoria: "${memoryFact}"`);
    }
  };

  // -------------------------------------------------------------
  // Message Generation & Streaming
  // -------------------------------------------------------------

  const handleSendMessage = async (
    userContent: string,
    attachments: Attachment[] = [],
    targetAssistantMessageId?: string,
    webSearchOverride?: boolean,
    isRegenerate: boolean = false,
    continueFromExistingProse?: string
  ) => {
    if (!activeChat) return;
    userAbortedRef.current = false;
    const isContinuationTurn = Boolean(targetAssistantMessageId && continueFromExistingProse);
    continuePrefixRef.current = isContinuationTurn && continueFromExistingProse ? continueFromExistingProse : '';

    const activeWebSearch =
      webSearchOverride !== undefined ? Boolean(webSearchOverride) : Boolean(isWebSearchEnabled);

    console.log("Despachando llamada con webSearch:", activeWebSearch);

    // Save uploaded media to session gallery ("la cajita")
    attachments.forEach((att) => {
      if (att.dataUrl || att.type.startsWith('image/')) {
        handleAttachSessionMedia(att);
      }
    });

    const cleanUserPrompt = userContent.trim();

    // Auto-update title if it's the first message
    let updatedTitle = activeChat.title;
    if (activeChat.messages.length === 0 && activeChat.title === 'Nueva Conversación') {
      const titleSeed = userContent.trim() || attachments[0]?.name || 'Escena Narrativa';
      updatedTitle = titleSeed.slice(0, 32).trim();
    }

    const hasImages = attachments.some(
      (a) => a.type?.startsWith('image/') || a.fileType === 'image'
    );
    if (hasImages && !isVisionCapable) {
      showToast(
        'Aviso: El modelo seleccionado es solo texto. Seleccioná uno con la etiqueta 👁️ Visión para que pueda ver la imagen.'
      );
    }

    let assistantPlaceholderId = targetAssistantMessageId || `msg_${Date.now()}_a`;
    let messagesPayload: Message[] = [];

    // Resolve user prompt & attachments for this turn (accounting for regenerate)
    let effectivePromptForRouting = userContent;
    let effectiveAttsForRouting = attachments;
    if (isRegenerate) {
      for (let i = activeChat.messages.length - 1; i >= 0; i--) {
        if (activeChat.messages[i].role === 'user') {
          effectivePromptForRouting = activeChat.messages[i].content;
          effectiveAttsForRouting = activeChat.messages[i].attachments || [];
          break;
        }
      }
    }

    const isVoiceCallTurn = Boolean(voiceReplyCallbackRef.current);
    const autoRouteDecision =
      settings.autoModelRouting && !isVoiceCallTurn
        ? resolveAutoRoutedModel(
            effectivePromptForRouting,
            effectiveAttsForRouting,
            settings,
            isContinuationTurn
          )
        : null;

    const effectiveTurnProvider: 'gemini' | 'custom' | 'alibaba' = autoRouteDecision
      ? autoRouteDecision.provider
      : settings.provider;

    const manualModelId =
      settings.provider === 'gemini'
        ? settings.geminiModel
        : settings.provider === 'alibaba'
          ? (settings.alibabaModel || 'qwen3.8-max')
          : (settings.customModel || 'moonshotai/kimi-k3');

    const effectiveTurnModelId = autoRouteDecision ? autoRouteDecision.modelId : manualModelId;

    const formatModelDisplayName = (modelId: string): string => {
      if (modelId.includes('qwen3.8-max-0902') || modelId.includes('0902')) return 'Qwen 3.8 Max 0902';
      if (modelId.includes('qwen3.7-plus') || modelId.includes('3.7-plus')) return 'Qwen 3.7 Plus';
      if (modelId.includes('qwen3.8-omni-flash') || modelId.includes('qwen-3.8-omni-flash') || modelId.includes('omni')) return 'Qwen 3.8 Omni Flash';
      if (modelId.includes('qwen3.8-plus') || modelId.includes('qwen-plus')) return 'Qwen 3.8 Plus (1M)';
      if (modelId.includes('qwen3.8-max') || modelId.includes('qwen-3.8-max')) return 'Qwen 3.8 Max';
      if (modelId.includes('qwen3.8-flash') || modelId.includes('qwen-3.8-flash')) return 'Qwen 3.8 Flash';
      if (modelId.includes('deepseek-k3')) return 'DeepSeek K3';
      if (modelId.includes('deepseek-v3')) return 'DeepSeek V3';
      if (modelId.includes('kimi-k3') || modelId.includes('moonshot')) return 'Kimi K3';
      if (modelId.includes('gemini-3.8-flash')) return 'Gemini 3.8 Flash';
      if (modelId.includes('gemini-3.6-flash')) return 'Gemini 3.6 Flash';
      if (modelId.includes('glm-5.3-flash')) return 'GLM 5.3-Flash';
      if (modelId.includes('glm-5.3')) return 'GLM 5.3';
      if (modelId.includes('llama-3.3-70b')) return 'Llama 3.3 70B';
      if (modelId.includes('gemini-3.1-pro')) return 'Gemini 3.1 Pro';
      if (modelId.includes('/')) return modelId.split('/').pop() || modelId;
      return modelId;
    };

    const effectiveTurnModelLabel = autoRouteDecision
      ? autoRouteDecision.modelLabel
      : formatModelDisplayName(effectiveTurnModelId);
    const effectiveAutoRouteReason = autoRouteDecision?.reason;

    const isReasoningModel =
      effectiveTurnProvider === 'gemini' ||
      /kimi|moonshot|glm|cot|reason|r1|gemini|step|stepfun|qwen3\.8|qwen3\.7/i.test(effectiveTurnModelId);
    const isCasual = isCasualGreeting(effectivePromptForRouting.trim());
    const userRequestedReasoning = settings.reasoningMode
      ? settings.reasoningMode !== 'off'
      : (settings.enableReasoning ?? true);
    // Voice Call Quota Shield: Disable reasoning CoT during voice calls to save 80% quota and respond in <0.8s
    const isReasoningTarget = !isCasual && !isVoiceCallTurn && userRequestedReasoning;
    const targetReasoningMode: 'off' | 'light' | 'deep' = (isCasual || isVoiceCallTurn)
      ? 'off'
      : autoRouteDecision && settings.reasoningMode !== 'off'
        ? autoRouteDecision.recommendedReasoningMode
        : (settings.reasoningMode || (settings.enableReasoning === false ? 'off' : 'light'));
    const thinkingBudget = targetReasoningMode === 'off' ? 0 : targetReasoningMode === 'light' ? 1024 : 4096;

    if (isRegenerate) {
      let lastUserIndex = -1;
      for (let i = activeChat.messages.length - 1; i >= 0; i--) {
        if (activeChat.messages[i].role === 'user') {
          lastUserIndex = i;
          break;
        }
      }
      if (lastUserIndex === -1) return;
      const userMsg = activeChat.messages[lastUserIndex];
      const trailingAssistant = activeChat.messages[lastUserIndex + 1];

      // CRITICAL FIX: Ensure assistantPlaceholderId matches the target message being regenerated
      if (trailingAssistant) {
        assistantPlaceholderId = trailingAssistant.id;
      }

      // Collect existing variants or seed with current content
      const priorVariants: string[] = trailingAssistant?.variants && trailingAssistant.variants.length > 0
        ? [...trailingAssistant.variants]
        : trailingAssistant?.content ? [trailingAssistant.content] : [];

      const newVariantIndex = priorVariants.length;
      const updatedVariants = [...priorVariants, ''];

      const assistantMessage: Message = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: '',
        thinking: '',
        timestamp: Date.now(),
        isStreaming: true,
        isThinking: false,
        variants: updatedVariants,
        activeVariantIndex: newVariantIndex,
        selectedLoreIds: activeChat.selectedLoreFileIds,
        modelName: effectiveTurnModelLabel,
        modelId: effectiveTurnModelId,
        autoRouteReason: effectiveAutoRouteReason,
      };

      // CRITICAL FIX: Define messagesWithoutTrailing properly so it never throws ReferenceError
      const messagesWithoutTrailing = activeChat.messages.slice(0, lastUserIndex + 1);
      const updatedMessages = [...messagesWithoutTrailing.slice(0, -1), userMsg, assistantMessage];

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: updatedMessages,
                updatedAt: Date.now(),
              }
            : c
        )
      );

      const historyToInclude = messagesWithoutTrailing.slice(-6);
      messagesPayload = historyToInclude;
      userContent = userMsg.content;
      attachments = userMsg.attachments || [];
    } else if (!targetAssistantMessageId) {
      // Check for smart memory triggers: "recordá que...", "guarda en memoria...", "save to memory:"
      processSmartMemory(userContent);

      const userMessage: Message = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        content: cleanUserPrompt,
        timestamp: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
        estimatedTokens: estimateTokenCount(cleanUserPrompt),
      };

      const assistantMessage: Message = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: '',
        thinking: '',
        timestamp: Date.now(),
        isStreaming: true,
        isThinking: false,
        webSearch: activeWebSearch,
        selectedLoreIds: activeChat.selectedLoreFileIds,
        modelName: effectiveTurnModelLabel,
        modelId: effectiveTurnModelId,
        autoRouteReason: effectiveAutoRouteReason,
      };

      // Ventana Deslizante + Libretita de Resumen Automático (Rolling Session Summary)
      const maxHistoryCount = settings.contextDepth === 'quick' ? 6 : 15;
      const olderMessages =
        activeChat.messages.length > maxHistoryCount
          ? activeChat.messages.slice(0, -maxHistoryCount)
          : [];
      const existingCleanSummary =
        activeChat.sessionSummary &&
        !activeChat.sessionSummary.includes(' [...] ') &&
        !/Turno #\d+\s*\([^)]+\):\s*¡?Hola\b/i.test(activeChat.sessionSummary)
          ? activeChat.sessionSummary
          : '';
      const synthesizedSessionSummary =
        olderMessages.length > 0
          ? existingCleanSummary && olderMessages.length <= (activeChat.summarizedUpToCount || 0)
            ? existingCleanSummary
            : buildRollingSessionSummary(olderMessages)
          : existingCleanSummary;

      // IMMEDIATE UI DISPATCH: Render user message and streaming placeholder into chat state instantly!
      const updatedMessages = [...activeChat.messages, userMessage, assistantMessage];
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                title: updatedTitle,
                messages: updatedMessages,
                sessionSummary: synthesizedSessionSummary || undefined,
                summarizedUpToCount:
                  olderMessages.length > 0
                    ? olderMessages.length
                    : synthesizedSessionSummary
                      ? c.summarizedUpToCount
                      : 0,
                updatedAt: Date.now(),
              }
            : c
        )
      );

      const historyToInclude = activeChat.messages.slice(-maxHistoryCount);
      messagesPayload = [...historyToInclude, userMessage];
    } else {
      if (!isContinuationTurn) {
        processSmartMemory(userContent);
      }
      const targetIndex = activeChat.messages.findIndex((m) => m.id === targetAssistantMessageId);
      const historyBase = targetIndex !== -1 ? activeChat.messages.slice(0, targetIndex) : activeChat.messages;
      const maxHistoryCount = settings.contextDepth === 'quick' ? 6 : 15;
      const historyToInclude = historyBase.slice(-maxHistoryCount);

      if (isContinuationTurn && continueFromExistingProse) {
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === targetAssistantMessageId
                      ? {
                          ...m,
                          content: continueFromExistingProse,
                          isStreaming: true,
                          isInterrupted: false,
                          error: undefined,
                        }
                      : m
                  ),
                  updatedAt: Date.now(),
                }
              : c
          )
        );
        const tailSnippet = continueFromExistingProse.slice(-220);
        messagesPayload = [
          ...historyToInclude,
          {
            id: targetAssistantMessageId,
            role: 'assistant',
            content: continueFromExistingProse,
            timestamp: Date.now(),
          },
          {
            id: `cont_usr_${Date.now()}`,
            role: 'user',
            content: `Tu respuesta anterior quedó incompleta o cortada exactamente aquí: "${tailSnippet}". Continúa redactando exactamente desde la siguiente palabra o signo donde quedaste, sin repetir lo anterior, sin poner títulos ni preámbulos ("Aquí tienes la continuación..."), manteniendo el mismo pulso y cerrando la respuesta.`,
            timestamp: Date.now(),
          },
        ];
      } else {
        messagesPayload = historyToInclude;
      }
    }


    // Prepare prompt components
    const folder = activeChat.folderId
      ? folders.find((f) => f.id === activeChat.folderId)
      : null;

    const isPersonaWizardSession = activeChat.title.includes('Taller de Directiva Global');
    const isProjectChat = Boolean(activeChat.folderId && folder);

    // Gather active lore file contents: Any document explicitly marked in selectedLoreFileIds is injected into the session context
    const activeLoreDocs = isPersonaWizardSession
      ? []
      : loreFiles
          .filter((l) => Array.isArray(activeChat?.selectedLoreFileIds) && activeChat.selectedLoreFileIds.includes(l.id))
          .sort((a, b) => a.id.localeCompare(b.id));

    const loreImageAttachments: Attachment[] = activeLoreDocs
      .filter((doc) => doc.fileType === 'image' && doc.dataUrl)
      .map((doc) => ({
        id: `lore_img_${doc.id}`,
        name: doc.title || doc.filename || 'Imagen de Lore',
        type: 'image/jpeg',
        dataUrl: doc.dataUrl,
        fileType: 'image',
      }));

    if (loreImageAttachments.length > 0) {
      attachments = [...attachments, ...loreImageAttachments];
    }

    const loreDocumentsText = activeLoreDocs
      .filter((doc) => doc.fileType !== 'image')
      .map(
        (doc) =>
          `[DOCUMENTO: "${doc.title}" (${doc.filename || doc.fileType || 'Archivo'})]\n${doc.content}\n`
      )
      .join('\n\n');

    const isShortGreeting = !isContinuationTurn && attachments.length === 0 && isCasualGreeting(userContent.trim());
    const userAsksAboutLore = isContinuationTurn || /lore|bóveda|boveda|manuscrito|capítulo|capitulo|escena|documento|archivos|fichas|canon|kolder|hinistra|tedriot|teshuvana|monstereth/i.test(userContent);

    // Voice Call Quota Shield: During a live voice call, only inject heavy lore manuscripts if the user explicitly mentions a character/lore keyword
    const loreContext = (loreDocumentsText.trim() && ((!isShortGreeting && !isVoiceCallTurn) || userAsksAboutLore))
      ? `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO (${activeLoreDocs.length}/${currentFolderLoreFiles.length} documentos marcados en contexto)]:\n--- INICIO DE DOCUMENTOS ---\n${loreDocumentsText.trim()}\n--- FIN DE DOCUMENTOS ---`
      : '';

    // Determine effective System Instruction:
    // 1. If in "Taller de Directiva Global", inject dedicated Meta-Prompt Builder instruction.
    // 2. If in a Project/Folder OR user explicitly talks about the novel, use full globalSystemPrompt.
    // 3. If in a General Chat outside projects (e.g. talking about AI GPUs, hardware, daily topics), use a clean general persona without forcing novel diagnostics!
    const userMentionsNovel = /kolder|hinistra|tedriot|teshuvana|monstereth|jukkou|zankyou|catarsis|skarnita|gurasha|novela|capítulo|capitulo|escena|lore|bóveda|boveda|manuscrito|fichas|archivos/i.test(userContent);
    const loreStatusInstruction = `\n\n[ESTADO DE BÓVEDA DE LORE EN ESTA SESIÓN]: Tienes acceso completo e integrado al sistema Bóveda de Lore (Lore Storage) de Kizuna-Zek. Tienes ${currentFolderLoreFiles.length} documentos almacenados en este arco/espacio de trabajo (${activeLoreDocs.length} seleccionados actualmente en el contexto activo). NUNCA digas que no puedes ver la bóveda de lore ni que no tienes acceso a sus archivos. Si el usuario te pregunta por su lore o manuscritos, confirma afirmativamente que el acceso a Lore Storage está habilitado y recuérdale amigablemente que si desea que consultes un archivo específico en esta sesión, solo debe ir al selector 'Docs: X/Y' de la barra superior (o al menú '···' > 'Gestión de Lore') y marcar los documentos deseados con un check (✓).`;

    const maxHistoryWindow = settings.contextDepth === 'quick' ? 6 : 15;
    const olderTurnsForSummary =
      activeChat.messages.length > maxHistoryWindow
        ? activeChat.messages.slice(0, -maxHistoryWindow)
        : [];
    const validSavedSummary =
      activeChat.sessionSummary &&
      !activeChat.sessionSummary.includes(' [...] ') &&
      !/Turno #\d+\s*\([^)]+\):\s*¡?Hola\b/i.test(activeChat.sessionSummary)
        ? activeChat.sessionSummary
        : '';
    const activeRollingSummary =
      olderTurnsForSummary.length > 0
        ? validSavedSummary && olderTurnsForSummary.length <= (activeChat.summarizedUpToCount || 0)
          ? validSavedSummary
          : buildRollingSessionSummary(olderTurnsForSummary)
        : validSavedSummary;

    const sessionSummaryBlock =
      activeRollingSummary && !isShortGreeting
        ? `\n\n[MEMORIA DE SESIÓN — LIBRETITA DE RESUMEN DE MENSAJES ANTERIORES (#1 al #${olderTurnsForSummary.length || activeChat.summarizedUpToCount || 1})]:\nLos siguientes puntos resumen todo lo acordado, escrito y hablado al inicio de esta misma conversación antes de los últimos mensajes activos. Tenlos siempre presentes para mantener continuidad absoluta:\n${activeRollingSummary}`
        : '';

    const effectiveSystemInstruction = isPersonaWizardSession
      ? `Eres el Arquitecto del Taller de Directiva Global de Kizuna-Zek.
Tu ÚNICA misión en este chat es redactar la nueva Directiva Global (System Prompt) personalizada según las respuestas del usuario.
REGLAS DEL TALLER:
1. Cuando el usuario responda a tus preguntas sobre tono, prohibiciones y estilo de intervención, redacta DIRECTAMENTE el System Prompt completo, pulido y listo para usar en primera/segunda persona ("Eres Kizuna-Zek...").
2. NO incluyas introducciones largas ni explicaciones fuera de la directiva, porque cuando el usuario pulse el botón "✅ Aplicar a Directiva Global" debajo de tu mensaje, TODO el texto de tu respuesta se guardará como la nueva Directiva Global.
3. Si el usuario pide ajustes a la directiva que acabas de proponer, devuelve la versión completa corregida.`
      : (settings.globalSystemPrompt || `Eres Kizuna-Zek, colega creativo y taller editorial de cabecera del autor.`) +
        loreStatusInstruction +
        sessionSummaryBlock;

    // Auto-clamp max tokens safeguard based on active model
    const rawAlibabaModel = effectiveTurnProvider === 'alibaba' ? effectiveTurnModelId : (settings.alibabaModel || 'qwen3.8-max');
    const cleanAlibabaModel = /llama|nemotron|nvdev|mistralai|meta\/|qwen-long/i.test(rawAlibabaModel)
      ? 'qwen3.8-omni-flash'
      : rawAlibabaModel;

    const targetModelId =
      effectiveTurnProvider === 'alibaba'
        ? cleanAlibabaModel
        : effectiveTurnProvider === 'custom'
          ? effectiveTurnModelId
          : effectiveTurnModelId;
    const safeOutputTokens = isVoiceCallTurn
      ? 320
      : clampMaxTokensForModel(
          targetModelId,
          settings.maxOutputTokens || 8192
        );

    // Start SSE stream
    setIsStreaming(true);
    requestNotificationAccess();
    requestScreenWakeLock();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    currentAssistantIdRef.current = assistantPlaceholderId;
    currentAccumulatedTextRef.current = '';
    currentAccumulatedThinkingRef.current = '';
    savedMemoryFactsRef.current = new Set();

    const streamStartTime = Date.now();
    const streamPerfStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let firstTokenPerfMs: number | null = null;
    let lastTokenPerfMs: number | null = null;
    let capturedCompletionTokens: number | undefined = undefined;
    let fullRawStream = '';
    let accumulatedServerReasoning = '';
    let reasoningDurationCaptured: number | undefined = undefined;
    let capturedTtftSeconds: number | undefined = undefined;
    let capturedCachedTokens: number | undefined = undefined;
    let streamWasTruncated = false;
    let pendingSources: WebSearchResult[] | undefined = undefined;
    let animationFrameId: number | null = null;
    let pendingStreamText = '';
    let pendingReasoningText = '';

    const flushState = () => {
      animationFrameId = null;

      // Ultra-fast zero-overhead prose parsing
      let extractedThought = '';
      let cleanProse = fullRawStream;

      if (/(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)/i.test(fullRawStream)) {
        const closeMatch = fullRawStream.match(/([\s\S]*?)(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)([\s\S]*)/i);
        if (closeMatch) {
          const preTag = closeMatch[1];
          const postTag = closeMatch[2];
          const openMatch = preTag.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
          if (openMatch) {
            const prefix = preTag.slice(0, preTag.toLowerCase().indexOf(openMatch[0].toLowerCase()));
            extractedThought = openMatch[1].trim();
            cleanProse = (prefix + postTag);
          } else {
            // No opening tag (e.g. Stepfun / reasoning models without <think>):
            // Everything before </think> is reasoning text!
            extractedThought = preTag.trim();
            cleanProse = postTag;
          }
        }
      } else if (/(?:<think>|<thought>|<reasoning>|<cot>)/i.test(fullRawStream)) {
        const openMatch = fullRawStream.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
        if (openMatch) {
          const prefix = fullRawStream.slice(0, fullRawStream.toLowerCase().indexOf(openMatch[0].toLowerCase()));
          extractedThought = openMatch[1].trim();
          cleanProse = prefix;
        }
      }

      // Purge any residual closing tags, tool_call blocks or leaking thought block artifacts
      cleanProse = cleanProse
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<tool_call>[\s\S]*$/gi, '')
        .replace(/<\/?tool_call>/gi, '')
        .replace(/<\|tool_call\|>[\s\S]*?(?:<\|\/tool_call\|>|$)/gi, '')
        .replace(/<\|\/?tool_call\|>/gi, '')
        .replace(/[\wÀ-ÿ]*\.\<\/think\>/gi, '')
        .replace(/[\wÀ-ÿ]*\<\/think\>/gi, '')
        .replace(/[\wÀ-ÿ]*\<\/thought\>/gi, '')
        .replace(/<\/?(?:think|thought|reasoning|cot)[^>]*>/gi, '')
        .trimStart();

      // Automatic memory synthesis extraction (<<<SAVE_MEMORY: ... >>>)
      const memMatch = cleanProse.match(/<<<SAVE_MEMORY:\s*([\s\S]*?)>>>/i);
      if (memMatch && memMatch[1] && settings.enableMemoryToggle !== false) {
        const extractedFact = memMatch[1].trim();
        if (extractedFact && !savedMemoryFactsRef.current.has(extractedFact)) {
          savedMemoryFactsRef.current.add(extractedFact);
          const newMemId = "mem_" + Date.now();
          setSettings((prev) => {
            const exists = (prev.memories || []).some(
              (m) => m.text.trim().toLowerCase() === extractedFact.toLowerCase()
            );
            if (exists) return prev;
            const updatedMemories = [
              ...(prev.memories || []),
              { id: newMemId, text: extractedFact, timestamp: Date.now(), enabled: true, source: 'auto' as const },
            ];
            const updated = { ...prev, memories: updatedMemories };
            saveSettings(updated);
            return updated;
          });
          showToast("✦ Memoria guardada: " + extractedFact);
        }
      }

      // Remove memory tag from visible prose for clean reading
      cleanProse = cleanProse.replace(/<<<SAVE_MEMORY:\s*[\s\S]*?>>>/gi, '').trimEnd();

      let mergedProse = cleanProse;
      if (continuePrefixRef.current) {
        const prefix = continuePrefixRef.current;
        if (!cleanProse) {
          mergedProse = prefix;
        } else {
          const needsSpace = !/\s$/.test(prefix) && !/^[\s.,;:!?)»\]}]/.test(cleanProse);
          mergedProse = prefix + (needsSpace ? ' ' : '') + cleanProse;
        }
      }

      const combinedThinking = (accumulatedServerReasoning
        ? accumulatedServerReasoning + (extractedThought ? '\n' + extractedThought : '')
        : extractedThought
      ).trim();

      const hasCleanProse = cleanProse.trim().length > 0;
      if (hasCleanProse && !reasoningDurationCaptured) {
        reasoningDurationCaptured = Math.max(0.2, +((Date.now() - streamStartTime) / 1000).toFixed(1));
      }
      const stillThinking = isReasoningTarget && !hasCleanProse;

      const totalOutputTokensNow =
        capturedCompletionTokens && capturedCompletionTokens > 0
          ? capturedCompletionTokens
          : estimateTokenCount(cleanProse + (combinedThinking ? ' ' + combinedThinking : ''));
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const endPerf = lastTokenPerfMs || nowPerf;
      const genElapsedSec =
        firstTokenPerfMs !== null && endPerf > firstTokenPerfMs + 80
          ? (endPerf - firstTokenPerfMs) / 1000
          : Math.max(0.15, (endPerf - streamPerfStart) / 1000);
      const currentTokensPerSec =
        totalOutputTokensNow > 0 && genElapsedSec > 0
          ? +(totalOutputTokensNow / genElapsedSec).toFixed(1)
          : undefined;

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id !== assistantPlaceholderId) return m;
                  const vars = m.variants ? [...m.variants] : [mergedProse];
                  const idx = m.activeVariantIndex ?? (vars.length > 0 ? vars.length - 1 : 0);
                  if (vars.length > 0 && idx < vars.length) {
                    vars[idx] = mergedProse;
                  }
                  return {
                    ...m,
                    content: mergedProse,
                    thinking: combinedThinking || m.thinking,
                    reasoningDurationSeconds: reasoningDurationCaptured || m.reasoningDurationSeconds,
                    ttftSeconds: capturedTtftSeconds || m.ttftSeconds,
                    cachedTokens: capturedCachedTokens || m.cachedTokens,
                    tokensPerSecond: currentTokensPerSec || m.tokensPerSecond,
                    isThinking: stillThinking,
                    variants: vars,
                    activeVariantIndex: idx,
                    estimatedTokens: capturedCompletionTokens || estimateTokenCount(mergedProse),
                    webSearchSources: pendingSources || m.webSearchSources,
                  };
                }),
              }
            : c
        )
      );
    };

    const scheduleFlush = () => {
      if (animationFrameId === null) {
        animationFrameId = window.setTimeout(flushState, 96);
      }
    };

    const updateChunkText = (
      chunkText: string,
      reasoningChunk?: string,
      sources?: WebSearchResult[],
      ttftVal?: number,
      cachedVal?: number,
      truncatedVal?: boolean,
      completionTokensVal?: number
    ) => {
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (chunkText || reasoningChunk) {
        if (firstTokenPerfMs === null) {
          firstTokenPerfMs = nowPerf;
        }
        lastTokenPerfMs = nowPerf;
      }
      if (completionTokensVal !== undefined && completionTokensVal > 0) {
        capturedCompletionTokens = completionTokensVal;
        if (lastTokenPerfMs === null) {
          lastTokenPerfMs = nowPerf;
        }
      }
      if (truncatedVal) {
        streamWasTruncated = true;
      }
      if (cachedVal !== undefined && cachedVal > 0) {
        capturedCachedTokens = cachedVal;
      }
      if (ttftVal !== undefined && !capturedTtftSeconds) {
        capturedTtftSeconds = ttftVal;
      } else if (!capturedTtftSeconds && (chunkText || reasoningChunk)) {
        capturedTtftSeconds = Math.max(0.1, +((Date.now() - streamStartTime) / 1000).toFixed(1));
      }
      if (sources && sources.length > 0) {
        pendingSources = sources;
      }
      if (reasoningChunk) {
        accumulatedServerReasoning += reasoningChunk;
        currentAccumulatedThinkingRef.current = accumulatedServerReasoning;
      }
      if (chunkText) {
        fullRawStream += chunkText;
        currentAccumulatedTextRef.current = fullRawStream;
      }
      if (animationFrameId === null) {
        animationFrameId = window.setTimeout(flushState, 96);
      }
    };

    const preparedMessagesPayload = messagesPayload.map((m) => {
      if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
        const docSection = m.attachments
          .filter((a) => (a.textContent || a.content) && a.fileType !== 'image')
          .map((a) => `[DOCUMENTO ADJUNTO: ${a.name}]\n${(a.textContent || a.content)?.trim()}`)
          .join('\n\n');
        if (docSection && !m.content.includes('[DOCUMENTO ADJUNTO:')) {
          return {
            ...m,
            content: m.content ? `${m.content}\n\n${docSection}` : docSection,
          };
        }
      }
      return m;
    });
    const finalPayloadMessages = (isShortGreeting || isVoiceCallTurn) ? preparedMessagesPayload.slice(-4) : preparedMessagesPayload;

    try {
      let serverFailed = false;
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: finalPayloadMessages,
            isWebSearchEnabled: activeWebSearch,
            tavilyApiKey: cleanApiKey(settings.tavilyApiKey) || getTavilyApiKey(),
            systemInstruction: effectiveSystemInstruction,
            folderSystemPrompt: folder?.systemPrompt || '',
            loreContext,
            memories: settings.enableMemoryToggle === false ? [] : settings.memories,
            userProfile: settings.userProfile,
            personalityConfig: settings.personalityConfig,
            provider: effectiveTurnProvider,
            customConfig: {
              apiKey: effectiveTurnProvider === 'gemini' 
                ? (settings.geminiApiKey || getGeminiApiKey()) 
                : effectiveTurnProvider === 'alibaba'
                  ? (settings.alibabaApiKey || '')
                  : (settings.customApiKey || getNvidiaApiKey()),
              geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
              alibabaApiKey: settings.alibabaApiKey || '',
              alibabaBaseUrl: settings.alibabaBaseUrl,
              alibabaModel: effectiveTurnProvider === 'alibaba' ? targetModelId : settings.alibabaModel,
              baseUrl: effectiveTurnProvider === 'alibaba'
                ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                : settings.customBaseUrl,
              model: targetModelId,
              tavilyApiKey: cleanApiKey(settings.tavilyApiKey) || getTavilyApiKey(),
            },
            maxOutputTokens: safeOutputTokens,
            temperature: settings.temperature,
            model: targetModelId,
            enableReasoning: targetReasoningMode !== 'off',
            reasoningMode: targetReasoningMode,
            thinkingBudget: thinkingBudget,
            generationConfig: {
              thinkingConfig: {
                thinkingBudget: thinkingBudget,
              },
            },
          }),
        });

        if (!response.ok) {
          console.warn(`[Kizuna-Zek] Server returned HTTP ${response.status}. Activating direct client stream fallback.`);
          serverFailed = true;
        } else if (!response.body) {
          serverFailed = true;
        } else {
          const reader = response.body.getReader();
          activeReaderRef.current = reader;
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            if (controller.signal.aborted || userAbortedRef.current) {
              try { await reader.cancel(); } catch {}
              break;
            }
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, '');
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.truncated) {
                  updateChunkText('', '', undefined, undefined, undefined, true);
                }
                if (parsed.ttftSeconds !== undefined) {
                  updateChunkText('', '', undefined, parsed.ttftSeconds);
                }
                if (parsed.cachedTokens !== undefined && parsed.cachedTokens > 0) {
                  updateChunkText('', '', undefined, undefined, parsed.cachedTokens);
                }
                if (parsed.completionTokens !== undefined && parsed.completionTokens > 0) {
                  updateChunkText('', '', undefined, undefined, undefined, undefined, parsed.completionTokens);
                }
                if (parsed.sources && Array.isArray(parsed.sources)) {
                  updateChunkText('', '', parsed.sources);
                }
                if (parsed.text || parsed.reasoning) {
                  updateChunkText(parsed.text || '', parsed.reasoning || '', undefined, parsed.ttftSeconds, parsed.cachedTokens, undefined, parsed.completionTokens);
                }
                if (parsed.error) {
                  const is429 =
                    parsed.error.includes('429') ||
                    parsed.error.includes('RESOURCE_EXHAUSTED') ||
                    parsed.error.includes('límite de peticiones');
                  const isIncompleteJson =
                    parsed.error.includes('Incomplete JSON segment at the end') ||
                    parsed.error.includes('incomplete JSON');

                  const hasSubstantialAccumulatedText =
                    (currentAccumulatedTextRef.current && currentAccumulatedTextRef.current.trim().length > 20) ||
                    (currentAccumulatedThinkingRef.current && currentAccumulatedThinkingRef.current.trim().length > 20);

                  // If text/thought was already rendered, don't destroy it on a trailing EOF glitch
                  if (isIncompleteJson && hasSubstantialAccumulatedText) {
                    console.warn('[Kizuna Stream Warning]: Trailing segment glitch ignored because message was already rendered.');
                    finalizeCurrentPartialMessage();
                    continue;
                  }

                  // If no text was streamed yet and server failed (e.g. 401/500), try direct client stream fallback first
                  if (!hasSubstantialAccumulatedText && !is429) {
                    serverFailed = true;
                    break;
                  }

                  let friendlyError = is429 ? HTTP_429_RATE_LIMIT_NOTICE : parsed.error;
                  if (isIncompleteJson) {
                    friendlyError = 'La conexión con Google Gemini se interrumpió al finalizar la respuesta. Si quedó incompleta, pulsa en Regenerar 🔄.';
                  }

                  setErrorDiagnostic({
                    message: friendlyError,
                    status: is429 ? '429' : '500',
                    engine: settings.provider === 'alibaba' ? 'alibaba' : settings.provider === 'custom' ? 'nvidia' : 'gemini',
                    modelId: activeModelId,
                    isVisionModel: isVisionModel(activeModelId),
                    hadAttachments: attachments.length > 0,
                    attachmentTypes: attachments.map((a) => a.fileType || a.type || 'archivo'),
                    timestamp: new Date().toLocaleTimeString(),
                    rawError: parsed.error,
                    error: friendlyError,
                    model: activeModelId,
                    provider: settings.provider,
                    hasImages,
                    attachmentsCount: attachments.length,
                    promptLength: userContent.length,
                    temperature: settings.temperature,
                    maxTokens: settings.maxOutputTokens,
                  });
                  setChats((prev) =>
                    prev.map((c) =>
                      c.id === activeChat.id
                        ? {
                            ...c,
                            messages: c.messages.map((m) =>
                              m.id === assistantPlaceholderId
                                ? { ...m, error: friendlyError, isStreaming: false, isThinking: false }
                                : m
                            ),
                          }
                        : c
                    )
                  );
                }
              } catch {
                // Ignore partial SSE lines
              }
            }
            if (serverFailed) break;
          }
        }
      } catch (err: any) {
        const isAbort =
          userAbortedRef.current ||
          controller.signal.aborted ||
          err?.name === 'AbortError' ||
          err?.name === 'DOMException' ||
          err?.code === 20 ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (typeof err?.message === 'string' && (
            err.message.toLowerCase().includes('aborted') ||
            err.message.toLowerCase().includes('user abort') ||
            err.message.toLowerCase().includes('the operation was aborted')
          ));
        if (isAbort) throw err;
        serverFailed = true;
      }

      // If server route /api/chat returned 404 or failed, execute direct standalone client fetch
      if (serverFailed && !userAbortedRef.current && !controller.signal.aborted) {
        await executeDirectApiStream({
          messages: finalPayloadMessages,
          systemInstruction: effectiveSystemInstruction,
          folderSystemPrompt: folder?.systemPrompt || '',
          loreContext,
          memories: settings.enableMemoryToggle === false ? [] : settings.memories,
          userProfile: settings.userProfile,
          personalityConfig: settings.personalityConfig,
          isWebSearchEnabled: activeWebSearch,
          provider: effectiveTurnProvider,
          customConfig: {
            apiKey: effectiveTurnProvider === 'gemini' 
              ? (settings.geminiApiKey || getGeminiApiKey()) 
              : effectiveTurnProvider === 'alibaba'
                ? (settings.alibabaApiKey || '')
                : (settings.customApiKey || getNvidiaApiKey()),
            alibabaApiKey: settings.alibabaApiKey || '',
            alibabaBaseUrl: settings.alibabaBaseUrl,
            alibabaModel: effectiveTurnProvider === 'alibaba' ? targetModelId : settings.alibabaModel,
            baseUrl: effectiveTurnProvider === 'alibaba'
              ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
              : settings.customBaseUrl,
            model: targetModelId,
          },
          maxOutputTokens: safeOutputTokens,
          temperature: settings.temperature,
          model: targetModelId,
          enableReasoning: targetReasoningMode !== 'off',
          reasoningMode: targetReasoningMode,
          thinkingBudget: thinkingBudget,
          signal: controller.signal,
          onChunk: updateChunkText,
          onReaderInit: (r) => {
            activeReaderRef.current = r;
          },
        });
      }

      // Ensure final text and thinking state is flushed synchronously
      if (animationFrameId !== null) {
        clearTimeout(animationFrameId);
        animationFrameId = null;
      }
      flushState();

      // Stream completed cleanly: record tokens to persistent statistics
      const inputEstimatedTokens = estimateTokenCount(userContent) + (totalContextTokens || 0);
      const outputEstimatedTokens =
        capturedCompletionTokens && capturedCompletionTokens > 0
          ? capturedCompletionTokens
          : estimateTokenCount(fullRawStream + (accumulatedServerReasoning ? ' ' + accumulatedServerReasoning : ''));
      recordMessageActivity(inputEstimatedTokens, outputEstimatedTokens, capturedCachedTokens || 0);
      setStats(loadStatistics());

      const finalReasoningDuration = (accumulatedServerReasoning || reasoningDurationCaptured)
        ? Math.max(0.2, +((Date.now() - streamStartTime) / 1000).toFixed(1))
        : undefined;

      const finalEndPerf = lastTokenPerfMs || (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const finalGenSec =
        firstTokenPerfMs !== null && finalEndPerf > firstTokenPerfMs + 80
          ? (finalEndPerf - firstTokenPerfMs) / 1000
          : Math.max(0.15, (finalEndPerf - streamPerfStart) / 1000);
      const finalTokensPerSecond =
        outputEstimatedTokens > 0 && finalGenSec > 0
          ? +(outputEstimatedTokens / finalGenSec).toFixed(1)
          : undefined;

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantPlaceholderId
                    ? {
                        ...m,
                        isStreaming: false,
                        isThinking: false,
                        isInterrupted: Boolean(streamWasTruncated || userAbortedRef.current),
                        reasoningDurationSeconds: m.reasoningDurationSeconds || finalReasoningDuration,
                        ttftSeconds: m.ttftSeconds || capturedTtftSeconds,
                        tokensPerSecond: finalTokensPerSecond || m.tokensPerSecond,
                      }
                    : m
                ),
              }
            : c
        )
      );
      continuePrefixRef.current = '';

      // Síntesis ejecutiva asíncrona en segundo plano (Post-Turno, 0ms de latencia en el chat)
      // Cuando se acumulan 6 o más mensajes nuevos fuera de la ventana literal, consolida el resumen en la nube.
      if (
        !userAbortedRef.current &&
        olderTurnsForSummary.length >= (activeChat.summarizedUpToCount || 0) + 6
      ) {
        const targetChatId = activeChat.id;
        const poolSnapshot = [...olderTurnsForSummary];
        void synthesizeSessionSummaryWithAI(poolSnapshot, settings, validSavedSummary).then(
          (aiSummary) => {
            if (!aiSummary || !aiSummary.trim()) return;
            setChats((prev) => {
              const updated = prev.map((c) => {
                if (c.id !== targetChatId) return c;
                const nextChat: Chat = {
                  ...c,
                  sessionSummary: aiSummary.trim(),
                  summarizedUpToCount: poolSnapshot.length,
                  updatedAt: Date.now(),
                };
                if (user?.uid) {
                  syncChatToFirestore(user.uid, nextChat);
                }
                return nextChat;
              });
              saveChats(updated);
              return updated;
            });
          }
        );
      }
    } catch (err: any) {
      const isAbort =
        userAbortedRef.current ||
        err?.name === 'AbortError' ||
        err?.name === 'DOMException' ||
        err?.code === 20 ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (typeof err?.message === 'string' && (
          err.message.toLowerCase().includes('aborted') ||
          err.message.toLowerCase().includes('user abort') ||
          err.message.toLowerCase().includes('the operation was aborted')
        ));

      if (isAbort) {
        // Silently capture cancellation, preserve all accumulated text, and never delete message
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        flushState();
        finalizeCurrentPartialMessage();
        return;
      }

      console.error("Error en generación:", err);
      const isTimeout = err?.name === 'AbortError';
      const friendlyMessage = isTimeout
        ? "⚠️ La solicitud tardó más de 15 segundos sin responder y fue cancelada. Revisa la conexión o cambia de modelo en Ajustes."
        : `⚠️ Error de conexión con el motor: ${err.message || 'No se pudo conectar con el modelo seleccionado'}.`;
      
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== activeChat.id) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantPlaceholderId
                ? {
                    ...m,
                    content: friendlyMessage,
                    isStreaming: false,
                    isThinking: false,
                    error: friendlyMessage,
                  }
                : m
            ),
            updatedAt: Date.now(),
          };
        })
      );
    } finally {
      if (activeReaderRef.current) {
        try {
          activeReaderRef.current.cancel();
        } catch {}
        activeReaderRef.current = null;
      }
      setIsStreaming(false);
      abortControllerRef.current = null;
      currentAssistantIdRef.current = null;
      releaseScreenWakeLock();
      const words = fullRawStream.trim() ? fullRawStream.trim().split(/\s+/).length : 0;
      if (words > 0 && !userAbortedRef.current) {
        notifyGenerationComplete(words);
      }
      if (voiceReplyCallbackRef.current) {
        const cb = voiceReplyCallbackRef.current;
        voiceReplyCallbackRef.current = null;
        if (!userAbortedRef.current && fullRawStream.trim()) {
          cb(fullRawStream);
        }
      }
    }
  };

  const finalizeCurrentPartialMessage = () => {
    const rawText = currentAccumulatedTextRef.current;
    let extractedThought = '';
    let cleanProse = rawText;

    if (rawText.includes('<think') || rawText.includes('<thought')) {
      const thinkMatch = rawText.match(/(?:<think>|<thought>)([\s\S]*?)(?:<\/think>|<\/thought>|$)/i);
      if (thinkMatch) {
        extractedThought = thinkMatch[1].trim();
        cleanProse = (
          rawText.slice(0, thinkMatch.index) +
          rawText.slice((thinkMatch.index || 0) + thinkMatch[0].length)
        ).trimStart();
      }
    }

    const thinking = (
      currentAccumulatedThinkingRef.current
        ? currentAccumulatedThinkingRef.current + (extractedThought ? '\n' + extractedThought : '')
        : extractedThought
    ).trim();

    const targetId = currentAssistantIdRef.current;

    setChats((prev) =>
      prev.map((c) => {
        if (!activeChat || c.id !== activeChat.id) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            const isTarget = targetId ? m.id === targetId : m.isStreaming;
            if (!isTarget) return m;

            // Preserve accumulated partial text intact - do not discard or overwrite
            let mergedPartial = cleanProse;
            if (continuePrefixRef.current) {
              const prefix = continuePrefixRef.current;
              if (!cleanProse) {
                mergedPartial = prefix;
              } else {
                const needsSpace = !/\s$/.test(prefix) && !/^[\s.,;:!?)»\]}]/.test(cleanProse);
                mergedPartial = prefix + (needsSpace ? ' ' : '') + cleanProse;
              }
            }
            const finalContent = mergedPartial || m.content || '';
            const vars = m.variants ? [...m.variants] : [finalContent];
            const idx = m.activeVariantIndex ?? (vars.length > 0 ? vars.length - 1 : 0);
            if (vars.length > 0 && idx < vars.length) {
              vars[idx] = finalContent;
            }

            return {
              ...m,
              content: finalContent,
              thinking: thinking || m.thinking,
              isStreaming: false,
              isThinking: false,
              isInterrupted: true,
              variants: vars,
              activeVariantIndex: idx,
              estimatedTokens: estimateTokenCount(finalContent),
            };
          }),
          updatedAt: Date.now(),
        };
      })
    );
    continuePrefixRef.current = '';
  };

  const handleStopGeneration = () => {
    userAbortedRef.current = true;
    setIsStreaming(false);

    // Cancel active reader if still open
    if (activeReaderRef.current) {
      try {
        activeReaderRef.current.cancel();
      } catch {
        // Silently capture
      }
      activeReaderRef.current = null;
    }

    // Abort controller
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // Silently capture
      }
      abortControllerRef.current = null;
    }

    // Freeze assistant message with accumulated partial text - NEVER delete from messages array
    finalizeCurrentPartialMessage();
  };

  const handleSelectVariant = (messageId: string, variantIndex: number) => {
    if (!activeChat) return;
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== activeChat.id) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== messageId || !m.variants || typeof m.variants[variantIndex] !== 'string') return m;
            return {
              ...m,
              activeVariantIndex: variantIndex,
              content: m.variants[variantIndex],
            };
          }),
        };
      })
    );
  };

  const handleAuditScene = async (
    targetText?: string,
    overrideProvider?: 'gemini' | 'custom' | 'alibaba',
    overrideModel?: string,
    speedMode: 'fast' | 'deep' = 'fast'
  ) => {
    if (!activeChat || isStreaming) return;
    const assistantMsgs = activeChat.messages.filter((m) => m.role === 'assistant' && m.content.trim());
    const userMsgs = activeChat.messages.filter((m) => m.role === 'user' && m.content.trim());
    const sceneToAudit =
      targetText ||
      assistantMsgs[assistantMsgs.length - 1]?.content ||
      userMsgs[userMsgs.length - 1]?.content ||
      '';
    if (!sceneToAudit) {
      showToast('No hay texto o escena en el chat para auditar');
      return;
    }

    setIsAuditModalOpen(true);
    setIsAuditing(true);
    setIsAuditFinished(false);
    setAuditResult('');
    setAuditError(null);

    const activeLoreDocs = loreFiles.filter((l) => {
      return Array.isArray(activeChat?.selectedLoreFileIds) && activeChat.selectedLoreFileIds.includes(l.id);
    });

    const loreContextText = activeLoreDocs
      .map((doc) => `[DOCUMENTO LORE: "${doc.title}"]\n${doc.content}`)
      .join('\n\n');

    const auditPrompt = `Actúa como auditor de continuidad y lore. Revisa la coherencia sensorial, reglas del mundo y tono del texto actual. Entrega un informe conciso y constructivo destacando aciertos y contradicciones.

[TEXTO / ESCENA A AUDITAR]:
${sceneToAudit}

[LORE Y REGLAS DEL MUNDO]:
${loreContextText || 'Sin documentos de lore específicos cargados en el contexto.'}`;

    const targetProvider = overrideProvider || settings.provider;
    const targetModelId =
      overrideModel ||
      (targetProvider === 'alibaba'
        ? (settings.alibabaModel || 'qwen3.8-max')
        : targetProvider === 'custom'
          ? settings.customModel
          : settings.geminiModel);

    const isDeepMode = speedMode === 'deep';
    const auditMaxTokens = isDeepMode ? 3072 : 1024;

    try {
      let accumulatedText = '';
      let serverFailed = false;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ id: 'audit_req', role: 'user', content: auditPrompt, timestamp: Date.now() }],
            systemInstruction:
              'Eres el Auditor de Lore y Continuidad Rúnica de Kizuna-Zek. Entrega un veredicto estructurado, conciso y directo en 3 puntos: 1. Coherencia Sensorial & Foley, 2. Continuidad de Lore & Reglas, 3. Ajuste Quirúrgico Sugerido. Sin rodeos ni preámbulos.',
            folderSystemPrompt: '',
            loreContext: loreContextText,
            memories: [],
            provider: targetProvider,
            customConfig: {
              apiKey: targetProvider === 'gemini' 
                ? (settings.geminiApiKey || getGeminiApiKey()) 
                : targetProvider === 'alibaba'
                  ? (settings.alibabaApiKey || '')
                  : settings.customApiKey,
              geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
              alibabaApiKey: settings.alibabaApiKey || '',
              alibabaBaseUrl: settings.alibabaBaseUrl,
              alibabaModel: targetModelId,
              baseUrl: targetProvider === 'alibaba'
                ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                : settings.customBaseUrl,
              model: targetModelId,
            },
            maxOutputTokens: auditMaxTokens,
            temperature: 0.2,
            model: targetModelId,
            enableReasoning: isDeepMode,
            reasoningMode: isDeepMode ? 'light' : 'off',
            thinkingBudget: isDeepMode ? 1024 : 0,
          }),
        });

        if (!response.ok || !response.body) {
          serverFailed = true;
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, '');
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.text) {
                  accumulatedText += parsed.text;
                  setAuditResult(accumulatedText);
                }
              } catch (pErr: any) {
                if (pErr.message && !pErr.message.includes('JSON')) throw pErr;
              }
            }
          }
        }
      } catch {
        serverFailed = true;
      }

      // Direct fallback for BOTH Gemini and Custom/NVIDIA/Alibaba engines
      if (serverFailed || !accumulatedText) {
        await executeDirectApiStream({
          messages: [{ id: 'audit_req', role: 'user', content: auditPrompt, timestamp: Date.now() }],
          systemInstruction:
            'Eres el Auditor de Lore y Continuidad Rúnica de Kizuna-Zek. Entrega un veredicto estructurado, conciso y directo en 3 puntos: 1. Coherencia Sensorial & Foley, 2. Continuidad de Lore & Reglas, 3. Ajuste Quirúrgico Sugerido. Sin rodeos ni preámbulos.',
          provider: targetProvider,
          customConfig: {
            apiKey: targetProvider === 'gemini' 
              ? (settings.geminiApiKey || getGeminiApiKey()) 
              : targetProvider === 'alibaba'
                ? (settings.alibabaApiKey || '')
                : settings.customApiKey,
            baseUrl: targetProvider === 'alibaba'
              ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
              : settings.customBaseUrl,
            model: targetModelId,
          },
          maxOutputTokens: auditMaxTokens,
          temperature: 0.2,
          model: targetModelId,
          enableReasoning: isDeepMode,
          reasoningMode: isDeepMode ? 'light' : 'off',
          thinkingBudget: isDeepMode ? 1024 : 0,
          onChunk: (chunk) => {
            accumulatedText += chunk;
            setAuditResult(accumulatedText);
          },
        });
      }

      if (accumulatedText) {
        setIsAuditFinished(true);
        setTimeout(() => {
          setIsAuditFinished(false);
        }, 2500);
      }
    } catch (err: any) {
      setAuditError(err.message || 'Error al auditar la escena con el servicio de IA');
      setIsAuditFinished(false);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleBatchAudit = async (
    selectedChatIds: string[],
    overrideProvider?: 'gemini' | 'custom' | 'alibaba',
    overrideModel?: string,
    speedMode: 'fast' | 'deep' = 'fast'
  ) => {
    if (isStreaming || isAuditing) return;
    if (!selectedChatIds || selectedChatIds.length === 0) {
      showToast('⚠️ Selecciona al menos un capítulo o conversación para auditar');
      return;
    }

    setIsAuditModalOpen(true);
    setIsAuditing(true);
    setIsAuditFinished(false);
    setAuditResult('');
    setAuditError(null);

    const selectedChats = chats.filter((c) => selectedChatIds.includes(c.id));
    const combinedManuscriptText = selectedChats
      .map((c) => {
        const msgs = c.messages.filter((m) => m.content.trim());
        const body = msgs
          .map((m) => `[${m.role === 'user' ? 'AUTOR' : 'KIZUNA'}]: ${m.content}`)
          .join('\n\n');
        return `========================================\n[MANUSCRITO CAPÍTULO: "${c.title}"]\n========================================\n${body}`;
      })
      .join('\n\n\n');

    const activeLoreDocs = loreFiles;
    const loreContextText = activeLoreDocs
      .map((doc) => `[DOCUMENTO LORE: "${doc.title}"]\n${doc.content}`)
      .join('\n\n');

    const batchPrompt = `Actúa como Editor Principal y Auditor Rúnico de la novela ligera 'Jukkou no Zankyou'. 
Realiza una AUDITORÍA INTEGRAL EN LOTE del siguiente manuscrito compuesto por ${selectedChats.length} capítulos/escenas.

Examina minuciosamente:
1. FOLEY & BIOMECÁNICA SENSORIAL:
   - Coherencia somática de Kolder (vacío límbico, ojos prisma gris, virola de calabaza, yerba de cobre a 80-90°C, karambit, disipación de Catarsis).
   - Coherencia somática de Hinistra (voseo rioplatense, máscara de Euforia en pecho izquierdo, citas trágicas de Sófocles/Eurípides, corte Medusa).
   - Somática de Santusma y Skarnita.
2. CONTINUIDAD DE LORE ENTRE CAPÍTULOS:
   - Detecta contradicciones temporales, de reglas mágicas o de estados físicos de los personajes entre un capítulo y el siguiente.
3. FUGAS DE TONO & CLICHÉS:
   - Advierte si algún diálogo se vuelve melodramático, genérico o si los personajes pierden su voz distintiva.
4. PLAN DE ACCIÓN Y VEREDICTO QUIRÚRGICO:
   - Conclusiones concisas y sugerencias específicas de edición.

[MANUSCRITO COMPLETO EN LOTE]:
${combinedManuscriptText}

[CANON Y LORE DE REFERENCIA]:
${loreContextText || 'Canon central de Jukkou no Zankyou.'}`;

    const targetProvider = overrideProvider || settings.provider;
    const targetModelId =
      overrideModel ||
      (targetProvider === 'alibaba'
        ? (settings.alibabaModel || 'qwen3.8-max')
        : targetProvider === 'custom'
          ? settings.customModel
          : settings.geminiModel);

    const isDeepMode = speedMode === 'deep';
    const safeBatchMaxTokens = targetModelId.toLowerCase().includes('qwen-long') ? 2048 : (isDeepMode ? 4096 : 2048);

    try {
      let accumulatedText = '';
      let serverFailed = false;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ id: 'batch_audit_req', role: 'user', content: batchPrompt, timestamp: Date.now() }],
            systemInstruction:
              'Eres el Editor Jefe y Auditor de Continuidad de Jukkou no Zankyou. Entrega un informe editorial exhaustivo, ordenado en 4 secciones claras con formato Markdown profesional.',
            folderSystemPrompt: '',
            loreContext: loreContextText,
            memories: [],
            provider: targetProvider,
            customConfig: {
              apiKey: targetProvider === 'gemini' 
                ? (settings.geminiApiKey || getGeminiApiKey()) 
                : targetProvider === 'alibaba'
                  ? (settings.alibabaApiKey || '')
                  : settings.customApiKey,
              geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
              alibabaApiKey: settings.alibabaApiKey || '',
              alibabaBaseUrl: settings.alibabaBaseUrl,
              alibabaModel: targetModelId,
              baseUrl: targetProvider === 'alibaba'
                ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                : settings.customBaseUrl,
              model: targetModelId,
            },
            maxOutputTokens: safeBatchMaxTokens,
            temperature: 0.2,
            model: targetModelId,
            enableReasoning: isDeepMode,
            reasoningMode: isDeepMode ? 'light' : 'off',
            thinkingBudget: isDeepMode ? 1024 : 0,
          }),
        });

        if (!response.ok || !response.body) {
          serverFailed = true;
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, '');
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.text) {
                  accumulatedText += parsed.text;
                  setAuditResult(accumulatedText);
                }
              } catch (pErr: any) {
                if (pErr.message && !pErr.message.includes('JSON')) throw pErr;
              }
            }
          }
        }
      } catch {
        serverFailed = true;
      }

      if (serverFailed || !accumulatedText) {
        await executeDirectApiStream({
          messages: [{ id: 'batch_audit_req', role: 'user', content: batchPrompt, timestamp: Date.now() }],
          systemInstruction:
            'Eres el Editor Jefe y Auditor de Continuidad de Jukkou no Zankyou. Entrega un informe editorial exhaustivo, ordenado en 4 secciones claras con formato Markdown profesional.',
          provider: settings.provider,
          customConfig: {
            apiKey: settings.provider === 'gemini' 
              ? (settings.geminiApiKey || getGeminiApiKey()) 
              : settings.provider === 'alibaba'
                ? (settings.alibabaApiKey || '')
                : settings.customApiKey,
            alibabaApiKey: settings.alibabaApiKey || '',
            alibabaBaseUrl: settings.alibabaBaseUrl,
            alibabaModel: targetModelId,
            baseUrl: settings.provider === 'alibaba'
              ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
              : settings.customBaseUrl,
            model: targetModelId,
          },
          maxOutputTokens: safeBatchMaxTokens,
          temperature: 0.2,
          enableReasoning: false,
          reasoningMode: 'off',
          thinkingBudget: 0,
          onChunk: (text) => {
            accumulatedText += text;
            setAuditResult(accumulatedText);
          },
        });
      }

      setIsAuditFinished(true);
      showToast('⚡ Auditoría Integral del manuscrito completada con éxito');
    } catch (err: any) {
      console.error('Batch audit error:', err);
      setAuditError(err.message || 'Error al procesar la auditoría integral en lote');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleInspectUI = async (targetMode: 'chat' | 'modal' = 'chat') => {
    if (isStreaming) return;
    try {
      showToast('📸 Capturando pantalla para inspección de UI...');

      // Allow popovers and dropdowns 100ms to dismiss cleanly
      await new Promise((resolve) => setTimeout(resolve, 100));

      const element = document.body;
      const dataUrl = await captureAppScreenshot(element);
      const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

      const screenshotAttachment: Attachment = {
        id: `ui_inspect_${Date.now()}`,
        name: `captura_ui_${new Date().toISOString().slice(0, 10)}.jpg`,
        type: 'image/jpeg',
        fileType: 'image',
        size: Math.round((base64Data.length * 3) / 4),
        dataUrl,
        timestamp: Date.now(),
      };

      const uiDesignPrompt = `Actúa como un Diseñador Senior de Interfaz (UI/UX Inspector). Analiza la captura de pantalla adjunta de la aplicación Kizuna-Zek.
Evalúa con precisión los siguientes aspectos clave:
1. Jerarquía Visual y Composición (Alineación, legibilidad, contraste y aprovechamiento del espacio).
2. Armonía Tipográfica y Paleta Sintética (Elegancia del tema oscuro y coherencia visual).
3. Experiencia de Usuario (UX), Accesibilidad y Usabilidad en Dispositivos.
Ofrece un diagnóstico estructurado y recomendaciones de mejora de diseño.`;

      if (targetMode === 'chat') {
        await handleSendMessage(uiDesignPrompt, [screenshotAttachment]);
      } else {
        setIsAuditModalOpen(true);
        setIsAuditing(true);
        setAuditResult('');
        setAuditError(null);

        const targetModelId =
          settings.provider === 'alibaba'
            ? (settings.alibabaModel || 'qwen3.8-max')
            : settings.provider === 'custom'
              ? settings.customModel
              : settings.geminiModel;

        const auditMessagePayload: Message[] = [
          {
            id: `ui_inspect_req_${Date.now()}`,
            role: 'user',
            content: uiDesignPrompt,
            timestamp: Date.now(),
            attachments: [screenshotAttachment],
          },
        ];

        let serverFailed = false;
        let accumulatedText = '';
        let flushTimer: any = null;
        let lastFlushTime = 0;

        const flushAudit = () => {
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          lastFlushTime = Date.now();
          setAuditResult(accumulatedText);
        };

        const scheduleAuditFlush = () => {
          const now = Date.now();
          const elapsed = now - lastFlushTime;
          if (elapsed >= 80) {
            flushAudit();
          } else if (!flushTimer) {
            flushTimer = setTimeout(flushAudit, 80 - elapsed);
          }
        };

        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: auditMessagePayload,
              systemInstruction: 'Actúa como un Diseñador Senior de Interfaz (UI/UX Inspector). Analiza la interfaz de la aplicación de forma crítica, constructiva y elegante.',
              provider: settings.provider,
              customConfig: {
                apiKey: settings.provider === 'gemini' 
                  ? (settings.geminiApiKey || getGeminiApiKey()) 
                  : settings.provider === 'alibaba'
                    ? (settings.alibabaApiKey || '')
                    : settings.customApiKey,
                geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
                alibabaApiKey: settings.alibabaApiKey || '',
                alibabaBaseUrl: settings.alibabaBaseUrl,
                alibabaModel: settings.alibabaModel,
                baseUrl: settings.provider === 'alibaba'
                  ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                  : settings.customBaseUrl,
                model: targetModelId,
              },
              maxOutputTokens: 2048,
              temperature: 0.3,
              model: targetModelId,
              enableReasoning: false,
            }),
          });

          if (!response.ok) {
            if (response.status === 404) {
              serverFailed = true;
            } else {
              const errText = await response.text();
              throw new Error(`Error en servidor (${response.status}): ${errText || response.statusText}`);
            }
          } else if (!response.body) {
            serverFailed = true;
          } else {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const jsonStr = trimmed.replace(/^data:\s*/, '');
                try {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.text) {
                    accumulatedText += parsed.text;
                    scheduleAuditFlush();
                  }
                  if (parsed.error) {
                    throw new Error(parsed.error);
                  }
                } catch (parseErr: any) {
                  if (parseErr.message && !parseErr.message.includes('JSON')) {
                    throw parseErr;
                  }
                }
              }
            }
          }
        } catch (serverErr: any) {
          console.error('UI Inspector server error:', serverErr.message || serverErr);
          serverFailed = true;
        }

        if (serverFailed) {
          await executeDirectApiStream({
            messages: auditMessagePayload,
            systemInstruction: 'Actúa como un Diseñador Senior de Interfaz (UI/UX Inspector). Analiza la interfaz de la aplicación de forma crítica, constructiva y elegante.',
            provider: settings.provider,
            customConfig: {
              apiKey: settings.provider === 'gemini' 
                ? (settings.geminiApiKey || getGeminiApiKey()) 
                : settings.provider === 'alibaba'
                  ? (settings.alibabaApiKey || '')
                  : settings.customApiKey,
              baseUrl: settings.provider === 'alibaba'
                ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                : settings.customBaseUrl,
              model: targetModelId,
            },
            maxOutputTokens: 2048,
            temperature: 0.3,
            model: targetModelId,
            enableReasoning: false,
            onChunk: (chunk) => {
              accumulatedText += chunk;
              scheduleAuditFlush();
            },
          });
        }
        flushAudit();
      }
    } catch (err: any) {
      console.error('UI Inspector error:', err);
      showToast(`Error al capturar pantalla: ${err.message || String(err)}`);
      if (targetMode === 'modal') {
        setAuditError(err.message || 'Error al capturar e inspeccionar la interfaz');
      }
    } finally {
      setIsAuditing(false);
    }
  };

  const handleExportEpub = async () => {
    if (!activeChat) return;
    try {
      showToast('Encuadernando novela en .epub...');
      await exportChatToEpub(activeChat, activeFolder?.name);
      showToast('📖 Novela encuadernada con éxito en .epub');
    } catch (err: any) {
      console.error('Error exporting EPUB:', err);
      showToast(`Error al exportar EPUB: ${err.message || 'Error inesperado'}`);
    }
  };

  const handleRegenerate = () => {
    if (!activeChat || isStreaming) return;
    const msgs = activeChat.messages;
    if (msgs.length === 0) return;

    // 1. Find the last user message in the active session
    let lastUserIndex = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) return;

    const userMsg = msgs[lastUserIndex];

    // 2. Remove the trailing assistant message from the 'messages' array
    // 3. Re-trigger the generation call strictly with that last user prompt and the prior context
    // 4. Do NOT append duplicate user messages or blank entries to the history
    handleSendMessage(userMsg.content, userMsg.attachments || [], undefined, undefined, true);
  };

  const handleContinueGeneration = (messageId?: string) => {
    if (!activeChat || isStreaming) return;
    const msgs = activeChat.messages;
    if (msgs.length === 0) return;

    let targetMsg: Message | undefined;
    if (messageId) {
      targetMsg = msgs.find((m) => m.id === messageId && m.role === 'assistant');
    } else {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          targetMsg = msgs[i];
          break;
        }
      }
    }

    if (!targetMsg || !targetMsg.content.trim()) return;

    const cleanExisting = targetMsg.content
      .replace(/<<<FOLLOW_UP>>>[\s\S]*$/i, '')
      .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
      .trimEnd();

    if (!cleanExisting) return;

    showToast('▶️ Continuando respuesta desde donde se cortó...');
    handleSendMessage('Continúa.', [], targetMsg.id, false, false, cleanExisting);
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    if (!activeChat) return;

    // Force reset streaming and abort hanging requests so editing is NEVER blocked
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);

    const msgIndex = activeChat.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const existingAtts = activeChat.messages[msgIndex].attachments || [];
    // Rewind conversation to this point (up to edited message)
    const truncated = activeChat.messages.slice(0, msgIndex);
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id ? { ...c, messages: truncated } : c
      )
    );

    // Resubmit immediately with new content
    handleSendMessage(newContent, existingAtts);
  };

  // Find folder for modal
  const targetFolderForModal =
    folders.find((f) => f.id === activeFolderModalId) ||
    (activeFolderModalId === 'general'
      ? {
          id: 'general',
          name: activeChat?.title || 'Contexto de la Conversación',
          description: 'Documentos activos y lore de esta sesión',
          systemPrompt: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      : undefined);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-[#09090b] text-zinc-100 font-sans antialiased relative pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] select-none overscroll-none"
    >
      {/* Invisible mobile edge gesture touch target for opening sidebar */}
      {!isSidebarOpen && (
        <div
          className="fixed inset-y-0 left-0 w-7 z-40 md:hidden pointer-events-auto"
          aria-hidden="true"
        />
      )}

      {/* Noir Sidebar with Touch Edge-Swipe and Motion */}
      <Sidebar
        folders={folders}
        chats={chats}
        loreFiles={loreFiles}
        activeChatId={activeChatId}
        activeFolderId={activeChat?.folderId || null}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onOpenFolderManager={(fId) => setActiveFolderModalId(fId)}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onDeleteChat={handleDeleteChat}
        onMoveChat={handleMoveChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenMediaGallery={() => setIsMediaGalleryOpen(true)}
        onOpenStats={() => setIsStatsOpen(true)}
        sessionMediaCount={sessionMedia.length}
      />

      {/* Main Chat Viewport */}
      <main className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-[#09090b] dark:bg-[#09090b] relative overscroll-none transition-colors">
        {/* Header Contract with 1M Token Gauge and Collision Fix */}
        <ChatHeader
          chat={activeChat}
          folder={activeFolder}
          folders={folders}
          availableLoreFiles={currentFolderLoreFiles}
          sessionMediaCount={sessionMedia.length}
          totalContextTokens={totalContextTokens}
          settings={settings}
          currentProvider={settings.provider}
          onSelectQuickModel={(prov, mod) => {
            setSettings(prev => {
              const updated = {
                ...prev,
                autoModelRouting: false,
                provider: prov,
                ...(prov === 'gemini' 
                  ? { geminiModel: mod } 
                  : prov === 'alibaba'
                    ? { alibabaModel: mod }
                    : { customModel: mod })
              };
              saveSettings(updated);
              showToast(
                prov === 'gemini' 
                  ? 'Cambiado a Google Gemini' 
                  : prov === 'alibaba'
                    ? `Cambiado a Alibaba Cloud (${mod})`
                    : `Cambiado a NVIDIA NIM (${mod})`
              );
              return updated;
            });
          }}
          onToggleAutoRouting={(enabled) => {
            setSettings((prev) => {
              const updated: AppSettings = {
                ...prev,
                autoModelRouting: enabled,
              };
              saveSettings(updated);
              showToast(
                enabled
                  ? '✦ Modo Automático activado (Qwen 3.8 Max 0902 · Kimi K3 · Flash · 3.7 Plus)'
                  : 'Modo Automático desactivado (Selección manual)'
              );
              return updated;
            });
          }}
          onUpdateProvider={(newProvider, newModel) => {
            setSettings((prev) => {
              const updated: AppSettings = {
                ...prev,
                provider: newProvider,
                ...(newProvider === 'gemini' 
                  ? { geminiModel: newModel } 
                  : newProvider === 'alibaba'
                    ? { alibabaModel: newModel }
                    : { customModel: newModel }),
              };
              saveSettings(updated);
              showToast(
                `Modelo activo: ${
                  newProvider === 'gemini' 
                    ? 'Gemini 3.6 Flash' 
                    : newProvider === 'alibaba'
                      ? (newModel || 'Qwen 3.8 Max')
                      : 'NVIDIA NIM'
                }`
              );
              return updated;
            });
          }}
          isAuditingLore={isAuditing}
          isAuditFinished={isAuditFinished}
          isLightMode={isLightMode}
          onToggleTheme={() => setIsLightMode(!isLightMode)}
          reasoningMode={settings.reasoningMode || 'off'}
          onToggleReasoning={(newMode) => {
            setSettings((prev) => {
              const updated: AppSettings = {
                ...prev,
                reasoningMode: newMode,
                enableReasoning: newMode !== 'off',
                thinkingBudget: newMode === 'off' ? 0 : newMode === 'light' ? 1024 : -1,
              };
              saveSettings(updated);
              showToast(
                newMode === 'off'
                  ? '⚡ Razonamiento: Rápido (0s)'
                  : newMode === 'light'
                  ? '💡 Razonamiento: Equilibrado (1k)'
                  : '🧠 Razonamiento: Profundo (Full)'
              );
              return updated;
            });
          }}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onOpenMediaGallery={() => setIsMediaGalleryOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenStats={() => setIsStatsOpen(true)}
          onAuditScene={handleAuditScene}
          onInspectUI={() => handleInspectUI('chat')}
          onOpenFolderManager={(fId) => setActiveFolderModalId(fId)}
          onUpdateChatTitle={handleUpdateChatTitle}
          onToggleLoreFile={handleToggleLoreFile}
          onMoveChat={handleMoveChat}
          onExportChat={handleExportChat}
          onExportEpub={handleExportEpub}
          onExportChatToDrive={handleExportChatToDrive}
          onClearChat={handleClearChat}
          onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
          onStartVoiceCall={() => setIsVoiceCallOpen(true)}
        />

        {/* Message Feed Canvas */}
        <ChatArea
          ref={chatAreaRef}
          chat={activeChat}
          folder={activeFolder}
          loreFiles={loreFiles}
          isStreaming={isStreaming}
          isAuditingLore={isAuditing}
          toastMessage={toastMessage}
          onRegenerate={handleRegenerate}
          onContinueMessage={handleContinueGeneration}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onSelectVariant={handleSelectVariant}
          onAuditScene={handleAuditScene}
          onIllustrateScene={handleIllustrateScene}
          onOpenImageLightbox={(img) => setActiveLightboxImage(img)}
          onQuickPrompt={(prompt) => handleSendMessage(prompt, [])}
          onOpenFolderManager={() => {
            if (activeFolder) setActiveFolderModalId(activeFolder.id);
          }}
          onShowToast={showToast}
          onApplyGlobalPersona={handleApplyGlobalPersona}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenDocumentPreview={handleOpenDocumentPreview}
          onSwitchProvider={(prov, mod) => {
            setSettings((prev) => {
              const updated = {
                ...prev,
                provider: prov,
                ...(prov === 'gemini' 
                  ? { geminiModel: mod || 'gemini-3.6-flash' } 
                  : prov === 'alibaba'
                    ? { alibabaModel: mod || 'qwen3.8-max' }
                    : { customModel: mod || 'moonshotai/kimi-k3' }),
              };
              saveSettings(updated);
              showToast(
                prov === 'gemini' 
                  ? 'Cambiado a Google Gemini' 
                  : prov === 'alibaba'
                    ? `Cambiado a Alibaba Cloud (${mod || 'Qwen 3.8'})`
                    : 'Cambiado a Kimi K3 (NVIDIA)'
              );
              return updated;
            });
          }}
        />

        {/* Floating Input Bar with Attachment Popover Menu */}
        {activeChat && (
          <ChatInput
            onSendMessage={(content, attachments, webSearch) =>
              handleSendMessage(content, attachments, undefined, webSearch)
            }
            onStopGeneration={handleStopGeneration}
            isStreaming={isStreaming}
            activeLoreFilesCount={activeLoreFilesCount}
            totalLoreFilesCount={currentFolderLoreFiles.length}
            onAttachDocumentToContext={handleAttachDocumentToContext}
            onOpenLoreSelector={() => {
              if (activeFolder) {
                setActiveFolderModalId(activeFolder.id);
              } else {
                setActiveFolderModalId('general');
              }
            }}
            onOpenMediaGallery={() => setIsMediaGalleryOpen(true)}
            onOpenTextImportModal={() => setIsTextImportModalOpen(true)}
            onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
            onStartVoiceCall={() => setIsVoiceCallOpen(true)}
            onOpenImageLightbox={(img) => setActiveLightboxImage(img)}
            onOpenDocumentPreview={handleOpenDocumentPreview}
            onAttachSessionMedia={handleAttachSessionMedia}
            isVisionCapable={isVisionCapable}
            isWebSearchEnabled={isWebSearchEnabled}
            onToggleWebSearch={() => {
              setIsWebSearchEnabled((prev) => {
                const next = !prev;
                showToast(
                  next
                    ? 'Búsqueda Web en Vivo activada (Google Search Grounding)'
                    : 'Búsqueda Web en Vivo desactivada'
                );
                return next;
              });
            }}
            reasoningMode={settings.reasoningMode || (settings.enableReasoning === false ? 'off' : 'deep')}
            onCycleReasoningMode={() => {
              setSettings((prev) => {
                const current = prev.reasoningMode || (prev.enableReasoning === false ? 'off' : 'deep');
                const nextMode: 'off' | 'light' | 'deep' = current === 'deep' ? 'off' : 'deep';
                const updated: AppSettings = {
                  ...prev,
                  reasoningMode: nextMode,
                  enableReasoning: nextMode === 'deep',
                  thinkingBudget: nextMode === 'deep' ? 4096 : 0,
                };
                saveSettings(updated);
                showToast(
                  nextMode === 'deep'
                    ? '⏳ Pensar más: ACTIVADO (Razonamiento profundo • 4096 tokens)'
                    : '⚡ Pensar más: DESACTIVADO (Respuesta directa • 0s)'
                );
                return updated;
              });
            }}
            onShowWarningToast={showToast}
            onFocusInput={() => chatAreaRef.current?.scrollToBottom()}
            onInspectUI={() => handleInspectUI('chat')}
            onOpenKZShortcuts={() => handleInspectUI('chat')}
            onRegisterAttach={(fn) => {
              attachSessionMediaRef.current = fn;
            }}
          />
        )}
      </main>

      {/* Folder Directives & Lore Storage Modal */}
      <ErrorBoundary fallbackTitle="Error al abrir el gestor de arco">
        {targetFolderForModal && (
          <FolderModal
            folder={targetFolderForModal}
            loreFiles={loreFiles}
            isOpen={Boolean(activeFolderModalId)}
            onClose={() => setActiveFolderModalId(null)}
            onUpdateFolder={handleUpdateFolder}
            onAddLoreFiles={handleAddLoreFiles}
            onUpdateLoreFile={handleUpdateLoreFile}
            onDeleteLoreFile={handleDeleteLoreFile}
            selectedLoreFileIds={activeChat?.selectedLoreFileIds || []}
            onToggleLoreFile={handleToggleLoreFile}
            onSelectAllLoreFiles={handleSelectAllLoreFiles}
            onDeselectAllLoreFiles={handleDeselectAllLoreFiles}
            activeChatId={activeChat?.id}
          />
        )}
      </ErrorBoundary>

      {/* Session Media Gallery (La Cajita) Modal */}
      <ErrorBoundary fallbackTitle="Error en la galería multimedia">
        <SessionMediaGalleryModal
          isOpen={isMediaGalleryOpen}
          onClose={() => setIsMediaGalleryOpen(false)}
          media={sessionMedia}
          onDeleteMedia={handleDeleteSessionMedia}
          onAttachMedia={(att) => {
            attachSessionMediaRef.current?.(att);
            showToast("Imagen adjunta desde La Cajita");
          }}
          onAddMedia={handleAttachSessionMedia}
          alibabaApiKey={settings.alibabaApiKey}
          activeChatId={activeChat?.id}
        />
      </ErrorBoundary>

      {/* Model & Smart Memory Settings Modal with Dynamic NVIDIA NIM Discovery & Search */}
      <ErrorBoundary fallbackTitle="Error en el panel de configuración de modelos">
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSaveSettings={setSettings}
          onStartPersonaWizard={handleStartPersonaWizard}
          activeChat={activeChat}
          onUpdateChatSessionSummary={(chatId, summary, summarizedCount) => {
            setChats((prev) => {
              const updated = prev.map((c) => {
                if (c.id !== chatId) return c;
                const nextChat: Chat = {
                  ...c,
                  sessionSummary: summary || undefined,
                  summarizedUpToCount: summary ? summarizedCount : 0,
                  updatedAt: Date.now(),
                };
                if (user?.uid) {
                  syncChatToFirestore(user.uid, nextChat);
                }
                return nextChat;
              });
              saveChats(updated);
              return updated;
            });
            showToast('Resumen de sesión actualizado');
          }}
        />
      </ErrorBoundary>

      {/* Standalone Lightbox with Zoom Controls */}
      <ErrorBoundary fallbackTitle="Error en la previsualización de imagen">
        <ImageLightbox
          image={activeLightboxImage}
          onClose={() => setActiveLightboxImage(null)}
        />
      </ErrorBoundary>

      {/* Standalone In-App Document & Manuscript Reader Modal */}
      <ErrorBoundary fallbackTitle="Error en la vista previa del documento">
        <DocumentPreviewModal
          isOpen={Boolean(previewDocument)}
          onClose={() => setPreviewDocument(null)}
          document={previewDocument}
          onShowToast={showToast}
        />
      </ErrorBoundary>

      {/* Create Folder Modal */}
      <PromptModal
        isOpen={isCreateFolderModalOpen}
        title="Nuevo Arco / Carpeta"
        description="Introduce el nombre del nuevo arco narrativo o proyecto:"
        placeholder="p. ej. Volumen II: Tokio Crepúsculo"
        confirmLabel="Crear Arco"
        onConfirm={(name) => {
          const newFolder: Folder = {
            id: `fld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: name.trim(),
            systemPrompt: `ENTORNO: Describe el mundo y el tono del arco.\nTONO: Prosa literaria, concisa y cuidada.\nREGLAS:\n1. Adherirse a las directivas del sistema y el lore activo.`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setFolders((prev) => {
            const updated = [...prev, newFolder];
            saveFolders(updated);
            return updated;
          });
          setActiveFolderModalId(newFolder.id);
          showToast('Arco creado');
        }}
        onClose={() => setIsCreateFolderModalOpen(false)}
      />

      {/* Rename Folder Modal */}
      <PromptModal
        isOpen={Boolean(folderToRename)}
        title="Renombrar Arco"
        description="Modifica el título del arco:"
        initialValue={folderToRename?.name || ''}
        confirmLabel="Guardar"
        onConfirm={(newName) => {
          if (folderToRename) {
            setFolders((prev) => {
              const updated = prev.map((f) =>
                f.id === folderToRename.id ? { ...f, name: newName.trim(), updatedAt: Date.now() } : f
              );
              saveFolders(updated);
              return updated;
            });
            setFolderToRename(null);
            showToast('Arco renombrado');
          }
        }}
        onClose={() => setFolderToRename(null)}
      />

      {/* Clear Chat Confirmation Modal */}
      <ConfirmModal
        isOpen={isClearChatConfirmOpen}
        title="¿Vaciar conversación?"
        description="¿Estás seguro de que deseas eliminar todos los mensajes de esta conversación? Esta acción no se puede deshacer."
        confirmLabel="Vaciar"
        onConfirm={() => {
          if (activeChat) {
            setChats((prev) => {
              const updated = prev.map((c) =>
                c.id === activeChat.id ? { ...c, messages: [], updatedAt: Date.now() } : c
              );
              saveChats(updated);
              return updated;
            });
            showToast('Conversación vaciada');
          }
          setIsClearChatConfirmOpen(false);
        }}
        onClose={() => setIsClearChatConfirmOpen(false)}
      />

      {/* RikkaHub Inspired Statistics & Activity Heatmap Dashboard */}
      <ErrorBoundary fallbackTitle="Error al abrir las estadísticas">
        <StatsModal
          isOpen={isStatsOpen}
          onClose={() => setIsStatsOpen(false)}
          stats={stats}
          chats={chats}
          loreFiles={loreFiles}
          onResetStats={() => {
            const clean = resetStatistics();
            setStats(clean);
            showToast('Métricas reiniciadas a cero');
          }}
        />
      </ErrorBoundary>

      {/* Resilient Error Recovery & Diagnostic "Copiar Reporte" Modal */}
      <ErrorBoundary fallbackTitle="Error en el diagnóstico de errores">
        <ErrorDiagnosticModal
          isOpen={Boolean(errorDiagnostic)}
          onClose={() => setErrorDiagnostic(null)}
          errorInfo={errorDiagnostic}
          onRetry={handleRegenerate}
          onSwitchToGeminiFlash={() => {
            const updatedSettings: AppSettings = {
              ...settings,
              provider: 'gemini',
              geminiModel: 'gemini-3.5-flash',
            };
            setSettings(updatedSettings);
            saveSettings(updatedSettings);
            showToast('Cambiado a gemini-3.5-flash (Alta Disponibilidad)');
            setTimeout(() => {
              handleRegenerate();
            }, 100);
          }}
          onShowToast={showToast}
        />
      </ErrorBoundary>

      {/* Lore Storage & Scene Audit Modal */}
      <ErrorBoundary fallbackTitle="Error en la auditoría de escena">
        <LoreAuditorModal
          isOpen={isAuditModalOpen}
          isAuditing={isAuditing}
          auditResult={auditResult || ''}
          auditError={auditError}
          onClose={() => setIsAuditModalOpen(false)}
          onInspectUI={() => handleInspectUI('modal')}
          onReaudit={(prov, mod, sm) => handleAuditScene(undefined, prov, mod, sm)}
          chats={chats}
          loreFiles={loreFiles}
          onBatchAudit={(chatIds, prov, mod, sm) => handleBatchAudit(chatIds, prov, mod, sm)}
          activeProvider={settings.provider}
          activeModel={
            settings.provider === 'alibaba'
              ? settings.alibabaModel
              : settings.provider === 'custom'
                ? settings.customModel
                : settings.geminiModel
          }
        />
      </ErrorBoundary>

      {/* Google Drive Direct Chat & Project Lore Modal */}
      <ErrorBoundary fallbackTitle="Error al abrir Google Drive">
        <GoogleDriveModal
          isOpen={isGoogleDriveOpen}
          onClose={() => setIsGoogleDriveOpen(false)}
          folderId={activeFolder?.id || activeChat?.folderId || 'general'}
          defaultMode="chat"
          onImportLoreFiles={(files) => {
            handleAddLoreFiles(files);
            showToast(`📚 ${files.length} archivo(s) de Google Drive importados a Lore`);
          }}
          onImportToChat={(atts) => {
            atts.forEach((a) => attachSessionMediaRef.current?.(a));
            showToast(`📎 ${atts.length} capítulo(s) de Google Drive adjuntados al chat`);
          }}
        />
      </ErrorBoundary>

      {/* Hands-Free Omni Live Voice Call Modal */}
      <ErrorBoundary fallbackTitle="Error en Llamada Omni">
        <VoiceCallModal
          isOpen={isVoiceCallOpen}
          onClose={() => {
            voiceReplyCallbackRef.current = null;
            setIsVoiceCallOpen(false);
          }}
          activeModelName={
            settings.provider === 'alibaba'
              ? (settings.alibabaModel || 'qwen3.8-omni-flash')
              : settings.provider === 'custom'
                ? (settings.customModel || 'moonshotai/kimi-k3')
                : (settings.geminiModel || 'gemini-3.6-flash')
          }
          activeProvider={settings.provider}
          alibabaApiKey={settings.alibabaApiKey}
          onStopGeneration={handleStopGeneration}
          onSendVoiceTurn={(spokenPrompt, onResponseReady, onError) => {
            voiceReplyCallbackRef.current = onResponseReady;
            handleSendMessage(spokenPrompt, []).catch((err) => {
              voiceReplyCallbackRef.current = null;
              onError(err?.message || 'Error en la llamada');
            });
          }}
        />
      </ErrorBoundary>

      {/* Quick Google Docs / Text Import Modal */}
      {isTextImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-xs modal-backdrop-fluid select-none">
          <div className="flex flex-col w-full max-w-xl bg-[#0a0a0e] border border-[#22222a] rounded-2xl shadow-2xl text-white overflow-hidden modal-sheet-fluid">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c24] bg-[#0d0d12]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#181822] border border-[#282834] flex items-center justify-center text-blue-400">
                  <FileUp size={16} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Importar Google Docs / Manuscrito
                  </h3>
                  <p className="text-[11px] text-[#71717a]">
                    Pega texto directamente a Docs en Contexto sin límites de móvil
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTextImportModalOpen(false)}
                className="p-1.5 text-[#71717a] hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#a1a1aa] mb-1.5">
                  Título del documento o capítulo
                </label>
                <input
                  type="text"
                  value={importDocTitle}
                  onChange={(e) => setImportDocTitle(e.target.value)}
                  placeholder="Ej: Capítulo 1 - La Torre en Penumbras"
                  className="w-full bg-[#121218] border border-[#22222a] focus:border-blue-500/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#52525b] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#a1a1aa] mb-1.5">
                  Contenido del documento / Manuscrito
                </label>
                <textarea
                  value={importDocContent}
                  onChange={(e) => setImportDocContent(e.target.value)}
                  placeholder="Pega aquí el contenido de tu Google Doc o archivo de texto..."
                  rows={8}
                  className="w-full bg-[#121218] border border-[#22222a] focus:border-blue-500/60 rounded-xl p-3.5 text-xs text-white placeholder-[#52525b] focus:outline-none resize-none transition-colors leading-relaxed font-sans"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#1c1c24] bg-[#0d0d12]">
              <span className="text-[10px] font-mono text-[#71717a]">
                {importDocContent.trim()
                  ? `${importDocContent.trim().split(/\s+/).length.toLocaleString()} palabras`
                  : 'Listo para importar'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTextImportModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#272731] bg-[#101014] text-xs font-medium text-[#a1a1aa] hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveTextImport}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors cursor-pointer shadow-sm"
                >
                  Guardar en Docs en Contexto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global In-App Document & Manuscript Reader Modal */}
      <DocumentPreviewModal
        isOpen={Boolean(previewDocument)}
        onClose={() => setPreviewDocument(null)}
        document={previewDocument}
      />
    </div>
  );
}
