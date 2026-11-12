import { preprocess, stem } from './preprocess';
import { ZONES, type ProcessedDocument, type PipelineOptions, type Zone, type IndexStatistics, type Contribution, type Model, type SearchOptions, type SearchResult, type Match, type Passage, type ScoringParameters } from './types';
export const K1 = 1.2, B = 0.75;
export const ZONE_WEIGHT: Record<Zone, number> = { amar: 3, tuntutan: 1, pertimbangan: 1, kepala: .5, dakwaan: .5 };
type Posting = Map<string, number[]>;
export class CorpusIndex {
    readonly postings = new Map<string, Posting>();
    readonly documents = new Map<string, ProcessedDocument>();
    readonly terms = new Map<string, string[]>();
    readonly lengths = new Map<string, number>();
    readonly norms = new Map<string, number>();
    readonly zoneIndex = Object.fromEntries(ZONES.map(z => [z, new Map<string, Map<string, number>>()])) as Record<Zone, Map<string, Map<string, number>>>;
    readonly zoneLengths = Object.fromEntries(ZONES.map(z => [z, new Map<string, number>()])) as Record<Zone, Map<string, number>>;
    readonly zoneAverage = {} as Record<Zone, number>;
    readonly averageLength: number;
    readonly size: number;
    constructor(docs: ProcessedDocument[], readonly options: PipelineOptions = {}) {
        this.size = docs.length;
        for (const doc of docs) {
            this.documents.set(doc.id, doc);
            const terms = options.stopwords === false ? preprocess(doc.text, options) : doc.tokens.map(t => options.stemming ? stem(t.normalized) : t.normalized);
            this.terms.set(doc.id, terms);
            this.lengths.set(doc.id, terms.length);
            terms.forEach((t, pos) => { if (!this.postings.has(t))
                this.postings.set(t, new Map()); const p = this.postings.get(t)!; if (!p.has(doc.id))
                p.set(doc.id, []); p.get(doc.id)!.push(pos); });
            for (const z of ZONES) {
                const zterms = options.stopwords === false ? preprocess(doc.sections[z].text, options) : doc.zoneTokens[z].map(t => options.stemming ? stem(t) : t);
                this.zoneLengths[z].set(doc.id, zterms.length);
                for (const t of zterms) {
                    if (!this.zoneIndex[z].has(t))
                        this.zoneIndex[z].set(t, new Map());
                    const p = this.zoneIndex[z].get(t)!;
                    p.set(doc.id, (p.get(doc.id) ?? 0) + 1);
                }
            }
        }
        this.averageLength = [...this.lengths.values()].reduce((a, b) => a + b, 0) / (this.size || 1) || 1;
        for (const z of ZONES)
            this.zoneAverage[z] = Math.max(1e-9, [...this.zoneLengths[z].values()].reduce((a, b) => a + b, 0) / (this.size || 1));
        for (const [term, p] of this.postings)
            for (const [id, positions] of p)
                this.norms.set(id, (this.norms.get(id) ?? 0) + ((1 + Math.log(positions.length)) * this.idf(term, 'TF-IDF')) ** 2);
        for (const id of this.documents.keys())
            this.norms.set(id, Math.sqrt(this.norms.get(id) ?? 0) || 1);
    }
    idf(term: string, model: Model = 'BM25') { const df = this.postings.get(term)?.size ?? 0; return model === 'TF-IDF' ? (df ? Math.log(this.size / df) : 0) : Math.log(1 + (this.size - df + .5) / (df + .5)); }
    parseQuery(query: string) {
        const phrases = [...query.matchAll(/"([^"]+)"/g)].map(m => preprocess(m[1], this.options)).filter(p => p.length);
        const rest = query.replace(/"[^"]+"/g, ' '), excluded = new Set([...rest.matchAll(/-(\S+)/g)].flatMap(m => preprocess(m[1], this.options)));
        return { terms: [...preprocess(rest.replace(/-\S+/g, ' '), this.options), ...phrases.flat()], phrases, excluded };
    }
    boolean(query: string): string[] { const { terms, phrases, excluded } = this.parseQuery(query); return [...this.documents.keys()].filter(id => terms.every(t => this.postings.get(t)?.has(id)) && [...excluded].every(t => !this.postings.get(t)?.has(id)) && phrases.every(p => (this.postings.get(p[0])?.get(id) ?? []).some(start => p.every((t, k) => this.postings.get(t)?.get(id)?.includes(start + k))))).sort((a, b) => parseInt(a) - parseInt(b)); }
    explain(query: string, id: string, model: Model = 'BM25F', fallback = true, parameters: ScoringParameters = {}): Contribution[] {
        const k1 = parameters.k1 ?? K1, b = parameters.b ?? B;
        const weights = { ...ZONE_WEIGHT, ...parameters.zoneWeights };
        if (!Number.isFinite(k1) || k1 <= 0 || !Number.isFinite(b) || b < 0 || b > 1 || ZONES.some(z => !Number.isFinite(weights[z]) || weights[z] < 0))
            throw new Error('Parameter skor tidak valid');
        const doc = this.documents.get(id);
        if (!doc)
            throw new Error(`Unknown document: ${id}`);
        if (model === 'BM25F' && fallback && !doc.sections.amar.found)
            model = 'BM25';
        const terms = this.parseQuery(query).terms, qtf = new Map<string, number>();
        terms.forEach(t => qtf.set(t, (qtf.get(t) ?? 0) + 1));
        const qnorm = Math.sqrt([...qtf].reduce((sum, [t, c]) => sum + ((1 + Math.log(c)) * this.idf(t, 'TF-IDF')) ** 2, 0)) || 1;
        return [...qtf].map(([term, count]) => {
            const tf = this.postings.get(term)?.get(id)?.length ?? 0, df = this.postings.get(term)?.size ?? 0, idf = this.idf(term, model), lengthNormalization = 1 - b + b * (this.lengths.get(id) ?? 0) / this.averageLength;
            const zones = ZONES.map(zone => { const tf = this.zoneIndex[zone].get(term)?.get(id) ?? 0, lengthNormalization = 1 - b + b * (this.zoneLengths[zone].get(id) ?? 0) / this.zoneAverage[zone]; return { zone, tf, weight: weights[zone], lengthNormalization, weightedTf: tf ? weights[zone] * tf / lengthNormalization : 0 }; });
            const pseudo = zones.reduce((a, z) => a + z.weightedTf, 0);
            const contribution = model === 'BM25F' ? idf * pseudo / (k1 + pseudo) : model === 'BM25' ? (tf ? idf * tf * (k1 + 1) / (tf + k1 * lengthNormalization) : 0) : model === 'TF-IDF' ? (tf ? (1 + Math.log(count)) * idf * (1 + Math.log(tf)) * idf / (qnorm * this.norms.get(id)!) : 0) : tf ? 1 : 0;
            return { term, tf, df, idf, lengthNormalization, contribution, zones };
        });
    }
    /** Evaluation disables fallback to reproduce the notebook's BM25F exactly. */
    rank(query: string, model: Model = 'BM25F', fallback = false, parameters: ScoringParameters = {}): {
        id: string;
        score: number;
    }[] {
        if (model === 'Boolean')
            return this.boolean(query).map(id => ({ id, score: 1 }));
        const parsed = this.parseQuery(query), required = parsed.phrases.length || parsed.excluded.size ? new Set(this.boolean(query)) : null;
        const candidates = new Set(parsed.terms.flatMap(t => [...(this.postings.get(t)?.keys() ?? [])]));
        return [...candidates].filter(id => !required || required.has(id)).map(id => ({ id, score: this.explain(query, id, model, fallback, parameters).reduce((sum, c) => sum + c.contribution, 0) })).sort((a, b) => b.score - a.score || parseInt(a.id) - parseInt(b.id));
    }
    search(query: string, options: SearchOptions = {}): SearchResult[] {
        const model = options.model ?? 'BM25F', terms = new Set(this.parseQuery(query).terms);
        return this.rank(query, model, true, options).filter(({ id }) => Object.entries(options.filters ?? {}).every(([key, value]) => String(this.documents.get(id)!.attributes[key] ?? '').toLowerCase().includes(value.toLowerCase()))).slice(0, options.k ?? 10).map(({ id, score }) => {
            const doc = this.documents.get(id)!;
            const matches: Match[] = doc.tokens.filter(t => terms.has(this.options.stemming ? stem(t.normalized) : t.normalized)).map(t => ({ term: this.options.stemming ? stem(t.normalized) : t.normalized, normalized: t.normalized, start: t.start, end: t.end, rectangles: t.sources }));
            return { id, caseNumber: id, score, model: model === 'BM25F' && !doc.sections.amar.found ? 'BM25' : model, passage: this.passage(doc, matches), matches, rectangles: matches.flatMap(m => m.rectangles) };
        });
    }
    private passage(doc: ProcessedDocument, matches: Match[]): Passage {
        let best = 0, bestWeight = -1;
        let right = 0, sum = 0;
        for (let left = 0; left < matches.length; left++) {
            while (right < matches.length && matches[right].start - matches[left].start < 300) {
                sum += this.idf(matches[right].term);
                right++;
            }
            if (sum > bestWeight) {
                bestWeight = sum;
                best = left;
            }
            sum -= this.idf(matches[left].term);
        }
        let start = Math.max(0, (matches[best]?.start ?? 0) - 65), end = Math.min(doc.text.length, start + 380);
        while (start > 0 && /\w/.test(doc.text[start - 1]))
            start--;
        while (end < doc.text.length && /\w/.test(doc.text[end]))
            end++;
        return { text: doc.text.slice(start, end), start, end, page: matches[best]?.rectangles[0]?.page ?? 1, highlights: matches.filter(m => m.start >= start && m.end <= end).map(m => ({ start: m.start - start, end: m.end - start, term: m.term })) };
    }
    statistics(): IndexStatistics {
        let postings = 0, positions = 0, rawBytes = 0, gapVariableBytes = 0;
        const vb = (n: number) => { let bytes = 1; while (n >= 128) {
            n = Math.floor(n / 128);
            bytes++;
        } return bytes; };
        const ids = [...this.documents.keys()].sort((a, b) => parseInt(a) - parseInt(b)), ordinal = new Map(ids.map((id, i) => [id, i + 1]));
        const zipf = [...this.postings].map(([term, p]) => { let frequency = 0, prevDoc = 0; for (const [id, list] of [...p].sort((a, b) => ordinal.get(a[0])! - ordinal.get(b[0])!)) {
            postings++;
            positions += list.length;
            frequency += list.length;
            rawBytes += 8 + list.length * 4;
            const doc = ordinal.get(id)!;
            gapVariableBytes += vb(doc - prevDoc) + vb(list.length);
            prevDoc = doc;
            let prev = 0;
            for (const pos of list) {
                gapVariableBytes += vb(pos - prev);
                prev = pos;
            }
        } return { term, frequency, rank: 0 }; }).sort((a, b) => b.frequency - a.frequency || a.term.localeCompare(b.term));
        zipf.forEach((v, i) => v.rank = i + 1);
        const lengths = [...this.lengths.values()];
        return { vocabularySize: this.postings.size, postings, positions, docLength: { min: Math.min(...lengths, Infinity), max: Math.max(...lengths, 0), avg: this.averageLength }, zipf, rawBytes, gapVariableBytes };
    }
}
