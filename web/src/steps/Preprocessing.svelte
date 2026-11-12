<script lang="ts">
  import Step from '../lib/ui/Step.svelte'
  import Frame from '../lib/ui/viz/Frame.svelte'
  import Playback from '../lib/ui/viz/Playback.svelte'
  import { selectedDocument, motion, label, number } from '../lib/ui/viz/learning.svelte'
  import { corpus, preprocess } from '../lib/corpus.svelte'
  import type { TokenStages } from '../lib/pipeline/types'
  import { fade, fly } from 'svelte/transition'
  const chosen = selectedDocument(), preference = motion()
  const legal: Record<string,string> = { bukan:'negasi', tanpa:'ketiadaan hak', tidak:'negasi', belum:'waktu/negasi', para:'jamak', lebih:'batas jumlah', kurang:'batas jumlah', bersama:'keterlibatan bersama' }
  let input = $state(''), edited = $state(false), stemming = $state(false), count = $state(0), removed = $state(false)
  let stages = $state<TokenStages | null>(null), busy = $state(false), error = $state('')
  $effect(() => {
    const doc = chosen.document
    if (!doc || edited) return
    const sentences = doc.sections.amar.text.split(/(?<=[;.])\s+/).filter(s => s.length > 35)
    input = (sentences.find(s => /tanpa hak/i.test(s) && /shabu|sabu|golongan/i.test(s)) ?? sentences.find(s => /shabu|sabu/i.test(s)) ?? sentences[0] ?? '').slice(0,2500)
  })
  $effect(() => {
    const text = input
    if (corpus.status !== 'ready') return
    let current = true
    busy = true; stages = null; count = 0; error = ''
    const timer = setTimeout(() => { void preprocess(text).then(result => { if (current) { stages = result; busy = false } }).catch(e => { if (current) { error = String(e); busy = false } }) }, 220)
    return () => { current = false; clearTimeout(timer) }
  })
  $effect(() => {
    removed = false
    if (count < 4) return
    if (preference.reduced) { removed = true; return }
    const timer = setTimeout(() => removed = true, 700)
    return () => clearTimeout(timer)
  })
  const protectedWords = new Set('terdakwa perantara penuntut direktori golongan penyidik penyalahguna narkotika psikotropika metamfetamina tembakau sintetis ekstasi ganja sabu'.split(' '))
  const rows = $derived(stages ? [
    { title:'1 · Huruf kecil', tokens:stages.lowercase.split(/\s+/).filter(Boolean) },
    { title:'2 · Normalisasi ejaan', tokens:stages.normalized.split(/\s+/).filter(Boolean) },
    { title:'3 · Tokenisasi', tokens:stages.tokens },
    { title:'4 · Stopword removal', tokens:stages.tokens },
    { title:stemming ? '5 · Stemming aktif' : '5 · Stemming dilewati', tokens:stemming ? stages.afterStemming : stages.afterStopwords },
  ] : [])
</script>
<Step id="preprocessing" number={5} title="Preprocessing: memilih bentuk kata" description="Huruf kecil dan normalisasi menyatukan ejaan yang setara. Tokenisasi memecah teks menjadi istilah, lalu stopword removal mengurangi kata umum. Stemming opsional menyatukan bentuk berimbuhan.">
  <Frame>
    <label for="preprocess-input">Kalimat yang diproses</label><textarea id="preprocess-input" rows="4" maxlength="2500" bind:value={input} oninput={() => edited = true}></textarea>
    <div class="toolbar"><button class="compact secondary" disabled={!chosen.document?.sections.amar.text} onclick={() => edited = false}>Gunakan amar pilihan</button><span class="small muted">{edited ? 'Teks masukan Anda' : `Sumber: ${chosen.document ? label(chosen.document.id) : 'memuat putusan pilihan'}`}</span><label><input type="checkbox" bind:checked={stemming} /> Aktifkan stemming</label></div>
    {#if error}<p role="alert">{error}</p>{/if}
    {#if busy}<p role="status">Menghitung tahapan token di worker…</p>{/if}
    {#if stages}<Playback bind:value={count} total={5} label="Jalankan tahapan" interval={1300} />
      {#each rows as row, stage}<div class="panel"><h3>{row.title}</h3>{#if count > stage}<div class="chips" in:fly={{y:preference.reduced ? 0 : 10,duration:preference.reduced ? 0 : 200}}>
        {#each row.tokens.slice(0,100) as term, i (`${stage}-${i}`)}
          {#if stage !== 3 || !removed || stages.afterStopwords.includes(term)}<span class="chip" class:changed={(stage === 1 && !stages.lowercase.split(/\s+/).includes(term)) || (stage === 4 && stemming && term !== stages.afterStopwords[i])} class:protected={(stage >= 3 && !!legal[term]) || (stage === 4 && stemming && protectedWords.has(term))} class:discard={stage === 3 && !stages.afterStopwords.includes(term)} out:fade={{duration:preference.reduced ? 0 : 500}} title={stage === 4 && stemming ? `${stages.afterStopwords[i]} → ${term}${protectedWords.has(term) ? ' · istilah domain dilindungi' : ''}` : legal[term] ? `Dipertahankan: ${legal[term]}` : ''}>{term}{#if stage >= 3 && legal[term]} <small>· {legal[term]}</small>{/if}{#if stage === 4 && stemming && protectedWords.has(term)} <small>· dilindungi</small>{/if}</span>{/if}
        {/each}
      </div><p class="small muted">{stage === 3 ? `${stages.afterStopwords.length} token tersisa; ${stages.tokens.length-stages.afterStopwords.length} dibuang` : `${row.tokens.length} ${stage < 2 ? 'potongan spasi (belum token)' : 'token'}`}{row.tokens.length > 100 ? ' · tampilan dibatasi pada 100 posisi pertama' : ''}</p>{:else}<p class="muted small">Menunggu tahapan sebelumnya…</p>{/if}</div>{/each}
    {/if}
    <div class="notes"><p><strong>Perhatikan:</strong> shabu-shabu dinormalisasi menjadi sabu, dan golongan I menjadi golongan_i. bukan/tanpa/tidak/belum/para/lebih/kurang/bersama dipertahankan karena mengubah makna hukum.</p><p>Pencarian memakai stemming nonaktif. Indeks korpus saat ini berisi {number(corpus.summary?.statistics.positions ?? 0)} token dan {number(corpus.summary?.statistics.vocabularySize ?? 0)} istilah unik setelah stopword removal; API tidak menyediakan hitungan korpus untuk setiap tahap.</p></div>
  </Frame>
</Step>
<style>.discard { text-decoration:line-through; color:var(--bad); }.chip small { font-family:var(--sans); font-size:.7rem; }</style>
