<script lang="ts">
  import Step from '../lib/ui/Step.svelte'
  import Frame from '../lib/ui/viz/Frame.svelte'
  import { corpus, search, explain } from '../lib/corpus.svelte'
  import { ZONES, type Contribution, type Zone, type Model } from '../lib/pipeline/types'
  import { label, motion } from '../lib/ui/viz/learning.svelte'
  import { flip } from 'svelte/animate'
  import { fade } from 'svelte/transition'
  const preference = motion()
  const defaults: Record<Zone,number> = { kepala:.5, tuntutan:1, dakwaan:.5, pertimbangan:1, amar:3 }
  const colors = ['var(--accent)','var(--green)','var(--amber)','var(--red)','var(--ink-3)']
  let query = $state('permufakatan jahat perantara jual beli sabu'), model = $state<Model>('BM25F')
  let k1 = $state(1.2), b = $state(.75), weights = $state({ ...defaults })
  let results = $state<{id:string;score:number;model:Model;contributions:Contribution[]}[]>([])
  let selected = $state(''), busy = $state(false), error = $state(''), terms = $state<string[]>([]), applied = $state('')
  const focused = $derived(results.find(r => r.id === selected) ?? results[0])
  const maxScore = $derived(Math.max(1e-9,...results.map(r => r.score)))
  $effect(() => {
    const text = query, currentModel = model, parameters = { k1, b, zoneWeights:{ ...weights } }, summary = corpus.summary
    if (!summary || corpus.status !== 'ready') return
    let current = true
    busy = true; error = ''
    const timer = setTimeout(() => { void (async () => {
      const response = await search(text,{ model:currentModel, ...parameters, k:8 })
      if (!current) return
      const next = await Promise.all(response.results.map(async r => ({id:r.id,score:r.score,model:r.model,contributions:await explain(text,r.id,currentModel,false,parameters)})))
      if (!current) return
      results = next; terms = [...new Set(response.parsed.terms)]; applied = `${currentModel} · k1 ${parameters.k1.toFixed(2)} · b ${parameters.b.toFixed(2)}`; busy = false
    })().catch(e => { if (current) { error = String(e); busy = false } }) }, 220)
    return () => { current = false; clearTimeout(timer) }
  })
