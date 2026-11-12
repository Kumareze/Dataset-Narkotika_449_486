<script lang="ts">
  import { onMount } from 'svelte'
  import { corpus, loadCorpus, clearStoredData } from './lib/corpus.svelte'
  import { cases, zipUrl } from './lib/data'
  import Crawl from './steps/Crawl.svelte'
  import Teks from './steps/Teks.svelte'
  import Segmentasi from './steps/Segmentasi.svelte'
  import Atribut from './steps/Atribut.svelte'
  import Preprocessing from './steps/Preprocessing.svelte'
  import Index from './steps/Index.svelte'
  import Skor from './steps/Skor.svelte'
  import Cari from './steps/Cari.svelte'
  import Evaluasi from './steps/Evaluasi.svelte'

  const links = [['crawl', 'Crawl'], ['teks', 'PDF ke teks'], ['segmentasi', 'Segmentasi'], ['atribut', 'Atribut'], ['preprocessing', 'Preprocessing'], ['index', 'Indexing'], ['skor', 'Skor'], ['cari', 'Pencarian'], ['evaluasi', 'Evaluasi']]
  let current = $state('')
  let nav: HTMLElement
  onMount(() => {
    void loadCorpus()
    const sections = links.map(([id]) => document.getElementById(id)!)
    let frame = 0
    const update = () => {
      frame = 0
      const readingPosition = window.innerHeight * 0.35
      current = sections.filter(section => section.getBoundingClientRect().top <= readingPosition).at(-1)?.id ?? ''
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) current = 'evaluasi'
      const active = nav.querySelector<HTMLAnchorElement>(`a[href="#${current}"]`)
      if (active) {
        const bounds = nav.getBoundingClientRect(), tab = active.getBoundingClientRect()
        if (tab.left < bounds.left) nav.scrollLeft += tab.left - bounds.left
        else if (tab.right > bounds.right) nav.scrollLeft += tab.right - bounds.right
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('hashchange', schedule)
    const observer = new ResizeObserver(schedule)
    sections.forEach(section => observer.observe(section))
    observer.observe(nav)
    update()
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('hashchange', schedule)
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  })
</script>
<a class="skip-link" href="#main">Lewati navigasi</a>
<header class="topbar"><div class="topbar-inner">
  <a class="brand" href="#intro" aria-label="putusan-ir-showcase, pengantar">
    <svg width="20" height="24" viewBox="0 0 20 24" fill="none" aria-hidden="true"><path d="M3 1h10l4 4v18H3z" stroke="currentColor" stroke-width="1.5"/><path d="M13 1v5h4" stroke="currentColor"/><path d="M6 10h8M6 14h8" stroke="var(--accent)" stroke-width="2"/><path d="M6 18h5" stroke="var(--amber)" stroke-width="2"/></svg>
    <span>putusan-ir-showcase</span>
  </a>
  <nav bind:this={nav} class="nav-links" aria-label="Tahapan pengolahan">{#each links as [id, label]}<a href={`#${id}`} aria-current={current === id ? 'location' : undefined}>{label}</a>{/each}</nav>
  <div class="corpus-badge"><span class="pill" class:pill-running={corpus.status === 'loading'} class:pill-done={corpus.status === 'ready'}>{corpus.ocr ? `OCR halaman ${corpus.progress.completed}/${corpus.progress.total}` : corpus.status === 'ready' ? (corpus.cached ? 'Dimuat dari penyimpanan browser' : `${corpus.summary?.documents.length} dokumen siap`) : corpus.status === 'error' ? 'Pemrosesan gagal' : `Memproses ${corpus.progress.completed}/${corpus.progress.total}`}</span>{#if corpus.status === 'loading'}<progress value={corpus.progress.completed} max={corpus.progress.total || 50} aria-label="Progres dokumen"></progress>{/if}</div>
</div></header>
<main id="main" class="page">
  <header id="intro" class="page-head hero">
    <p class="eyebrow">Information retrieval · PN Bekasi · 2025</p><h1>Dari putusan menjadi pengetahuan.</h1>
    <p class="lede">Telusuri perjalanan {cases.length} putusan perkara narkotika: dari pengumpulan PDF hingga pencarian dan evaluasi hasilnya.</p>
    <p>Ikuti sembilan tahap untuk memahami bagaimana dokumen hukum diubah menjadi informasi yang dapat dicari. Semua pengolahan berjalan di browser Anda, tanpa server pemrosesan.</p>
    <p class="small muted">Sumber dataset: <a href="https://github.com/Kumareze/Dataset-Narkotika_449_486">Kumareze/Dataset-Narkotika_449_486</a>, bersumber dari Direktori Putusan Mahkamah Agung.</p>
    <div class="notice" aria-live="polite">
      {#if corpus.status === 'ready'}
        <strong>{corpus.summary?.documents.filter(d => !d.needsOcr).length} dokumen dapat dicari, {corpus.summary?.documents.filter(d => d.needsOcr).length} menunggu OCR.</strong>
        <span class="small"> {corpus.cached ? 'Dimuat dari penyimpanan browser' : 'PDF selesai diproses di browser Anda.'}</span>
      {:else if corpus.status === 'error'}<strong>Pengolahan gagal:</strong> {corpus.error}
      {:else}<strong>PDF sedang diproses di browser Anda.</strong> {corpus.progress.completed} dari {corpus.progress.total} dokumen selesai. Halaman tetap dapat dijelajahi selama proses berlangsung.{/if}
      {#if corpus.ocr}<p class="small">OCR halaman {corpus.progress.completed}/{corpus.progress.total}. Pencarian tetap dapat digunakan.</p>{/if}
      {#if corpus.ocrError}<p class="small" role="alert">OCR gagal: {corpus.ocrError}. Muat ulang halaman untuk mencoba kembali.</p>{/if}
      {#if corpus.storageWarning}<p class="small">Hasil tidak dapat disimpan di browser ini; halaman akan memproses ulang saat dimuat ulang.</p>{/if}
      <div class="small muted">{corpus.progress.pages} halaman · {corpus.progress.tokens.toLocaleString('id-ID')} token · {(corpus.progress.elapsed / 1000).toFixed(1)} detik</div>
      {#if corpus.status !== 'loading'}<button class="compact secondary outline" onclick={() => clearStoredData()}>Hapus data tersimpan</button>{/if}
    </div>
    <div class="hero-actions"><a class="compact" role="button" href="#crawl">Mulai dari crawl</a><a href={zipUrl} download="Narkotika.zip">Unduh dataset PDF</a><span class="pill">{cases.length} putusan</span></div>
  </header><Crawl />
  <Teks />
  <Segmentasi />
  <Atribut />
  <Preprocessing />
  <Index />
  <Skor />
  <Cari />
  <Evaluasi />
</main>
<footer class="page-foot">
  <p>Dataset: <a href="https://github.com/Kumareze/Dataset-Narkotika_449_486">Kumareze/Dataset-Narkotika_449_486</a>. Sumber: <a href="https://putusan3.mahkamahagung.go.id/">Direktori Putusan Mahkamah Agung RI</a>.</p>
  <p>Pembacaan PDF: <a href="https://mozilla.github.io/pdf.js/">pdf.js</a>. OCR bahasa Indonesia: <a href="https://tesseract.projectnaptha.com/">Tesseract.js</a>.</p>
  <p>Stemming: <a href="https://github.com/damzaky/sastrawijs">SastrawiJs (MIT)</a>; kamus kata dasar dari <a href="https://github.com/ivanlanin/kateglo">Kateglo, lisensi CC-BY-NC-SA 3.0</a>.</p>
</footer>
