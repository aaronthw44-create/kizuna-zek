import html2canvas from 'html2canvas';

// Helper canvas for converting modern CSS color strings (oklab, oklch, light-dark, color-mix) to standard rgba()
let colorCanvas: HTMLCanvasElement | null = null;
let colorCtx: CanvasRenderingContext2D | null = null;

function getColorContext(): CanvasRenderingContext2D | null {
  if (!colorCanvas) {
    if (typeof document === 'undefined') return null;
    colorCanvas = document.createElement('canvas');
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
  }
  return colorCtx;
}

export function parseColorToRgba(colorStr: string): string {
  if (!colorStr) return colorStr;
  const ctx = getColorContext();
  if (!ctx) return 'rgba(30, 31, 38, 1)';

  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000000';
    ctx.fillStyle = colorStr;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const alpha = (a / 255).toFixed(2);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch {
    return 'rgba(30, 31, 38, 1)';
  }
}

export function sanitizeCssColorString(cssText: string): string {
  if (!cssText) return cssText;
  // Matches oklab(...), oklch(...), light-dark(...), color-mix(...)
  return cssText.replace(/(?:oklab|oklch|light-dark|color-mix)\((?:[^()]+|\([^()]*\))*\)/gi, (match) => {
    return parseColorToRgba(match);
  });
}

function createSanitizedStyleProxy(style: CSSStyleDeclaration): CSSStyleDeclaration {
  return new Proxy(style, {
    get(target, prop, receiver) {
      if (prop === 'getPropertyValue') {
        return (propertyName: string) => {
          const rawVal = target.getPropertyValue(propertyName);
          if (
            typeof rawVal === 'string' &&
            (rawVal.includes('oklab') ||
              rawVal.includes('oklch') ||
              rawVal.includes('light-dark') ||
              rawVal.includes('color-mix'))
          ) {
            return sanitizeCssColorString(rawVal);
          }
          return rawVal;
        };
      }

      const val = Reflect.get(target, prop, target);
      if (typeof val === 'function') {
        return val.bind(target);
      }
      if (
        typeof val === 'string' &&
        (val.includes('oklab') ||
          val.includes('oklch') ||
          val.includes('light-dark') ||
          val.includes('color-mix'))
      ) {
        return sanitizeCssColorString(val);
      }
      return val;
    },
  });
}

export async function captureAppScreenshot(element: HTMLElement = document.body): Promise<string> {
  const origWindowGetComputedStyle = window.getComputedStyle;

  try {
    // Intercept global window.getComputedStyle during html2canvas run
    window.getComputedStyle = function (el: Element, pseudo?: string | null) {
      const style = origWindowGetComputedStyle.call(window, el, pseudo);
      return createSanitizedStyleProxy(style);
    };

    const canvas = await html2canvas(element, {
      useCORS: true,
      logging: false,
      scale: 1,
      onclone: (clonedDoc) => {
        // 1. Force re-parsing of style tags by replacing them with sanitized text content
        const styleTags = Array.from(clonedDoc.querySelectorAll('style'));
        styleTags.forEach((tag) => {
          if (tag.textContent && (tag.textContent.includes('oklab') || tag.textContent.includes('oklch'))) {
            const newStyle = clonedDoc.createElement('style');
            newStyle.textContent = sanitizeCssColorString(tag.textContent);
            tag.parentNode?.replaceChild(newStyle, tag);
          }
        });

        // 2. Sanitize SVG presentation attributes
        const svgEls = clonedDoc.querySelectorAll('svg, path, circle, line, polyline, rect, polygon, g, stop');
        svgEls.forEach((el) => {
          ['fill', 'stroke', 'color', 'stop-color', 'flood-color', 'lighting-color', 'style'].forEach((attr) => {
            const val = el.getAttribute(attr);
            if (val && (val.includes('oklab') || val.includes('oklch') || val.includes('light-dark'))) {
              el.setAttribute(attr, sanitizeCssColorString(val));
            }
          });
        });

        // 3. Sanitize inline style attributes on all DOM nodes
        const allEls = clonedDoc.querySelectorAll('*');
        allEls.forEach((el) => {
          if (el instanceof HTMLElement || el instanceof SVGElement) {
            const styleAttr = el.getAttribute('style');
            if (styleAttr && (styleAttr.includes('oklab') || styleAttr.includes('oklch') || styleAttr.includes('light-dark'))) {
              el.setAttribute('style', sanitizeCssColorString(styleAttr));
            }
          }
        });

        // 4. Intercept getComputedStyle in cloned window
        const win = clonedDoc.defaultView || window;
        if (win && win.getComputedStyle) {
          const origClonedGetComputedStyle = win.getComputedStyle.bind(win);
          win.getComputedStyle = function (el: Element, pseudo?: string | null) {
            const style = origClonedGetComputedStyle(el, pseudo);
            return createSanitizedStyleProxy(style);
          };
        }
      },
    });

    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    window.getComputedStyle = origWindowGetComputedStyle;
  }
}
