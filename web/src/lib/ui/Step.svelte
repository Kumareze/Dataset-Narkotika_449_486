<script lang="ts">
  import type { Snippet } from 'svelte'
  let { id, number, title, description, children }: { id: string; number: number; title: string; description: string; children?: Snippet } = $props()
</script>
<section {id} class="pipeline-step" aria-labelledby={`${id}-title`}>
  <header class="step-head"><p class="eyebrow">Tahap {String(number).padStart(2, '0')} / 09</p><h2 id={`${id}-title`}>{title}</h2><p class="step-description">{description}</p></header>
  {#if children}{@render children()}{:else}<div class="empty-state">Tahap ini sedang dibangun.</div>{/if}
</section>
