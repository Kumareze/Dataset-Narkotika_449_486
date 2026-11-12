<script lang="ts">
  import Step from '../lib/ui/Step.svelte'
  import Frame from '../lib/ui/viz/Frame.svelte'
  import DocumentPicker from '../lib/ui/viz/DocumentPicker.svelte'
  import Playback from '../lib/ui/viz/Playback.svelte'
  import TextPage from '../lib/ui/viz/TextPage.svelte'
  import { selectedDocument } from '../lib/ui/viz/learning.svelte'
  const chosen = selectedDocument()
  let page = $state(1), count = $state(0)
  $effect(() => { chosen.document; page = 1; count = 0 })
  const raw = $derived(chosen.document?.pages[page - 1])
  const ordered = $derived(raw?.items.filter(i => i.horizontal && i.text.trim()).sort((a,b) => a.start - b.start) ?? [])
  const removed = $derived(chosen.document?.removedLines.filter(line => line.page === page) ?? [])
  const clean = $derived.by(() => {
    const ids = new Set(removed.flatMap(line => line.itemIds)), lines: string[] = []
    let y = Infinity
    for (const item of ordered.filter(i => !ids.has(i.id))) {
      if (Math.abs(y - item.transform[5]) >= 2) { lines.push(item.text); y = item.transform[5] }
      else lines[lines.length - 1] += ' ' + item.text
    }
    return lines.join('\n').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\u00a0/g, ' ').replace(/\u00ad/g, '').replace(/(\d)\s+\.(\d{3})/g, '$1.$2').replace(/\b(?:[A-Za-z] ){2,}[A-Za-z]\b/g, m => m.replaceAll(' ', '')).replace(/[ \t]+/g, ' ')
  })
</script>
<Step id="teks" number={2} title="PDF ke teks" description="PDF menyimpan potongan teks beserta koordinatnya. Pipeline mengurutkan baris dari atas ke bawah, lalu kiri ke kanan, dan membuang teks berulang agar isi putusan tidak tertutup boilerplate.">
  <Frame><DocumentPicker id="teks-document" />
    {#if chosen.error}<p role="alert">{chosen.error}</p>{:else if chosen.document && raw}
      <div class="toolbar"><label>Halaman <select bind:value={page} onchange={() => count = 0}>{#each chosen.document.pages as p}<option value={p.page}>{p.page}</option>{/each}</select></label><span class="pill">{raw.items.length} item mentah</span><span class="pill">{removed.length} baris dibuang</span></div>
      <Playback bind:value={count} total={ordered.length} label="Urutkan" interval={80} />
      <div class="split"><div class="panel">{#key chosen.document.id}<TextPage doc={chosen.document} pageNumber={page} {count} />{/key}</div><div>
        <div class="panel"><h3>Item mentah · urutan internal PDF</h3><pre class="scroll">{raw.items.map(i => i.text).join('\n') || 'Tidak ada lapisan teks.'}</pre></div>
        <div class="panel"><h3>Baris setelah penyaringan</h3><pre class="scroll">{clean || 'Tidak ada teks bersih. Halaman ini memerlukan OCR.'}</pre></div>
      </div></div>
      <details><summary>Legenda coretan dan aturan penghapusan</summary><p class="small">watermark: nama Mahkamah Agung atau alamat direktori · footer: nomor halaman/putusan · disclaimer: blok mulai kata “Disclaimer” · non-horizontal: item miring atau vertikal.</p><ul>{#each removed as line}<li class="small"><code>{line.reason}</code> <s>{line.text}</s></li>{/each}</ul></details>
      <div class="notes"><p><strong>Perhatikan:</strong> urutan internal PDF dapat berbeda dari urutan baca. Nomor kotak mengikuti urutan visual yang benar-benar dipakai worker.</p><p>Putusan 392 berupa hasil pindai. OCR bahasa Indonesia berjalan di latar belakang setelah 49 PDF teks siap dicari. Kotak kata hasil OCR dipakai untuk pengindeksan dan sorotan pada PDF. Baris bersih di sini direkonstruksi dari item yang lolos; worker menyatukannya menjadi satu teks.</p></div>
    {:else}<p role="status">Memuat item dan posisi teks…</p>{/if}
  </Frame>
</Step>
