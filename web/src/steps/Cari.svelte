<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import Step from '../lib/ui/Step.svelte'
  import { cases } from '../lib/data'
  import { corpus, search } from '../lib/corpus.svelte'
  import type { SearchResult, Passage } from '../lib/pipeline/types'
  let query = $state(''), filter = $state(''), busy = $state(false), error = $state('')
  let results = $state<SearchResult[]>([]), selected = $state<SearchResult | null>(null)
  let viewer = $state<Promise<typeof import('../lib/ui/PdfViewer.svelte')> | null>(null)
  function openPdf(result: SearchResult) {
    viewer = import('../lib/ui/PdfViewer.svelte')
    selected = result
  }
  let parsed = $state<{ terms: string[]; phrases: string[][]; excluded: string[] } | null>(null)
  let reduced = $state(false), searched = $state(false), revision = 0
  const examples = ['permufakatan jahat perantara jual beli sabu', '"tembakau sintetis" timbangan digital', 'ganja -sabu', 'rehabilitasi pecandu', 'barang bukti dirampas untuk negara']
  const types = [...new Set(cases.map(c => c['Jenis Narkotika']))].sort()
  const metadata = (id: string) => cases.find(c => c['Nomor Perkara'] === parseInt(id))
  function parts(p: Passage) {
    const chunks: { text: string; hit: boolean }[] = []; let end = 0
    for (const h of [...p.highlights].sort((a, b) => a.start - b.start)) {
      if (h.start < end) continue
      chunks.push({ text: p.text.slice(end, h.start), hit: false }, { text: p.text.slice(h.start, h.end), hit: true }); end = h.end
    }
    chunks.push({ text: p.text.slice(end), hit: false }); return chunks
  }
  async function run(value = query) {
    query = value
    if (corpus.status !== 'ready') return
    const ticket = ++revision; busy = true; error = ''; searched = true
    try {
      const reply = await search(query, { k: 50, filters: filter ? { 'Jenis Narkotika': filter } : undefined })
      if (ticket === revision) { results = reply.results; parsed = reply.parsed }
    } catch (e) { if (ticket === revision) error = String(e) }
    finally { if (ticket === revision) busy = false }
  }
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reduced = media.matches }; update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  })
</script>
<Step id="cari" number={8} title="Pencarian" description="Cari bagian putusan dengan BM25F. Dokumen tanpa bagian amar memakai BM25. Skor menunjukkan kecocokan teks, bukan penilaian hukum.">
  <form class="search-form" onsubmit={e => { e.preventDefault(); void run() }}>
    <label>Cari dalam putusan<input type="search" bind:value={query} placeholder="Contoh: perantara jual beli sabu" aria-describedby="query-help" /></label>
    <label>Jenis Narkotika<select bind:value={filter} onchange={() => { if (searched) void run() }}><option value="">Semua jenis</option>{#each types as type}<option>{type}</option>{/each}</select></label>
    <button disabled={corpus.status !== 'ready' || busy || !query.trim()}>Cari</button>
  </form>
  <p id="query-help" class="small muted">Gunakan tanda kutip untuk frasa, misalnya "tembakau sintetis", dan -kata untuk mengecualikan kata. Frasa dicocokkan setelah normalisasi dan penghapusan stopword.</p>
  <div class="query-chips">{#each examples as example}<button class="compact secondary outline" disabled={corpus.status !== 'ready'} onclick={() => run(example)}>{example}</button>{/each}</div>
  {#if corpus.status !== 'ready'}<p class="notice">{corpus.status === 'error' ? corpus.error : `Menyiapkan indeks: ${corpus.progress.completed}/${corpus.progress.total} dokumen. Pencarian tersedia setelah selesai.`}</p>
  {:else}
    {#if parsed}<div class="notice small"><strong>Kueri setelah diproses:</strong> {parsed.terms.join(' · ') || '(tanpa kata pencarian)'}{#if parsed.phrases.length}<br />Frasa: {parsed.phrases.map(p => p.join(' ')).join(' · ')}{/if}{#if parsed.excluded.length}<br />Dikecualikan: {parsed.excluded.join(' · ')}{/if}</div>{/if}
    {#if busy}<p role="status">Mencari kecocokan…</p>{:else if error}<p role="alert" class="notice notice-error">{error}</p>{:else if searched}
      <p class="small muted" role="status">{results.length} dokumen ditemukan.</p>
      {#if !results.length}<div class="empty-state">Tidak ada hasil. Coba kurangi kata, lepaskan tanda kutip, atau ubah filter.</div>{/if}
      <ol class="search-results">{#each results as result, rank (result.id)}
        {@const meta = metadata(result.id)}
        <li in:fade={{ duration: reduced ? 0 : 180, delay: reduced ? 0 : Math.min(rank, 5) * 35 }}>
          <button class="result-card" onclick={() => openPdf(result)}>
            <span class="result-heading"><strong>{rank + 1}. {meta?.['No Putusan'] ?? result.id}</strong><span class="mono">{result.model} · {result.score.toFixed(3)}</span></span>
            <span class="small muted">{meta?.['Jenis Narkotika'] ?? 'Tidak tersedia'} · Penjara: {meta?.['Pidana Penjara (bulan)'] == null ? 'tidak tercantum' : `${meta['Pidana Penjara (bulan)']} bulan`}</span>
            <span class="passage">…{#each parts(result.passage) as part}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}…</span>
            <span class="small">hal. {result.passage.page} dari {corpus.summary?.documents.find(d => d.id === result.id)?.pages} · Buka PDF →</span>
          </button>
        </li>
      {/each}</ol>
    {:else}<p class="empty-state">Masukkan kueri atau pilih contoh untuk mulai mencari.</p>{/if}
  {/if}
</Step>
{#if selected && viewer}
  {#await viewer}
    <p role="status" class="notice">Memuat penampil PDF…</p>
  {:then { default: PdfViewer }}
    <PdfViewer result={selected} metadata={metadata(selected.id)} onclose={() => selected = null} />
  {:catch reason}
    <p role="alert" class="notice notice-error">Penampil PDF gagal dimuat: {String(reason)}. Pilih hasil lagi untuk mencoba ulang.</p>
  {/await}
{/if}
