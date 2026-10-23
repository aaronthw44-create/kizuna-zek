import JSZip from 'jszip';
import { Chat } from '../types';

export async function exportChatToEpub(chat: Chat, folderName?: string): Promise<void> {
  if (!chat || !chat.messages || chat.messages.length === 0) {
    throw new Error('No hay contenido en la conversación para exportar.');
  }

  const zip = new JSZip();

  // 1. mimetype (MUST be first file in ZIP and uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.folder('META-INF')?.file('container.xml', containerXml);

  // Extract assistant scenes as chapters
  const assistantMessages = chat.messages.filter((m) => m.role === 'assistant' && m.content.trim());
  const chapters = assistantMessages.length > 0 ? assistantMessages : chat.messages;

  const title = chat.title || 'Escena Narrativa';
  const author = 'Kizuna-Zek Workspace';
  const bookId = `kizuna_${chat.id}_${Date.now()}`;

  // Build chapter XHTML files
  const chapterManifestItems: string[] = [];
  const chapterSpineItems: string[] = [];
  const navTocItems: string[] = [];

  chapters.forEach((msg, idx) => {
    const chapNum = idx + 1;
    const id = `chapter_${chapNum}`;
    const filename = `chapter_${chapNum}.xhtml`;

    // Format content paragraphs
    const paragraphs = msg.content
      .split(/\n\n+/)
      .map((p) => `<p>${escapeXml(p.trim())}</p>`)
      .join('\n');

    const chapterHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
  <title>Capítulo ${chapNum}</title>
  <style>
    body { font-family: serif; line-height: 1.6; padding: 5%; color: #111; }
    h1 { text-align: center; margin-bottom: 2em; font-size: 1.4em; }
    p { margin-bottom: 1em; text-indent: 1em; }
  </style>
</head>
<body>
  <h1>Capítulo ${chapNum}</h1>
  ${paragraphs}
</body>
</html>`;

    zip.folder('OEBPS')?.file(filename, chapterHtml);

    chapterManifestItems.push(`<item id="${id}" href="${filename}" media-type="application/xhtml+xml"/>`);
    chapterSpineItems.push(`<itemref idref="${id}"/>`);
    navTocItems.push(`<li><a href="${filename}">Capítulo ${chapNum}</a></li>`);
  });

  // OEBPS/content.opf
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>es</dc:language>
    <dc:creator>${author}</dc:creator>
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

  // OEBPS/nav.xhtml
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es">
<head>
  <title>Índice</title>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Índice de Capítulos</h1>
    <ol>
      ${navTocItems.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
  zip.folder('OEBPS')?.file('nav.xhtml', navXhtml);

  // Generate EPUB Blob & download
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[/\\?%*:|"<>]/g, '_')}.epub`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
