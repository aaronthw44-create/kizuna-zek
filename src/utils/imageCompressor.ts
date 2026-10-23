/**
 * Client-Side Canvas Image Compressor
 * Prevents HTTP 413 / 500 errors by compressing high-resolution images down to
 * a max dimension of 1440px and JPEG 0.82 quality before converting to Base64.
 * Reduces 15MB photos to ~250-350KB without visual degradation for vision models.
 */

export interface CompressedImageResult {
  dataUrl: string;
  size: number;
  width: number;
  height: number;
  name: string;
}

export async function compressImage(
  file: File,
  maxDimension = 1440,
  quality = 0.82
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    // If SVG or gif animation, avoid flattening if necessary, but for camera/photos always compress
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          dataUrl: e.target?.result as string,
          size: file.size,
          width: 800,
          height: 800,
          name: file.name,
        });
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo SVG'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Error al renderizar la imagen en el canvas'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve({
            dataUrl: e.target?.result as string,
            size: file.size,
            width: img.width,
            height: img.height,
            name: file.name,
          });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64Str = dataUrl.split(',')[1] || '';
        const approxSize = Math.round((base64Str.length * 3) / 4);

        resolve({
          dataUrl,
          size: approxSize,
          width,
          height,
          name: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
