<script lang="ts">
  import Step from '../lib/ui/Step.svelte'
  import Frame from '../lib/ui/viz/Frame.svelte'
  import DocumentPicker from '../lib/ui/viz/DocumentPicker.svelte'
  import Playback from '../lib/ui/viz/Playback.svelte'
  import { selectedDocument, motion, color } from '../lib/ui/viz/learning.svelte'
  import { attributeRows } from '../lib/ui/viz/attributes'
  import { fly, crossfade } from 'svelte/transition'
  const chosen = selectedDocument(), preference = motion()
  let count = $state(0), focus = $state(0)
  const [send, receive] = crossfade({ duration: 450 })
  const rows = $derived(chosen.document ? attributeRows(chosen.document) : [])
  $effect(() => { chosen.document; count = 0; focus = 0 })
  $effect(() => { focus = Math.min(count, 12) })
  const shown = $derived(rows[focus])
  const display = (value: unknown) => value === null || value === undefined || value === '' ? 'Tidak tersedia' : String(value)
</script>
<Step id="atribut" number={4} title="Ekstraksi atribut: teks menjadi kolom" description="Aturan pola mengambil identitas, barang bukti, dan hukuman dari bagian yang sesuai. Hasil terstruktur dapat dibandingkan dengan metadata situs untuk menemukan perbedaan yang perlu diperiksa.">
  <Frame><DocumentPicker id="atribut-document" />
    {#if chosen.error}<p role="alert">{chosen.error}</p>{:else if chosen.document}
      <Playback bind:value={count} total={rows.length} label="Ekstrak atribut" interval={1200} />
      <div class="split"><div class="panel source"><h3>Sumber untuk {shown?.key}</h3>
        {#if shown}<span class="pill" style:color={color(shown.zone)}>{shown.zone}{shown.offset !== null ? ` · karakter ${shown.offset}` : ''}</span><p>{shown.before}<mark>{shown.source || 'Cuplikan sumber tidak ditemukan.'}</mark>{shown.after}</p><p class="small muted">Cuplikan konteks dari teks asli. Angka hukuman dikonversi menjadi bulan atau rupiah; cuplikan bukan pemetaan karakter eksak untuk seluruh nilai.</p>{/if}
        {#each rows.slice(count,count+1) as next (next.key)}<div class="chip" out:send={{key:next.key,duration:preference.reduced ? 0 : 450}}><strong>{next.key}</strong><br />{display(next.value).slice(0,180)}{display(next.value).length > 180 ? '…' : ''}</div>{/each}
      </div><div class="panel"><h3>Hasil terbaru</h3>{#if count > 0}{#key count}<div in:fly={{ x:preference.reduced ? 0 : -60, duration:preference.reduced ? 0 : 400 }}><strong>{rows[count-1]?.key}</strong><p class="scroll">{display(rows[count-1]?.value)}</p></div>{/key}{:else}<p class="muted">Tekan satu langkah untuk memindahkan hasil ekstraksi ke tabel.</p>{/if}</div></div>
      <div class="table-scroll"><table><thead><tr><th>Atribut</th><th>Dari PDF</th><th>Metadata situs</th><th>Perbandingan</th></tr></thead><tbody>
        {#each rows.slice(0,count) as row (row.key)}<tr><th><button class="field" onclick={() => focus = rows.indexOf(row)}>{row.key}</button></th><td><div class="value" in:receive={{key:row.key,duration:preference.reduced ? 0 : 450}}>{display(row.value)}</div></td><td><div class="value">{display(row.reference)}</div></td><td><span class="pill" class:pill-done={row.reference != null && row.value != null && row.value !== '' && row.equal}>{row.reference == null ? 'Tanpa pembanding' : row.value == null || row.value === '' ? 'Tidak terekstrak' : row.equal ? 'Cocok' : 'Berbeda'}</span></td></tr>{/each}
      </tbody></table></div>
      <div class="notes"><p><strong>Perhatikan:</strong> “berbeda” berarti nilai setelah normalisasi spasi, huruf kecil, dan pemisah nomor belum sama, bukan otomatis salah. Baca konteks sumber sebelum menyimpulkan.</p><p>Metadata dipakai sebagai pembanding independen, tidak dimasukkan ke indeks teks. Beberapa atribut, seperti hakim dan nama terdakwa, tidak tersedia di metadata.</p></div>
    {:else}<p role="status">Memuat atribut dan sumber…</p>{/if}
  </Frame>
</Step>
<style>
  .source p { margin-top:.8rem; overflow-wrap:anywhere; }
  .value { min-width:10rem; max-width:24rem; max-height:10rem; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; }
  .field { background:none; border:0; color:var(--accent); padding:0; text-align:left; font-size:inherit; }
</style>
