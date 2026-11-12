<script lang="ts">
  import { onMount } from 'svelte'
  import { flip } from 'svelte/animate'
  import { fade } from 'svelte/transition'
  import type { Evaluation } from '../../pipeline/evaluation'
  let { result, reduced }: { result: Evaluation; reduced: boolean } = $props()
  let queryId = $state('Q1'), position = $state(0), playing = $state(false)
  const query = $derived(result.queries.find(q => q.id === queryId)!)
  const relevant = $derived(new Set(query.relevant))
  const rows = $derived.by(() => {
    let hits = 0, sum = 0, dcg = 0, first = 0
    return query.ranking.map((id, i) => {
      const hit = relevant.has(id), rank = i + 1, gain = hit && rank <= 10 ? 1 / Math.log2(rank + 1) : 0
      if (hit) { hits++; sum += hits / rank; if (!first) first = rank }
      dcg += gain
      return { id, rank, hit, hits, sum, dcg, first, gain, precision: hits / rank }
    })
  })
  const current = $derived(rows[position - 1])
  const ideal = $derived(Array.from({ length: Math.min(10, relevant.size) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0))
  const hitsAt = (k: number) => rows.slice(0, Math.min(position, k)).filter(r => r.hit).length
  const fmt = (n: number) => n.toFixed(3)
  $effect(() => { result; queryId; position = 0; playing = false })
  $effect(() => { if (reduced) playing = false })
  function step() { position = Math.min(position + 1, rows.length); if (position === rows.length) playing = false }
  onMount(() => { const timer = setInterval(() => { if (playing && !document.hidden) step() }, 850); return () => clearInterval(timer) })
</script>
<div class="controls">
  <label>Kueri<select bind:value={queryId}>{#each result.queries as q}<option value={q.id}>{q.id} · {q.query}</option>{/each}</select></label>
  <span class="pill">{result.model} · {relevant.size} relevan</span>
</div>
<div class="controls">
  <button class="compact" onclick={() => { if (position === rows.length) position = 0; playing = !playing }}>{playing ? 'Jeda' : 'Putar'}</button>
  <button class="compact secondary" disabled={position === rows.length} onclick={() => { playing = false; step() }}>Satu peringkat</button>
  <button class="compact secondary outline" onclick={() => { playing = false; position = 0 }}>Reset</button>
  <button class="compact secondary outline" onclick={() => { playing = false; position = rows.length }}>Lihat akhir</button>
</div>
<p class="small muted">Peringkat {position}/{rows.length}. P@k tetap dibagi k meskipun hasil kurang dari k. AP dan RR memakai seluruh daftar; nDCG berhenti di 10.</p>
<div class="walk">
  <div><h4>Sepuluh hasil teratas</h4><ol class="ranks">
    {#each rows.slice(0, 10) as row (row.id)}
      <li animate:flip={{ duration: reduced ? 0 : 240 }} class:visited={row.rank <= position} class:active={row.rank === position} class:hit={row.hit && row.rank <= position}>
        <span class="doc">{row.id}</span><strong>{row.hit ? '✓ Relevan' : 'Tidak relevan'}</strong>
        {#if row.rank <= position}<small in:fade={{ duration: reduced ? 0 : 160 }}>P({row.rank}) = {row.hits}/{row.rank} = {fmt(row.precision)} · gain {fmt(row.gain)}</small>{/if}
      </li>
    {/each}
  </ol>{#if rows.length < 10}<p class="small">Hanya {rows.length} dokumen ditemukan.</p>{/if}</div>
  <div class="calculations" aria-live="polite" aria-atomic="true">
    <h4>Akumulasi pada peringkat {position}</h4>
    {#if current}<p class="notice">{current.id}: {current.hit ? 'relevan, tambahkan precision ke jumlah AP' : 'tidak relevan, jumlah AP tidak berubah'}.<br />P({position}) = {current.hits}/{position} = {fmt(current.precision)}<br />Σ AP: {fmt(rows[position - 2]?.sum ?? 0)} + {fmt(current.hit ? current.precision : 0)} = {fmt(current.sum)}{#if current.first === position}<br /><strong>Hasil relevan pertama ditemukan!</strong>{/if}</p>{/if}
    <dl>
      <dt>P@5 · ketepatan lima hasil pertama</dt><dd>{hitsAt(5)}/5 = {fmt(hitsAt(5) / 5)} {position < Math.min(5, rows.length) ? '(sementara)' : ''}</dd>
      <dt>P@10 · ketepatan sepuluh hasil pertama</dt><dd>{hitsAt(10)}/10 = {fmt(hitsAt(10) / 10)}</dd>
      <dt>R@10 · bagian dokumen relevan yang ditemukan</dt><dd>{hitsAt(10)}/{relevant.size} = {fmt(relevant.size ? hitsAt(10) / relevant.size : 0)}</dd>
      <dt>AP · jumlah P(i) pada setiap hasil relevan, dibagi semua label relevan</dt><dd>Σ P(i)·rel(i) = {fmt(current?.sum ?? 0)}<br />AP sementara = {fmt(relevant.size ? (current?.sum ?? 0) / relevant.size : 0)} · AP akhir {fmt(query.metrics.AP)}</dd>
      <dt>nDCG@10 · gain posisi dibanding urutan ideal</dt><dd>gain(i) = rel(i)/log₂(i+1)<br />{#if current && position <= 10}gain({position}) = {current.hit ? 1 : 0}/log₂({position + 1}) = {fmt(current.gain)}<br />{/if}DCG = {fmt(current?.dcg ?? 0)} · ideal = {fmt(ideal)}<br />nDCG = {fmt(ideal ? (current?.dcg ?? 0) / ideal : 0)}</dd>
      <dt>RR · kebalikan peringkat relevan pertama</dt><dd class:found={!!current?.first}>{current?.first ? `1/${current.first} = ${fmt(1 / current.first)}` : 'Belum ditemukan · 0'}</dd>
    </dl>
    <p class="small muted">Nilai di atas masih parsial sampai pemutaran selesai. Dokumen relevan yang tidak ditemukan tetap masuk penyebut AP dan recall.</p>
  </div>
</div>
<style>
  .controls { margin-bottom: .8rem; } label { min-width: 0; flex: 1; } select { margin-bottom: 0; max-width: 100%; } .walk { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; } .walk > div { min-width: 0; }
  .ranks { padding-left: 1.8rem; } li { padding: .6rem; border: 1px solid var(--rule); border-radius: 6px; background: var(--sunk); color: var(--ink-2); } li.visited { background: var(--panel); } li.hit { background: var(--green-bg); } li.active { outline: 2px solid var(--accent); } .doc { overflow-wrap: anywhere; display: block; font: .8rem var(--mono); } li strong { font-size: .75rem; } li small { display: block; font-size: .75rem; } dt { font-size: .85rem; color: var(--ink-2); } dd { margin: .25rem 0 .9rem; font-variant-numeric: tabular-nums; } .found { color: var(--green); background: var(--green-bg); } @media(max-width: 720px) { .walk { grid-template-columns: 1fr; } }
</style>
