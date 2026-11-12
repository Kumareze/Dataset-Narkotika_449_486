import { onMount } from 'svelte'
import { corpus, inspect } from '../../corpus.svelte'
import { cases } from '../../data'
import type { ProcessedDocument, SectionName } from '../../pipeline/types'

export const selection = $state({ id: '' })
export const names: SectionName[] = ['kepala', 'tuntutan', 'dakwaan', 'pertimbangan', 'amar', 'penutup']
export const color = (name: SectionName) => `var(--${name === 'penutup' ? 'kepala' : name})`
export const background = (name: SectionName) => `var(--${name === 'penutup' ? 'kepala' : name}-bg)`
export const number = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
export const label = (id: string) => cases.find(c => parseInt(c['No Putusan']) === parseInt(id))?.['No Putusan'] ?? id
const cache = new Map<string, Promise<ProcessedDocument>>()
let cachedSummary = corpus.summary
export function documentFor(id: string) {
  if (cachedSummary !== corpus.summary) { cache.clear(); cachedSummary = corpus.summary }
  if (!cache.has(id)) {
    if (cache.size >= 4) cache.delete(cache.keys().next().value!)
    const pending = inspect(id).catch(error => { cache.delete(id); throw error })
    cache.set(id, pending)
  }
  return cache.get(id)!
}
export function selectedDocument() {
  const state = $state<{ document: ProcessedDocument | null; error: string }>({ document: null, error: '' })
  $effect(() => {
    const id = selection.id, summary = corpus.summary
    state.document = null; state.error = ''
    if (corpus.status !== 'ready' || !id || !summary) return
    let current = true
    void documentFor(id).then(d => { if (current) state.document = d }).catch(e => { if (current) state.error = String(e) })
    return () => { current = false }
  })
  return state
}
export function motion() {
  const state = $state({ reduced: false })
  onMount(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => state.reduced = query.matches
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  })
  return state
}
