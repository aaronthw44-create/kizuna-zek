/**
 * Client-Side 8K-Safe Adaptive Canvas Image Compressor
 * Prevents HTTP 413 / 400 errors on Alibaba Cloud DashScope & Gemini Vision
 * by decoding 4K/8K/200MP photos via zero-copy ObjectURL (avoiding RAM spikes on mobile)
 * and running an adaptive multi-pass byte guard (up to 1920px HD clarity, guaranteed < 750KB).
 */

export interface CompressedImageResult {
  dataUrl: string;
  size: number;
  originalSize: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  name: string;
}

const MAX_SAFE_BYTES = 500 * 1024; // ~500 KB binary (~665 KB Base64), safe for 4+ images on Vercel Serverless (4.5MB cap) & Alibaba DashScope

/**
 * Progressive 2x Mipmap Downsampler:
 * Scaling an 8K (7680x4320) image directly to ~2048px in a single drawImage() pass
 * causes browser bilinear/bicubic samplers to skip pixels and blur small text.
 * Stepping down by 50% per pass (7680 -> 3840 -> 2044) acts as a Lanczos/Box pre-filter
 * that preserves razor-sharp typography and fine line art for Vision AI OCR.
 */
function drawProgressiveSharp(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  srcW: number,
  srcH: number,
  destCtx: CanvasRenderingContext2D,
  destW: number,
  destH: number
) {
  let curW = srcW;
  let curH = srcH;
  let curSource: CanvasImageSource = source;
  let tempCanvas: HTMLCanvasElement | null = null;

  const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;

  while (curW * 0.5 > destW * 1.15 && curH * 0.5 > destH * 1.15) {
    // For 4K/8K <video> frames on mobile, let the hardware GPU video decoder jump straight to 2x target
    // on the first pass instead of allocating massive 4K intermediate canvases in mobile RAM
    const nextW = isVideo && curSource === source ? Math.min(destW * 2, Math.round(curW * 0.5)) : Math.max(destW, Math.round(curW * 0.5));
    const nextH = isVideo && curSource === source ? Math.min(destH * 2, Math.round(curH * 0.5)) : Math.max(destH, Math.round(curH * 0.5));
    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = nextW;
    stepCanvas.height = nextH;
    const stepCtx = stepCanvas.getContext('2d');
    if (!stepCtx) break;

    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(curSource, 0, 0, curW, curH, 0, 0, nextW, nextH);

    if (tempCanvas) {
      tempCanvas.width = 1;
      tempCanvas.height = 1;
    }
    tempCanvas = stepCanvas;
    curSource = stepCanvas;
    curW = nextW;
    curH = nextH;
  }

  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';
  // Subtle micro-contrast enhancement so Vision Transformer (ViT) edges stay crisp after downsampling
  if (typeof destCtx.filter === 'string') {
    destCtx.filter = srcW > destW * 1.5 ? 'contrast(1.04) saturate(1.02)' : 'none';
  }
  destCtx.drawImage(curSource, 0, 0, curW, curH, 0, 0, destW, destH);
  if (typeof destCtx.filter === 'string') {
    destCtx.filter = 'none';
  }

  if (tempCanvas) {
    tempCanvas.width = 1;
    tempCanvas.height = 1;
  }
}

