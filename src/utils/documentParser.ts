import { DocFileType } from '../types';
import { compressImage } from './imageCompressor';

export function detectFileType(file: File): DocFileType {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (name.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.doc') || mime.includes('msword')) return 'doc';
  if (name.endsWith('.pdf') || mime.includes('pdf')) return 'pdf';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
  if (name.endsWith('.txt') || mime.includes('text/plain')) return 'txt';
  if (name.endsWith('.json') || mime.includes('json')) return 'json';
  if (mime.startsWith('image/')) return 'image';

  return 'txt';
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Standard heuristic: ~4 characters per token or ~0.75 words per token
  return Math.max(1, Math.round(text.length / 3.8));
}

export interface ParsedDocumentResult {
  text: string;
  wordCount: number;
  estimatedTokens: number;
  fileType: DocFileType;
  dataUrl?: string;
}

export function sanitizeExtractedText(rawText: string): string {
  if (!rawText) return '';
  // Strip null bytes and non-printable control characters (\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F)
  return rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
}

export async function parseDocumentFile(file: File): Promise<ParsedDocumentResult> {
  const fileType = detectFileType(file);

  if (fileType === 'image') {
    try {
      const compressed = await compressImage(file, 1920, 0.84);
      return {
        text: `[Imagen de Lore del Proyecto: ${file.name}]`,
        wordCount: 5,
        estimatedTokens: 250,
        fileType: 'image',
        dataUrl: compressed.dataUrl,
      };
    } catch {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve({
            text: `[Imagen de Lore del Proyecto: ${file.name}]`,
            wordCount: 5,
            estimatedTokens: 250,
            fileType: 'image',
            dataUrl,
          });
        };
        reader.onerror = () => reject(new Error('Error al procesar la imagen adjunta'));
        reader.readAsDataURL(file);
      });
    }
  }

  if (fileType === 'docx' || fileType === 'doc') {
    try {
      const mammothModule = await import('mammoth');
      const mammoth = (mammothModule as any).default || mammothModule;
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = sanitizeExtractedText(result.value.trim());
      const words = text ? text.split(/\s+/).length : 0;
      return {
        text,
        wordCount: words,
        estimatedTokens: estimateTokenCount(text),
        fileType: 'docx',
      };
    } catch (err: any) {
      console.error('Mammoth .docx parse error:', err);
      throw new Error(`Por favor usa archivos .txt, .md o copia y pega el texto directamente para evitar errores de codificación.`);
    }
  }

  if (fileType === 'pdf') {
    try {
      const pdfjsModule = await import('pdfjs-dist');
      const pdfjsLib = (pdfjsModule as any).default || pdfjsModule;

      if (typeof window !== 'undefined' && pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
        } catch (e) {
          console.warn('PDF.js worker initialization warning:', e);
        }
      }

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let lastY: number | undefined;
        let pageStr = '';
        for (const item of textContent.items) {
          if (!('str' in item)) continue;
          if (lastY !== undefined && Math.abs((item as any).transform[5] - lastY) > 5) {
            pageStr += '\n';
          } else if (pageStr.length > 0 && !pageStr.endsWith(' ') && !pageStr.endsWith('\n')) {
            pageStr += ' ';
          }
          pageStr += item.str;
          lastY = (item as any).transform[5];
        }
        fullText += `[Page ${i}]\n${pageStr.trim()}\n\n`;
      }

      const text = sanitizeExtractedText(fullText.trim());
      const words = text ? text.split(/\s+/).length : 0;
      return {
        text,
        wordCount: words,
        estimatedTokens: estimateTokenCount(text),
        fileType: 'pdf',
      };
    } catch (err: any) {
      console.error('PDF.js parse error:', err);
      throw new Error(`Por favor usa archivos .txt, .md o copia y pega el texto directamente para evitar errores de codificación.`);
    }
  }

  // Text, Markdown, or JSON
  const rawText = await file.text();
  const sanitized = sanitizeExtractedText(rawText.trim());
  const words = sanitized ? sanitized.split(/\s+/).length : 0;
  return {
    text: sanitized,
    wordCount: words,
    estimatedTokens: estimateTokenCount(sanitized),
    fileType: fileType === 'md' ? 'md' : 'txt',
  };
}

export interface ChapterSplitItem {
  title: string;
  filename: string;
  content: string;
  wordCount: number;
  estimatedTokens: number;
  index: number;
}

