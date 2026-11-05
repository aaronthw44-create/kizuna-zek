import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  BookOpen,
  Upload,
  Plus,
  Trash2,
  FileText,
  Save,
  Download,
  AlertCircle,
  FileCode,
  Check,
  Eye,
  Loader2,
  Scissors,
  Zap,
  Sparkles,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { Folder, LoreFile, DocFileType, Attachment } from '../types';
import { parseDocumentFile, splitManuscriptIntoChapters, ChapterSplitItem } from '../utils/documentParser';
import { GoogleDriveModal } from './GoogleDriveModal';

const MAX_LORE_FILES = 200;

interface FolderModalProps {
  folder: Folder;
  loreFiles: LoreFile[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateFolder: (updated: Folder) => void;
  onAddLoreFiles: (files: Array<Omit<LoreFile, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  onUpdateLoreFile: (file: LoreFile) => void;
  onDeleteLoreFile: (loreId: string) => void;
  selectedLoreFileIds?: string[];
  onToggleLoreFile?: (chatId: string, loreId: string) => void;
  onSelectAllLoreFiles?: (chatId: string, loreIds: string[]) => void;
  onDeselectAllLoreFiles?: (chatId: string) => void;
  activeChatId?: string | null;
}

export const FolderModal: React.FC<FolderModalProps> = ({
  folder,
  loreFiles,
  isOpen,
  onClose,
  onUpdateFolder,
  onAddLoreFiles,
  onUpdateLoreFile,
  onDeleteLoreFile,
  selectedLoreFileIds = [],
  onToggleLoreFile,
  onSelectAllLoreFiles,
  onDeselectAllLoreFiles,
  activeChatId,
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'lore'>('prompt');
  const [name, setName] = useState(folder.name);
  const [description, setDescription] = useState(folder.description || '');
  const [systemPrompt, setSystemPrompt] = useState(folder.systemPrompt || '');
  const [isSavedNotice, setIsSavedNotice] = useState(false);
  const [isParsingFiles, setIsParsingFiles] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // New lore file creation state
  const [isCreatingLore, setIsCreatingLore] = useState(false);
  const [newLoreTitle, setNewLoreTitle] = useState('');
  const [newLoreFilename, setNewLoreFilename] = useState('');
  const [newLoreContent, setNewLoreContent] = useState('');

  // Editing existing lore file state
  const [editingLore, setEditingLore] = useState<LoreFile | null>(null);
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false);
  const [deletingLoreId, setDeletingLoreId] = useState<string | null>(null);

  // Chapter Auto-Splitter Modal State
  const [splitDialog, setSplitDialog] = useState<{
    isOpen: boolean;
    chapters: ChapterSplitItem[];
    sourceName: string;
    rawItem?: Omit<LoreFile, 'id' | 'createdAt' | 'updatedAt'>;
  } | null>(null);

  const [isManualSplitterOpen, setIsManualSplitterOpen] = useState(false);
  const [manualSplitText, setManualSplitText] = useState('');
  const [manualSplitPreview, setManualSplitPreview] = useState<ChapterSplitItem[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const folderLoreFiles = loreFiles.filter((l) => l.folderId === folder.id);
  const totalWords = folderLoreFiles.reduce((acc, f) => acc + f.wordCount, 0);
  const totalTokens = folderLoreFiles.reduce((acc, f) => acc + (f.estimatedTokens || 0), 0);
  const isAtCapacity = folderLoreFiles.length >= MAX_LORE_FILES;

  const handleConfirmSplitImport = (chapters: ChapterSplitItem[]) => {
    const slots = MAX_LORE_FILES - folderLoreFiles.length;
    if (slots <= 0) {
      alert(`Capacidad máxima de ${MAX_LORE_FILES} documentos alcanzada.`);
      return;
    }
    const chaptersToImport = chapters.slice(0, slots);
    const newItems: Array<Omit<LoreFile, 'id' | 'createdAt' | 'updatedAt'>> = chaptersToImport.map((ch) => ({
      folderId: folder.id,
      title: ch.title,
      filename: ch.filename,
      content: ch.content,
      fileType: 'md',
      size: new Blob([ch.content]).size,
      wordCount: ch.wordCount,
      estimatedTokens: ch.estimatedTokens,
      parseStatus: 'ready',
    }));

    onAddLoreFiles(newItems);
    setSplitDialog(null);
    setIsManualSplitterOpen(false);
    setManualSplitText('');
    setManualSplitPreview(null);
  };

  const handleDirectPasteText = (content: string, customTitle?: string) => {
    if (!content.trim()) return;
    const remainingSlots = MAX_LORE_FILES - folderLoreFiles.length;
    if (remainingSlots <= 0) {
      alert(`Capacidad máxima de ${MAX_LORE_FILES} documentos alcanzada.`);
      return;
    }

    // Check if this pasted text contains a full manuscript with multiple chapters
    const detectedChapters = splitManuscriptIntoChapters(content);
    if (detectedChapters && detectedChapters.length >= 2) {
      setSplitDialog({
        isOpen: true,
        chapters: detectedChapters,
        sourceName: customTitle || 'Texto Pegado (Docs)',
      });
      return;
    }

    const firstLine = content.trim().split('\n')[0].replace(/^[#*\s-]+/, '').trim();
    const title =
      customTitle?.trim() ||
      (firstLine.length > 2 && firstLine.length < 50
        ? firstLine
        : `Capítulo ${folderLoreFiles.length + 1}`);
    const filename = `${title
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 32)}.md`;
    const words = content.trim().split(/\s+/).length;
    const tokens = Math.max(1, Math.round(content.length / 3.8));

    onAddLoreFiles([
      {
        folderId: folder.id,
        title,
        filename,
        content: content.trim(),
        fileType: 'md',
        size: new Blob([content]).size,
        wordCount: words,
        estimatedTokens: tokens,
        parseStatus: 'ready',
      },
    ]);
  };

  const handleSavePrompt = () => {
    onUpdateFolder({
      ...folder,
      name: name.trim() || folder.name,
      description: description.trim(),
      systemPrompt,
      updatedAt: Date.now(),
    });
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_LORE_FILES - folderLoreFiles.length;
    if (remainingSlots <= 0) {
      alert(`Maximum capacity of ${MAX_LORE_FILES} lore files reached for this folder.`);
      return;
    }

    setIsParsingFiles(true);
    setParseError(null);

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    const newItems: Array<Omit<LoreFile, 'id' | 'createdAt' | 'updatedAt'>> = [];

    try {
      for (const file of filesToProcess) {
        const parsed = await parseDocumentFile(file);
        const title = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

        // Check if this document contains an entire novel / multi-chapter manuscript
        const detectedChapters = splitManuscriptIntoChapters(parsed.text);
        if (detectedChapters && detectedChapters.length >= 2 && filesToProcess.length === 1) {
          setIsParsingFiles(false);
          setSplitDialog({
            isOpen: true,
            chapters: detectedChapters,
            sourceName: file.name,
            rawItem: {
              folderId: folder.id,
              title: title.charAt(0).toUpperCase() + title.slice(1),
              filename: file.name,
              content: parsed.text,
              fileType: parsed.fileType,
              dataUrl: parsed.dataUrl,
              size: file.size,
              wordCount: parsed.wordCount,
              estimatedTokens: parsed.estimatedTokens,
              parseStatus: 'ready',
            },
          });
          return;
        }

        newItems.push({
          folderId: folder.id,
          title: title.charAt(0).toUpperCase() + title.slice(1),
          filename: file.name,
          content: parsed.text,
          fileType: parsed.fileType,
          dataUrl: parsed.dataUrl,
          size: file.size,
          wordCount: parsed.wordCount,
          estimatedTokens: parsed.estimatedTokens,
          parseStatus: 'ready',
        });
      }

      onAddLoreFiles(newItems);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setParseError(err.message || 'Error parsing uploaded documents');
    } finally {
      setIsParsingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateNewLore = () => {
    if (!newLoreTitle.trim() || !newLoreContent.trim()) return;

    if (folderLoreFiles.length >= MAX_LORE_FILES) {
      alert(`Maximum capacity of ${MAX_LORE_FILES} lore files reached for this folder.`);
      return;
    }

    const filename = newLoreFilename.trim()
      ? newLoreFilename.trim().endsWith('.md')
        ? newLoreFilename.trim()
        : `${newLoreFilename.trim()}.md`
      : `${newLoreTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.md`;

    const words = newLoreContent.trim().split(/\s+/).length;
    const tokens = Math.max(1, Math.round(newLoreContent.length / 3.8));

    onAddLoreFiles([
      {
        folderId: folder.id,
        title: newLoreTitle.trim(),
        filename,
        content: newLoreContent,
        fileType: 'md',
        size: new Blob([newLoreContent]).size,
        wordCount: words,
        estimatedTokens: tokens,
        parseStatus: 'ready',
      },
    ]);

    setNewLoreTitle('');
    setNewLoreFilename('');
    setNewLoreContent('');
    setIsCreatingLore(false);
  };

  const handleSaveEditedLore = () => {
    if (!editingLore) return;
    const words = editingLore.content.trim().split(/\s+/).length;
    const tokens = Math.max(1, Math.round(editingLore.content.length / 3.8));

    onUpdateLoreFile({
      ...editingLore,
      size: new Blob([editingLore.content]).size,
      wordCount: words,
      estimatedTokens: tokens,
      updatedAt: Date.now(),
    });
    setEditingLore(null);
  };

  const handleDownloadLore = (file: LoreFile) => {
    const blob = new Blob([file.content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderBadge = (fileType: DocFileType) => {
    const badgeText = fileType.toUpperCase();
    const colorClass =
      fileType === 'docx' || fileType === 'doc'
        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
        : fileType === 'pdf'
        ? 'bg-red-500/10 border-red-500/30 text-red-400'
        : fileType === 'image'
        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
        : 'bg-[#1c1c20] border-[#2b2b30] text-[#d4d4d8]';
    return (
      <span className={`text-[10px] font-mono px-1.5 py-0.2 border rounded ${colorClass}`}>
        [{badgeText}]
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-xs modal-backdrop-fluid">
      <div
        className="flex flex-col w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] bg-[#09090b] border border-[#1f1f23] rounded-2xl shadow-2xl text-white overflow-hidden modal-sheet-fluid"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#18181c] bg-[#070709]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-[#121215] border border-[#222226] flex items-center justify-center text-white shrink-0">
              <BookOpen size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-semibold text-white tracking-tight truncate">
                {folder.name}
              </h2>
              <p className="text-[11px] sm:text-xs text-[#a1a1aa] truncate">
                Arc Worldbuilding & Lore Storage Architecture
              </p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onClose}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#71717a] hover:text-white rounded-md hover:bg-[#161619] active:scale-95 transition-transform shrink-0"
          >
            <X size={18} />
          </motion.button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-[#0b0b0e] border-b border-[#18181c] overflow-x-auto">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setActiveTab('prompt')}
            className={`min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-md transition-colors shrink-0 flex items-center justify-center ${
              activeTab === 'prompt'
                ? 'bg-white text-black'
                : 'text-[#a1a1aa] hover:text-white hover:bg-[#141418]'
            }`}
          >
            Folder System Prompt
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setActiveTab('lore')}
            className={`min-h-[44px] flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors shrink-0 justify-center ${
              activeTab === 'lore'
                ? 'bg-white text-black'
                : 'text-[#a1a1aa] hover:text-white hover:bg-[#141418]'
            }`}
          >
            <span>Lore Storage</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                activeTab === 'lore'
                  ? 'bg-black text-white'
                  : 'bg-[#1c1c20] text-[#a1a1aa]'
              }`}
            >
              {folderLoreFiles.length}/{MAX_LORE_FILES}
            </span>
          </motion.button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 smooth-scroll">
          {activeTab === 'prompt' ? (
            <div className="space-y-4 max-w-3xl">
              <div>
                <label className="block text-xs font-medium text-[#d4d4d8] mb-1.5">
                  Arc Title / Folder Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#101014] border border-[#1f1f23] rounded-md px-3 py-2 text-[16px] md:text-xs text-white placeholder-[#71717a] focus:outline-none focus:border-[#38383e]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#d4d4d8] mb-1.5">
                  Synopsis / Scope
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Subterranean investigation arc, chapters 1-12"
                  className="w-full bg-[#101014] border border-[#1f1f23] rounded-md px-3 py-2 text-[16px] md:text-xs text-white placeholder-[#71717a] focus:outline-none focus:border-[#38383e]"
                />
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                  <label className="block text-xs font-medium text-[#d4d4d8]">
                    Dedicated System Prompt (Novel Tone, Worldbuilding & Character Constraints)
                  </label>
                  <span className="text-[11px] font-mono text-[#71717a]">
                    Auto-injected into every chat inside this arc
                  </span>
                </div>
                <p className="text-[11px] text-[#71717a] mb-2 leading-relaxed">
                  Establish the laws of magic, technological limits, character constraints, prose pacing, and vocabulary rules. The AI will strictly honor these instructions in all chats nested inside this folder.
                </p>
                <textarea
                  rows={8}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="SETTING: Neo-Tokyo Kuroshio District...
TONE: Hardboiled noir, atmospheric light novel dialogue...
RULES:
1. Casting spells leaves ash on the fingertips.
2. Protagonist Ren is calculating and does not speak frivolously..."
                  className="w-full bg-[#0d0d10] border border-[#1f1f23] rounded-md p-3 text-[16px] md:text-xs text-white placeholder-[#52525b] font-mono leading-relaxed focus:outline-none focus:border-[#38383e]"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[#18181c]">
                <div className="flex flex-wrap items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() =>
                      setSystemPrompt(`SETTING: Subterranean Neo-Noir metropolis.
TONE: Literary noir, hardboiled dialogue, sensory precision (ozone, graphite ash, rain).
PROSE STYLE: Terse, cinematic, high contrast. Avoid purple prose or generic hero tropes.
CONSTRAINTS: Characters experience physical exhaustion from resonance casting.`)
                    }
                    className="min-h-[44px] sm:min-h-0 px-3 py-2 text-xs text-[#a1a1aa] hover:text-white bg-[#121215] hover:bg-[#1a1a1e] border border-[#222226] rounded-md transition-colors flex items-center justify-center cursor-pointer"
                  >
                    Noir Cyberpunk Preset
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() =>
                      setSystemPrompt(`SETTING: Dark fantasy cathedral ruins.
TONE: Gothic, visceral, poetic melancholy.
MAGIC SYSTEM: Blood catalysts and forgotten liturgical seals.
PACING: Methodical tension leading to sudden brutal skirmishes.`)
                    }
                    className="min-h-[44px] sm:min-h-0 px-3 py-2 text-xs text-[#a1a1aa] hover:text-white bg-[#121215] hover:bg-[#1a1a1e] border border-[#222226] rounded-md transition-colors flex items-center justify-center cursor-pointer"
                  >
                    Dark Gothic Preset
                  </motion.button>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {isSavedNotice && (
                    <span className="flex items-center gap-1 text-xs text-white font-mono">
                      <Check size={14} /> Saved
                    </span>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={handleSavePrompt}
                    className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-black bg-white hover:bg-[#e4e4e7] rounded-md transition-colors cursor-pointer"
                  >
                    <Save size={14} />
                    <span>Save Directives</span>
                  </motion.button>
                </div>
              </div>
            </div>
          ) : (
            /* Lore Storage Tab */
            <div className="space-y-4">
              {/* Lore Storage Toolbar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 bg-[#0e0e12] border border-[#1f1f23] rounded-xl">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-semibold text-white">
                      Lore Storage Vault
                    </span>
                    <span className="text-[11px] font-mono text-[#a1a1aa]">
                      ({folderLoreFiles.length} / {MAX_LORE_FILES} files)
                    </span>
                  </div>
                  <p className="text-[11px] text-[#71717a] mt-0.5">
                    Total volume: <span className="font-mono text-white">{totalWords.toLocaleString()}</span> words (~{totalTokens.toLocaleString()} tokens)
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept=".docx,.doc,.pdf,.md,.txt,.json,.markdown,image/*,.png,.jpg,.jpeg,.webp,.gif"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  {/* Auto-Divisor 1-Clic button */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => {
                      setIsManualSplitterOpen(true);
                      setManualSplitText('');
                      setManualSplitPreview(null);
                    }}
                    disabled={isAtCapacity}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 rounded-md transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
                    title="Dividir automáticamente manuscrito completo en capítulos individuales (Ahorra 95% cuota)"
                  >
                    <Scissors size={14} className="shrink-0 text-amber-400" />
                    <span className="truncate">Auto-Divisor (1-Clic)</span>
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={async () => {
                      try {
                        const clipText = await navigator.clipboard.readText();
                        if (clipText && clipText.trim()) {
                          handleDirectPasteText(clipText);
                        } else {
                          setIsCreatingLore(true);
                        }
                      } catch {
                        setIsCreatingLore(true);
                      }
                    }}
                    disabled={isAtCapacity}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-[#d4d4d8] hover:text-white bg-[#141418] hover:bg-[#1a1a1f] border border-[#242429] rounded-md transition-colors disabled:opacity-40 cursor-pointer"
                    title="Pegar capítulo copiado desde Google Docs"
                  >
                    <FileText size={14} className="shrink-0" />
                    <span className="truncate">Pegar (Docs)</span>
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setIsGoogleDriveModalOpen(true)}
                    disabled={isAtCapacity}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/40 rounded-md transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
                    title="Importar capítulos e imágenes directamente desde tu Google Drive"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                    <span className="truncate">Google Drive</span>
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAtCapacity || isParsingFiles}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-[#d4d4d8] hover:text-white bg-[#141418] hover:bg-[#1a1a1f] border border-[#242429] rounded-md transition-colors disabled:opacity-40 cursor-pointer"
                    title="Subir archivos .docx, .pdf, .md o .txt"
                  >
                    {isParsingFiles ? (
                      <Loader2 size={14} className="animate-spin text-white shrink-0" />
                    ) : (
                      <Upload size={14} className="shrink-0" />
                    )}
                    <span className="truncate">{isParsingFiles ? 'Procesando...' : 'Subir Archivo'}</span>
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setIsCreatingLore(true);
                      setEditingLore(null);
                    }}
                    disabled={isAtCapacity}
                    className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-black bg-white hover:bg-[#e4e4e7] rounded-md transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <Plus size={14} strokeWidth={2.5} className="shrink-0" />
                    <span>Nuevo Doc</span>
                  </motion.button>
                </div>
              </div>

              {/* 1-Click Jukkou No Zankyou v22 Pre-split Importer Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-amber-950/35 via-[#121018] to-[#0e0e14] border border-amber-500/35 rounded-xl">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 sm:mt-0">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-amber-200 flex items-center gap-2 flex-wrap">
                      <span>Manuscrito Oficial: Jukkou No Zankyou (v22 - Espasa Calpe 2027)</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        58 Capítulos + Ficha Listos
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Importa tus 58 capítulos ya divididos en 1 clic (~800 tokens por capítulo) para que tu cuota de Alibaba dure meses.
                    </p>
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={async () => {
                    try {
                      setIsParsingFiles(true);
                      const res = await fetch('/assets/aistudio/jukkou_chapters_v22.json');
                      if (!res.ok) throw new Error('No se pudo cargar el índice pre-dividido');
                      const chapters: ChapterSplitItem[] = await res.json();
                      setIsParsingFiles(false);
                      setSplitDialog({
                        isOpen: true,
                        chapters,
                        sourceName: 'Manuscrito_Jukkou_No_Zankyou_Espasa_Calpe_2027_v22.pdf',
                      });
                    } catch (err: any) {
                      setIsParsingFiles(false);
                      setParseError(err.message || 'Error al cargar capítulos pre-divididos');
                    }
                  }}
                  className="min-h-[40px] px-3.5 py-2 text-xs font-bold text-black bg-gradient-to-r from-amber-400 to-amber-300 hover:brightness-110 rounded-lg shrink-0 transition-all shadow-md shadow-amber-500/15 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Zap size={14} className="text-black shrink-0" />
                  <span>Cargar 58 Capítulos en 1 Clic</span>
                </motion.button>
              </div>

              {/* Drag & Drop & Direct Paste Zone for Google Docs Chapter Content */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDropzoneActive(true);
                }}
                onDragLeave={() => setIsDropzoneActive(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setIsDropzoneActive(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    await handleFileUpload({ target: { files: e.dataTransfer.files } } as any);
                    return;
                  }
                  const textData = e.dataTransfer.getData('text/plain');
                  if (textData && textData.trim()) {
                    handleDirectPasteText(textData.trim());
                  }
                }}
                className={`p-3.5 border-2 border-dashed rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left transition-colors ${
                  isDropzoneActive
                    ? 'border-white bg-[#161622]'
                    : 'border-[#22222a] hover:border-[#383842] bg-[#09090d]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-[#141418] border border-[#26262e] flex items-center justify-center text-[#a1a1aa] shrink-0">
                    <FileText size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-white">
                      Arrastrar documentos (Word, PDF, Docs) o imágenes
                    </div>
                    <div className="text-[11px] text-[#71717a]">
                      Archivos .docx, .pdf, .md, .txt o imágenes (.png, .jpg, .webp)
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text && text.trim()) {
                        handleDirectPasteText(text.trim());
                      } else {
                        setIsCreatingLore(true);
                      }
                    } catch {
                      setIsCreatingLore(true);
                    }
                  }}
                  className="min-h-[44px] w-full sm:w-auto px-3.5 py-2 bg-[#141418] hover:bg-[#1a1a20] border border-[#2b2b34] text-xs text-white rounded-md shrink-0 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FileText size={14} className="shrink-0 text-zinc-400" />
                  <span>Pegar desde Portapapeles</span>
                </button>
              </div>

              {parseError && (
                <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-900/50 text-red-300 rounded-md text-xs">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Notice if at capacity */}
              {isAtCapacity && (
                <div className="flex items-center gap-2 p-3 bg-[#141418] border border-[#2b2b30] text-[#a1a1aa] rounded-md text-xs">
                  <AlertCircle size={15} className="shrink-0 text-white" />
                  <span>Capacidad máxima alcanzada ({MAX_LORE_FILES}/{MAX_LORE_FILES} documentos de lore). Elimina alguno para agregar más.</span>
                </div>
              )}

              {/* Creator Mode / Inline Editor */}
              {isCreatingLore && (
                <div className="p-4 bg-[#101014] border border-[#242429] rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      Crear Nuevo Documento de Lore
                    </span>
                    <button
                      onClick={() => setIsCreatingLore(false)}
                      className="text-[#71717a] hover:text-white text-xs p-1"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#a1a1aa] mb-1">
                        Título del Documento
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Ficción: Los Cuervos de Plata"
                        value={newLoreTitle}
                        onChange={(e) => setNewLoreTitle(e.target.value)}
                        className="w-full bg-[#0a0a0c] border border-[#1f1f23] rounded-md px-3 py-2 text-[16px] md:text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#a1a1aa] mb-1">
                        Nombre de Archivo (opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 04_cuervos_plata.md"
                        value={newLoreFilename}
                        onChange={(e) => setNewLoreFilename(e.target.value)}
                        className="w-full bg-[#0a0a0c] border border-[#1f1f23] rounded-md px-3 py-2 text-[16px] md:text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#a1a1aa] mb-1">
                      Contenido (Formato Markdown)
                    </label>
                    <textarea
                      rows={6}
                      placeholder="# Reglas de Facción y Directorio de Miembros..."
                      value={newLoreContent}
                      onChange={(e) => setNewLoreContent(e.target.value)}
                      className="w-full bg-[#0a0a0c] border border-[#1f1f23] rounded-md p-3 text-[16px] md:text-xs text-white font-mono leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsCreatingLore(false)}
                      className="min-h-[44px] px-3 py-2 text-xs text-[#a1a1aa] hover:text-white"
                    >
                      Cancelar
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleCreateNewLore}
                      className="min-h-[44px] px-4 py-2 text-xs font-semibold text-black bg-white hover:bg-[#e4e4e7] rounded-md cursor-pointer"
                    >
                      Guardar Archivo
                    </motion.button>
                  </div>
                </div>
              )}

              {/* Editing Existing File Modal/Inline */}
              {editingLore && (
                <div className="p-4 bg-[#101014] border border-[#242429] rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white truncate max-w-[200px] sm:max-w-md">
                      Editando: {editingLore.title}
                    </span>
                    <button
                      onClick={() => setEditingLore(null)}
                      className="text-[#71717a] hover:text-white text-xs p-1"
                    >
                      Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#a1a1aa] mb-1">
                        Título del Documento
                      </label>
                      <input
                        type="text"
                        value={editingLore.title}
                        onChange={(e) =>
                          setEditingLore({ ...editingLore, title: e.target.value })
                        }
                        className="w-full bg-[#0a0a0c] border border-[#1f1f23] rounded-md px-3 py-2 text-[16px] md:text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#a1a1aa] mb-1">
                        Nombre de Archivo
                      </label>
                      <input
                        type="text"
                        value={editingLore.filename}
                        onChange={(e) =>
                          setEditingLore({ ...editingLore, filename: e.target.value })
                        }
                        className="w-full bg-[#0a0a0c] border border-[#1f1f23] rounded-md px-3 py-2 text-[16px] md:text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#a1a1aa] mb-1">
                      Contenido
                    </label>
                    <textarea
                      rows={8}
                      value={editingLore.content}
                      onChange={(e) =>
                        setEditingLore({ ...editingLore, content: e.target.value })
                      }
                      className="w-full bg-[#0a0a0c] border border-[#1f1f23] rounded-md p-3 text-[16px] md:text-xs text-white font-mono leading-relaxed"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setEditingLore(null)}
                      className="min-h-[44px] px-3 py-2 text-xs text-[#a1a1aa] hover:text-white"
                    >
                      Cancelar
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSaveEditedLore}
                      className="min-h-[44px] px-4 py-2 text-xs font-semibold text-black bg-white hover:bg-[#e4e4e7] rounded-md cursor-pointer"
                    >
                      Guardar Cambios
                    </motion.button>
                  </div>
                </div>
              )}

              {/* Active Chat Context Bar */}
              {activeChatId && onToggleLoreFile && (() => {
                const rawActiveTokens = folderLoreFiles
                  .filter((f) => selectedLoreFileIds.includes(f.id))
                  .reduce((a, f) => a + (f.estimatedTokens || 0), 0);
                const is2KShieldActive = rawActiveTokens > 1450;
                const effectiveTokens = Math.min(rawActiveTokens, 1450);
                return (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:p-3.5 bg-[#101015] border border-[#22222b] rounded-xl shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                      <Check size={14} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-2 flex-wrap">
                        <span>Inyectados en este chat:</span>
                        <span className="font-mono text-emerald-400 font-bold px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-600/40 rounded text-[11px]">
                          {selectedLoreFileIds.filter((id) => folderLoreFiles.some((f) => f.id === id)).length} de {folderLoreFiles.length}
                        </span>
                        <span className="text-[11px] font-mono text-emerald-300 font-semibold">
                          {is2KShieldActive
                            ? `🛡️ ~${effectiveTokens.toLocaleString()} tok enviados (Escudo 2K · comprimido de ${rawActiveTokens.toLocaleString()} tok)`
                            : `(~${effectiveTokens.toLocaleString()} tok activos)`}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        {is2KShieldActive
                          ? 'Escudo 2K activo: envía el Mapa de los 58 capítulos + escenas clave de tu pregunta sin superar ~2.000 tokens totales.'
                          : 'Inyecta solo el capítulo actual (~800 tok) o marca Todos con el Escudo 2K (~2.000 tok máx).'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {onSelectAllLoreFiles && folderLoreFiles.length > 0 && (
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={() => {
                          const chapterFiles = folderLoreFiles.filter(
                            (f) => f.fileType === 'md' || /^\d+_/i.test(f.filename) || (f.estimatedTokens || 0) < 15000
                          );
                          const pool = chapterFiles.length > 0 ? chapterFiles : folderLoreFiles;
                          const sorted = [...pool].sort((a, b) => {
                            const numA = parseInt(a.filename.match(/^\d+/)?.[0] || '0', 10);
                            const numB = parseInt(b.filename.match(/^\d+/)?.[0] || '0', 10);
                            if (numA !== numB) return numA - numB;
                            return a.filename.localeCompare(b.filename);
                          });
                          const latest = sorted[sorted.length - 1];
                          if (latest) {
                            (onSelectAllLoreFiles as any)(activeChatId, [latest.id], true);
                          }
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-xs text-amber-300 font-semibold transition-colors cursor-pointer flex items-center gap-1 active:scale-95 shadow-xs"
                        title="Inyectar únicamente el último capítulo de la novela (Ignora PDFs masivos)"
                      >
                        <Zap size={13} className="text-amber-400 shrink-0" />
                        <span>Solo Actual</span>
                      </motion.button>
                    )}
                    {onSelectAllLoreFiles && folderLoreFiles.length > 2 && (
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={() => {
                          const chapterFiles = folderLoreFiles.filter(
                            (f) => f.fileType === 'md' || /^\d+_/i.test(f.filename) || (f.estimatedTokens || 0) < 15000
                          );
                          const pool = chapterFiles.length > 0 ? chapterFiles : folderLoreFiles;
                          const sorted = [...pool].sort((a, b) => {
                            const numA = parseInt(a.filename.match(/^\d+/)?.[0] || '0', 10);
                            const numB = parseInt(b.filename.match(/^\d+/)?.[0] || '0', 10);
                            if (numA !== numB) return numA - numB;
                            return a.filename.localeCompare(b.filename);
                          });
                          const lastThree = sorted.slice(-3).map((f) => f.id);
                          (onSelectAllLoreFiles as any)(activeChatId, lastThree, true);
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#181820] border border-[#2d2d38] hover:border-zinc-500 text-xs text-zinc-200 hover:text-white font-medium transition-colors cursor-pointer active:scale-95"
                        title="Inyectar solo los últimos 3 capítulos de la novela"
                      >
                        Últimos 3
                      </motion.button>
                    )}
                    {onSelectAllLoreFiles && (
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={() => (onSelectAllLoreFiles as any)(activeChatId, folderLoreFiles.map((f) => f.id), true)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#181820] border border-[#2d2d38] hover:border-zinc-500 text-xs text-zinc-300 hover:text-white font-medium transition-colors cursor-pointer active:scale-95"
                      >
                        Todos
                      </motion.button>
                    )}
                    {onDeselectAllLoreFiles && (
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={() => onDeselectAllLoreFiles(activeChatId)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#181820] border border-[#2d2d38] hover:border-zinc-500 text-xs text-zinc-400 hover:text-white font-medium transition-colors cursor-pointer active:scale-95"
                      >
                        Desmarcar
                      </motion.button>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* List of Lore Files */}
              {folderLoreFiles.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-[#1f1f23] rounded-xl">
                  <FileCode size={24} className="mx-auto text-[#52525b] mb-2" />
                  <p className="text-xs text-[#a1a1aa] font-medium">
                    Sin documentos de lore en este arco todavía
                  </p>
                  <p className="text-[11px] text-[#71717a] mt-1 max-w-sm mx-auto">
                    Sube tu manuscrito en PDF o Word (.docx) y se dividirá automáticamente en capítulos individuales.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {folderLoreFiles.map((file) => {
                    const isSelected = Boolean(selectedLoreFileIds && selectedLoreFileIds.includes(file.id));
                    return (
                      <div
                        key={file.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 rounded-xl transition-all group ${
                          isSelected
                            ? 'bg-[#0f1412] border border-emerald-500/40 shadow-xs'
                            : 'bg-[#0d0d10] border border-[#1a1a1e] hover:border-[#27272c]'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                          {file.dataUrl && file.dataUrl.trim() ? (
                            <img
                              src={file.dataUrl}
                              alt={file.title}
                              className="w-10 h-10 rounded border border-[#26262e] object-cover shrink-0 cursor-pointer hover:scale-105 transition-transform mt-0.5 sm:mt-0"
                              onClick={() => setEditingLore(file)}
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                              isSelected
                                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                                : 'bg-[#141418] border-[#222228] text-[#a1a1aa]'
                            }`}>
                              <FileText size={18} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs sm:text-sm font-semibold text-white truncate max-w-[220px] sm:max-w-md">
                                {file.title}
                              </h4>
                              {renderBadge(file.fileType)}
                              {isSelected && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-semibold">
                                  EN CONTEXTO
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-[#71717a] mt-1">
                              <span className="text-[#a1a1aa] truncate max-w-[150px] sm:max-w-[220px]">{file.filename}</span>
                              <span className="text-zinc-600">·</span>
                              <span>{file.wordCount.toLocaleString()} words</span>
                              <span className="text-zinc-600">·</span>
                              <span>~{(file.estimatedTokens || 0).toLocaleString()} tok</span>
                              <span className="text-zinc-600">·</span>
                              <span>{Math.round(file.size / 1024) || 1} KB</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1a1a1e] w-full sm:w-auto">
                          {activeChatId && onToggleLoreFile && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              type="button"
                              onClick={() => onToggleLoreFile(activeChatId, file.id)}
                              className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60 hover:bg-emerald-500/30 shadow-xs'
                                  : 'bg-[#16161c] text-zinc-400 hover:text-white border border-[#272730] hover:border-zinc-500'
                              }`}
                              title={isSelected ? 'Documento inyectado en este chat. Toca para desmarcar.' : 'Toca para inyectar este documento en el chat actual.'}
                            >
                              {isSelected ? (
                                <>
                                  <Check size={13} className="text-emerald-400 shrink-0" />
                                  <span>Inyectado</span>
                                </>
                              ) : (
                                <>
                                  <Plus size={13} className="shrink-0" />
                                  <span>Inyectar</span>
                                </>
                              )}
                            </motion.button>
                          )}
                          {file.content && file.content.length > 5000 && (
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                const detected = splitManuscriptIntoChapters(file.content);
                                if (detected && detected.length >= 2) {
                                  setSplitDialog({
                                    isOpen: true,
                                    chapters: detected,
                                    sourceName: file.filename,
                                  });
                                } else {
                                  alert('No se detectaron divisiones claras de capítulos (Prólogo, Capítulo 1, etc.) en este documento.');
                                }
                              }}
                              className="min-h-[40px] px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-md transition-colors flex items-center gap-1 cursor-pointer text-xs font-mono"
                              title="Dividir este archivo monolítico en capítulos individuales"
                            >
                              <Scissors size={14} />
                              <span className="hidden sm:inline">Dividir</span>
                            </motion.button>
                          )}
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setEditingLore(file)}
                            className="min-h-[40px] min-w-[40px] p-2 text-[#a1a1aa] hover:text-white hover:bg-[#18181c] rounded-md transition-colors flex items-center justify-center cursor-pointer"
                            title="View & Edit Document"
                          >
                            <Eye size={15} />
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDownloadLore(file)}
                            className="min-h-[40px] min-w-[40px] p-2 text-[#a1a1aa] hover:text-white hover:bg-[#18181c] rounded-md transition-colors flex items-center justify-center cursor-pointer"
                            title="Download Markdown"
                          >
                            <Download size={15} />
                          </motion.button>
                          {deletingLoreId === file.id ? (
                            <div className="flex items-center gap-2 bg-red-950/90 border border-red-800 px-2.5 py-1.5 rounded-md text-xs select-none animate-noir-enter min-h-[40px]">
                              <span className="text-[11px] text-red-300 font-medium">¿Eliminar?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteLoreFile(file.id);
                                  setDeletingLoreId(null);
                                }}
                                className="text-[11px] text-red-400 hover:text-red-200 font-bold px-1.5 cursor-pointer min-h-[32px] flex items-center"
                              >
                                Sí
                              </button>
                              <span className="text-zinc-600 font-mono">/</span>
                              <button
                                type="button"
                                onClick={() => setDeletingLoreId(null)}
                                className="text-[11px] text-zinc-400 hover:text-white font-bold px-1.5 cursor-pointer min-h-[32px] flex items-center"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setDeletingLoreId(file.id)}
                              className="min-h-[40px] min-w-[40px] p-2 text-[#71717a] hover:text-red-400 hover:bg-[#18181c] rounded-md transition-colors cursor-pointer flex items-center justify-center"
                              title="Eliminar documento de lore"
                            >
                              <Trash2 size={15} />
                            </motion.button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chapter Split Confirmation Modal */}
      <AnimatePresence>
        {splitDialog && splitDialog.isOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col w-full max-w-2xl max-h-[88vh] bg-[#0c0c10] border border-amber-500/40 rounded-2xl shadow-2xl text-white overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/40 to-[#0e0e14]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Scissors size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                      <span>¡Manuscrito Detectado: {splitDialog.chapters.length} Capítulos!</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Auto-Divisor 1-Clic
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-400 truncate max-w-md">
                      Origen: {splitDialog.sourceName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSplitDialog(null)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Explanation / Quota Value Prop */}
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
                <div className="p-3.5 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <Zap size={14} className="shrink-0" />
                    <span>¿Por qué dividir tu manuscrito en capítulos individuales?</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-300">
                    <div className="p-2.5 rounded-lg bg-black/40 border border-red-500/25">
                      <span className="text-red-400 font-semibold block mb-1">❌ 1 Archivo Monolítico:</span>
                      Envía ~{splitDialog.chapters.reduce((a, c) => a + c.estimatedTokens, 0).toLocaleString()} tokens en cada mensaje. Agota 1M de cuota en apenas 10-15 mensajes.
                    </div>
                    <div className="p-2.5 rounded-lg bg-black/40 border border-emerald-500/30">
                      <span className="text-emerald-400 font-semibold block mb-1">⚡ Capítulos Individuales:</span>
                      Inyecta solo el capítulo actual (~800 tokens). Ahorras <strong className="text-emerald-300">95% de tokens</strong> y tu cuota dura meses.
                    </div>
                  </div>
                </div>

                {/* Chapter Previews list */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 mb-2">
                    <span>Capítulos listos para importar ({splitDialog.chapters.length}):</span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      Total obra: ~{splitDialog.chapters.reduce((a, c) => a + c.estimatedTokens, 0).toLocaleString()} tokens
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-[#08080a] border border-[#1b1b22] rounded-xl smooth-scroll">
                    {splitDialog.chapters.map((ch, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#111116] border border-[#1c1c24] text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-mono text-[10px] text-zinc-500 w-5 text-right shrink-0">
                            {idx + 1}.
                          </span>
                          <span className="font-medium text-zinc-200 truncate">{ch.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 shrink-0">
                          <span>{ch.wordCount.toLocaleString()} pal.</span>
                          <span className="text-zinc-600">·</span>
                          <span className="text-amber-400">~{ch.estimatedTokens.toLocaleString()} tok</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-5 py-4 border-t border-[#18181f] bg-[#08080b]">
                <div className="text-[11px] text-zinc-400 text-center sm:text-left">
                  Se inyectará solo el último capítulo por defecto para proteger tu cuota.
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {splitDialog.rawItem && (
                    <button
                      type="button"
                      onClick={() => {
                        if (splitDialog.rawItem) {
                          onAddLoreFiles([splitDialog.rawItem]);
                        }
                        setSplitDialog(null);
                      }}
                      className="flex-1 sm:flex-none min-h-[42px] px-3 py-2 text-xs text-zinc-400 hover:text-white bg-[#141418] hover:bg-[#1a1a20] border border-[#26262e] rounded-xl transition-colors cursor-pointer"
                    >
                      1 Solo Archivo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleConfirmSplitImport(splitDialog.chapters)}
                    className="flex-1 sm:flex-none min-h-[42px] flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-black bg-gradient-to-r from-amber-400 to-amber-300 hover:brightness-110 rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    <Sparkles size={14} className="text-black shrink-0" />
                    <span>Dividir e Importar {splitDialog.chapters.length} Capítulos</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Novel Splitter Modal */}
      <AnimatePresence>
        {isManualSplitterOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col w-full max-w-2xl max-h-[90vh] bg-[#0c0c10] border border-[#262630] rounded-2xl shadow-2xl text-white overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c24] bg-[#09090d]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Scissors size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Auto-Divisor de Novela (1-Clic)
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Pega tu manuscrito o sube tu PDF/DOCX para dividirlo al instante en capítulos individuales
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsManualSplitterOpen(false)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-zinc-300">
                    Pega el texto completo de tu novela o selecciona un archivo:
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualSplitterOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="px-2.5 py-1.5 text-[11px] font-mono text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Upload size={12} />
                      <span>Subir PDF / DOCX</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text && text.trim()) {
                            setManualSplitText(text);
                            const chs = splitManuscriptIntoChapters(text);
                            setManualSplitPreview(chs);
                          }
                        } catch {}
                      }}
                      className="px-2.5 py-1.5 text-[11px] font-mono text-zinc-300 hover:text-white bg-[#16161e] hover:bg-[#1e1e28] border border-[#2b2b38] rounded-md transition-colors cursor-pointer"
                    >
                      📋 Pegar del Portapapeles
                    </button>
                  </div>
                </div>

                <textarea
                  rows={9}
                  value={manualSplitText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualSplitText(val);
                    const chs = splitManuscriptIntoChapters(val);
                    setManualSplitPreview(chs);
                  }}
                  placeholder="Pega aquí tu novela completa con capítulos (PRÓLOGO: ..., CAPÍTULO 1: ..., CAPÍTULO 2: ...)..."
                  className="w-full bg-[#08080a] border border-[#1f1f28] rounded-xl p-3.5 text-xs text-white font-mono leading-relaxed placeholder-zinc-600 focus:outline-none focus:border-amber-500/50"
                />

                {manualSplitPreview && manualSplitPreview.length > 0 && (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Check size={14} className="text-emerald-400" />
                        <span>{manualSplitPreview.length} Capítulos detectados con éxito</span>
                      </span>
                      <span className="font-mono text-[11px]">
                        ~{manualSplitPreview.reduce((a, c) => a + c.estimatedTokens, 0).toLocaleString()} tok en total
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Promedio por capítulo: ~{Math.round(manualSplitPreview.reduce((a, c) => a + c.estimatedTokens, 0) / manualSplitPreview.length)} tokens (95%+ de ahorro por mensaje).
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#18181f] bg-[#08080b]">
                <button
                  onClick={() => setIsManualSplitterOpen(false)}
                  className="px-3 py-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  disabled={!manualSplitPreview || manualSplitPreview.length < 2}
                  onClick={() => {
                    if (manualSplitPreview) {
                      handleConfirmSplitImport(manualSplitPreview);
                    }
                  }}
                  className="min-h-[40px] px-4 py-2 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Scissors size={14} />
                  <span>Dividir e Importar ({manualSplitPreview?.length || 0}) Capítulos</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <GoogleDriveModal
        isOpen={isGoogleDriveModalOpen}
        onClose={() => setIsGoogleDriveModalOpen(false)}
        folderId={folder.id}
        onImportLoreFiles={(newItems) => onAddLoreFiles(newItems)}
      />
    </div>
  );
};
