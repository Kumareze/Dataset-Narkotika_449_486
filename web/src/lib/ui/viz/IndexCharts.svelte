<script lang="ts">
  import { scaleLog, line } from 'd3'
  import type { IndexStatistics } from '../../pipeline/types'
  import { number } from './learning.svelte'
  let { stats }: { stats: IndexStatistics } = $props()
  const x = $derived(scaleLog().domain([1, Math.max(2,stats.vocabularySize)]).range([55,610]))
  const y = $derived(scaleLog().domain([1,Math.max(2,stats.zipf[0]?.frequency ?? 1)]).range([260,20]))
  const sampled = $derived(stats.zipf.filter((_,i) => i < 30 || i % Math.max(1,Math.ceil(stats.zipf.length/600)) === 0 || i === stats.zipf.length-1))
  const path = $derived(line<{ rank:number; frequency:number }>().x(d => x(d.rank)).y(d => y(d.frequency))(sampled) ?? '')
</script>
<div class="split"><div class="panel"><h3>Zipf · skala log–log</h3>
  <svg viewBox="0 0 640 310" role="img" aria-label="Frekuensi istilah menurut peringkat, kedua sumbu logaritmik"><title>Kurva Zipf korpus: peringkat dan frekuensi</title>
    {#each x.ticks(4).filter(t => [1,2,5].includes(Number(String(t)[0]))) as tick}<line x1={x(tick)} x2={x(tick)} y1="20" y2="260" class="grid"/><text x={x(tick)} y="280" text-anchor="middle">{number(tick)}</text>{/each}
    {#each y.ticks(4).filter(t => String(t)[0] === '1') as tick}<line x1="55" x2="610" y1={y(tick)} y2={y(tick)} class="grid"/><text x="48" y={y(tick)+4} text-anchor="end">{number(tick)}</text>{/each}
    <path d={path} fill="none" stroke="var(--accent)" stroke-width="2"/><text x="330" y="305" text-anchor="middle">Peringkat istilah (log)</text><text x="8" y="14">Frekuensi (log)</text>
  </svg><p class="small muted">{stats.zipf.length} istilah; kurva diringkas menjadi {sampled.length} titik. Seluruh frekuensi berasal dari indeks worker.</p>
</div><div class="panel"><h3>20 istilah paling sering muncul</h3><div class="top-terms">{#each stats.zipf.slice(0,20) as row}<div class="term"><span title={row.term}>{row.term}</span><div class="track"><div class="bar" style:width={`${row.frequency/(stats.zipf[0]?.frequency || 1)*100}%`}></div></div><span class="mono">{number(row.frequency)}</span></div>{/each}</div></div></div>
<div class="panel"><h3>Estimasi penyimpanan posting</h3>{#each [{label:'Integer 32-bit mentah',bytes:stats.rawBytes},{label:'Gap + variable-byte',bytes:stats.gapVariableBytes}] as row}<p class="small">{row.label} · {number(row.bytes/1024)} KiB</p><div class="track"><div class="bar" style:width={`${row.bytes/Math.max(1,stats.rawBytes)*100}%`}></div></div>{/each}<p class="small muted">Pengurangan {number((1-stats.gapVariableBytes/Math.max(1,stats.rawBytes))*100)}%. Kedua estimasi hanya mencakup ID dokumen, jumlah posisi, dan posisi; kamus istilah serta overhead objek JavaScript tidak dihitung.</p></div>
<style>
  svg { width:100%; height:auto; overflow:visible; } text { fill:var(--ink-2); font-size:12px; }.grid { stroke:var(--rule); }
  .term { display:grid; grid-template-columns:6rem minmax(0,1fr) 4rem; gap:.5rem; align-items:center; font-size:.75rem; margin:.3rem 0; }.term > span:first-child { overflow:hidden; text-overflow:ellipsis; }.term > span:last-child { text-align:right; }
  .track { background:var(--sunk); border-radius:2px; }.top-terms .bar { height:.65rem; }
</style>
