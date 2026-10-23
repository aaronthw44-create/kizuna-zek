import { DocFileType } from '../types';

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
      throw new Error(`⚠️ Por favor usa archivos .txt, .md o copia y pega el texto directamente para evitar errores de codificación.`);
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
        const pageText = textContent.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ');
        fullText += `[Page ${i}]\n${pageText.trim()}\n\n`;
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
      throw new Error(`⚠️ Por favor usa archivos .txt, .md o copia y pega el texto directamente para evitar errores de codificación.`);
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
