<script lang="ts">
  import { onMount } from 'svelte'
  import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
  import { fetchPdf } from '../../corpus.svelte'
  import type { ProcessedDocument, RawItem } from '../../pipeline/types'
  import { motion } from './learning.svelte'
  import { fade } from 'svelte/transition'
  let { doc, pageNumber, count }: { doc: ProcessedDocument; pageNumber: number; count: number } = $props()
  const preference = motion()
  let host: HTMLDivElement, canvas: HTMLCanvasElement
  let available = $state(0), width = $state(0), height = $state(0), loading = $state(true), error = $state('')
  let pdf = $state.raw<PDFDocumentProxy | null>(null)
  let boxes = $state<{ item: RawItem; rank: number; reason: string; left: number; top: number; width: number; height: number }[]>([])
  onMount(() => {
    const observer = new ResizeObserver(() => available = host.clientWidth); observer.observe(host)
    let disposed = false, task: PDFDocumentLoadingTask | undefined
    void Promise.all([import('pdfjs-dist'), fetchPdf(doc.id)]).then(([{ getDocument, GlobalWorkerOptions }, bytes]) => { GlobalWorkerOptions.workerSrc = workerUrl; if (!disposed) { task = getDocument({ data: bytes, useSystemFonts: true }); return task.promise } }).then(value => { if (!disposed && value) pdf = value }).catch(e => { if (!disposed) { error = String(e); loading = false } })
    return () => { disposed = true; observer.disconnect(); void task?.destroy() }
  })
  $effect(() => {
    const document = pdf, size = available, number = pageNumber
    if (!document || !size) return
    let disposed = false, render: RenderTask | undefined
    loading = true; error = ''; boxes = []
    void document.getPage(number).then(async page => {
      if (disposed) return
      const viewport = page.getViewport({ scale: size / page.getViewport({ scale: 1 }).width })
      width = viewport.width; height = viewport.height
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio)
      render = page.render({ canvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] }); await render.promise
      if (disposed) return
      const items = doc.pages[number - 1].items.filter(i => i.text.trim())
      const order = items.filter(i => i.horizontal).sort((a,b) => a.start - b.start)
      boxes = items.slice(0, 500).map(item => {
        const [x1,y1] = viewport.convertToViewportPoint(item.x,item.y), [x2,y2] = viewport.convertToViewportPoint(item.x + item.w,item.y + item.h)
        return { item, rank: order.indexOf(item) + 1, reason: doc.removedLines.find(line => line.itemIds.includes(item.id))?.reason ?? '', left: Math.min(x1,x2), top: Math.min(y1,y2), width: Math.abs(x2-x1), height: Math.abs(y2-y1) }
      }); loading = false
    }).catch(e => { if (!disposed) { error = String(e); loading = false } })
    return () => { disposed = true; render?.cancel() }
  })
</script>
{#if loading}<p role="status">Merender halaman PDF…</p>{/if}
{#if error}<p class="notice notice-error" role="alert">{error}</p>{/if}
<div bind:this={host} class="host"><div class="page" style:width={`${width}px`} style:height={`${height}px`} style:visibility={loading ? 'hidden' : 'visible'}>
  <canvas bind:this={canvas} style:width={`${width}px`} style:height={`${height}px`} aria-label={`Halaman asli ${pageNumber}`}></canvas>
  {#each boxes as box (box.item.id)}<span class="box" class:removed={!!box.reason} style:left={`${box.left}px`} style:top={`${box.top}px`} style:width={`${box.width}px`} style:height={`${box.height}px`} title={`${box.item.text}${box.reason ? ` · dihapus: ${box.reason}` : ''}`}>
    {#if box.rank > 0 && box.rank <= count}<b transition:fade={{ duration: preference.reduced ? 0 : 160 }}>{box.rank}</b>{/if}
  </span>{/each}
</div></div>
<p class="small muted">Kotak mengikuti batas item PDF, bukan ukuran setiap huruf. Maksimal 500 kotak pada satu halaman.</p>
<style>
  .host { width:100%; min-width:0; overflow:hidden; }
  .page { position:relative; }
  canvas { display:block; }
  .box { position:absolute; border:1px solid var(--accent); background:var(--search-hit); }
  .box.removed { border-color:var(--bad); background:color-mix(in srgb,var(--bad) 16%,transparent); }
  .removed::after { content:''; position:absolute; top:50%; left:0; right:0; border-top:1px solid var(--bad); }
  b { position:absolute; left:0; top:-.5em; font-size:9px; line-height:1.1; background:var(--accent); color:var(--panel); padding:1px 2px; }
</style>
