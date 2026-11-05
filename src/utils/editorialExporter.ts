import { Chat, Folder } from '../types';

export interface EditorialExportOptions {
  title: string;
  author: string;
  subtitle?: string;
  mode: 'narrative_only' | 'full_dialogue';
  includeSceneNumbers: boolean;
  typography: 'serif_classic' | 'modern_clean';
}

export interface CleanedManuscriptStats {
  cleanedScenes: Array<{
    heading: string;
    role: 'user' | 'assistant';
    paragraphs: string[];
  }>;
  totalWords: number;
  purgedThinkingCount: number;
  purgedCommandsCount: number;
}

/**
 * Limpia de raíz todas las notas de pensamiento (💧 Pensado durante..., <think>),
 * bloques <<<FOLLOW_UP>>>, <<<SAVE_MEMORY>>>, llamadas a herramientas y metadatos.
 */
export function sanitizeMessageForEditorial(rawContent: string): {
  cleanText: string;
  hadInlineThink: boolean;
  hadCommands: boolean;
} {
  if (!rawContent) {
    return { cleanText: '', hadInlineThink: false, hadCommands: false };
  }

  let text = rawContent;
  let hadInlineThink = false;
  let hadCommands = false;

  if (/(?:<think|<thought|<reasoning|<cot|💧\s*Pensado durante)/i.test(text)) {
    hadInlineThink = true;
  }
  if (/(?:<<<FOLLOW_UP>>>|<<<SAVE_MEMORY|<tool_call>)/i.test(text)) {
    hadCommands = true;
  }

  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/<cot>[\s\S]*?<\/cot>/gi, '')
    .replace(/💧\s*Pensado durante[^\n]*\n?/gi, '')
    .replace(/<<<FOLLOW_UP>>>[\s\S]*?(?:<<<END_FOLLOW_UP>>>|$)/gi, '')
    .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<\/?(?:think|thought|reasoning|cot|tool_call)[^>]*>/gi, '')
    .trim();

  return { cleanText: text, hadInlineThink, hadCommands };
}

export function buildCleanedManuscript(
  chat: Chat,
  options: EditorialExportOptions
): CleanedManuscriptStats {
  const messages = chat?.messages || [];
  const cleanedScenes: CleanedManuscriptStats['cleanedScenes'] = [];
  let purgedThinkingCount = 0;
  let purgedCommandsCount = 0;
  let totalWords = 0;
  let sceneCounter = 1;

  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (options.mode === 'narrative_only' && msg.role !== 'assistant') {
      continue;
    }

    if (msg.thinking && msg.thinking.trim()) {
      purgedThinkingCount++;
    }

    const { cleanText, hadInlineThink, hadCommands } = sanitizeMessageForEditorial(msg.content || '');
    if (hadInlineThink) purgedThinkingCount++;
    if (hadCommands) purgedCommandsCount++;

    if (!cleanText) continue;

    const paragraphs = cleanText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paragraphs.length === 0) continue;

    const wordsInMsg = cleanText.split(/\s+/).filter(Boolean).length;
    totalWords += wordsInMsg;

    const heading =
      options.mode === 'narrative_only'
        ? options.includeSceneNumbers
          ? `Escena ${sceneCounter}`
          : ''
        : msg.role === 'user'
          ? `Autor — Intervención ${sceneCounter}`
          : `Kizuna-Zek — Escena ${sceneCounter}`;

    cleanedScenes.push({
      heading,
      role: msg.role === 'user' ? 'user' : 'assistant',
      paragraphs,
    });

    sceneCounter++;
  }

  return {
    cleanedScenes,
    totalWords,
    purgedThinkingCount,
    purgedCommandsCount,
  };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 1. Exportación Markdown Editorial (.md)
 */
export function exportEditorialMarkdown(
  chat: Chat,
  options: EditorialExportOptions,
  folder?: Folder | null
): void {
  const manuscript = buildCleanedManuscript(chat, options);
  const lines: string[] = [];

  lines.push(`# ${options.title || chat.title || 'Manuscrito Editorial'}`);
  if (options.subtitle || folder?.name) {
    lines.push(`## ${options.subtitle || folder?.name}`);
  }
  lines.push(`**Autor:** ${options.author || 'Autor'}`);
  lines.push(`**Fecha de edición:** ${new Date().toLocaleDateString('es-ES')}`);
  lines.push(`**Extensión:** ${manuscript.totalWords.toLocaleString()} palabras`);
  lines.push('\n* * *\n');

  manuscript.cleanedScenes.forEach((scene, idx) => {
    if (scene.heading) {
      lines.push(`### ${scene.heading}\n`);
    }
    scene.paragraphs.forEach((p) => {
      lines.push(`${p}\n`);
    });
    if (idx < manuscript.cleanedScenes.length - 1) {
      lines.push('* * *\n');
    }
  });

  const finalMd = lines.join('\n');
  const safeName = (options.title || chat.title || 'manuscrito')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim();
  const blob = new Blob([finalMd], { type: 'text/markdown;charset=utf-8' });
  triggerBlobDownload(blob, `${safeName}_editorial.md`);
}