</script>
<Step id="skor" number={7} title="Pembobotan dan skor: mengapa urutannya berubah?" description="BM25 menyeimbangkan frekuensi istilah, kelangkaan, dan panjang dokumen. BM25F menghitung frekuensi per bagian, sehingga kecocokan pada amar dapat diberi bobot lebih besar daripada pada kepala putusan.">
  <Frame>
    <label for="score-query">Kueri</label><input id="score-query" bind:value={query} maxlength="500" />
    <div class="toolbar"><label for="score-model">Model</label><select id="score-model" bind:value={model}><option>BM25F</option><option>BM25</option></select><button class="compact secondary" onclick={() => { k1 = 1.2; b = .75; weights = {...defaults} }}>Reset parameter</button></div>
    <div class="split"><div class="panel"><h3>Frekuensi dan panjang</h3><label for="score-k1">k1 · {k1.toFixed(2)} <span class="small muted">· kejenuhan frekuensi</span></label><input id="score-k1" type="range" min="0.1" max="3" step="0.05" bind:value={k1} /><label for="score-b">b · {b.toFixed(2)} <span class="small muted">· normalisasi panjang</span></label><input id="score-b" type="range" min="0" max="1" step="0.05" bind:value={b} /><p class="small muted">b = 0 mengabaikan panjang. k1 lebih besar membuat tambahan kemunculan lebih berpengaruh sebelum jenuh.</p></div>
      <fieldset class="panel" disabled={model === 'BM25'}><legend>Bobot lima zona · BM25F</legend>{#each ZONES as zone}<label for={`weight-${zone}`}>{zone} · {weights[zone].toFixed(2)}</label><input id={`weight-${zone}`} type="range" min="0" max="5" step="0.25" bind:value={weights[zone]} />{/each}</fieldset></div>
    {#if error}<p class="notice notice-error" role="alert">{error}</p>{/if}
    <p class="small" role="status">{busy ? 'Menghitung ulang seluruh kandidat di worker…' : `${results.length} hasil teratas · ${applied}`}</p>
    <div class="chips" aria-label="Legenda istilah">{#each terms as term,i}<span class="chip" style:border-color={colors[i%colors.length]}>{i+1}. {term}</span>{/each}</div>
    <div class="rankings" aria-busy={busy}>{#each results as result,i (result.id)}<div class="ranking" class:active={focused?.id === result.id} animate:flip={{duration:preference.reduced ? 0 : 450}} in:fade={{duration:preference.reduced ? 0 : 160}}>
      <button class="rank-button" onclick={() => selected = result.id}><span>{i+1}. {label(result.id)}</span><strong class="mono">{result.score.toFixed(4)}</strong></button>
      <div class="stack" role="img" aria-label={`Kontribusi istilah pada ${label(result.id)}, skor ${result.score.toFixed(4)}`}>{#each result.contributions as part,j}<span style:width={`${part.contribution/maxScore*100}%`} style:background={colors[j%colors.length]} title={`${j+1}. ${part.term}: ${part.contribution.toFixed(5)}`}>{part.contribution/maxScore > .07 ? j+1 : ''}</span>{/each}</div>
      <span class="small muted">{result.model}</span>
    </div>{:else}{#if !busy}<p class="notice">Tidak ada dokumen yang cocok. Coba istilah lain.</p>{/if}{/each}</div>
    {#if focused}<div class="panel"><h3>Rincian · {label(focused.id)}</h3><p class="small muted">tf: jumlah kemunculan; df: jumlah dokumen; idf: bobot kelangkaan. L = 1 − b + b × panjang/rata-rata panjang. Semua kontribusi berasal dari explain worker.</p>
      <div class="table-scroll"><table><thead><tr><th>Istilah</th><th>tf seluruh teks</th><th>df</th><th>idf</th><th>L dokumen</th><th>tf berbobot zona</th><th>Kontribusi</th></tr></thead><tbody>{#each focused.contributions as part}<tr><th>{part.term}</th><td>{part.tf}</td><td>{part.df}</td><td>{part.idf.toFixed(4)}</td><td>{part.lengthNormalization.toFixed(3)}</td><td>{focused.model === 'BM25F' ? part.zones.reduce((sum,z) => sum+z.weightedTf,0).toFixed(3) : 'Tidak digunakan'}</td><td>{part.contribution.toFixed(5)}</td></tr>{/each}</tbody></table></div>
      {#if focused.model === 'BM25F'}<details open><summary>Normalisasi dan bobot per zona</summary><div class="table-scroll"><table><thead><tr><th>Istilah</th><th>Zona</th><th>tf zona</th><th>Bobot</th><th>L zona</th><th>Bobot × tf / L</th></tr></thead><tbody>{#each focused.contributions as part}{#each part.zones as zone}<tr><th>{part.term}</th><td>{zone.zone}</td><td>{zone.tf}</td><td>{zone.weight}</td><td>{zone.lengthNormalization.toFixed(3)}</td><td>{zone.weightedTf.toFixed(4)}</td></tr>{/each}{/each}</tbody></table></div></details>{/if}
    </div>{/if}
    <div class="notes"><p><strong>Perhatikan:</strong> BM25F notebook memakai idf × tf berbobot / (k1 + tf berbobot). BM25 memakai idf × tf × (k1 + 1) / (tf + k1 × L). Bandingkan urutan hasil, bukan besar skor antar-model.</p><p>Bobot amar awal 3, sedangkan kepala dan dakwaan 0,5. Penutup tidak menjadi zona BM25F. Dokumen tanpa amar memakai BM25 sebagai fallback; seluruh teks tetap dipakai untuk df.</p></div>
  </Frame>
</Step>
<style>
  #score-model { width:auto; margin:0; }
  fieldset label { font-size:.85rem; } fieldset input { margin-bottom:.5rem; }
  .ranking { border:1px solid var(--rule); padding:.65rem; border-radius:5px; margin:.5rem 0; }
  .ranking.active { border-color:var(--accent); background:var(--accent-soft); }
  .rank-button { display:flex; align-items:center; justify-content:space-between; gap:1rem; width:100%; padding:0; margin:0 0 .5rem; border:0; background:none; color:var(--ink); text-align:left; font-size:.9rem; }
  .rank-button span { overflow-wrap:anywhere; }.rank-button strong { flex-shrink:0; }
  .stack { display:flex; height:1.4rem; background:var(--sunk); overflow:hidden; border-radius:3px; }.stack span { color:var(--panel); font-size:.75rem; text-align:center; border-right:1px solid var(--panel); }
  .table-scroll { max-height:26rem; }
</style>
