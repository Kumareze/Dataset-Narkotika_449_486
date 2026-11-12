<script lang="ts">
  import { motion } from './learning.svelte'
  let { value = $bindable(0), total, label = 'Putar', interval = 650 }: { value?: number; total: number; label?: string; interval?: number } = $props()
  let playing = $state(false)
  const preference = motion()
  $effect(() => {
    if (!playing || preference.reduced) return
    const timer = setInterval(() => { if (!document.hidden) { value = Math.min(total, value + 1); if (value >= total) playing = false } }, interval)
    return () => clearInterval(timer)
  })
</script>
<div class="toolbar">
  <button class="compact" disabled={!total} onclick={() => { if (preference.reduced) value = total; else { if (value >= total) value = 0; playing = !playing } }}>{preference.reduced ? 'Tampilkan semua' : playing ? 'Jeda' : label}</button>
  <button class="compact secondary" disabled={value >= total} onclick={() => { playing = false; value++ }}>Satu langkah</button>
  <button class="compact secondary" onclick={() => { playing = false; value = 0 }}>Ulangi</button>
  <span class="small mono" aria-live="polite">{value}/{total}</span>
</div>