/**
 * 2. Exportación Documento Word Oficial (.docx OOXML vía JSZip)
 */
export async function exportEditorialDocx(
  chat: Chat,
  options: EditorialExportOptions,
  folder?: Folder | null
): Promise<void> {
  const manuscript = buildCleanedManuscript(chat, options);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const fontName = options.typography === 'serif_classic' ? 'Georgia' : 'Calibri';

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${fontName}" w:hAnsi="${fontName}" w:cs="${fontName}"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="es-ES"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="160" w:line="320" w:lineRule="auto"/>
        <w:jc w:val="both"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="44"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:pPr>
      <w:spacing w:after="360"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:i/>
      <w:color w:val="555555"/>
      <w:sz w:val="26"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="SceneHeading">
    <w:name w:val="SceneHeading"/>
    <w:pPr>
      <w:spacing w:before="360" w:after="180"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="28"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="EditorialBody">
    <w:name w:val="EditorialBody"/>
    <w:pPr>
      <w:ind w:firstLine="420"/>
      <w:spacing w:after="140" w:line="340" w:lineRule="auto"/>
      <w:jc w:val="both"/>
    </w:pPr>
  </w:style>
</w:styles>`;

  const bodyParagraphs: string[] = [];

  // Title & Subtitle
  const docTitle = options.title || chat.title || 'Manuscrito Editorial';
  const docSub = options.subtitle || folder?.name || `Por ${options.author || 'Autor'}`;

  bodyParagraphs.push(
    `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${escapeXml(docTitle)}</w:t></w:r></w:p>`
  );
  bodyParagraphs.push(
    `<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r><w:t>${escapeXml(docSub)} — ${escapeXml(options.author || 'Autor')}</w:t></w:r></w:p>`
  );

  manuscript.cleanedScenes.forEach((scene, sIdx) => {
    if (scene.heading) {
      bodyParagraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="SceneHeading"/></w:pPr><w:r><w:t>${escapeXml(scene.heading)}</w:t></w:r></w:p>`
      );
    }

    scene.paragraphs.forEach((para) => {
      const cleanLine = para
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^#+\s*/gm, '');

      bodyParagraphs.push(
        `<w:p><w:pPr><w:pStyle w:val="EditorialBody"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(cleanLine)}</w:t></w:r></w:p>`
      );
    });

    if (sIdx < manuscript.cleanedScenes.length - 1) {
      bodyParagraphs.push(
        `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="200" w:after="200"/></w:pPr><w:r><w:t>*   *   *</w:t></w:r></w:p>`
      );
    }
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParagraphs.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.file('[Content_Types].xml', contentTypesXml);
  zip.folder('_rels')?.file('.rels', relsXml);
  const wordFolder = zip.folder('word');
  wordFolder?.file('document.xml', documentXml);
  wordFolder?.file('styles.xml', stylesXml);
  wordFolder?.folder('_rels')?.file('document.xml.rels', wordRelsXml);

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const safeName = docTitle.replace(/[/\\?%*:|"<>]/g, '_').trim();
  triggerBlobDownload(blob, `${safeName}_editorial.docx`);
}

/**
 * 3. Exportación Libro Electrónico Editorial (.epub 3.0)
 */
export async function exportEditorialEpub(
  chat: Chat,
  options: EditorialExportOptions,
  folder?: Folder | null
): Promise<void> {
  const manuscript = buildCleanedManuscript(chat, options);
  if (manuscript.cleanedScenes.length === 0) {
    throw new Error('No hay escenas narrativas limpias para exportar.');
  }

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.folder('META-INF')?.file('container.xml', containerXml);

  const docTitle = options.title || chat.title || 'Manuscrito Editorial';
  const docAuthor = options.author || 'Autor';
  const docSub = options.subtitle || folder?.name || '';
  const bookId = `kizuna_editorial_${chat.id}_${Date.now()}`;
  const fontStack =
    options.typography === 'serif_classic'
      ? 'Georgia, "Times New Roman", Garamond, serif'
      : '"Helvetica Neue", Arial, sans-serif';

  const chapterManifestItems: string[] = [];
  const chapterSpineItems: string[] = [];
  const navTocItems: string[] = [];

  // Portada Editorial
  const titlePageXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
  <title>${escapeXml(docTitle)}</title>
  <style>
    body { font-family: ${fontStack}; text-align: center; padding: 18% 8% 10% 8%; color: #111; }
    h1 { font-size: 2em; margin-bottom: 0.4em; letter-spacing: 0.02em; }
    h2 { font-size: 1.15em; font-weight: normal; font-style: italic; color: #444; margin-bottom: 2.5em; }
    .author { font-size: 1.1em; font-weight: bold; margin-top: 3em; }
    .meta { font-size: 0.85em; color: #666; margin-top: 4em; }
  </style>
</head>
<body>
  <h1>${escapeXml(docTitle)}</h1>
  ${docSub ? `<h2>${escapeXml(docSub)}</h2>` : ''}
  <p class="author">${escapeXml(docAuthor)}</p>
  <p class="meta">Edición Maquetada · ${manuscript.totalWords.toLocaleString()} palabras</p>
</body>
</html>`;

  zip.folder('OEBPS')?.file('titlepage.xhtml', titlePageXhtml);
  chapterManifestItems.push(`<item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>`);
  chapterSpineItems.push(`<itemref idref="titlepage"/>`);
  navTocItems.push(`<li><a href="titlepage.xhtml">Portada</a></li>`);

  manuscript.cleanedScenes.forEach((scene, idx) => {
    const chapNum = idx + 1;
    const id = `scene_${chapNum}`;
    const filename = `scene_${chapNum}.xhtml`;
    const chapterHeading = scene.heading || `Capítulo ${chapNum}`;

    const paragraphsHtml = scene.paragraphs
      .map((p) => {
        const cleanP = p
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/^#+\s*/gm, '');
        return `<p>${escapeXml(cleanP)}</p>`;
      })
      .join('\n  ');

    const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
  <title>${escapeXml(chapterHeading)}</title>
  <style>
    body { font-family: ${fontStack}; line-height: 1.75; padding: 6% 7%; color: #141414; }
    h1 { text-align: center; margin-top: 1.5em; margin-bottom: 2em; font-size: 1.35em; letter-spacing: 0.04em; }
    p { margin-top: 0; margin-bottom: 0.85em; text-indent: 1.4em; text-align: justify; }
  </style>
</head>
<body>
  ${scene.heading ? `<h1>${escapeXml(scene.heading)}</h1>` : ''}
  ${paragraphsHtml}
</body>
</html>`;

    zip.folder('OEBPS')?.file(filename, chapterXhtml);
    chapterManifestItems.push(`<item id="${id}" href="${filename}" media-type="application/xhtml+xml"/>`);
    chapterSpineItems.push(`<itemref idref="${id}"/>`);
    navTocItems.push(`<li><a href="${filename}">${escapeXml(chapterHeading)}</a></li>`);
  });

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapeXml(docTitle)}</dc:title>
    <dc:language>es</dc:language>
    <dc:creator>${escapeXml(docAuthor)}</dc:creator>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${chapterManifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${chapterSpineItems.join('\n    ')}
  </spine>
</package>`;
  zip.folder('OEBPS')?.file('content.opf', contentOpf);

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es">
<head>
  <title>Índice</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Índice Editorial</h1>
    <ol>
      ${navTocItems.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
  zip.folder('OEBPS')?.file('nav.xhtml', navXhtml);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  const safeName = docTitle.replace(/[/\\?%*:|"<>]/g, '_').trim();
  triggerBlobDownload(blob, `${safeName}_editorial.epub`);
}

/**
 * 4. Convertir Chat a PDF Editorial (vía Iframe de Impresión Limpio sin popups bloqueados)
 */
export function exportEditorialPdf(
  chat: Chat,
  options: EditorialExportOptions,
  folder?: Folder | null
): void {
  const manuscript = buildCleanedManuscript(chat, options);
  const docTitle = options.title || chat.title || 'Manuscrito Editorial';
  const docSub = options.subtitle || folder?.name || '';
  const docAuthor = options.author || 'Autor';
  const fontStack =
    options.typography === 'serif_classic'
      ? "'Georgia', 'Times New Roman', serif"
      : "'Inter', 'Helvetica Neue', Arial, sans-serif";

  const scenesHtml = manuscript.cleanedScenes
    .map((scene) => {
      const paras = scene.paragraphs
        .map((p) => {
          const cleanLine = escapeXml(p)
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
            .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
            .replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');
          return `<p>${cleanLine}</p>`;
        })
        .join('\n');

      return `
        <section class="scene">
          ${scene.heading ? `<h2 class="scene-heading">${escapeXml(scene.heading)}</h2>` : ''}
          ${paras}
        </section>
      `;
    })
    .join('\n<div class="divider">* &nbsp; * &nbsp; *</div>\n');

  const htmlDoc = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeXml(docTitle)}</title>
  <style>
    @page { margin: 20mm 18mm; }
    body {
      font-family: ${fontStack};
      color: #111111;
      background: #ffffff;
      line-height: 1.72;
      font-size: 11.5pt;
      margin: 0;
      padding: 0;
    }
    .header {
      text-align: center;
      border-bottom: 1px solid #d4d4d8;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 20pt;
      margin: 0 0 6px 0;
    }
    .header .sub {
      font-style: italic;
      color: #52525b;
      font-size: 11pt;
      margin: 0;
    }
    .scene-heading {
      font-size: 13pt;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin: 20px 0 12px 0;
      color: #27272a;
    }
    p {
      margin: 0 0 10px 0;
      text-align: justify;
    }
    .divider {
      text-align: center;
      color: #71717a;
      margin: 18px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeXml(docTitle)}</h1>
    <p class="sub">${docSub ? `${escapeXml(docSub)} — ` : ''}${escapeXml(docAuthor)} · ${manuscript.totalWords.toLocaleString()} palabras</p>
  </div>
  ${scenesHtml}
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlDoc);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {}
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 250);
  }
}

