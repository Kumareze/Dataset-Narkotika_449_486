import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Worker, ImageLike } from 'tesseract.js';
import type { RawPage } from './types';

export const OCR_SCALE = 3;
/** Renderers return PNG bytes so browser workers and Node use the same recognizer. */
export async function recognizePdf(pdf: PDFDocumentProxy, worker: Worker,
    render: (page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>, scale: number) => Promise<ImageLike>,
    progress: (page: number, total: number) => void): Promise<RawPage[]> {
    const pages: RawPage[] = [];
    let id = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
        progress(number, pdf.numPages);
        const page = await pdf.getPage(number), viewport = page.getViewport({ scale: OCR_SCALE });
        const image = await render(page, OCR_SCALE);
        const { data } = await worker.recognize(image, {}, { blocks: true });
        const items: RawPage['items'] = [];
        for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
            // Keep a shared baseline for reading order; the rectangle retains each word's exact bounds.
            const baseline = viewport.convertToPdfPoint(line.bbox.x0, line.bbox.y1)[1];
            for (const word of line.words) {
                if (!word.text.trim()) continue;
                const { x0, y0, x1, y1 } = word.bbox;
                const [ax, ay] = viewport.convertToPdfPoint(x0, y0), [bx, by] = viewport.convertToPdfPoint(x1, y1);
                const x = Math.min(ax, bx), y = Math.min(ay, by), w = Math.abs(bx - ax), h = Math.abs(by - ay);
                items.push({ id: id++, page: number, text: word.text, x, y, w, h, transform: [h, 0, 0, h, x, baseline], horizontal: true, start: 0, end: 0 });
            }
        }
        pages.push({ page: number, width: page.view[2] - page.view[0], height: page.view[3] - page.view[1], items });
        page.cleanup();
    }
    return pages;
}
