<script lang="ts">
  import { onMount } from 'svelte'
  import Step from '../lib/ui/Step.svelte'
  import { crawlLog, type CrawlRequest, type RequestKind } from '../lib/data'

  const requests = [...crawlLog.verified_run.requests].sort((a, b) => a.t - b.t)
  const duration = requests.at(-1)!.t
  const lanes: { kind: RequestKind; label: string; color: string }[] = [
    { kind: 'robots', label: 'robots.txt', color: 'var(--ink-3)' },
    { kind: 'listing', label: 'Listing', color: 'var(--amber)' },
    { kind: 'detail', label: 'Detail', color: 'var(--green)' },
    { kind: 'pdf', label: 'PDF', color: 'var(--accent)' },
  ]
  let elapsed = $state(0)
  let playing = $state(false)
  let speed = $state(10)
  let reducedMotion = $state(false)
  let started = $state(false)
  const visible = $derived(started ? requests.filter(request => request.t <= elapsed) : [])
  const pdfCount = $derived(visible.filter(request => request.kind === 'pdf').length)
  const bytes = $derived(visible.reduce((sum, request) => sum + request.bytes, 0))
  const latest = $derived(visible.slice(-6).reverse())
  const finished = $derived(elapsed >= duration)
  const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
  const size = (value: number) => value >= 1e6 ? `${(value / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 })} MB` : `${(value / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} kB`
  function shortUrl(request: CrawlRequest) {
    if (request.kind === 'listing') return `…/2025/${request.url.match(/page\/\d+/)?.[0] ?? 'halaman 1'}`
    if (request.kind === 'robots') return '/robots.txt'
    return `…/${request.kind === 'pdf' ? 'pdf' : 'putusan'}/${request.url.split('/').at(-1)!.slice(0, 12)}…`
  }
  function toggle() {
    if (finished) elapsed = 0
    started = true
    playing = !playing
  }
  onMount(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion = preference.matches
    const change = () => { reducedMotion = preference.matches; if (reducedMotion) playing = false }
    preference.addEventListener('change', change)
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      if (playing && !document.hidden) {
        elapsed = Math.min(duration, elapsed + (now - previous) / 1000 * speed)
        if (elapsed >= duration) playing = false
      }
      previous = now
    }, 50)
    return () => { clearInterval(timer); preference.removeEventListener('change', change) }
  })
</script>