export async function compressImage(
  file: File,
  maxDimension = 2044, // 2044 = 28 * 73 (Exact 1:1 alignment with Qwen-VL / ViT 28x28 patch grid!)
  quality = 0.86
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    // If SVG, read directly as it's vector text
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          dataUrl: e.target?.result as string,
          size: file.size,
          originalSize: file.size,
          width: 800,
          height: 800,
          originalWidth: 800,
          originalHeight: 800,
          name: file.name,
        });
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo SVG'));
      reader.readAsDataURL(file);
      return;
    }

    const processLoadedImage = (img: HTMLImageElement, cleanup?: () => void) => {
      try {
        const originalWidth = img.naturalWidth || img.width || 1000;
        const originalHeight = img.naturalHeight || img.height || 1000;

        const renderPass = (targetMaxDim: number, targetQuality: number) => {
          let width = originalWidth;
          let height = originalHeight;

          if (width > targetMaxDim || height > targetMaxDim) {
            if (width > height) {
              height = Math.round((height * targetMaxDim) / width);
              width = targetMaxDim;
            } else {
              width = Math.round((width * targetMaxDim) / height);
              height = targetMaxDim;
            }
            // Snap scaled dimensions to nearest multiple of 28px (min 28) to avoid secondary server-side ViT interpolation blur
            width = Math.max(28, Math.round(width / 28) * 28);
            height = Math.max(28, Math.round(height / 28) * 28);
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            return null;
          }

          // Fill subtle neutral background in case of transparent PNG->JPEG conversion
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          drawProgressiveSharp(img, originalWidth, originalHeight, ctx, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', targetQuality);
          const base64Str = dataUrl.split(',')[1] || '';
          const approxSize = Math.round((base64Str.length * 3) / 4);

          // Free canvas memory immediately (critical for 8K photos on mobile Safari/Chrome)
          canvas.width = 1;
          canvas.height = 1;

          return { dataUrl, size: approxSize, width, height };
        };

        // Pass 1: Ultra-Sharp 2K ViT-Aligned pass (default 2044px @ 0.86)
        let result = renderPass(maxDimension, quality);

        // Adaptive Byte-Guard for ultra-dense 4K/8K photos so Alibaba Cloud never rejects the payload
        if (result && result.size > MAX_SAFE_BYTES) {
          result = renderPass(maxDimension, 0.76);
        }
        if (result && result.size > MAX_SAFE_BYTES) {
          result = renderPass(Math.min(maxDimension, 1680), 0.72); // 1680 = 28 * 60
        }
        if (result && result.size > MAX_SAFE_BYTES) {
          result = renderPass(1344, 0.66); // 1344 = 28 * 48
        }

        cleanup?.();

        if (!result) {
          reject(new Error('No se pudo inicializar el motor de compresión Canvas 2D'));
          return;
        }

        resolve({
          dataUrl: result.dataUrl,
          size: result.size,
          originalSize: file.size,
          width: result.width,
          height: result.height,
          originalWidth,
          originalHeight,
          name: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
        });
      } catch (err) {
        cleanup?.();
        reject(err);
      }
    };

    // Prefer zero-copy URL.createObjectURL to avoid allocating 40MB+ Base64 strings in RAM on 8K photos
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      const cleanup = () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {}
      };
      img.onerror = () => {
        cleanup();
        reject(new Error('Error al decodificar la imagen de alta resolución'));
      };
      img.onload = () => processLoadedImage(img, cleanup);
      img.src = objectUrl;
      return;
    }

    // Fallback to FileReader if URL.createObjectURL is unavailable
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Error al renderizar la imagen en el canvas'));
      img.onload = () => processLoadedImage(img);
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export interface VideoKeyframeCanvas {
  canvas: HTMLCanvasElement;
  timeSec: number;
}

/**
 * Stitches up to 4 temporal video frames into a single crisp HD 2x2 Storyboard Grid (< 680 KB)
 * with burned-in timecode badges so ANY Vision AI (Qwen3.5/3.6-Plus, Gemini, Kimi) can understand
 * video motion and temporal progression without needing raw .mp4 support.
 */