/**
 * Detecta y divide automáticamente un manuscrito monolítico masivo (55+ capítulos)
 * en capítulos individuales perfectamente indexados para ahorrar hasta 95% de tokens por mensaje.
 */
export function splitManuscriptIntoChapters(rawText: string): ChapterSplitItem[] | null {
  if (!rawText || rawText.trim().length < 500) return null;

  // Pattern matches PRÓLOGO, CAPÍTULO \d+, EPÍLOGO, INTERLUDIO with optional titles
  const chapterPattern = /(?:^|\n)\s*(?:[=\-_*#]{3,}\s*)?((?:PR[ÓO]LOGO|CAP[ÍI]TULO\s+\d+|EP[ÍI]LOGO|INTERLUDIO(?:\s+\d+)?)(?:\s*[:\-–—]\s*[^\n\r]*)?)/gi;

  const matches: Array<{ index: number; title: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = chapterPattern.exec(rawText)) !== null) {
    const title = m[1].trim();
    matches.push({
      index: m.index,
      title,
    });
  }

  // Only split if at least 2 distinct chapters/sections are detected
  if (matches.length < 2) return null;

  const chapters: ChapterSplitItem[] = [];
  let chapterIndex = 0;

  // Check if there is meaningful preamble before the first chapter (e.g. Title, pseudonyms, awards, cover info)
  const preamble = rawText.slice(0, matches[0].index)
    .replace(/\[Page\s+\d+\]/gi, '')
    .replace(/^[=\-_*#\s]+/g, '')
    .trim();

  if (preamble.length > 50 && preamble.split(/\s+/).length >= 10) {
    const preambleWords = preamble.split(/\s+/).filter(Boolean).length;
    chapters.push({
      title: 'Portada y Ficha Editorial',
      filename: '00_portada_y_ficha_editorial.md',
      content: preamble,
      wordCount: preambleWords,
      estimatedTokens: estimateTokenCount(preamble),
      index: chapterIndex++,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextIndex = i < matches.length - 1 ? matches[i + 1].index : rawText.length;
    let content = rawText.slice(current.index, nextIndex).trim();

    // Clean leading divider lines
    content = content.replace(/^[=\-_*#\s]{3,}\n?/, '').trim();

    // Clean page markers inside content for smooth reading
    content = content.replace(/\[Page\s+\d+\]\s*\n?/gi, '\n');

    // Create a safe, standardized filename
    const cleanTitle = current.title
      .replace(/[:\-–—]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\u00C0-\u024F]/g, '')
      .toLowerCase();

    const paddedNum = String(chapterIndex).padStart(2, '0');
    const filename = `${paddedNum}_${cleanTitle.slice(0, 36)}.md`;

    const words = content.split(/\s+/).filter(Boolean).length;
    const tokens = estimateTokenCount(content);

    chapters.push({
      title: current.title,
      filename,
      content,
      wordCount: words,
      estimatedTokens: tokens,
      index: chapterIndex++,
    });
  }

  return chapters;
}

/**
 * Extracción e indexación inteligente de capítulos para manuscritos masivos (55+ capítulos).
 * Reduce la sobrecarga de 100,000+ tokens enviando los capítulos más relevantes para la consulta activa.
 */
export function extractRelevantChapters(
  fullLoreText: string,
  userQuery: string,
  maxCharLength: number = 18000
): string {
  if (!fullLoreText || fullLoreText.length <= maxCharLength) {
    return fullLoreText;
  }

  // Regex de coincidencia para capítulos (# Capítulo X, Capítulo Y, Chapter Z, Acto N, etc.)
  const chapterHeaderRegex = /(?:^|\n)(?=#+\s*(?:cap[íi]tulo|chapter|acto|volumen|\bcap\b)\s*\d+|(?:cap[íi]tulo|chapter|acto|volumen|\bcap\b)\s*\d+)/gi;
  const segments = fullLoreText.split(chapterHeaderRegex).filter((s) => s && s.trim().length > 100);

  if (segments.length <= 1) {
    // Si no tiene divisiones explícitas por capítulos, devuelve los primeros y últimos caracteres
    const half = Math.floor(maxCharLength / 2);
    return `${fullLoreText.slice(0, half)}\n\n[... Fragmento central de la obra recortado para respuesta ultra-rápida ...]\n\n${fullLoreText.slice(-half)}`;
  }

  const queryTerms = (userQuery || '')
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u024F]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  // Calificación de relevancia por capítulo según palabras clave + bonificación al último capítulo del archivo
  const scoredSegments = segments.map((seg, index) => {
    const lowerSeg = seg.toLowerCase();
    let score = 0;
    queryTerms.forEach((term) => {
      if (lowerSeg.includes(term)) {
        score += 3;
      }
    });
    // Los últimos capítulos tienen alta relevancia narrativa por continuidad
    if (index >= segments.length - 2) {
      score += 5;
    }
    return { seg, score, index };
  });

  // Ordenar por puntuación descendente
  scoredSegments.sort((a, b) => b.score - a.score);

  // Seleccionar capítulos hasta alcanzar maxCharLength
  const selectedSegments: typeof scoredSegments = [];
  let currentLength = 0;

  for (const item of scoredSegments) {
    if (currentLength + item.seg.length <= maxCharLength || selectedSegments.length === 0) {
      selectedSegments.push(item);
      currentLength += item.seg.length;
    }
    if (currentLength >= maxCharLength) break;
  }

  // Volver a ordenar por su secuencia original en el libro
  selectedSegments.sort((a, b) => a.index - b.index);

  const selectedText = selectedSegments.map((s) => s.seg.trim()).join('\n\n---\n\n');
  return `[SELECCIÓN INTELIGENTE DE CAPÍTULOS DEL MANUSCRITO (${selectedSegments.length} de ${segments.length} Capítulos detectados)]:\n\n${selectedText}`;
}

export const MAX_SMART_2K_LORE_CHARS = 5600; // ~1,450 tokens de Lore (+ ~550 tokens System Prompt = <= 2,000 tokens totales)
export const MAX_SMART_2K_LORE_TOKENS = 1450;

export interface CompressibleLoreDoc {
  id: string;
  title: string;
  filename?: string;
  fileType?: string;
  content: string;
  estimatedTokens?: number;
}

/**
 * Extrae números de capítulos individuales y rangos explícitos (ej. "capítulos 10 hasta el 20", "del 10 al 20", "cap 10-20").
 */
export function parseChapterNumbersAndRanges(rawQuery: string): number[] {
  if (!rawQuery) return [];
  const normalized = rawQuery
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const chapterSet = new Set<number>();

  const rangePatterns = [
    /\b(?:cap(?:itulos?)?|chapters?|actos?|partes?|episodios?)\s*(?:del\s*)?#?(\d+)\s*(?:al|hasta(?:\s+el)?|a|-|–|—|y(?:\s+el)?)\s*#?(\d+)\b/g,
    /\b(?:del|desde\s+el|entre\s+el)\s+(?:cap(?:itulo)?\s*)?#?(\d+)\s+(?:al|hasta(?:\s+el)?|a|y\s+el)\s+(?:cap(?:itulo)?\s*)?#?(\d+)\b/g,
  ];

  for (const pattern of rangePatterns) {
    for (const m of normalized.matchAll(pattern)) {
      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);
      if (!Number.isNaN(start) && !Number.isNaN(end) && start > 0 && end >= start && end - start <= 40) {
        for (let c = start; c <= end; c++) {
          chapterSet.add(c);
        }
      }
    }
  }

  for (const listMatch of normalized.matchAll(/\b(?:cap(?:itulos?)?|chapters?|episodios?)\s+((?:#?\d+(?:\s*(?:,|y|e|o)\s*)?)+)/g)) {
    const numsBlock = listMatch[1] || '';
    for (const numMatch of numsBlock.matchAll(/\b(\d+)\b/g)) {
      const n = parseInt(numMatch[1], 10);
      if (!Number.isNaN(n) && n > 0 && n <= 500) {
        chapterSet.add(n);
      }
    }
  }

  for (const singleMatch of normalized.matchAll(/\b(?:cap(?:itulos?)?|chapters?|actos?|partes?|episodios?)\s*#?(\d+)\b/g)) {
    const n = parseInt(singleMatch[1], 10);
    if (!Number.isNaN(n) && n > 0 && n <= 500) {
      chapterSet.add(n);
    }
  }

  return Array.from(chapterSet).sort((a, b) => a - b);
}

/**
 * Extrae quirúrgicamente los diálogos literales (—..., «...», "...") de un capítulo
 * junto con su contexto inmediato de hablante/acción para comparar diálogos entre múltiples capítulos
 * consumiendo una fracción mínima de tokens.
 */
export function extractChapterDialogues(content: string, budgetChars: number): string {
  if (!content || budgetChars <= 0) return '';
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const dialogueLines: string[] = [];
  let accumulatedChars = 0;

  for (const line of lines) {
    const isDialogueLine =
      /^(?:—|–|―|-\s|[«"“])/.test(line) ||
      /(?:—[^—\n]{4,}|«[^»\n]{4,}»|"[^"\n]{6,}"|“[^”\n]{6,}”)/.test(line);

    if (isDialogueLine) {
      const cleanLine = line.replace(/\s+/g, ' ').trim();
      if (accumulatedChars + cleanLine.length + 2 <= budgetChars) {
        dialogueLines.push(cleanLine);
        accumulatedChars += cleanLine.length + 2;
      } else {
        const remaining = budgetChars - accumulatedChars - 10;
        if (remaining > 45) {
          dialogueLines.push(`${cleanLine.slice(0, remaining).trim()}...`);
        }
        break;
      }
    }
  }

  if (dialogueLines.length === 0) {
    // Fallback si el capítulo no usa rayas o comillas convencionales
    const flat = content.replace(/\s+/g, ' ').trim();
    if (flat.length <= budgetChars) return flat;
    const half = Math.floor((budgetChars - 20) / 2);
    return `${flat.slice(0, half).trim()} [...] ${flat.slice(-half).trim()}`;
  }

  return dialogueLines.join('\n');
}

/**
 * Motor de Compresión 2K Automático + Extractor Quirúrgico de Rangos y Diálogos para Manuscritos de 88+ Capítulos.
 * Permite marcar todos los capítulos al mismo tiempo manteniendo un consumo mínimo de tokens:
 * 1) Genera un Mapa Cronológico Completo de TODOS los capítulos de la novela con apertura y cierre.
 * 2) Detecta rangos ("capítulos 10 hasta el 20") y consultas de diálogos ("comparar los diálogos") para extraer
 *    exactamente los capítulos y parlamentos solicitados sin derrochar cuota en Alibaba Cloud.
 */
export function compressLoreDocsTo2K(
  docs: CompressibleLoreDoc[],
  userQuery: string = '',
  maxChars: number = MAX_SMART_2K_LORE_CHARS,
  allCatalogDocs?: CompressibleLoreDoc[]
): string {
  const textDocs = (docs || []).filter((d) => d.fileType !== 'image' && d.content && d.content.trim());
  if (textDocs.length === 0) return '';

  const sortDocsNaturally = (list: CompressibleLoreDoc[]) =>
    [...list].sort((a, b) => {
      const fnA = a.filename || a.title || '';
      const fnB = b.filename || b.title || '';
      const numA = parseInt(fnA.match(/^\d+/)?.[0] || a.title.match(/\b(\d+)\b/)?.[1] || '9999', 10);
      const numB = parseInt(fnB.match(/^\d+/)?.[0] || b.title.match(/\b(\d+)\b/)?.[1] || '9999', 10);
      if (numA !== numB) return numA - numB;
      return fnA.localeCompare(fnB);
    });

  // Ordenar capítulos en secuencia numérica natural (00_, 01_, 02_ ... 88_)
  const sortedDocs = sortDocsNaturally(textDocs);
  const fullCatalogTextDocs =
    allCatalogDocs && allCatalogDocs.length > textDocs.length
      ? sortDocsNaturally(allCatalogDocs.filter((d) => d.fileType !== 'image' && d.content && d.content.trim()))
      : sortedDocs;

  // Si solo hay 1 documento gigante sin dividir (ej. PDF monolítico), intentar dividirlo al vuelo para indexar sus capítulos
  let effectiveDocs = sortedDocs;
  if (sortedDocs.length === 1 && sortedDocs[0].content.length > maxChars) {
    const autoSplit = splitManuscriptIntoChapters(sortedDocs[0].content);
    if (autoSplit && autoSplit.length > 1) {
      effectiveDocs = autoSplit.map((ch, idx) => ({
        id: `autosplit_${idx}`,
        title: ch.title,
        filename: ch.filename,
        fileType: 'md',
        content: ch.content,
        estimatedTokens: ch.estimatedTokens,
      }));
    }
  }

  const explicitNumbers = parseChapterNumbersAndRanges(userQuery);
  const lowerQuery = (userQuery || '').toLowerCase();
  const asksDialogues =
    /\b(?:di[áa]logos?|hablan|conversaci[óo]n(?:es)?|dicen|charlan|intercambio|parlamentos?|qu[ée]\s+le\s+dice)\b/i.test(
      lowerQuery
    );

  // Escalar el presupuesto de caracteres de manera controlada cuando el autor pide comparar un rango de varios capítulos (ej. 10 al 20)
  const effectiveMaxChars =
    explicitNumbers.length >= 2
      ? Math.min(17500, Math.max(maxChars, 4000 + explicitNumbers.length * 1150))
      : asksDialogues
        ? Math.max(maxChars, 7500)
        : maxChars;

  const rawJoined = effectiveDocs
    .map((doc) => `[DOCUMENTO: "${doc.title}" (${doc.filename || doc.fileType || 'Archivo'})]\n${doc.content.trim()}`)
    .join('\n\n');

  // Si el total ya entra dentro del presupuesto y no hay catálogo externo mayor omitido, enviarlo íntegro
  if (rawJoined.length <= effectiveMaxChars && fullCatalogTextDocs.length <= effectiveDocs.length) {
    return rawJoined;
  }

  // Presupuesto dividido:
  // Parte 1 (Estática para Input Cache): Mapa Cronológico Completo de todos los capítulos del proyecto
  // Parte 2 (Dinámica según consulta): Escenas o diálogos literales clave de los capítulos relevantes
  const mapSourceDocs = fullCatalogTextDocs.length > effectiveDocs.length ? fullCatalogTextDocs : effectiveDocs;
  const mapBudget =
    explicitNumbers.length >= 4
      ? Math.min(3200, Math.floor(effectiveMaxChars * 0.25))
      : Math.min(3600, Math.floor(effectiveMaxChars * 0.58));
  const excerptBudget = Math.max(1800, effectiveMaxChars - mapBudget - 240);

  const perChapterChars = Math.max(42, Math.floor(mapBudget / Math.max(1, mapSourceDocs.length)));
  const mapLines: string[] = [];

  for (let i = 0; i < mapSourceDocs.length; i++) {
    const doc = mapSourceDocs[i];
    const cleanBody = doc.content
      .replace(/^(?:[=\-_*#\s]*)(?:PR[ÓO]LOGO|CAP[ÍI]TULO\s+\d+|EP[ÍI]LOGO|INTERLUDIO[^\n]*)\s*[:\-–—]?\s*[^\n]*\n?/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    const shortTitle = doc.title.replace(/^CAP[ÍI]TULO\s+/i, 'Cap ').slice(0, 34);
    const bodyBudget = Math.max(26, perChapterChars - shortTitle.length - 8);
    const half = Math.floor(bodyBudget / 2);

    let summarySnippet = '';
    if (cleanBody.length <= bodyBudget) {
      summarySnippet = cleanBody;
    } else {
      const startBeat = cleanBody.slice(0, half).trim();
      const endBeat = cleanBody.slice(-half).trim();
      summarySnippet = `${startBeat} → ${endBeat}`;
    }
    mapLines.push(`• [${shortTitle}]: ${summarySnippet}`);
  }

  const chronologicalMapBlock =
    `[MAPA CRONOLÓGICO COMPLETO (${mapSourceDocs.length} capítulos indexados en Bóveda de Lore)]:\n` +
    mapLines.join('\n').slice(0, mapBudget);

  // Parte 2: Selección de capítulos focales según la pregunta del usuario (usando todo el catálogo si pidió un rango explícito)
  const searchPoolDocs = explicitNumbers.length > 0 ? mapSourceDocs : effectiveDocs;
  const isMacroEvolutionQuery =
    /cambio|evoluci[oó]n|arco|desarrollo|principio a fin|todos los cap|desde el cap|hasta el cap|1 al \d+|1 hasta/i.test(
      lowerQuery
    ) || explicitNumbers.length >= 2;
  const asksPrologue = /\b(?:pr[óo]logo|inicio|comienzo)\b/i.test(lowerQuery);

  const queryTerms = lowerQuery
    .replace(/[^\w\s\u00C0-\u024F]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(como|para|este|esta|entre|hasta|desde|todos|capitulo|capítulos|capitulos|analiza|comparar|compara|dialogo|dialogos|diálogos|quiero|podemos)$/i.test(w));

  const scoredDocs = searchPoolDocs.map((doc, idx) => {
    let score = 0;
    const lowerTitle = (doc.title || '').toLowerCase();
    const lowerContent = doc.content.toLowerCase();
    const chapNumMatch =
      doc.title.match(/\b(?:cap[íi]tulo|chapter|cap|acto|parte)\s*#?(\d+)\b/i) ||
      (doc.filename || '').match(/^(\d+)_/) ||
      doc.title.match(/\b(\d+)\b/);
    const chapNum = chapNumMatch ? parseInt(chapNumMatch[1], 10) : -1;

    if (chapNum !== -1 && explicitNumbers.includes(chapNum)) {
      score += 200;
    }
    if (asksPrologue && /pr[óo]logo/i.test(lowerTitle)) {
      score += 150;
    }
    if (isMacroEvolutionQuery && explicitNumbers.length === 0) {
      // Si pide analizar el cambio general sin rango fijo, priorizar primer capítulo narrativo, punto medio y capítulo final
      if (idx === 0 || idx === 1 || chapNum === 1) score += 65;
      if (idx === Math.floor(searchPoolDocs.length / 2)) score += 50;
      if (idx === searchPoolDocs.length - 1) score += 75;
    } else if (explicitNumbers.length === 0) {
      // Por defecto, dar prioridad al último capítulo activo para mantener continuidad inmediata
      if (idx === searchPoolDocs.length - 1) score += 35;
      if (idx === 0) score += 15;
    }

    for (const term of queryTerms) {
      if (lowerTitle.includes(term)) score += 20;
      const occurrences = lowerContent.split(term).length - 1;
      if (occurrences > 0) {
        score += Math.min(30, occurrences * 6);
      }
    }

    return { doc, score, idx, chapNum };
  });

  scoredDocs.sort((a, b) => b.score - a.score);
  const topCount =
    explicitNumbers.length > 0
      ? Math.max(3, Math.min(25, explicitNumbers.length))
      : 3;
  const topDocs = scoredDocs.slice(0, topCount).sort((a, b) => a.idx - b.idx);
  const perExcerptBudget = Math.max(450, Math.floor(excerptBudget / Math.max(1, topDocs.length)));

  const excerptBlocks = topDocs.map(({ doc }) => {
    if (asksDialogues) {
      const extractedDialogues = extractChapterDialogues(doc.content, perExcerptBudget);
      return `[DIÁLOGOS EXTRAÍDOS — ${doc.title}]:\n${extractedDialogues}`;
    }

    const cleanText = doc.content.replace(/\s+/g, ' ').trim();
    if (cleanText.length <= perExcerptBudget) {
      return `[EXTRACTO CLAVE — ${doc.title}]:\n${cleanText}`;
    }
    // Buscar si algún término de la consulta aparece en el cuerpo para centrar el extracto ahí
    let matchedWindow = '';
    for (const term of queryTerms) {
      const pos = cleanText.toLowerCase().indexOf(term);
      if (pos !== -1) {
        const start = Math.max(0, pos - Math.floor(perExcerptBudget * 0.35));
        matchedWindow = cleanText.slice(start, start + Math.floor(perExcerptBudget * 0.7));
        break;
      }
    }
    if (matchedWindow) {
      const closing = cleanText.slice(-Math.floor(perExcerptBudget * 0.25));
      return `[EXTRACTO CLAVE — ${doc.title}]:\n...${matchedWindow.trim()} [...] ${closing.trim()}`;
    }
    const half = Math.floor((perExcerptBudget - 20) / 2);
    return `[EXTRACTO CLAVE — ${doc.title}]:\n${cleanText.slice(0, half).trim()} [...] ${cleanText.slice(-half).trim()}`;
  });

  const sectionHeader = asksDialogues
    ? `[DIÁLOGOS LITERALES FOCALIZADOS (${topDocs.length} capítulos seleccionados para comparación)]:`
    : `[ESCENAS LITERALES FOCALIZADAS PARA ESTA CONSULTA (${topDocs.length} capítulos activos)]:`;

  return `${chronologicalMapBlock}\n\n${sectionHeader}\n${excerptBlocks.join('\n\n')}`.slice(
    0,
    effectiveMaxChars
  );
}

