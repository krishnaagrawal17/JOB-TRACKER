import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

const PDF_MIMETYPE = 'application/pdf';
const DOCX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // disableFontFace stops PDF.js from fetching external font files (e.g. FoxitSymbol.pfb).
  // We only need text extraction, so font rendering is irrelevant and this is safe.
  const pdf = await getDocumentProxy(new Uint8Array(buffer), { disableFontFace: true });
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIMETYPE) {
    return extractPdfText(buffer);
  }
  if (mimeType === DOCX_MIMETYPE) {
    return extractDocxText(buffer);
  }
  throw new Error(`Unsupported resume file type: ${mimeType}`);
}