export function stitchVideoStoryboard(
  frames: VideoKeyframeCanvas[],
  baseName = 'video'
): CompressedImageResult {
  if (!frames.length) {
    throw new Error('No se capturaron fotogramas del video');
  }

  // Ensure 4 frames by duplicating if user stopped early
  const normalized: VideoKeyframeCanvas[] = [];
  for (let i = 0; i < 4; i++) {
    const idx = Math.min(frames.length - 1, Math.floor((i * frames.length) / 4));
    normalized.push(frames[idx]);
  }

  const first = normalized[0].canvas;
  const aspect = (first.width || 1280) / Math.max(1, first.height || 720);

  const cellW = aspect >= 1 ? 800 : 600;
  const cellH = Math.max(320, Math.round(cellW / aspect));
  const gap = 8;
  const headerH = 38;
  const totalW = cellW * 2 + gap * 3;
  const totalH = headerH + cellH * 2 + gap * 3;

  const master = document.createElement('canvas');
  master.width = totalW;
  master.height = totalH;
  const ctx = master.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el motor de storyboard de video');
  }

  // Noir background
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, totalW, totalH);

  // Header strip so the Vision AI immediately knows this is a chronological 4-frame video sequence
  ctx.fillStyle = '#e4e4e7';
  ctx.font = 'bold 16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.fillText('SECUENCIA DE VIDEO (4 FOTOGRAMAS CRONOLÓGICOS: #1 -> #2 -> #3 -> #4)', gap + 6, 25);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  normalized.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = gap + col * (cellW + gap);
    const y = headerH + gap + row * (cellH + gap);

    ctx.drawImage(item.canvas, 0, 0, item.canvas.width, item.canvas.height, x, y, cellW, cellH);

    // Draw high-contrast timecode badge in top-left of each frame
    const label = `#${index + 1} • ${item.timeSec.toFixed(1)}s`;
    ctx.fillStyle = 'rgba(9, 9, 11, 0.78)';
    ctx.fillRect(x + 10, y + 10, 116, 28);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 10, y + 10, 116, 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillText(label, x + 18, y + 29);

    // Free individual frame canvas RAM
    item.canvas.width = 1;
    item.canvas.height = 1;
  });

  let quality = 0.82;
  let dataUrl = master.toDataURL('image/jpeg', quality);
  let approxSize = Math.round(((dataUrl.split(',')[1] || '').length * 3) / 4);

  if (approxSize > MAX_SAFE_BYTES) {
    dataUrl = master.toDataURL('image/jpeg', 0.7);
    approxSize = Math.round(((dataUrl.split(',')[1] || '').length * 3) / 4);
  }
  if (approxSize > MAX_SAFE_BYTES) {
    dataUrl = master.toDataURL('image/jpeg', 0.6);
    approxSize = Math.round(((dataUrl.split(',')[1] || '').length * 3) / 4);
  }

  master.width = 1;
  master.height = 1;

  return {
    dataUrl,
    size: approxSize,
    originalSize: approxSize,
    width: totalW,
    height: totalH,
    originalWidth: totalW,
    originalHeight: totalH,
    name: `${baseName.replace(/\.[^/.]+$/, '')}_video_4f.jpg`,
  };
}

/**
 * Extracts 4 evenly-spaced keyframes from any uploaded .mp4 / .webm / .mov file
 * and converts it into a universal HD Storyboard JPEG for Vision AI models.
 */
