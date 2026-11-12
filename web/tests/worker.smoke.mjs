// Open /tests/worker.smoke.html through Vite to exercise actual nested workers.
import zipUrl from '../../Dataset/Narkotika.zip?url';
const output = document.querySelector('pre');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const worker = new Worker(new URL('../src/workers/pipeline.worker.ts', import.meta.url), { type: 'module' });
const pending = new Map();
const testOcr = new URL(location.href).searchParams.has('ocr');
let ocrProgress = 0, finishOcr;
const ocrFinished = new Promise(resolve => { finishOcr = resolve; });
let sequence = 0, protocolError;
worker.onmessage = ({ data }) => {
  if (!data.id || !['warning', 'progress', 'ready', 'search', 'explain', 'evaluate', 'inspect', 'preprocess', 'pdf', 'error'].includes(data.type)) {
    protocolError = new Error(`Foreign message: ${JSON.stringify(data)}`);
    output.textContent = String(protocolError);
    return;
  }
  if (data.type === 'warning') { console.warn(data); if (testOcr) finishOcr({ error: data.message }); return; }
  if (data.type === 'progress') { if (data.stage === 'ocr') ocrProgress++; output.textContent = `${data.stage}: ${data.completed}/${data.total}`; return; }
  if (testOcr && data.type === 'ready' && data.summary.documents.every(d => !d.needsOcr)) finishOcr(data);
  const entry = pending.get(data.id);
  if (!entry) return;
  pending.delete(data.id);
  if (data.type === 'error') entry.reject(new Error(data.message)); else entry.resolve(data);
};
worker.onerror = event => { for (const entry of pending.values()) entry.reject(new Error(event.message)); pending.clear(); };
const request = message => new Promise((resolve, reject) => {
  const id = String(++sequence);
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('Worker request timed out')); }, 180000);
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  worker.postMessage({ ...message, id });
});
try {
  const ready = await request({ type: 'load', zipUrl, assetBase: new URL('../', location.href).href, ocr: testOcr, force: testOcr });
  assert(ready.summary.documents.length === 50, 'Expected 50 documents');
  assert(ready.summary.documents.filter(d => d.needsOcr).length <= 1, 'Unexpected OCR document count');
  const search = await request({ type: 'search', query: 'perantara jual beli sabu', options: { k: 5 } });
  assert(search.results.length === 5 && search.results[0].rectangles.length, 'Search must return mapped matches');
  const documentId = search.results[0].id;
  const explanation = await request({ type: 'explain', query: 'perantara jual beli sabu', documentId });
  assert(Math.abs(explanation.contributions.reduce((sum, c) => sum + c.contribution, 0) - search.results[0].score) < 1e-12, 'Score mismatch');
  const first = await request({ type: 'pdf', documentId });
  const second = await request({ type: 'pdf', documentId });
  assert(first.bytes instanceof ArrayBuffer && first.bytes.byteLength === second.bytes.byteLength, 'PDF bytes must survive repeated transfers');
  assert(new TextDecoder().decode(new Uint8Array(first.bytes, 0, 5)) === '%PDF-', 'Invalid PDF');
  if (testOcr) {
    assert(ready.summary.documents.filter(d => !d.needsOcr).length === 49, 'Text corpus must be ready before OCR');
    let timer;
    const finished = await Promise.race([ocrFinished, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OCR timed out')), 600000); })]).finally(() => clearTimeout(timer));
    assert(!finished.error, `OCR/cache warning: ${finished.error}`);
    assert(ocrProgress >= 22, 'Missing OCR page progress');
    const scanned = ready.summary.documents.find(d => d.needsOcr);
    const inspected = await request({ type: 'inspect', documentId: scanned.id });
    assert(inspected.document.sections.amar.found && !inspected.document.needsOcr, 'OCR amar missing');
    const hits = await request({ type: 'search', query: 'tembakau sintetis', options: { k: 50 } });
    assert(hits.results.some(hit => hit.id === scanned.id && hit.rectangles.length), 'OCR result must have highlight boxes');
  }
  const progressBeforeReload = ocrProgress;
  const cached = await request({ type: 'load', zipUrl, assetBase: new URL('../', location.href).href, ocr: testOcr });
  assert(cached.summary.cached, 'IndexedDB cache was not reused');
  if (testOcr) {
    assert(cached.summary.documents.every(d => !d.needsOcr), 'Cache lost OCR document');
    await request({ type: 'preprocess', text: 'cache barrier' });
    assert(ocrProgress === progressBeforeReload, 'Cache reload reran OCR');
  }
  assert(!protocolError, String(protocolError));
  output.textContent = `PASS: isolated worker protocol, 50 PDFs, search, explanation, repeated PDF transfer, IndexedDB cache${testOcr ? ', background OCR, progress, OCR search boxes, cached OCR reuse' : ''}. Viewer rendering requires a separate UI check.`;
} catch (error) { output.textContent = `FAIL: ${error}`; }
finally { worker.terminate(); }
