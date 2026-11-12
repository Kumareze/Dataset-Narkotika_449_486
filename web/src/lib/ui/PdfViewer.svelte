<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask, TextLayer } from 'pdfjs-dist'
  import './pdf/text-layer.css'
  import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
  import { fetchPdf } from '../corpus.svelte'
  import type { SearchResult } from '../pipeline/types'
  import type { CaseRecord } from '../data'
  let { result, metadata, onclose }: { result: SearchResult; metadata?: CaseRecord; onclose: () => void } = $props()
  let dialog: HTMLDialogElement, host: HTMLDivElement, canvas: HTMLCanvasElement, pageContainer: HTMLDivElement, textContainer: HTMLDivElement
  // Extraction assigns document-wide ids before sorting or removing any items.
  const pageOffsets = new Map<number, Promise<number>>([[1, Promise.resolve(0)]])
  function itemOffset(document: PDFDocumentProxy, number: number): Promise<number> {
    const cached = pageOffsets.get(number)
    if (cached) return cached
    const offset = itemOffset(document, number - 1).then(async previous => {
      const page = await document.getPage(number - 1)
      const content = await page.getTextContent()
      return previous + content.items.filter(item => 'str' in item).length
    })
    pageOffsets.set(number, offset)
    void offset.catch(() => pageOffsets.delete(number))
    return offset
  }
  let pdf = $state.raw<PDFDocumentProxy | null>(null)
  let pageNumber = $state(untrack(() => result.passage.page)), width = $state(0), height = $state(0), available = $state(0)
  let focused = $state(untrack(() => Math.max(0, result.matches.findIndex(m => m.start >= result.passage.start && m.rectangles.some(r => r.page === result.passage.page)))))
  let error = $state(''), rendering = $state(true)
  let boxes = $state<{ left: number; top: number; width: number; height: number; focused: boolean }[]>([])
  function match(delta: number) {
    focused = (focused + delta + result.matches.length) % result.matches.length
    pageNumber = result.matches[focused].rectangles[0]?.page ?? pageNumber
  }
  function key(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); onclose(); return }
    if ((event.target as HTMLElement).tagName === 'INPUT') return
    if (['ArrowRight', 'ArrowDown', 'n', 'ArrowLeft', 'ArrowUp', 'p'].includes(event.key) && result.matches.length) {
      event.preventDefault(); match(['ArrowRight', 'ArrowDown', 'n'].includes(event.key) ? 1 : -1)
    }
  }
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialog.showModal()
    const measure = () => { available = host.clientWidth }
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    measure()
    let disposed = false
    let task: PDFDocumentLoadingTask | undefined
    void Promise.all([import('pdfjs-dist'), fetchPdf(result.id)]).then(([{ getDocument, GlobalWorkerOptions }, bytes]) => {
      if (disposed) return
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      task = getDocument({ data: bytes, useSystemFonts: true }); return task.promise
    }).then(value => { if (!disposed && value) pdf = value }).catch(e => { if (!disposed) { error = `PDF gagal dimuat: ${String(e)}`; rendering = false } })
    return () => { disposed = true; observer.disconnect(); void task?.destroy(); document.body.style.overflow = overflow; previous?.focus() }
  })
  $effect(() => {
    const document = pdf, number = pageNumber, size = available, focus = focused
    if (!document || !size) return
    let disposed = false, render: RenderTask | undefined, layer: TextLayer | undefined
    textContainer.replaceChildren()
    rendering = true; error = ''; boxes = []
    void document.getPage(number).then(async page => {
      if (disposed) return
      const viewport = page.getViewport({ scale: size / page.getViewport({ scale: 1 }).width })
      const ratio = window.devicePixelRatio || 1
      width = viewport.width; height = viewport.height
      canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio)
      render = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await render.promise
      if (disposed) return
      let offset = -1
      try {
        const [content, firstId, { TextLayer }] = await Promise.all([page.getTextContent(), itemOffset(document, number), import('pdfjs-dist')])
        if (disposed) return
        offset = firstId
        textContainer.style.setProperty('--total-scale-factor', String(viewport.scale))
        layer = new TextLayer({ textContentSource: content, container: textContainer, viewport })
        // Use exact viewport dimensions without viewer-specific pixel rounding variables.
        const rotated = viewport.rotation % 180 !== 0
        textContainer.style.width = `${rotated ? viewport.height : viewport.width}px`
        textContainer.style.height = `${rotated ? viewport.width : viewport.height}px`
        await layer.render()
      } catch {
        if (disposed) return
        layer?.cancel(); layer = undefined
        textContainer.replaceChildren()
      }
      await tick()
      if (disposed) return
      const origin = pageContainer.getBoundingClientRect()
      boxes = result.matches.flatMap((m, i) => m.rectangles.filter(r => r.page === number).flatMap(r => {
        const index = r.itemId - offset
        const span = layer?.textDivs[index], node = span?.firstChild
        const source = layer?.textContentItemsStr[index]
        if (span?.isConnected && node?.nodeType === Node.TEXT_NODE && source === node.textContent &&
          r.start >= 0 && r.end > r.start && r.end <= source.length && source.slice(r.start, r.end) === r.text) {
          const range = window.document.createRange()
          range.setStart(node, r.start); range.setEnd(node, r.end)
          const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0)
          if (rects.length) return rects.map(rect => ({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height, focused: i === focus }))
        }
        const [x1, y1] = viewport.convertToViewportPoint(r.x, r.y)
        const [x2, y2] = viewport.convertToViewportPoint(r.x + r.w, r.y + r.h)
        return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), focused: i === focus }
      }))
      rendering = false
      requestAnimationFrame(() => { if (!disposed) host.querySelector('.pdf-hit.focused')?.scrollIntoView({ block: 'center', behavior: 'instant' }) })
    }).catch(e => { if (!disposed) { error = `Halaman gagal ditampilkan: ${String(e)}`; rendering = false } })
    return () => { disposed = true; render?.cancel(); layer?.cancel() }
  })
