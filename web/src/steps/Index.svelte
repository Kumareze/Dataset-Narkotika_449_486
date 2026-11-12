<script lang="ts">
  import Step from '../lib/ui/Step.svelte'
  import Frame from '../lib/ui/viz/Frame.svelte'
  import Playback from '../lib/ui/viz/Playback.svelte'
  import IndexCharts from '../lib/ui/viz/IndexCharts.svelte'
  import { corpus, inspect, search, explain, preprocess } from '../lib/corpus.svelte'
  import { label, number, motion } from '../lib/ui/viz/learning.svelte'
  import { crossfade } from 'svelte/transition'
  import { flip } from 'svelte/animate'
  const preference = motion()
  const [send, receive] = crossfade({duration:450})
  let samples = $state<{id:string; term:string; position:number}[]>([]), count = $state(0), sampleError = $state('')
  let term = $state('sabu'), lookup = $state<{term:string; df:number; idf:number; postings:{id:string;positions:number[]}[]} | null>(null), busy = $state(false), error = $state('')
  const stats = $derived(corpus.summary?.statistics)
  const grouped = $derived.by(() => {
    const groups = new Map<string, {id:string;positions:number[]}[]>()
    for (const item of samples.slice(0,count)) {
      if (!groups.has(item.term)) groups.set(item.term,[])
      const rows = groups.get(item.term)!
      let row = rows.find(r => r.id === item.id)
      if (!row) { row = {id:item.id,positions:[]}; rows.push(row) }
      row.positions.push(item.position)
    }
    return [...groups].sort(([a],[b]) => a.localeCompare(b))
  })
  $effect(() => {
    const summary = corpus.summary
    if (!summary || corpus.status !== 'ready') return
    let current = true
    samples = []; count = 0; sampleError = ''
    void (async () => {
      const next: typeof samples = []
      for (const item of summary.documents.filter(d => d.tokens).slice(0,3)) {
        const doc = await inspect(item.id)
        if (!current) return
        next.push(...doc.tokens.slice(0,8).map((t,position) => ({id:doc.id,term:t.normalized,position})))
      }
      samples = next
    })().catch(e => { if (current) sampleError = String(e) })
    return () => { current = false }
  })
  $effect(() => {
    const input = term, summary = corpus.summary
    if (!summary || corpus.status !== 'ready') return
    let current = true
    busy = true; error = ''; lookup = null
    const timer = setTimeout(() => { void (async () => {
      const stages = await preprocess(input)
      if (!current) return
      if (stages.afterStopwords.length !== 1) { error = 'Masukkan satu istilah yang lolos preprocessing.'; busy = false; return }
      const normalized = stages.afterStopwords[0]
      const { results } = await search(normalized,{model:'BM25',k:5})
      if (!current) return
      const contributions = results.length ? await explain(normalized,results[0].id,'BM25') : []
      const postings = []
      for (const result of results) {
        const doc = await inspect(result.id)
        if (!current) return
        postings.push({id:doc.id,positions:doc.tokens.flatMap((t,i) => t.normalized === normalized ? [i] : [])})
      }
      if (current) { lookup = {term:normalized,df:contributions[0]?.df ?? 0,idf:contributions[0]?.idf ?? Math.log(1+(summary.documents.length+.5)/.5),postings}; busy = false }
    })().catch(e => { if (current) { error = String(e); busy = false } }) }, 300)
    return () => { current = false; clearTimeout(timer) }
  })
</script>
<Step id="index" number={6} title="Indexing: dari kata ke lokasi" description="Inverted index menyimpan daftar dokumen untuk setiap istilah. Posisi token membantu mencari frasa, sehingga mesin tidak perlu membaca ulang semua teks setiap kali ada kueri.">
  <Frame>
    <div class="panel"><h3>Bangun indeks kecil dari korpus</h3><p class="small muted">Delapan token pertama dari tiga dokumen berteks. Posisi dimulai dari 0 setelah preprocessing.</p>
      {#if sampleError}<p role="alert">{sampleError}</p>{/if}<Playback bind:value={count} total={samples.length} label="Bangun posting" />
      <div class="split"><div>{#each [...new Set(samples.map(s => s.id))] as id}<h4 class="small">{label(id)}</h4><div class="chips">{#each samples.filter(s => s.id === id) as token (`${token.id}-${token.position}`)}{#if samples.indexOf(token) >= count}<span class="chip" out:send={{key:`${token.id}-${token.position}`,duration:preference.reduced ? 0 : 450}}>{token.term}<small> @{token.position}</small></span>{:else}<span class="chip sent">{token.term}<small> @{token.position}</small></span>{/if}{/each}</div>{/each}</div>
        <div class="postings">{#each grouped as [word,rows] (word)}<div class="posting" animate:flip={{duration:preference.reduced ? 0 : 250}}><strong>{word}</strong>{#each rows as row}<div class="small mono">({parseInt(row.id)}, [{#each row.positions as position,j (position)}<span in:receive={{key:`${row.id}-${position}`,duration:preference.reduced ? 0 : 450}}>{j ? ', ' : ''}{position}</span>{/each}])</div>{/each}</div>{:else}<p class="muted">Token akan masuk ke daftar istilah.</p>{/each}</div>
      </div>
    </div>
    {#if stats}<div class="result-grid">{#each [{name:'Dokumen',value:corpus.summary!.documents.length},{name:'Kosakata',value:stats.vocabularySize},{name:'Posting (term, dokumen)',value:stats.postings},{name:'Posisi token',value:stats.positions},{name:'Rata-rata panjang',value:stats.docLength.avg},{name:'Panjang minimum',value:stats.docLength.min},{name:'Panjang maksimum',value:stats.docLength.max}] as item}<div class="stat"><span class="stat-label">{item.name}</span><strong class="stat-value">{number(item.value)}</strong></div>{/each}</div>
      <div class="panel"><label for="index-term">Cari istilah dalam indeks</label><input id="index-term" bind:value={term} maxlength="100" />
        {#if busy}<p role="status">Membaca posting dari korpus…</p>{/if}{#if error}<p role="alert">{error}</p>{/if}
        {#if lookup}<p><code>{lookup.term}</code> · df = {lookup.df} dokumen · idf BM25 = {lookup.idf.toFixed(4)}</p><p class="small muted">Maksimal lima posting, dipilih berdasarkan skor BM25. Setiap daftar menampilkan maksimal 40 posisi.</p>{#each lookup.postings as posting}<details><summary>{label(posting.id)} · {posting.positions.length} posisi</summary><p class="mono">[{posting.positions.slice(0,40).join(', ')}{posting.positions.length > 40 ? ', …' : ''}]</p></details>{:else}<p>Tidak ada posting untuk istilah ini.</p>{/each}{/if}
      </div><IndexCharts {stats} />
    {/if}
    <div class="notes"><p><strong>Perhatikan:</strong> df menghitung dokumen, sedangkan frekuensi pada grafik menghitung seluruh kemunculan. Istilah yang sering berulang di satu putusan belum tentu muncul di banyak putusan.</p><p>Dokumen pindai memiliki panjang 0 hingga OCR selesai. Selisih posisi yang kecil dapat disimpan dengan lebih sedikit byte daripada posisi absolut.</p></div>
  </Frame>
</Step>
<style>.sent { opacity:.4; }.posting { border-bottom:1px solid var(--rule); padding:.4rem; }.postings { min-height:10rem; }.posting strong { color:var(--accent); }.posting span { display:inline-block; }</style>
