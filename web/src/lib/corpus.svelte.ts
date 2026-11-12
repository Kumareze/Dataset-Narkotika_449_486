import { zipUrl } from './data'
import type { PipelineRequest, PipelineResponse } from './pipeline/protocol'
import type { CorpusSummary, SearchOptions, Model, ScoringParameters } from './pipeline/types'
type Request = PipelineRequest extends infer R ? R extends { id: string } ? Omit<R, 'id'> : never : never
type Reply<T extends PipelineResponse['type']> = Extract<PipelineResponse, { type: T }>
export const corpus = $state({
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  progress: { completed: 0, total: 50, documentId: '', stage: '', elapsed: 0, pages: 0, tokens: 0 },
  ocr: false, storageWarning: false, ocrError: '', cached: false, summary: null as CorpusSummary | null, error: '',
})
let worker: Worker | undefined
let sequence = 0
let loading: Promise<void> | undefined
const pending = new Map<string, { resolve: (reply: PipelineResponse) => void; reject: (error: Error) => void }>()
function fail(message: string) {
  corpus.status = 'error'; corpus.error = message
  for (const entry of pending.values()) entry.reject(new Error(message))
  pending.clear(); worker?.terminate(); worker = undefined
}
async function request<T extends PipelineResponse['type']>(message: Request, type: T): Promise<Reply<T>> {
  if (!worker) {
    worker = new Worker(new URL('../workers/pipeline.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<PipelineResponse>) => {
      if (data.type === 'progress') {
        corpus.ocr = data.stage === 'ocr'
        Object.assign(corpus.progress, data, { documentId: data.documentId ?? corpus.progress.documentId })
        return
      }
      if (data.type === 'warning') {
        if (data.kind === 'storage') corpus.storageWarning = true
        else { corpus.ocr = false; corpus.ocrError = data.message }
        return
      }
      if (data.type === 'ready') {
        corpus.summary = data.summary; corpus.cached = data.summary.cached; corpus.status = 'ready'; corpus.ocr = false
      }
      const entry = pending.get(data.id)
      if (!entry) return
      pending.delete(data.id)
      if (data.type === 'error') entry.reject(new Error(data.message)); else entry.resolve(data)
    }
    worker.onerror = event => fail(event.message || 'Worker gagal memproses dokumen.')
    worker.onmessageerror = () => fail('Balasan worker tidak dapat dibaca.')
  }
  const id = String(++sequence)
  return new Promise<PipelineResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject }); worker!.postMessage({ ...message, id })
  }).then(reply => {
    if (reply.type !== type) throw new Error('Jenis balasan tidak sesuai permintaan.')
    return reply as Reply<T>
  })
}
export function loadCorpus(force = false): Promise<void> {
  if (loading) return loading
  if (corpus.status === 'ready' && !force) return Promise.resolve()
  corpus.ocr = false; corpus.storageWarning = false; corpus.ocrError = ''; corpus.status = 'loading'; corpus.error = ''; corpus.cached = false; corpus.summary = null
  Object.assign(corpus.progress, { completed: 0, total: 50, documentId: '', stage: 'fetch', elapsed: 0, pages: 0, tokens: 0 })
  const start = performance.now()
  const timer = setInterval(() => { corpus.progress.elapsed = performance.now() - start }, 200)
  loading = request({ type: 'load', zipUrl, force, assetBase: new URL('.', document.baseURI).href }, 'ready').then(({ summary }) => {
    corpus.summary = summary; corpus.cached = summary.cached; corpus.status = 'ready'
  }).catch(error => { corpus.status = 'error'; corpus.error = String(error.message ?? error) })
    .finally(() => { clearInterval(timer); loading = undefined })
  return loading
}
export const clearStoredData = () => {
  for (const entry of pending.values()) entry.reject(new Error('Data tersimpan dihapus.'))
  pending.clear(); worker?.terminate(); worker = undefined
  return loadCorpus(true)
}
export const search = (query: string, options?: SearchOptions) => request({ type: 'search', query, options }, 'search')
export const explain = (query: string, documentId: string, model?: Model, stemming?: boolean, parameters?: ScoringParameters) => request({ type: 'explain', query, documentId, model, stemming, parameters }, 'explain').then(r => r.contributions)
export const evaluate = (model?: Model, stemming?: boolean) => request({ type: 'evaluate', model, stemming }, 'evaluate').then(r => r.evaluation)
export const inspect = (documentId: string) => request({ type: 'inspect', documentId }, 'inspect').then(r => r.document)
export const preprocess = (text: string) => request({ type: 'preprocess', text }, 'preprocess').then(r => r.stages)
export const fetchPdf = (documentId: string) => request({ type: 'pdf', documentId }, 'pdf').then(r => r.bytes)


