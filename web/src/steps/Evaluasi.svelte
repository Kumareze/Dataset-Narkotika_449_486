<script lang="ts">
  import { onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import Step from '../lib/ui/Step.svelte'
  import Comparison from '../lib/ui/eval/Comparison.svelte'
  import RankWalk from '../lib/ui/eval/RankWalk.svelte'
  import { corpus, evaluate } from '../lib/corpus.svelte'
  import type { Evaluation } from '../lib/pipeline/evaluation'
  import type { Model } from '../lib/pipeline/types'
  const models: Model[] = ['TF-IDF', 'BM25', 'BM25F', 'Boolean']
  let stemming = $state(false), busy = $state(false), error = $state(''), reduced = $state(false)
  let results = $state<Evaluation[]>([]), ablation = $state<NonNullable<Evaluation['ablation']>>([])
  let selected = $state('BM25F'), retry = $state(0)
  const chosen = $derived(results.find(r => r.model === selected))
  const ranked = $derived(results.filter(r => r.model !== 'Boolean'))
  const best = $derived([...ranked].sort((a, b) => b.MAP - a.MAP)[0])
  const booleanRows = $derived(results.find(r => r.model === 'Boolean')?.queries.map(q => {
    const hits = q.ranking.filter(id => q.relevant.includes(id)).length
    const precision = q.ranking.length ? hits / q.ranking.length : 0, recall = q.relevant.length ? hits / q.relevant.length : 0
    return { id: q.id, count: q.ranking.length, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 }
  }) ?? [])
  const rules = ['Kata utuh ganja.', 'tembakau sintetis, mdmb, atau butinaca.', 'ekstasi atau tablet.', 'permufakatan atau pemufakatan.', 'perantara.', 'menyimpan, menguasai, atau memiliki.', 'tanaman yang tidak langsung didahului “bukan ”.', 'para terdakwa atau terdakwa ii (batas kata setelah ii).', 'dirampas untuk negara.', 'Kata utuh uang.']
  const fmt = (n: number) => n.toFixed(3)
  const delta = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}`
  $effect(() => {
    const status = corpus.status, summary = corpus.summary, stem = stemming; retry
    let active = true
    if (status !== 'ready' || !summary) { results = []; ablation = []; return }
    busy = true; error = ''
    void (async () => {
      try {
        const next: Evaluation[] = []
        for (const model of models) { if (!active) return; next.push(await evaluate(model, stem)) }
        if (!active) return
        const full = stem ? next.find(r => r.model === 'BM25')! : await evaluate('BM25', true)
        if (active) { results = next; ablation = full.ablation ?? [] }
      } catch (e) { if (active) error = String(e) }
      finally { if (active) busy = false }
    })()
    return () => { active = false }
  })
  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reduced = media.matches }; update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  })
</script>
<Step id="evaluasi" number={9} title="Evaluasi: mengukur hasil pencarian" description="Sepuluh kueri tetap membandingkan hasil model dengan label relevansi dari metadata situs. Semua nilai dihitung dari korpus yang diproses di browser.">
  <label class="toggle"><input type="checkbox" role="switch" bind:checked={stemming} /> Stemming untuk perbandingan model</label>
  <p class="small muted">Default tanpa stemming. Mengubah opsi menghitung ulang seluruh kueri. Ablasi di bawah selalu memakai BM25 lengkap sebagai acuan tetap.</p>
  {#if corpus.status === 'error'}<p class="notice notice-error" role="alert">{corpus.error}</p>
  {:else if error}<p class="notice notice-error" role="alert">Evaluasi gagal: {error}</p><button class="compact" onclick={() => retry++}>Coba lagi</button>
  {:else if corpus.status !== 'ready' || busy || !chosen}
    <div aria-busy="true"><p role="status">{corpus.status !== 'ready' ? `Menyiapkan korpus: ${corpus.progress.completed}/${corpus.progress.total} dokumen.` : 'Menghitung peringkat, metrik, dan ablasi…'}</p><div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton"></div></div>
  {:else}
    <div in:fade={{ duration: reduced ? 0 : 200 }}>
      <h3 class="section-title">01 · Asal label relevansi</h3>
      <p>Kolom <strong>Barang Bukti</strong> dan <strong>Amar Putusan</strong> dalam <code>cases.json</code> berasal dari metadata situs, terpisah dari teks PDF yang diindeks. Teks metadata diubah menjadi huruf kecil lalu dicocokkan dengan aturan berikut. Label hanya mencakup dokumen dalam korpus.</p>
      <div class="query-grid">{#each chosen.queries as q, i}<details class="query"><summary><strong>{q.id}</strong> · {q.query}<span class="count">{chosen.queries[i].relevant.length} relevan</span></summary><p><strong>{q.source.field}</strong>{q.source.first ? ', bagian sebelum kata “menjatuhkan” (diktum pertama)' : ', seluruh kolom'}: {rules[i]}</p><code>{q.source.pattern}</code><p class="small">Putusan relevan: {chosen.queries[i].relevant.join('; ') || 'Tidak ada'}.</p></details>{/each}</div>
      <aside class="notice notice-warn"><strong>Bias label:</strong> label yang dibangun dari teks amar menguntungkan model yang memberi bobot besar pada bagian amar, seperti BM25F. Ini bukan penilaian relevansi independen oleh ahli dan belum membuktikan keunggulan pada korpus lain.</aside>
      <h3 class="section-title">02 · Ikuti peringkat, hitung metrik</h3>
      <div class="panel"><label>Model untuk demonstrasi<select bind:value={selected}>{#each ranked as r}<option value={r.model}>{r.model}</option>{/each}</select></label><RankWalk result={chosen} {reduced} /></div>
      <h3 class="section-title">03 · Perbandingan seluruh kueri</h3>
      <p class="small">Rerata makro: setiap kueri memiliki bobot yang sama. MAP adalah rerata AP. BM25F di evaluasi memakai bobot zona tanpa fallback BM25.</p>
      <div class="panel"><Comparison results={ranked} /></div>
      <div class="table-wrap"><table class="data-table ap"><caption>AP per kueri · ★ nilai terbaik, termasuk seri</caption><thead><tr><th>Kueri</th>{#each ranked as r}<th>{r.model}</th>{/each}</tr></thead><tbody>{#each chosen.queries as q, i}<tr><th title={q.query}>{q.id}</th>{#each ranked as r}{@const winner = r.queries[i].metrics.AP === Math.max(...ranked.map(m => m.queries[i].metrics.AP))}<td class:best={winner}>{fmt(r.queries[i].metrics.AP)}{winner ? ' ★' : ''}</td>{/each}</tr>{/each}</tbody></table></div>
      <h4>Boolean · pencarian himpunan</h4><p class="small">Semua istilah kueri harus cocok (AND). Urutan hasil Boolean tidak menyatakan kualitas. Precision = relevan ditemukan / seluruh hasil; recall = relevan ditemukan / semua relevan; F1 = 2PR/(P+R). Jika penyebut nol, nilai ditetapkan nol.</p>
      <div class="table-wrap"><table class="data-table"><caption>Boolean per kueri dan rerata makro</caption><thead><tr><th>Kueri</th><th>Hasil</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>{#each booleanRows as row}<tr><th>{row.id}</th><td>{row.count}</td><td>{fmt(row.precision)}</td><td>{fmt(row.recall)}</td><td>{fmt(row.f1)}</td></tr>{/each}<tr><th>Rerata</th><td>—</td>{#each ['precision', 'recall', 'f1'] as key}<td>{fmt(booleanRows.reduce((sum, r) => sum + r[key as 'precision' | 'recall' | 'f1'], 0) / booleanRows.length)}</td>{/each}</tr></tbody></table></div>
      <h3 class="section-title">04 · Ablasi: ubah satu komponen</h3>
      <p class="small">BM25 lengkap memakai stemming dan penghapusan stopword. Varian tanpa stopword removal tetap memakai stemming; BM25F juga memakai keduanya. Δ dihitung terhadap BM25 lengkap, terpisah dari toggle perbandingan.</p>
      <div class="table-wrap"><table class="data-table"><caption>Hasil langsung dari indeks varian</caption><thead><tr><th>Varian</th><th>MAP</th><th>Δ MAP</th><th>nDCG@10</th><th>Δ nDCG</th></tr></thead><tbody>{#each ablation as row}<tr><th>{row.label}</th><td>{fmt(row.MAP)}</td><td>{delta(row.MAP - ablation[0].MAP)}</td><td>{fmt(row.ndcg)}</td><td>{delta(row.ndcg - ablation[0].ndcg)}</td></tr>{/each}</tbody></table></div>
      {#if ablation.length}<p>Tanpa stemming, MAP berubah {delta(ablation[1].MAP - ablation[0].MAP)}; tanpa penghapusan stopword, MAP berubah {delta(ablation[2].MAP - ablation[0].MAP)} terhadap BM25 lengkap.</p>{/if}
      <h3 class="section-title">05 · Yang dapat disimpulkan</h3>
      <ul class="takeaway"><li>Pada label dan opsi saat ini, {best.model} memperoleh MAP tertinggi ({fmt(best.MAP)}); periksa AP setiap kueri sebelum menyimpulkan model yang paling cocok.</li><li>BM25F mencapai nDCG@10 {fmt(results.find(r => r.model === 'BM25F')!.mean['nDCG@10'])}; bobot amar perlu dibaca bersama bias label dari metadata amar.</li><li>Ablasi menunjukkan dampak pemrosesan pada korpus ini. Angka ini belum mengukur generalisasi ke pengadilan atau kebutuhan pencarian lain.</li></ul>
    </div>
  {/if}
</Step>
<style>
  .toggle { width: fit-content; } .query-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem; } .query { margin: 0; padding: .85rem; background: var(--panel); border: 1px solid var(--rule); border-radius: 6px; min-width: 0; } .query p { margin: .7rem 0 0; } .query code, .query p { overflow-wrap: anywhere; } .query summary { font-size: .85rem; line-height: 1.5; } .count { display: block; color: var(--accent); font-size: .8rem; } .table-wrap { margin: 1rem 0; max-width: 100%; } caption { text-align: left; padding: .65rem; font-size: .85rem; color: var(--ink-2); } td.best { background: var(--green-bg); color: var(--green); font-weight: 650; } .skeleton { height: 5rem; border-radius: 6px; background: var(--sunk); margin: .75rem 0; animation: breathe 1.5s infinite alternate; } .short { width: 65%; height: 2rem; } @keyframes breathe { to { opacity: .4; } } @media(prefers-reduced-motion: reduce) { .skeleton { animation: none; } } @media(max-width: 600px) { .query-grid { grid-template-columns: 1fr; } .ap th, .ap td { padding: .5rem .35rem; font-size: .75rem; } .panel { padding: .8rem; } }
</style>

