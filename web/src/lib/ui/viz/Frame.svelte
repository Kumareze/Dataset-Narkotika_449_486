<script lang="ts">
  import type { Snippet } from 'svelte'
  import { corpus } from '../../corpus.svelte'
  let { children }: { children: Snippet } = $props()
</script>
<div class="viz">
  {#if corpus.status === 'ready'}{@render children()}
  {:else if corpus.status === 'error'}<p class="notice notice-error" role="alert">{corpus.error}</p>
  {:else}<div class="viz-loading" role="status"><p>Menyiapkan korpus · {corpus.progress.stage || 'menunggu worker'} · {corpus.progress.completed}/{corpus.progress.total || 50} dokumen</p><progress value={corpus.progress.completed} max={corpus.progress.total || 50}></progress><div></div><div></div><div></div></div>{/if}
</div>
<style>
  .viz { min-width:0; }
  .viz-loading div { height:1.1rem; background:var(--sunk); margin:.8rem 0; border-radius:4px; }
  .viz-loading div:last-child { width:65%; }
  :global(.viz .split) { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
  :global(.viz .split > *) { min-width:0; }
  :global(.viz .panel) { padding:1rem; margin:.75rem 0; min-width:0; }
  :global(.viz .scroll) { max-height:28rem; overflow:auto; overflow-wrap:anywhere; }
  :global(.viz .table-scroll) { overflow:auto; max-width:100%; }
  :global(.viz table) { font-size:.82rem; }
  :global(.viz td), :global(.viz th) { vertical-align:top; }
  :global(.viz pre) { white-space:pre-wrap; overflow-wrap:anywhere; font-size:.8rem; }
  :global(.viz .chips) { display:flex; flex-wrap:wrap; gap:.35rem; margin:.5rem 0; }
  :global(.viz .chip) { background:var(--sunk); border:1px solid var(--rule); border-radius:4px; padding:.2rem .45rem; font-family:var(--mono); font-size:.8rem; overflow-wrap:anywhere; }
  :global(.viz .changed) { background:var(--search-hit); border-color:var(--warn); }
  :global(.viz .protected) { border-color:var(--ok); }
  :global(.viz .notes) { border-left:3px solid var(--accent); padding-left:.8rem; color:var(--ink-2); font-size:.88rem; margin-top:1rem; }
  :global(.viz .notes p) { margin:.4rem 0; }
  :global(.viz .toolbar) { display:flex; flex-wrap:wrap; align-items:center; gap:.65rem; margin:.75rem 0; }
  :global(.viz .toolbar label) { margin:0; }
  :global(.viz .bar) { height:1rem; background:var(--accent); border-radius:2px; }
  @media(max-width:720px) { :global(.viz .split) { grid-template-columns:minmax(0,1fr); } :global(.viz .panel) { padding:.7rem; } }
</style>
