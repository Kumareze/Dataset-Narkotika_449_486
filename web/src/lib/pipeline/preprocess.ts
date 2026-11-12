import { Stemmer } from 'sastrawijs';
import stopwordList from './stopwords.json';
import { mapped, replaceMapped, type MappedText } from './mapping';
import type { PipelineOptions, TokenStages } from './types';
export const LEGAL_KEEP = new Set('bukan tanpa tidak belum para lebih kurang bersama'.split(' '));
export const PROTECTED = new Set('terdakwa perantara penuntut direktori golongan penyidik penyalahguna narkotika psikotropika metamfetamina tembakau sintetis ekstasi ganja sabu'.split(' '));
export const STOPWORDS = new Set([...stopwordList.filter(w => !LEGAL_KEEP.has(w)), ...'menimbang mengingat memperhatikan bahwa tersebut yaitu yakni pid sus bks pn sdr saudara als alias bin binti alm almarhum halaman hal dkk'.split(' ')]);
const stemmer = new Stemmer();
const cache = new Map<string, string>();
export function rawStem(term: string) { return stemmer.stem(term); }
export function stem(term: string): string {
    if (term.includes('_') || /^\d+$/.test(term) || PROTECTED.has(term))
        return term;
    if (!cache.has(term))
        cache.set(term, ['berisikan', 'berisi'].includes(term) ? 'isi' : rawStem(term));
    return cache.get(term)!;
}
const RULES: [
    RegExp,
    string
][] = [
    [/\bshabu(?:[\s-]shabu)?\b|\bsabu[\s-]sabu\b/g, 'sabu'],
    [/\bmetafetamina?\b|\bmetamfetamin\b|\bmethamphetamine\b/g, 'metamfetamina'],
    [/\bextasi\b|\bekstasy\b|\bextacy\b|\bectasy\b/g, 'ekstasi'],
    [/\bpemufakatan\b/g, 'permufakatan'], [/\bhand\s*phone\b|\bhp\b/g, 'handphone'],
];
export function normalizedMap(text: string): MappedText {
    let value = mapped(text.toLowerCase());
    for (const [pattern, replacement] of RULES)
        value = replaceMapped(value, pattern, () => replacement);
    return replaceMapped(value, /\bgolongan\s+(iii|ii|iv|i|[1-4])\b/g, m => 'golongan_' + ({ '1': 'i', '2': 'ii', '3': 'iii', '4': 'iv' }[m[1]] ?? m[1]));
}
export const TOKEN = /[a-z]+(?:_[a-z]+)?|(?<![\d.,])\d{1,4}(?![\d.,])/g;
export function keep(term: string) { return !STOPWORDS.has(term) && (term.length > 1 || /^\d+$/.test(term)); }
export function normalize(text: string) { return normalizedMap(text).text; }
export function preprocess(text: string, options: PipelineOptions = {}): string[] {
    const tokens = normalize(text).match(TOKEN) ?? [];
    return tokens.filter(t => options.stopwords === false || keep(t)).map(t => options.stemming ? stem(t) : t);
}
export function tokenStages(text: string): TokenStages {
    const normalized = normalize(text), tokens = normalized.match(TOKEN) ?? [], afterStopwords = tokens.filter(keep);
    return { lowercase: text.toLowerCase(), normalized, tokens, afterStopwords, afterStemming: afterStopwords.map(stem) };
}
