/** Text transformations carry ranges in the original string, including deletions
 * and many-to-one replacements. This map is transient; tokens persist sources. */
export interface MappedText {
    text: string;
    starts: number[];
    ends: number[];
}
export function mapped(text: string): MappedText {
    return { text, starts: Array.from({ length: text.length }, (_, i) => i), ends: Array.from({ length: text.length }, (_, i) => i + 1) };
}
export function replaceMapped(input: MappedText, pattern: RegExp, replacement: (m: RegExpMatchArray) => string): MappedText {
    const out: MappedText = { text: '', starts: [], ends: [] };
    let cursor = 0;
    const copy = (a: number, b: number) => { out.text += input.text.slice(a, b); for (let i = a; i < b; i++) {
        out.starts.push(input.starts[i]);
        out.ends.push(input.ends[i]);
    } };
    for (const m of input.text.matchAll(pattern)) {
        const a = m.index!, b = a + m[0].length;
        copy(cursor, a);
        const value = replacement(m);
        out.text += value;
        if (value === m[0]) {
            for (let i = a; i < b; i++) {
                out.starts.push(input.starts[i]);
                out.ends.push(input.ends[i]);
            }
        }
        else
            for (let i = 0; i < value.length; i++) {
                out.starts.push(input.starts[a]);
                out.ends.push(input.ends[b - 1]);
            }
        cursor = b;
    }
    copy(cursor, input.text.length);
    return out;
}
