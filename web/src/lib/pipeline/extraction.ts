import type { PDFDocumentProxy } from 'pdfjs-dist';
import { replaceMapped, type MappedText } from './mapping';
import type { RawPage, RawItem, RemovedLine } from './types';
export interface Extraction {
    pages: RawPage[];
    raw: string;
    clean: MappedText;
    removedLines: RemovedLine[];
    timings: Record<string, number>;
}
const BOILER = /^\s*(?:Mahkamah Agung Republik Indonesia|Direktori Putusan Mahkamah Agung Republik Indonesia|putusan\.mahkamahagung\.go\.id|Hal(?:aman)?\.?\s*\d+\s*(?:dari\s*\d+\s*(?:hal(?:aman)?\.?)?)?\s*,?\s*Putusan\s+(?:Nomor|No\.?)\s*:?\s*\d+\s*\/\s*Pid\.?\s*\.?\s*Sus\s*\/\s*\d{4}\s*\/\s*PN\.?\s*\w+\.?|Hal(?:aman)?\.?\s*\d+\s*(?:dari\s*\d+\s*(?:hal(?:aman)?\.?)?)?)\s*$/i;
export async function extractPdf(pdf: PDFDocumentProxy, onCleaning?: () => void, ocrPages?: RawPage[]): Promise<Extraction> {
    const started = performance.now();
    const pages: RawPage[] = [], removedLines: RemovedLine[] = [];
    let raw = '', id = 0;
    const dropped: [
        number,
        number
    ][] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber), content = await page.getTextContent();
        const items: RawItem[] = ocrPages ? ocrPages[pageNumber - 1].items.map(item => ({ ...item, id: id++ })) : content.items.filter(item => 'str' in item).map(item => {
            const [a, b, , , x, y] = item.transform, h = item.height || Math.hypot(a, b);
            return { id: id++, page: pageNumber, text: item.str, transform: item.transform, x, y: y - h * 0.2, w: item.width, h, horizontal: a / Math.hypot(a, b) > 0.99, start: 0, end: 0 };
        });
        const lines: RawItem[][] = [];
        for (const item of items.filter(i => i.horizontal && i.text).sort((a, b) => Math.round(b.transform[5]) - Math.round(a.transform[5]) || a.x - b.x)) {
            const line = lines.at(-1);
            if (line && Math.abs(line[0].transform[5] - item.transform[5]) < 2)
                line.push(item);
            else
                lines.push([item]);
        }
        let disclaimer = false;
        for (const line of lines) {
            line.sort((a, b) => a.x - b.x);
            const start = raw.length;
            for (let i = 0; i < line.length; i++) {
                const item = line[i], prev = line[i - 1];
                if (prev && !/\s$/.test(prev.text) && !/^\s/.test(item.text) && item.x - (prev.x + prev.w) > 0.8)
                    raw += ' ';
                item.start = raw.length;
                raw += item.text;
                item.end = raw.length;
            }
            const text = raw.slice(start);
            raw += '\n';
            if (/^\s*Disclaimer\s*$/i.test(text))
                disclaimer = true;
            const reason = disclaimer ? 'disclaimer' : BOILER.test(text) ? (/mahkamah|putusan\.mahkamah/i.test(text) ? 'watermark' : 'footer') : undefined;
            if (reason) {
                dropped.push([start, raw.length]);
                removedLines.push({ page: pageNumber, text, itemIds: line.map(i => i.id), reason });
            }
        }
        for (const item of items.filter(i => !i.horizontal))
            removedLines.push({ page: pageNumber, text: item.text, itemIds: [item.id], reason: 'non-horizontal' });
        pages.push({ page: pageNumber, width: page.view[2] - page.view[0], height: page.view[3] - page.view[1], items });
        page.cleanup();
    }
    const extracted = performance.now();
    onCleaning?.();
    let clean: MappedText;
    const removed = new Uint8Array(raw.length);
    for (const [a, b] of dropped)
        removed.fill(1, a, b);
    clean = { text: '', starts: [], ends: [] };
    const chars: string[] = [];
    for (let i = 0; i < raw.length; i++)
        if (!removed[i]) {
            chars.push(raw[i]);
            clean.starts.push(i);
            clean.ends.push(i + 1);
        }
    clean.text = chars.join('');
    const charMap: Record<string, string> = { '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '\u00a0': ' ', '\u00ad': '' };
    clean = replaceMapped(clean, /[“”‘’–—\u00a0\u00ad]/g, m => charMap[m[0]]);
    clean = replaceMapped(clean, /(\d)\s+\.(\d{3})/g, m => m[1] + '.' + m[2]);
    clean = replaceMapped(clean, /[ \t]+/g, () => ' ');
    clean = replaceMapped(clean, / *\n */g, () => '\n');
    // Preserve each letter's own origin when joining letter-spaced headings.
    const letterSpaces = new Set<number>();
    for (const m of clean.text.matchAll(/\b(?:[A-Za-z] ){2,}[A-Za-z]\b/g))
        for (let i = 0; i < m[0].length; i++)
            if (m[0][i] === ' ')
                letterSpaces.add(m.index! + i);
    clean = { text: [...clean.text].filter((_, i) => !letterSpaces.has(i)).join(''), starts: clean.starts.filter((_, i) => !letterSpaces.has(i)), ends: clean.ends.filter((_, i) => !letterSpaces.has(i)) };
    // Flat text is the canonical coordinate system for both sections and tokens.
    clean = replaceMapped(clean, /\s+/g, () => ' ');
    clean = replaceMapped(clean, /^\s+|\s+$/g, () => '');
    return { pages, raw, clean, removedLines, timings: { extraction: extracted - started, cleaning: performance.now() - extracted } };
}