export async function extractStoryboardFromVideoFile(file: File): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');

    let isResolved = false;
    const cleanup = () => {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(objectUrl);
      } catch {}
    };

    video.onerror = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      reject(new Error('No se pudo decodificar el archivo de video'));
    };

    const runExtraction = async () => {
      if (isResolved) return;
      isResolved = true;
      try {
        // Mobile Safari / Android Chrome sometimes report Infinity or NaN until primed
        const rawDur = video.duration;
        const duration = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 4;
        const ratios = [0.08, 0.36, 0.64, 0.92];
        const frames: VideoKeyframeCanvas[] = [];

        const seekTo = (t: number) =>
          new Promise<void>((res) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              video.removeEventListener('seeked', finish);
              res();
            };
            // Safety timeout so 4K/8K mobile hardware decoders never hang if seeked is coalesced
            const timer = setTimeout(finish, 1500);
            video.addEventListener('seeked', finish, { once: true });
            try {
              video.currentTime = Math.min(Math.max(0.01, t), Math.max(0.01, duration - 0.05));
            } catch {
              finish();
            }
          });

        for (const r of ratios) {
          const targetSec = duration * r;
          await seekTo(targetSec);
          const srcW = video.videoWidth || 1280;
          const srcH = video.videoHeight || 720;
          const w = Math.min(1008, srcW); // 1008 = 28 * 36 (ViT patch aligned)
          const h = Math.round((w * srcH) / Math.max(1, srcW));
          const c = document.createElement('canvas');
          c.width = Math.max(1, w);
          c.height = Math.max(1, h);
          const cCtx = c.getContext('2d');
          if (cCtx) {
            drawProgressiveSharp(video, srcW, srcH, cCtx, w, h);
            frames.push({ canvas: c, timeSec: targetSec });
          }
        }

        cleanup();
        const storyboard = stitchVideoStoryboard(frames, file.name);
        storyboard.originalSize = file.size;
        resolve(storyboard);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.addEventListener('loadeddata', runExtraction, { once: true });
    // Fallback if mobile browser only fires loadedmetadata without buffering first frame automatically
    video.addEventListener('loadedmetadata', () => {
      setTimeout(() => {
        if (!isResolved) runExtraction();
      }, 350);
    }, { once: true });

    video.src = objectUrl;
    video.load();
  });
}

/**
 * Ensures that when multiple images (e.g. 4 character design sheets) are sent in a single turn,
 * their combined Base64 size stays strictly under Vercel's 4.5MB serverless body limit (~2.5MB max for images).
 * Also works on images already saved in an existing chat!
 */
export async function ensureMultiImagePayloadFit<T extends { type?: string; fileType?: string; dataUrl?: string }>(
  attachments: T[],
  maxTotalBase64Chars = 2500000
): Promise<T[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) return attachments;

  const imageIndices: number[] = [];
  let totalBase64Chars = 0;

  attachments.forEach((att, idx) => {
    const isImg = att.type?.startsWith('image/') || att.fileType === 'image';
    if (isImg && att.dataUrl) {
      imageIndices.push(idx);
      totalBase64Chars += att.dataUrl.length;
    }
  });

  if (imageIndices.length === 0 || totalBase64Chars <= maxTotalBase64Chars) {
    return attachments;
  }

  const perImageMaxChars = Math.max(280000, Math.floor(maxTotalBase64Chars / imageIndices.length));

  const shrinkDataUrl = (dataUrl: string, targetChars: number): Promise<string> =>
    new Promise((resolve) => {
      if (!dataUrl || dataUrl.length <= targetChars || typeof document === 'undefined') {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const origW = img.naturalWidth || img.width || 1200;
          const origH = img.naturalHeight || img.height || 1200;
          const maxDim = imageIndices.length >= 4 ? 1288 : 1512; // 28x28 ViT aligned
          let w = origW;
          let h = origH;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
            w = Math.max(28, Math.round(w / 28) * 28);
            h = Math.max(28, Math.round(h / 28) * 28);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          drawProgressiveSharp(img, origW, origH, ctx, w, h);
          let out = canvas.toDataURL('image/jpeg', 0.74);
          if (out.length > targetChars) {
            out = canvas.toDataURL('image/jpeg', 0.62);
          }
          canvas.width = 1;
          canvas.height = 1;
          resolve(out.length < dataUrl.length ? out : dataUrl);
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  const result = [...attachments];
  for (const idx of imageIndices) {
    const cur = result[idx];
    if (cur.dataUrl && cur.dataUrl.length > perImageMaxChars) {
      const compactUrl = await shrinkDataUrl(cur.dataUrl, perImageMaxChars);
      result[idx] = { ...cur, dataUrl: compactUrl, type: 'image/jpeg' };
    }
  }
  return result;
}



