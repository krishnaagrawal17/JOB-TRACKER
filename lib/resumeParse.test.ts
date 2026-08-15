// @vitest-environment node
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { extractPdfText, extractDocxText, extractResumeText } from './resumeParse';

async function buildTestPdfBuffer(text: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([400, 200]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 20, y: 100, size: 18, font });
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

async function buildTestDocxBuffer(text: string): Promise<Buffer> {
  const doc = new DocxDocument({
    sections: [
      {
        children: [new Paragraph({ children: [new TextRun(text)] })],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

describe('extractPdfText', () => {
  it('extracts text from a real minimal PDF buffer', async () => {
    const buffer = await buildTestPdfBuffer('Jane Doe Resume Text');
    const text = await extractPdfText(buffer);
    expect(text).toContain('Jane Doe Resume Text');
  });
});

describe('extractDocxText', () => {
  it('extracts text from a real minimal DOCX buffer', async () => {
    const buffer = await buildTestDocxBuffer('Jane Doe Resume Text');
    const text = await extractDocxText(buffer);
    expect(text).toContain('Jane Doe Resume Text');
  });
});

describe('extractResumeText', () => {
  it('dispatches to extractPdfText for application/pdf', async () => {
    const buffer = await buildTestPdfBuffer('PDF dispatch text');
    const text = await extractResumeText(buffer, 'application/pdf');
    expect(text).toContain('PDF dispatch text');
  });

  it('dispatches to extractDocxText for the DOCX mimetype', async () => {
    const buffer = await buildTestDocxBuffer('DOCX dispatch text');
    const text = await extractResumeText(
      buffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(text).toContain('DOCX dispatch text');
  });

  it('throws for an unsupported mimetype', async () => {
    await expect(extractResumeText(Buffer.from('not a resume'), 'text/plain')).rejects.toThrow(
      'Unsupported resume file type'
    );
  });
});
