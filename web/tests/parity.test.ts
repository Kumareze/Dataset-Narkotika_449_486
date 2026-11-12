import assert from 'node:assert/strict';
import { serialize } from 'node:v8';
import { recognizePdf } from '../src/lib/pipeline/ocr';
import { extractPdf } from '../src/lib/pipeline/extraction';
import { sections } from '../src/lib/pipeline/sections';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { processDocument } from '../src/lib/pipeline/process';
import { CorpusIndex } from '../src/lib/pipeline/search';
import { evaluate, QUERIES } from '../src/lib/pipeline/evaluation';
import { normalize, rawStem, stem } from '../src/lib/pipeline/preprocess';
import stopwords from '../src/lib/pipeline/stopwords.json';
import type { CaseMetadata, ProcessedDocument, Model } from '../src/lib/pipeline/types';
const root = new URL('../../', import.meta.url), start = performance.now();
for (const heading of ['MENGADILLI:', 'M E N G A D I L I :']) {
    const text = `${heading} 1. Menyatakan terdakwa bersalah. Demikian diputuskan dalam sidang.`;
    const amar = sections(text, true).amar;
    assert.ok(amar.found, `OCR heading: ${heading}`);
    assert.equal(text.slice(amar.start, amar.end), '1. Menyatakan terdakwa bersalah.');
    assert.equal(sections(text).amar.found, false, 'OCR tolerance must not affect text PDFs');
}
assert.equal(sections('Menimbang MENGADILLI dalam perkara ini.', true).amar.found, false);
const cases = (JSON.parse(await readFile(new URL('web/src/data/cases.json', root), 'utf8')) as {
    cases: CaseMetadata[];
}).cases;
const bytes = await readFile(new URL('Dataset/Narkotika.zip', root));
const entries = Object.entries(unzipSync(bytes)).filter(([name]) => /\.pdf$/i.test(name)).sort((a, b) => parseInt(a[0].split('/').at(-1)!) - parseInt(b[0].split('/').at(-1)!));
const docs: ProcessedDocument[] = [], timings: Record<string, number> = {};
for (const [name, data] of entries) {
    const task = getDocument({ data: data.slice(), useSystemFonts: true, verbosity: 0 });
    try {
        const pdf = await task.promise, doc = await processDocument(pdf, name);
        docs.push(doc);
        for (const [stage, ms] of Object.entries(doc.timings))
            timings[stage] = (timings[stage] ?? 0) + ms;
        console.log(`${docs.length}/${entries.length} ${doc.id}: ${doc.pages.length} pages, ${doc.tokens.length} tokens, amar=${doc.sections.amar.found}, OCR=${doc.needsOcr}`);
    }
    finally {
        await task.destroy();
    }
}
assert.doesNotThrow(() => structuredClone(docs), 'processed documents must survive structured clone');
console.log('Cache bytes:', { json: Buffer.byteLength(JSON.stringify(docs)), structured: serialize(docs).byteLength, largestDocument: Math.max(...docs.map(doc => serialize(doc).byteLength)) });
const processingMs = performance.now() - start;
const indexStart = performance.now(), index = new CorpusIndex(docs);
timings.index = performance.now() - indexStart;
const results = [];
for (const stemming of [false, true]) {
    const idx = stemming ? new CorpusIndex(docs, { stemming }) : index;
    for (const model of ['BM25', 'BM25F', 'TF-IDF', 'Boolean'] as Model[]) {
        const result = evaluate(idx, cases, model);
        results.push(result);
        console.log(JSON.stringify({ model, stemming, ...result.mean, MAP: result.MAP, MRR: result.MRR }));
    }
}
const amar = docs.filter(d => !d.needsOcr).map(d => ({ id: d.id, actual: String(d.attributes['Amar Putusan']), expected: String(cases.find(c => c['No Putusan'] === d.id)?.['Amar Putusan'] ?? '') }));
let ocrDocument: ProcessedDocument | undefined;
let ocrMs = 0;
if (process.env.PARITY_OCR === '1') {
    const { createWorker } = await import('tesseract.js');
    const { createCanvas } = await import('@napi-rs/canvas');
    const [name, data] = entries.find(([name]) => name.split('/').at(-1)!.startsWith('392_'))!;
    const began = performance.now();
    const worker = await createWorker('ind', 1, { langPath: fileURLToPath(new URL('../public/tessdata/', import.meta.url)), gzip: false, cacheMethod: 'none' });
    const task = getDocument({ data: data.slice(), useSystemFonts: true, verbosity: 0 });
    try {
        const pdf = await task.promise;
        const pages = await recognizePdf(pdf, worker, async (page, scale) => {
            const viewport = page.getViewport({ scale });
            const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
            await page.render({ canvas: canvas as never, canvasContext: canvas.getContext('2d') as never, viewport }).promise;
            return canvas.toBuffer('image/png');
        }, (page, total) => console.log(`OCR halaman ${page}/${total}`));
        ocrDocument = await processDocument(pdf, name, undefined, pages);
        if (process.env.PARITY_OCR_DUMP) {
            const extraction = await extractPdf(pdf, undefined, pages);
            await writeFile(process.env.PARITY_OCR_DUMP, JSON.stringify({ pages, raw: extraction.raw, clean: extraction.clean.text, removedLines: extraction.removedLines, sections: ocrDocument.sections }, null, 2));
        }
        ocrDocument.id = docs.find(d => d.needsOcr)!.id;
        assert.ok(ocrDocument.sections.amar.found, 'OCR must find amar');
        assert.doesNotThrow(() => structuredClone(ocrDocument));
        const ocrIndex = new CorpusIndex([ocrDocument]);
        const hits = ocrIndex.search('tembakau sintetis');
        assert.ok(hits.length && hits[0].rectangles.length, 'OCR text must be searchable with source boxes');
        for (const rect of hits[0].rectangles) {
            const word = ocrDocument.pages[rect.page - 1].items.find(item => item.id === rect.itemId)!;
            assert.deepEqual([rect.x, rect.y, rect.w, rect.h], [word.x, word.y, word.w, word.h], 'OCR highlights retain whole word boxes');
        }
        amar.push({ id: ocrDocument.id, actual: String(ocrDocument.attributes['Amar Putusan']), expected: String(cases.find(c => c['No Putusan'] === ocrDocument!.id)?.['Amar Putusan'] ?? '') });
        ocrMs = performance.now() - began;
        console.log(`OCR time: ${(ocrMs / 1000).toFixed(2)} s`);
    } finally { await task.destroy(); await worker.terminate(); }
}
const vocabulary = [...index.postings.keys()].sort();
console.log(`Running isolated PySastrawi and difflib oracle on ${vocabulary.length} vocabulary terms...`);
if (process.env.PARITY_PREPARE) {
    await writeFile(process.env.PARITY_PREPARE, JSON.stringify({ amar, vocabulary }));
    console.log(JSON.stringify({ timings, processingMs }));
    process.exit(0);
}
const oracle: {
    inputHash: string;
    similarities: Record<string, number>;
    stems: Record<string, string>;
    stopwords: string[];
} = process.env.PARITY_ORACLE ? JSON.parse(await readFile(process.env.PARITY_ORACLE, 'utf8')) : await new Promise<{
    inputHash: string;
    similarities: Record<string, number>;
    stems: Record<string, string>;
    stopwords: string[];
}>((resolve, reject) => {
    const child = spawn(fileURLToPath(new URL('.venv/Scripts/python.exe', root)), ['-I', fileURLToPath(new URL('reference.py', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => out += data);
    child.stderr.on('data', data => err += data);
    child.on('error', reject);
    child.on('close', code => { if (code !== 0)
        reject(new Error(`Python oracle ${code}: ${err}`));
    else {
        try {
            resolve(JSON.parse(out));
        }
        catch (error) {
            reject(error);
        }
    } });
    child.stdin.end(JSON.stringify({ amar, vocabulary }));
});
assert.equal(oracle.inputHash, createHash('sha256').update(JSON.stringify({ amar, vocabulary })).digest('hex'), 'oracle must match this corpus and extraction');
const sorted = Object.values(oracle.similarities).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
const identical = vocabulary.filter(w => rawStem(w) === oracle.stems[w]).length;
const differences = vocabulary.filter(w => rawStem(w) !== oracle.stems[w]);
let rectangles = 0, matches = 0;
for (const query of [...QUERIES.map(q => q.query), '"tanpa hak" -ganja', 'shabu-shabu', 'golongan I'])
    for (const result of index.search(query, { k: 50 })) {
        const doc = index.documents.get(result.id)!;
        const discarded=new Set(doc.removedLines.flatMap(line=>line.itemIds));
        for (const match of result.matches) {
            matches++;
            assert.equal(normalize(doc.text.slice(match.start, match.end)), match.normalized, 'clean range must normalize to matched token');
            for (const rect of match.rectangles) {
                rectangles++;
                assert.ok(!discarded.has(rect.itemId),'boilerplate must never be highlighted');
                const item = doc.pages[rect.page - 1].items.find(i => i.id === rect.itemId)!;
                assert.ok(item, 'rectangle must refer to extracted item');
                assert.equal(item.text.slice(rect.start, rect.end), rect.text);
                assert.ok(rect.w > 0 && rect.h > 0);
                assert.ok(Math.abs(rect.x - (item.x + item.w * rect.start / item.text.length)) < 1e-6);
                assert.ok(Math.abs(rect.w - item.w * (rect.end - rect.start) / item.text.length) < 1e-6);
            }
            // Multi-item normalization is checked as a union; each source fragment remains
            // verifiable against its own extracted item rather than a fabricated term box.
            const sourceText = match.rectangles.map(r => r.text).join(' ');
            assert.ok(normalize(sourceText).trim() === match.normalized || normalize(match.rectangles.map(r => r.text).join('')).trim() === match.normalized, `source mismatch ${match.normalized}: ${sourceText}`);
        }
    }
const constrained = index.search('"tanpa hak" -ganja', { k: 50 });
assert.ok(constrained.length > 0);
for (const hit of constrained) {
    const terms = index.terms.get(hit.id)!;
    assert.ok(!terms.includes('ganja'));
    assert.ok(terms.some((term, i) => term === 'tanpa' && terms[i + 1] === 'hak'));
}
const filtered = index.search('barang bukti', { filters: { 'Jenis Narkotika': 'Ganja' }, k: 50 });
assert.ok(filtered.length > 0);
assert.ok(filtered.every(hit => String(index.documents.get(hit.id)!.attributes['Jenis Narkotika']).includes('Ganja')));
const bm25 = results.find(r => r.model === 'BM25' && !r.stemming)!;
console.log(JSON.stringify({ documents: docs.length, textDocuments: amar.length, pages: docs.reduce((n, d) => n + d.pages.length, 0), amarFound: docs.filter(d => !d.needsOcr && d.sections.amar.found).length, amarMedian: median, amarMinimum: sorted[0], BM25_MAP: bm25.MAP, rectangles, matches, stemmerAgreement: 100 * identical / vocabulary.length, stemmerIdentical: identical, vocabulary: vocabulary.length, stemmerDifferences: differences.slice(0, 25).map(word => ({ word, js: rawStem(word), python: oracle.stems[word] })), timings, processingMs, totalMs: performance.now() - start }, null, 2));
assert.equal(docs.length, 50);
assert.equal(amar.length, ocrDocument ? 50 : 49);
if (ocrDocument) {
    const similarity = oracle.similarities[ocrDocument.id];
    console.log(JSON.stringify({ ocrAmarSimilarity: similarity, ocrMs }));
    assert.ok(similarity >= .8, `OCR amar similarity ${similarity} < .8`);
}
assert.ok(median >= .9, `amar median ${median} < .9`);
assert.ok(docs.filter(d => !d.needsOcr && d.sections.amar.found).length >= 48);
assert.ok(Math.abs(bm25.MAP - .711) <= .02, `BM25 MAP ${bm25.MAP} outside .711 ± .02`);
assert.deepEqual(stopwords, oracle.stopwords);
assert.equal(rawStem('menyimpan'), 'simpan');
assert.equal(rawStem('penjualan'), 'jual');
assert.equal(rawStem('perantara'), 'antara');
assert.equal(stem('perantara'), 'perantara');
console.log('PASS: corpus parity, qrels, protected words, stopword copy, and PDF source rectangles.');

