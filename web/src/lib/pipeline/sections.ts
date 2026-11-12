import type { Sections, Section } from './types';
const AMAR = /\bMENGADILI\b\s*[:;.]?|\bMengadili\b(?:\s*[:;.]|(?=\s+(?:\d{1,2}\s*[.)]\s*)?Menyatakan))/g;
// OCR can duplicate the narrow L stroke. Require the opening verdict clause
// so a similar word in the court's reasoning cannot become the amar boundary.
const OCR_AMAR = /\bM\s*E\s*N\s*G\s*A\s*D\s*I\s*L(?:\s*L)?\s*I\b\s*[:;.]?(?=\s+(?:\d{1,2}\s*[.)]\s*)?Menyatakan\b)/gi;
const CLOSING = /Demikian(?:lah)?\s+diputus(?:kan)?\b/gi;
const DEMAND = /Setelah\s+mendengar\s+(?:pembacaan\s+)?(?:surat\s+)?tuntutan\s+pidana/i;
const CHARGE = /(?:didakwa|di\s+dakwa|diajukan\s+ke\s+persidangan)[^.]{0,120}?dakwaan[^.]{0,80}?(?:sebagai\s+berikut|sbb\.?|berbunyi|yaitu)\s*:?/i;
const AFTER_DEMAND = /Setelah\s+mendengar\s+(?:permohonan|pembelaan|nota\s+pembelaan|tanggapan|replik)|Menimbang,?\s+bahwa\s+Terdakwa\s+diajukan/i;
const AFTER_CHARGE = /Menimbang,?\s+bahwa\s+(?:terhadap|atas)\s+(?:surat\s+)?dakwaan|Menimbang,?\s+bahwa\s+untuk\s+membuktikan|Menimbang,?\s+bahwa\s+di\s+persidangan|Menimbang,?\s+bahwa\s+Penuntut\s+Umum\s+(?:telah\s+)?mengajukan/i;
export function sections(text: string, ocr = false): Sections {
    const closing = [...text.matchAll(CLOSING)].at(-1), end = closing?.index ?? text.length;
    const heads = [...text.slice(0, end).matchAll(AMAR), ...(ocr ? text.slice(0, end).matchAll(OCR_AMAR) : [])];
    const head = heads.sort((a, b) => a.index! - b.index!).at(-1), amarStart = head ? head.index! + head[0].length : end;
    const t = DEMAND.exec(text), d = CHARGE.exec(text);
    const after = (regex: RegExp, m: RegExpExecArray | null) => { if (!m)
        return null; const offset = m.index + m[0].length, hit = regex.exec(text.slice(offset)); if (hit)
        hit.index += offset; return hit; };
    const te = after(AFTER_DEMAND, t), de = after(AFTER_CHARGE, d), first = Math.min(...[t?.index, d?.index].filter((x): x is number => x !== undefined), amarStart);
    const section = (start: number, end: number, trigger = '', found = true): Section => {
        while (start < end && /[ :;]/.test(text[start]))
            start++;
        while (end > start && /[ :;]/.test(text[end - 1]))
            end--;
        return { start, end, text: text.slice(start, end), trigger, found };
    };
    return { kepala: section(0, first), tuntutan: t ? section(t.index + t[0].length, te?.index ?? amarStart, t[0]) : section(0, 0, '', false), dakwaan: d ? section(d.index + d[0].length, de?.index ?? amarStart, d[0]) : section(0, 0, '', false), pertimbangan: section(de ? de.index + de[0].length : first, amarStart, de?.[0] ?? ''), amar: section(amarStart, end, head?.[0] ?? '', !!head), penutup: section(end, text.length, closing?.[0] ?? '', !!closing) };
}
