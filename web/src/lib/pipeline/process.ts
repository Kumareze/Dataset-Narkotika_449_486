import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractPdf } from './extraction';
import { sections } from './sections';
import { extractAttributes } from './attributes';
import { normalizedMap, TOKEN, keep, preprocess } from './preprocess';
import { ZONES, type ProcessedDocument, type SourceRange, type Token, type Zone, type RawPage } from './types';
export const PIPELINE_VERSION = '2026-11-12.3';
/** OCR entry point: supply OCR items in PDF user space to the extraction adapter,
 * then reuse cleaning/tokenization. No metadata is substituted for missing text. */
export async function processDocument(pdf: PDFDocumentProxy, fileName: string, onStage?: (stage: string) => void, ocrPages?: RawPage[]): Promise<ProcessedDocument> {
    const timings: Record<string, number> = {};
    let start = performance.now();
    onStage?.('extraction');
    const extraction = await extractPdf(pdf, () => onStage?.('cleaning'), ocrPages);
    Object.assign(timings, extraction.timings);
    start = performance.now();
    onStage?.('sections');
    const { pages, clean, removedLines } = extraction, text = clean.text, sec = sections(text, !!ocrPages), attributes = extractAttributes(text, sec, pages.length);
    timings.sections = performance.now() - start;
    start = performance.now();
    onStage?.('preprocessing');
    // A normalized token may span a page break; discarded headers between its
    // endpoints must never become highlight rectangles.
    const discarded = new Set(removedLines.flatMap(line => line.itemIds));
    const normalized = normalizedMap(text), items = pages.flatMap(p => p.items).filter(i => i.horizontal && i.end > i.start && !discarded.has(i.id)).sort((a, b) => a.start - b.start);
    const sources = (a: number, b: number): SourceRange[] => {
        const rawStart = clean.starts[a], rawEnd = clean.ends[b - 1];
        let lo = 0, hi = items.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (items[mid].end <= rawStart)
                lo = mid + 1;
            else
                hi = mid;
        }
        const out: SourceRange[] = [];
        for (let i = lo; i < items.length && items[i].start < rawEnd; i++) {
            const item = items[i], left = Math.max(rawStart, item.start) - item.start, right = Math.min(rawEnd, item.end) - item.start;
            if (right > left)
                out.push({ itemId: item.id, page: item.page, start: left, end: right, text: item.text.slice(left, right), x: ocrPages ? item.x : item.x + item.w * left / item.text.length, y: item.y, w: ocrPages ? item.w : item.w * (right - left) / item.text.length, h: item.h });
        }
        return out;
    };
    const tokens: Token[] = [];
    for (const m of normalized.text.matchAll(TOKEN))
        if (keep(m[0])) {
            const a = normalized.starts[m.index!], b = normalized.ends[m.index! + m[0].length - 1];
            tokens.push({ term: m[0], normalized: m[0], start: a, end: b, sources: sources(a, b) });
        }
    const zoneTokens = Object.fromEntries(ZONES.map(z => [z, preprocess(sec[z].text)])) as Record<Zone, string[]>;
    timings.preprocessing = performance.now() - start;
    return { id: String(attributes['No Putusan'] || `${parseInt(fileName.split('/').at(-1)!)} /Pid.Sus/2025/PN Bks`).replace(/\s*\//g, '/'), fileName, pages, text, removedLines, sections: sec, attributes, tokens, zoneTokens, needsOcr: text.length < 80, timings };
}
