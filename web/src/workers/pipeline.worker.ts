/// <reference lib="webworker" />
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { unzipSync } from 'fflate';
import caseData from '../data/cases.json';
import { recognizePdf } from '../lib/pipeline/ocr';
import { processDocument, PIPELINE_VERSION } from '../lib/pipeline/process';
import { CorpusIndex } from '../lib/pipeline/search';
import { evaluate } from '../lib/pipeline/evaluation';
import { tokenStages } from '../lib/pipeline/preprocess';
import { loadCache, saveCache, clearCache } from '../lib/pipeline/cache';
import type { PipelineRequest, PipelineResponse } from '../lib/pipeline/protocol';
import type { ProcessedDocument, CaseMetadata, PipelineOptions } from '../lib/pipeline/types';
// Keep pdf.js protocol messages on a dedicated nested worker port.
GlobalWorkerOptions.workerPort = new Worker(pdfWorkerUrl, { type: 'module' });
class WorkerCanvasFactory {
    create(width: number, height: number) {
        const canvas = new OffscreenCanvas(width, height);
        return { canvas, context: canvas.getContext('2d')! };
    }
    reset(target: { canvas: OffscreenCanvas }, width: number, height: number) {
        target.canvas.width = width; target.canvas.height = height;
    }
    destroy(target: { canvas: OffscreenCanvas | null; context: OffscreenCanvasRenderingContext2D | null }) {
        if (target.canvas) { target.canvas.width = 0; target.canvas.height = 0; }
        target.canvas = null; target.context = null;
    }
    getNoAlphaContext(canvas: OffscreenCanvas) { return canvas.getContext('2d', { alpha: false }); }
}
let pdfBytes = new Map<string, Uint8Array>();
let documents: ProcessedDocument[] = [], cases: CaseMetadata[] = caseData.cases;
const indexes = new Map<string, CorpusIndex>();
let loading = false;
const send = (message: PipelineResponse) => self.postMessage(message);
function index(options: PipelineOptions = {}) { const key = JSON.stringify([!!options.stemming, options.stopwords !== false]); if (!indexes.has(key))
    indexes.set(key, new CorpusIndex(documents, options)); return indexes.get(key)!; }