<Step id="crawl" number={1} title="Crawl: mengikuti jejak dokumen" description="Halaman listing berisi daftar putusan. Setiap tautan membawa kita ke halaman detail yang memuat metadata dan tautan unduhan PDF.">
  <div class="notice"><strong>Replay crawl nyata, 11 November 2026.</strong> Rekaman dari koneksi rumahan, dengan waktu dan respons asli. Pemutaran ini tidak mengirim permintaan langsung ke situs pengadilan.</div>
  <div class="crawl-flow" aria-label="Alur crawl">
    <div><span class="eyebrow">01 · Aturan</span><strong>robots.txt</strong><small>Periksa aturan akses</small></div>
    <div><span class="eyebrow">02 · Daftar</span><strong>Listing</strong><small>Temukan tautan putusan</small></div>
    <div><span class="eyebrow">03 · Metadata</span><strong>Detail</strong><small>Baca informasi dan tautan PDF</small></div>
    <div><span class="eyebrow">04 · Dokumen</span><strong>PDF</strong><small>Unduh isi putusan</small></div>
  </div>
  <p class="small muted">Crawler perlu memeriksa robots.txt dan memberi jeda antarpemintaan, sekitar 4–5 detik pada run ini. Pemeriksaan robots.txt tidak tercatat dalam log terverifikasi ini; tidak ada titik yang ditambahkan untuknya.</p>
  <div class="kpi-row" aria-label="Statistik replay">
    <div class="stat"><span class="stat-label">Permintaan</span><span class="stat-value num">{visible.length} <span class="stat-sep">/ {requests.length}</span></span><span class="stat-foot">respons tercatat</span></div>
    <div class="stat"><span class="stat-label">PDF</span><span class="stat-value num">{pdfCount}</span><span class="stat-foot">dokumen diterima</span></div>
    <div class="stat"><span class="stat-label">Data diterima</span><span class="stat-value num">{(bytes / 1e6).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span class="stat-foot">MB · semua respons</span></div>
    <div class="stat"><span class="stat-label">Waktu crawl</span><span class="stat-value num">{clock(elapsed)}</span><span class="stat-foot">dari {clock(duration)} waktu asli</span></div>
  </div>
  <div class="panel">
    <div class="replay-toolbar">
      <div class="controls"><button class="compact" onclick={toggle}>{playing ? 'Jeda' : finished ? 'Putar ulang' : 'Putar replay'}</button><button class="compact secondary" onclick={() => { playing = false; started = false; elapsed = 0 }}>Reset</button></div>
      <label class="speed">Kecepatan <select bind:value={speed}><option value={1}>1×</option><option value={10}>10×</option><option value={60}>60×</option></select></label>
      <span class="pill" class:pill-done={finished}>{finished ? 'Selesai' : playing ? 'Memutar rekaman' : 'Dijeda'}</span>
    </div>
    <p class="small muted">Pada 10×, seluruh rekaman diputar dalam sekitar 49 detik.{reducedMotion ? ' Gerakan dikurangi sesuai pengaturan perangkat.' : ''}</p>
    <h3 class="section-title">Linimasa permintaan</h3>
    <div class="timeline" role="img" aria-label={`Linimasa empat jalur. ${visible.length} dari ${requests.length} permintaan, waktu ${clock(elapsed)}.`}>
      {#each lanes as lane}
        <div class="lane"><span class="lane-label" style:color={lane.color}>{lane.label}</span><div class="lane-track">
          {#if lane.kind === 'robots'}<span class="lane-note">Tidak tercatat</span>{/if}
          {#each visible.filter(request => request.kind === lane.kind) as request (request.t)}
            <span class="request-dot" style:left={`${request.t / duration * 100}%`} style:background={lane.color} title={`${clock(request.t)} · ${request.kind} · HTTP ${request.status} · ${size(request.bytes)}`}></span>
          {/each}
          <span class="playhead" style:left={`${elapsed / duration * 100}%`}></span>
        </div></div>
      {/each}
      <div class="timeline-axis"><span>00:00</span><span>{clock(duration / 2)}</span><span>{clock(duration)}</span></div>
    </div>
    <label class="small" for="replay-position">Posisi replay <span class="mono">{clock(elapsed)}</span></label>
    <input id="replay-position" type="range" min="0" max={duration} step="0.01" bind:value={elapsed} oninput={() => { started = true; playing = false }} aria-valuetext={`${clock(elapsed)} dari ${clock(duration)}`} />
    <h3 class="section-title">Respons terbaru</h3>
    <ul class="request-log" aria-label="Enam respons terakhir">
      {#each latest as request (request.t)}<li><time class="mono">{clock(request.t)}</time><span class="request-kind">{request.kind}</span><span class="request-url mono" title={request.url}>{shortUrl(request)}</span><span class="pill" class:pill-done={request.status === 200} class:pill-failed={request.status >= 400}>{request.status}</span><span class="log-size mono">{size(request.bytes)}</span></li>
      {:else}<li class="muted">Tekan Putar replay untuk mengikuti permintaan pertama.</li>{/each}
    </ul>
  </div>
  {#each crawlLog.rate_limited_examples as example}
    <aside class="notice notice-warn rate-limit">
      <h3>Saat server meminta jeda</h3>
      <p>Contoh terpisah dari rekaman utama: permintaan halaman detail mendapat HTTP {example.status}. Header <code>Retry-After</code> memberi petunjuk kapan permintaan boleh dicoba lagi. Log contoh ini mencatat jeda aktual, bukan nilai headernya.</p>
      <div class="retry-flow"><span class="pill pill-failed">{example.status} · Terlalu banyak permintaan</span><span class="mono">Tunggu {example.next_request_after_s} detik →</span><span class="pill pill-done">{example.next_status} · Berhasil</span></div>
      <p class="small">Memberi jeda dan mencoba ulang membantu menghormati batas akses server.</p>
    </aside>
  {/each}
</Step>
