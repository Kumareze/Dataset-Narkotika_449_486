<script lang="ts">
  import Step from '../lib/ui/Step.svelte'
  import Frame from '../lib/ui/viz/Frame.svelte'
  import DocumentPicker from '../lib/ui/viz/DocumentPicker.svelte'
  import Playback from '../lib/ui/viz/Playback.svelte'
  import { selectedDocument, names, color, background, motion } from '../lib/ui/viz/learning.svelte'
  import { corpus, inspect } from '../lib/corpus.svelte'
  import { fade } from 'svelte/transition'
  const chosen = selectedDocument(), preference = motion()
  let count = $state(0), completed = $state(0), error = $state('')
  let counts = $state<Record<string, number>>({})
  const parts = $derived.by(() => {
    const doc = chosen.document
    if (!doc?.text) return []
    const starts = names.filter(name => doc.sections[name].found && doc.sections[name].text).map(name => {
      const section = doc.sections[name]
      const triggerStart = section.trigger ? doc.text.lastIndexOf(section.trigger, section.start) : -1
      return { name, start: triggerStart >= 0 ? triggerStart : section.start, trigger: section.trigger }
    }).sort((a,b) => a.start - b.start)
    return starts.map((s,i) => ({ ...s, text: doc.text.slice(s.start, starts[i+1]?.start ?? doc.text.length), end: starts[i+1]?.start ?? doc.text.length }))
  })
  $effect(() => { chosen.document; count = 0 })
  $effect(() => {
    const summary = corpus.summary
    if (!summary || corpus.status !== 'ready') return
    let current = true
    completed = 0; counts = {}; error = ''
    void (async () => {
      const totals: Record<string, number> = Object.fromEntries(names.map(n => [n,0]))
      for (const item of summary.documents) {
        const doc = await inspect(item.id)
        if (!current) return
        for (const name of names) if (doc.sections[name].found && doc.sections[name].text.trim()) totals[name]++
        completed++; counts = { ...totals }
      }
    })().catch(e => { if (current) error = String(e) })
    return () => { current = false }
  })
  function jump(name: string) { document.getElementById(`segment-${name}`)?.scrollIntoView({ block: 'nearest', behavior: preference.reduced ? 'instant' : 'smooth' }) }
</script>
<Step id="segmentasi" number={3} title="Segmentasi: memberi struktur pada teks" description="Frasa penanda membagi putusan menjadi bagian yang punya fungsi berbeda. Pemisahan ini membantu mengambil tuntutan, alasan hakim, dan amar tanpa mencampurkan konteksnya.">
  <Frame><DocumentPicker id="segmentasi-document" />
    {#if chosen.error}<p role="alert">{chosen.error}</p>{:else if chosen.document}
      <Playback bind:value={count} total={parts.length} label="Temukan batas" />
      <div class="minimap" aria-label="Proporsi karakter tiap bagian">{#each parts as part}<button title={`${part.name}: ${((part.end-part.start)/chosen.document.text.length*100).toFixed(1)}%`} aria-label={`Lihat ${part.name}`} style:flex-grow={part.end-part.start} style:background={background(part.name)} style:border-color={color(part.name)} onclick={() => jump(part.name)}></button>{/each}</div>
      <div class="chips">{#each parts as part}<span class="chip" style:color={color(part.name)}>{part.name} · {((part.end-part.start)/chosen.document.text.length*100).toFixed(1)}%</span>{/each}</div>
      <div class="panel scroll document" aria-label="Teks putusan dengan batas bagian">
        {#each parts as part, i}<section id={`segment-${part.name}`} style:border-color={i < count ? color(part.name) : 'var(--rule)'} style:background={i < count ? background(part.name) : 'var(--panel)'}>
          <h3>{part.name} {#if i < count}<span class="small" transition:fade={{duration:preference.reduced ? 0 : 220}}>· batas ditemukan pada karakter {part.start}</span>{/if}</h3>
          <p>{#if part.trigger && part.text.startsWith(part.trigger)}<mark class:found={i < count}>{part.trigger}</mark>{part.text.slice(part.trigger.length)}{:else}{part.text}{/if}</p>
        </section>{:else}<p>Dokumen ini belum memiliki teks untuk disegmentasi. OCR diperlukan.</p>{/each}
      </div>
      <h3>Deteksi pada seluruh korpus</h3>
      {#if error}<p role="alert">{error}</p>{/if}
      {#if completed < (corpus.summary?.documents.length ?? 0)}<p role="status" class="small">Memeriksa bagian: {completed}/{corpus.summary?.documents.length} dokumen…</p><progress value={completed} max={corpus.summary?.documents.length}></progress>{/if}
      <div class="table-scroll"><table><thead><tr><th>Bagian</th><th>Terdeteksi dan berisi teks</th><th>Belum terdeteksi / kosong</th></tr></thead><tbody>{#each names as name}<tr><td>{name}</td><td>{counts[name] ?? 0} / {completed}</td><td>{completed - (counts[name] ?? 0)}</td></tr>{/each}</tbody></table></div>
      <div class="notes"><p><strong>Perhatikan:</strong> “MENGADILI” menandai amar; “Demikian diputuskan” menandai penutup. Pipeline memilih kemunculan terakhir agar kutipan sebelumnya tidak dianggap putusan akhir.</p><p>Warna dan mini-map mengikuti batas awal secara berurutan; rentang hasil ekstraksi dapat bertumpang tindih bila pemicu hilang. Kepala dan pertimbangan dapat dibentuk dari batas bagian lain. Dokumen pindai tetap masuk penyebut korpus.</p></div>
    {:else}<p role="status">Memuat bagian putusan…</p>{/if}
  </Frame>
</Step>
<style>
  .minimap { display:flex; height:1.8rem; gap:2px; }
  .minimap button { min-width:4px; flex-basis:0; padding:0; margin:0; border-bottom-width:3px; }
  .document section { padding:.8rem; border-left:3px solid; margin-bottom:.6rem; }
  .document p { font-size:.85rem; line-height:1.8; }
  mark:not(.found) { background:transparent; }
</style>