async function handle(request: PipelineRequest) {
    const { id } = request;
    try {
        if (request.type === 'load') {
            if (loading)
                throw new Error('A corpus is already loading');
            loading = true;
            try {
                const start = performance.now();
                let completed = 0, pages = 0, tokens = 0, total = 0;
                const progress = (stage: string, event: 'stage' | 'document-started' | 'document-finished' = 'stage', documentId?: string) => send({ id, type: 'progress', event, stage, documentId, completed, total, pages, tokens, elapsed: performance.now() - start });
                const warning = (kind: 'storage' | 'ocr', error: unknown) => {
                    if (kind === 'ocr') console.error('OCR failed', error);
                    else console.warn('Browser storage failed', error);
                    send({ id, type: 'warning', kind, message: String(error) });
                };
                const persist = async (docs: ProcessedDocument[]) => {
                    try { await saveCache(key, docs); } catch (error) { warning('storage', error); }
                };
                if (request.force) await clearCache();
                progress('fetch');
                const response = await fetch(request.zipUrl);
                if (!response.ok)
                    throw new Error(`ZIP fetch failed: ${response.status}`);
                const bytes = await response.arrayBuffer();
                const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
                const key = PIPELINE_VERSION + ':' + hash;
                progress('cache');
                let cached: ProcessedDocument[] | undefined;
                try {
                    if (!request.force)
                        cached = await loadCache(key);
                }
                catch (error) { warning('storage', error); }
                const entries = Object.entries(unzipSync(new Uint8Array(bytes))).filter(([name]) => /\.pdf$/i.test(name)).sort((a, b) => parseInt(a[0].split('/').at(-1)!) - parseInt(b[0].split('/').at(-1)!));
                pdfBytes = new Map(entries);
                total = entries.length;
                const next: ProcessedDocument[] = cached ?? [];
                if (!cached) {
                    progress('unzip');
                    total = entries.length;
                    for (const [name, data] of entries) {
                        progress('extraction', 'document-started', name);
                        const task = getDocument({ data: data.slice(), useSystemFonts: true });
                        const pdf = await task.promise;
                        try {
                            const doc = await processDocument(pdf, name, stage => progress(stage, 'stage', name));
                            next.push(doc);
                            completed++;
                            pages += doc.pages.length;
                            tokens += doc.tokens.length;
                            progress('complete', 'document-finished', doc.id);
                        }
                        finally {
                            await task.destroy();
                        }
                    }
                    progress('persist');
                    await persist(next);
                }
                if (cached) {
                    total = completed = next.length;
                    pages = next.reduce((sum, doc) => sum + doc.pages.length, 0);
                    tokens = next.reduce((sum, doc) => sum + doc.tokens.length, 0);
                }
                documents = next;
                cases = request.cases ?? caseData.cases;
                indexes.clear();
                progress('index');
                index();
                const timings: Record<string, number> = {};
                for (const doc of documents)
                    for (const [stage, ms] of Object.entries(doc.timings))
                        timings[stage] = (timings[stage] ?? 0) + ms;
                timings.total = performance.now() - start;
                const ready = (fromCache: boolean) => send({ id, type: 'ready', summary: { version: PIPELINE_VERSION, documents: documents.map(d => ({ id: d.id, fileName: d.fileName, pages: d.pages.length, needsOcr: d.needsOcr, amarFound: d.sections.amar.found, tokens: d.tokens.length })), statistics: index().statistics(), timings, cached: fromCache } });
                ready(!!cached);
                if (request.ocr !== false && documents.some(doc => doc.needsOcr)) {
                    try {
                        const scanned = documents.find(doc => doc.needsOcr)!;
                        send({ id, type: 'progress', event: 'stage', stage: 'ocr', documentId: scanned.id, completed: 0, total: scanned.pages.length, pages, tokens, elapsed: performance.now() - start });
                        const { createWorker } = await import('tesseract.js');
                        const base = request.assetBase;
                        // Tesseract's initialization promise can remain pending after a
                        // language-load failure; its error callback must reject this wait.
                        const ocr = await new Promise<import('tesseract.js').Worker>((resolve, reject) => {
                            void createWorker('ind', 1, { workerPath: new URL('tesseract/worker.min.js', base).href, corePath: new URL('tesseract/', base).href, langPath: new URL('tessdata/', base).href, gzip: false, workerBlobURL: false, cacheMethod: 'none', errorHandler: reject }).then(resolve, reject);
                        });
                        try {
                            for (const doc of documents.filter(d => d.needsOcr)) {
                                const task = getDocument({ data: pdfBytes.get(doc.fileName)!.slice(), useSystemFonts: true, CanvasFactory: WorkerCanvasFactory });
                                try {
                                    const pdf = await task.promise;
                                    const ocrPages = await recognizePdf(pdf, ocr, async (page, scale) => {
                                        const viewport = page.getViewport({ scale });
                                        const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
                                        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d')! as unknown as CanvasRenderingContext2D, viewport }).promise;
                                        return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
                                    }, (page, count) => send({ id, type: 'progress', event: 'stage', stage: 'ocr', documentId: doc.id, completed: page, total: count, pages, tokens, elapsed: performance.now() - start }));
                                    const result = await processDocument(pdf, doc.fileName, undefined, ocrPages);
                                    result.id = doc.id;
                                    if (result.needsOcr) throw new Error('OCR tidak menghasilkan teks.');
                                    if (!result.sections.amar.found) throw new Error('Teks OCR tidak memuat bagian amar yang dapat dikenali.');
                                    documents = documents.map(d => d === doc ? result : d);
                                } finally { await task.destroy(); }
                            }
                            indexes.clear();
                            index();
                            tokens = documents.reduce((sum, doc) => sum + doc.tokens.length, 0);
                            completed = total = documents.length;
                            progress('persist');
                            timings.total = performance.now() - start;
                            await persist(documents);
                        } finally { await ocr.terminate(); }
                        ready(false);
                    } catch (error) { warning('ocr', error); }
                }
            }
            finally {
                loading = false;
            }
        }
        else if (request.type === 'preprocess')
            send({ id, type: 'preprocess', stages: tokenStages(request.text) });
        else {
            if (!documents.length)
                throw new Error('Load a corpus before querying it');
            if (request.type === 'pdf') {
                const doc = documents.find(d => d.id === request.documentId);
                const data = doc && pdfBytes.get(doc.fileName);
                if (!data) throw new Error('PDF tidak ditemukan');
                const bytes = data.slice().buffer as ArrayBuffer;
                self.postMessage({ id, type: 'pdf', bytes } satisfies PipelineResponse, [bytes]);
            } else if (request.type === 'search') {
                const corpus = index(request.options), parsed = corpus.parseQuery(request.query);
                const results = corpus.search(request.query, { ...request.options, filters: undefined, k: documents.length }).filter(result => {
                    const metadata = cases.find(c => parseInt(String(c['No Putusan'])) === parseInt(result.id));
                    return Object.entries(request.options?.filters ?? {}).every(([key, value]) => String(metadata?.[key] ?? '') === value);
                }).slice(0, request.options?.k ?? 10);
                send({ id, type: 'search', results, parsed: { ...parsed, excluded: [...parsed.excluded] } });
            }
            else if (request.type === 'explain')
                send({ id, type: 'explain', contributions: index({ stemming: request.stemming }).explain(request.query, request.documentId, request.model, true, request.parameters) });
            else if (request.type === 'evaluate')
                send({ id, type: 'evaluate', evaluation: evaluate(index({ stemming: request.stemming }), cases, request.model) });
            else if (request.type === 'inspect') {
                const document = documents.find(d => d.id === request.documentId);
                if (!document)
                    throw new Error('Unknown document');
                send({ id, type: 'inspect', document });
            }
        }
    }
    catch (error) {
        send({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
}
self.onmessage = (event: MessageEvent<PipelineRequest>) => { void handle(event.data); };
