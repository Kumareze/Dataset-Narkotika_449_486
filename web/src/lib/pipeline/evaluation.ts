import type { CaseMetadata, Model } from './types';
import { CorpusIndex } from './search';
export const QUERIES = [
    { id: 'Q1', query: 'barang bukti ganja', field: 'Barang Bukti', pattern: /\bganja\b/ },
    { id: 'Q2', query: 'tembakau sintetis', field: 'Barang Bukti', pattern: /tembakau sintetis|mdmb|butinaca/ },
    { id: 'Q3', query: 'pil ekstasi', field: 'Barang Bukti', pattern: /ekstasi|tablet/ },
    { id: 'Q4', query: 'permufakatan jahat', field: 'Amar Putusan', first: true, pattern: /permufakatan|pemufakatan/ },
    { id: 'Q5', query: 'perantara dalam jual beli narkotika', field: 'Amar Putusan', first: true, pattern: /perantara/ },
    { id: 'Q6', query: 'memiliki menyimpan menguasai narkotika', field: 'Amar Putusan', first: true, pattern: /menyimpan|menguasai|memiliki/ },
    { id: 'Q7', query: 'narkotika golongan I dalam bentuk tanaman', field: 'Amar Putusan', first: true, pattern: /(?<!bukan )tanaman/ },
    { id: 'Q8', query: 'para terdakwa', field: 'Amar Putusan', pattern: /para terdakwa|terdakwa ii\b/ },
    { id: 'Q9', query: 'barang bukti dirampas untuk negara', field: 'Amar Putusan', pattern: /dirampas untuk negara/ },
    { id: 'Q10', query: 'uang hasil penjualan narkotika', field: 'Barang Bukti', pattern: /\buang\b/ },
];
export interface Metrics {
    'P@5': number;
    'P@10': number;
    'R@10': number;
    AP: number;
    'nDCG@10': number;
    RR: number;
}
export interface Evaluation {
    ablation?: { label: string; MAP: number; ndcg: number }[];
    model: Model;
    stemming: boolean;
    queries: {
        id: string;
        query: string;
        source: { field: string; first: boolean; pattern: string };
        relevant: string[];
        ranking: string[];
        metrics: Metrics;
    }[];
    mean: Metrics;
    MAP: number;
    MRR: number;
}
export function metrics(ranking: string[], relevant: Set<string>): Metrics {
    let hits = 0, ap = 0, dcg = 0, rr = 0;
    ranking.forEach((id, i) => { if (relevant.has(id)) {
        hits++;
        ap += hits / (i + 1);
        if (!rr)
            rr = 1 / (i + 1);
        if (i < 10)
            dcg += 1 / Math.log2(i + 2);
    } });
    const at = (k: number) => ranking.slice(0, k).filter(id => relevant.has(id)).length;
    const ideal = Array.from({ length: Math.min(10, relevant.size) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
    return { 'P@5': at(5) / 5, 'P@10': at(10) / 10, 'R@10': relevant.size ? at(10) / relevant.size : 0, AP: relevant.size ? ap / relevant.size : 0, 'nDCG@10': ideal ? dcg / ideal : 0, RR: rr };
}
function evaluateBase(index: CorpusIndex, cases: CaseMetadata[], model: Model): Evaluation {
    const queries = QUERIES.map(q => { const relevant = new Set(cases.filter(c => { const value = String(c[q.field] ?? '').toLowerCase(); return q.pattern.test(q.first ? value.split('menjatuhkan')[0] : value); }).map(c => String(c['No Putusan']).replace(/\s*([./])\s*/g, '$1')).filter(id => index.documents.has(id))); const ranking = index.rank(q.query, model, false).map(r => r.id); return { id: q.id, query: q.query, source: { field: q.field, first: !!q.first, pattern: q.pattern.source }, relevant: [...relevant], ranking, metrics: metrics(ranking, relevant) }; });
    const mean = Object.fromEntries(Object.keys(queries[0].metrics).map(key => [key, queries.reduce((sum, q) => sum + q.metrics[key as keyof Metrics], 0) / queries.length])) as unknown as Metrics;
    return { model, stemming: !!index.options.stemming, queries, mean, MAP: mean.AP, MRR: mean.RR };
}
/** The notebook ablation holds stemming on except in the explicit no-stem row. */
export function evaluate(index: CorpusIndex, cases: CaseMetadata[], model: Model = 'BM25'): Evaluation {
    const result = evaluateBase(index, cases, model);
    if (model === 'BM25' && index.options.stemming && index.options.stopwords !== false) {
        const documents = [...index.documents.values()];
        result.ablation = [
            ['BM25 lengkap', result],
            ['BM25 tanpa stemming', evaluateBase(new CorpusIndex(documents, { stemming: false }), cases, 'BM25')],
            ['BM25 tanpa stopword removal', evaluateBase(new CorpusIndex(documents, { stemming: true, stopwords: false }), cases, 'BM25')],
            ['BM25F (zona)', evaluateBase(index, cases, 'BM25F')],
        ].map(([label, evaluation]) => ({ label: label as string, MAP: (evaluation as Evaluation).MAP, ndcg: (evaluation as Evaluation).mean['nDCG@10'] }));
    }
    return result;
}
