<script lang="ts">
  import { corpus } from '../../corpus.svelte'
  import { label, selection } from './learning.svelte'
  let { id }: { id: string } = $props()
  $effect(() => {
    const docs = corpus.summary?.documents
    if (docs && !docs.some(d => d.id === selection.id)) selection.id = (docs.find(d => parseInt(d.id) === 107) ?? docs[0])?.id ?? ''
  })
</script>
<label for={id}>Ikuti satu putusan <span class="small muted">· pilihan tersambung pada tahap 2–4</span></label>
<select {id} bind:value={selection.id}>{#each corpus.summary?.documents ?? [] as doc}<option value={doc.id}>{label(doc.id)}{doc.needsOcr ? ' · perlu OCR' : ''}</option>{/each}</select>
