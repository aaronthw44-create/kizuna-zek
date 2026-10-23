export type DocFileType = 'docx' | 'doc' | 'pdf' | 'txt' | 'md' | 'image' | 'json';

export interface Folder {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string; // Worldbuilding rules, tone, and character constraints
  createdAt: number;
  updatedAt: number;
}

export interface LoreFile {
  id: string;
  folderId: string;
  title: string;
  filename: string;
  content: string;
  fileType: DocFileType;
  size: number; // bytes
  wordCount: number;
  estimatedTokens: number;
  parseStatus?: 'ready' | 'parsing' | 'error';
  dataUrl?: string; // Image base64 dataUrl for project lore storage assets
  createdAt: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: string; // mime type
  fileType?: DocFileType;
  size?: number | string;
  content?: string; // Raw text content of document
  dataUrl?: string; // Base64 for images
  textContent?: string; // Parsed text for docx/pdf/txt/md
  wordCount?: number;
  estimatedTokens?: number;
  parseStatus?: 'ready' | 'parsing' | 'error';
  timestamp?: number;
  chatId?: string;
  messageId?: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  sourceEngine?: 'google' | 'tavily' | string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  reasoningDurationSeconds?: number;
  tokensPerSecond?: number;
  variants?: string[];
  activeVariantIndex?: number;
  timestamp: number;
  attachments?: Attachment[];
  selectedLoreIds?: string[];
  webSearchSources?: WebSearchResult[];
  webSearch?: boolean;
  isStreaming?: boolean;
  isThinking?: boolean;
  error?: string;
  estimatedTokens?: number;
  isInterrupted?: boolean;
  thinkingDuration?: number;
  thought?: string;
  ttftSeconds?: number;
  cachedTokens?: number;
  modelName?: string;
  modelId?: string;
}

export interface Chat {
  id: string;
  folderId: string | null; // null for unorganized/root
  title: string;
  messages: Message[];
  selectedLoreFileIds: string[]; // Per-chat lore selector
  sessionSummary?: string; // Libretita de resumen automático de mensajes antiguos
  summarizedUpToCount?: number; // Cantidad de mensajes antiguos ya integrados en el resumen
  createdAt: number;
  updatedAt: number;
}

export interface SmartMemory {
  id: string;
  text: string;
  timestamp: number;
  enabled: boolean;
  source: 'auto' | 'manual';
}

export interface NvidiaModelItem {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface AppSettings {
  provider: 'gemini' | 'custom' | 'alibaba';
  customApiKey: string; // NVIDIA NIM API key
  customBaseUrl: string; // default https://integrate.api.nvidia.com/v1
  customModel: string; // Dynamic model selected from fetched list
  fetchedNvidiaModels: NvidiaModelItem[];
  favoriteModelIds: string[]; // Pinned go-to models
  alibabaApiKey?: string; // Alibaba Cloud Model Studio API key
  alibabaBaseUrl?: string; // default https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
  alibabaModel?: string; // e.g. qwen-3.8-max or deepseek-k3
  fetchedAlibabaModels?: NvidiaModelItem[];
  favoriteAlibabaModelIds?: string[];
  alibabaCustomLoraModel?: string; // Custom fine-tuned / LoRA author model ID (e.g. qwen3.8-max:lora-jukkou)
  alibabaCustomLoraName?: string; // Optional display label for author LoRA
  geminiModel: string; // default gemini-3.6-flash
  geminiApiKey?: string;
  fetchedGeminiModels?: string[];
  tavilyApiKey?: string;
  maxOutputTokens: number; // 512 up to 8192
  temperature: number; // 0.1 to 1.4
  globalSystemPrompt: string;
  globalPersona?: string;
  memories: SmartMemory[];
  contextDepth: 'full' | 'quick'; // 'full' (1M Tokens) | 'quick' (Últimos 15 mensajes)
  enableWebSearch: boolean;
  enableReasoning?: boolean; // Activar Razonamiento Profundo (Chain of Thought)
  reasoningMode?: 'off' | 'light' | 'deep';
  thinkingBudget?: number;
  userProfile?: {
    nickname?: string;
    occupation?: string;
    aboutMe?: string;
  };
  personalityConfig?: {
    warmth?: 'default' | 'warm' | 'neutral' | 'cold';
    enthusiasm?: 'default' | 'high' | 'dry';
    formatting?: 'default' | 'prose_only' | 'structured';
    emojiUsage?: 'default' | 'natural' | 'minimal' | 'none';
    customInstructions?: string;
  };
  enableMemoryToggle?: boolean;
}

export interface AppStatistics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  appLaunchCount: number;
  dailyActivity: Record<string, number>; // "YYYY-MM-DD" -> count
}

export interface ApiErrorInfo {
  message: string;
  status?: number | string;
  engine: 'gemini' | 'nvidia' | 'alibaba';
  modelId: string;
  isVisionModel: boolean;
  hadAttachments: boolean;
  attachmentTypes?: string[];
  timestamp: string | number;
  rawError?: string;
  // Optional backward compatibility fields
  error?: string;
  model?: string;
  provider?: string;
  hasImages?: boolean;
  attachmentsCount?: number;
  promptLength?: number;
  temperature?: number;
  maxTokens?: number;
}

export type ErrorDiagnosticInfo = ApiErrorInfo;