</script>
<dialog bind:this={dialog} class="pdf-dialog" aria-labelledby="pdf-title" onkeydown={key} oncancel={e => { e.preventDefault(); onclose() }}>
  <div class="pdf-header"><div><strong id="pdf-title">{metadata?.['No Putusan'] ?? result.id}</strong>{#if metadata?.['URL Putusan']}<br /><a class="small" href={metadata['URL Putusan']} target="_blank" rel="noreferrer">Lihat putusan asli ↗</a>{/if}</div><button class="compact secondary" onclick={onclose} aria-label="Tutup PDF">Tutup ×</button></div>
  <div class="pdf-controls">
    <div class="controls"><button class="compact secondary" disabled={!result.matches.length} onclick={() => match(-1)} aria-label="Kecocokan sebelumnya">←</button><span class="small">Kecocokan {result.matches.length ? focused + 1 : 0} dari {result.matches.length}</span><button class="compact secondary" disabled={!result.matches.length} onclick={() => match(1)} aria-label="Kecocokan berikutnya">→</button></div>
    <div class="controls"><button class="compact secondary" disabled={!pdf || pageNumber <= 1} onclick={() => pageNumber--} aria-label="Halaman sebelumnya">‹</button><label class="page-input">Hal. <input type="number" min="1" max={pdf?.numPages ?? 1} value={pageNumber} onchange={e => { const value = Number(e.currentTarget.value); if (pdf && Number.isInteger(value) && value >= 1 && value <= pdf.numPages) pageNumber = value; else e.currentTarget.value = String(pageNumber) }} /> / {pdf?.numPages ?? '…'}</label><button class="compact secondary" disabled={!pdf || pageNumber >= pdf.numPages} onclick={() => pageNumber++} aria-label="Halaman berikutnya">›</button></div>
  </div>
  <p class="small muted pdf-hint">Panah atau n/p: kecocokan · Esc: tutup. Sorotan mengikuti teks PDF; kotak kata OCR digunakan untuk dokumen pindai.</p>
  {#if error}<p role="alert" class="notice notice-error">{error}</p>{/if}
  {#if rendering}<p role="status" class="pdf-loading">Memuat halaman…</p>{/if}
  <div class="pdf-scroll"><div bind:this={host} class="pdf-host"><div bind:this={pageContainer} class="pdf-page" style:width={`${width}px`} style:height={`${height}px`} style:visibility={rendering || error ? 'hidden' : 'visible'}>
    <canvas bind:this={canvas} style:width={`${width}px`} style:height={`${height}px`} aria-label={`Halaman ${pageNumber} putusan`}></canvas>
    <div bind:this={textContainer} class="pdf-text-layer"></div>
    {#each boxes as box}<span class:focused={box.focused} class="pdf-hit" style:left={`${box.left}px`} style:top={`${box.top}px`} style:width={`${box.width}px`} style:height={`${box.height}px`}></span>{/each}
  </div></div></div>
</dialog>
