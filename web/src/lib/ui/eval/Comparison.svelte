<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3'
  import type { Evaluation } from '../../pipeline/evaluation'
  let { results }: { results: Evaluation[] } = $props()
  const labels = ['P@5', 'R@10', 'MAP', 'nDCG@10']
  const colors = ['var(--green-mark)', 'var(--amber-mark)', 'var(--red-mark)']
  const x = scaleBand().domain(labels).range([38, 640]).padding(.22)
  const inner = scaleBand().domain(['TF-IDF', 'BM25', 'BM25F']).range([0, x.bandwidth()]).padding(.12)
  const y = scaleLinear().domain([0, 1]).range([230, 20])
  const value = (e: Evaluation, key: string) => key === 'MAP' ? e.MAP : e.mean[key as keyof Evaluation['mean']]
</script>
<div class="legend">{#each results as result, i}<span><i style:background={colors[i]}></i>{result.model}</span>{/each}</div>
<svg viewBox="0 0 660 270" role="img" aria-label="Perbandingan rerata sepuluh kueri, skala nol sampai satu. Nilai tepat tersedia dalam tabel.">
  {#each y.ticks(4) as tick}<line x1="38" x2="640" y1={y(tick)} y2={y(tick)} /><text x="30" y={y(tick) + 4} text-anchor="end">{tick}</text>{/each}
  {#each labels as label}<text x={x(label)! + x.bandwidth() / 2} y="252" text-anchor="middle">{label}</text>
    {#each results as result, i}<rect x={x(label)! + inner(result.model)!} y={y(value(result, label))} width={inner.bandwidth()} height={230 - y(value(result, label))} fill={colors[i]}><title>{result.model} · {label}: {value(result, label).toFixed(4)}</title></rect>{/each}
  {/each}
</svg>
<details><summary>Nilai grafik</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>Model</th>{#each labels as label}<th>{label}</th>{/each}</tr></thead><tbody>{#each results as result}<tr><th>{result.model}</th>{#each labels as label}<td>{value(result, label).toFixed(3)}</td>{/each}</tr>{/each}</tbody></table></div></details>
<style>
  svg { width: 100%; height: auto; display: block; } text { fill: var(--ink-2); font: 12px var(--sans); } line { stroke: var(--rule); }
  .legend { display: flex; flex-wrap: wrap; gap: 1rem; font-size: .85rem; } .legend span { display: flex; gap: .4rem; align-items: center; } i { width: .8rem; height: .8rem; display: inline-block; }
</style>
