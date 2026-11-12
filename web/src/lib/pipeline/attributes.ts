import type { CaseMetadata, Sections } from './types';
export const JENIS: [
    string,
    RegExp
][] = [['Sabu (metamfetamina)', /\b(?:sabu|shabu|metamfetamina?|metafetamina)\b/i], ['Ganja', /\bganja\b/i], ['Tembakau sintetis', /tembakau\s+sintetis|kanabinoid\s+sintetis|\bmdmb\b|butinaca/i], ['Ekstasi/MDMA', /ekst?asi|\bmdma\b|\btablet\b/i]];
export function jenisNarkotika(text: string) { return JENIS.filter(([, r]) => r.test(text)).map(([label]) => label).join(', ') || '-'; }
export function pasal(text: string) { return [...new Set([...text.matchAll(/Pasal\s+(\d{3})\s*(?:ayat\s*\(\s*(\d)\s*\))?/gi)].filter(m => +m[1] >= 111 && +m[1] <= 148).map(m => `Pasal ${m[1]}${m[2] ? ` ayat (${m[2]})` : ''}`))]; }
export function pidana(text: string): (number | null)[] {
    const pj = /pidana\s+pena?jara[^;]{0,60}?selama\W*(\d+)\s*\(\s*[a-z ]+\)\W*tahun(?:\W*(?:dan|serta)?\W*(\d+)\s*\(\s*[a-z ]+\)\W*bulan)?/i.exec(text);
    const num = /denda[^;]{0,140}?(?<![\d.])(\d{1,3}(?:\.\d{3}){2,})(?![\d.]|,\d{3})/i.exec(text);
    const spelled = /denda[^;]{0,200}?\(\s*(satu|dua|tiga|empat|lima)\s+(milyar|miliar|juta)/i.exec(text);
    const sb = /(?:tidak\s+(?:bisa\s+|dapat\s+)?(?:di\s?bayar|terbayar)|subsid(?:i)?air)[^;]*?(\d+)\W{0,3}\(\s*[a-z]+(?:\s[a-z]+)*\s*\.?\s*\)\s*(bulan|tahun)/i.exec(text);
    const angka: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5 };
    return [pj ? +pj[1] * 12 + +(pj[2] || 0) : null, num ? +num[1].replaceAll('.', '') : spelled ? angka[spelled[1].toLowerCase()] * (spelled[2].toLowerCase() === 'juta' ? 1e6 : 1e9) : null, sb ? +sb[1] * (sb[2].toLowerCase() === 'tahun' ? 12 : 1) : null];
}
const DISPOSISI = /(?:seluruhnya\s+)?(?:Dirampas\s+untuk\s+(?:dimusnahkan|negara)|Dimusnahkan|Dikembalikan\s+kepada[^;.]*|Dipergunakan\s+dalam\s+(?:berkas\s+)?perkara[^;.]*|Digunakan\s+dalam\s+(?:berkas\s+)?perkara[^;.]*|(?:Tetap\s+)?Terlampir\s+dalam\s+berkas\s+perkara)/gi;
export function barangBukti(amar: string): [
    string,
    string[]
] {
    const m = /barang\s+bukti\s+(?:berupa|yaitu|sebagai\s+berikut)?\s*:?/i.exec(amar);
    if (!m)
        return ['', []];
    let zone = amar.slice(m.index + m[0].length);
    const end = /(?:\b\d{1,2}\s*[.)]\s*)?(?:Membebankan|Menghukum\s+(?:para\s+)?Terdakwa\s+(?:untuk\s+)?membayar|Menetapkan\s+(?:agar\s+)?(?:para\s+)?Terdakwa\s+membayar)/i.exec(zone);
    if (end)
        zone = zone.slice(0, end.index);
    const dispo = [...new Set([...zone.matchAll(DISPOSISI)].map(m => m[0].toLowerCase()))].map(s => s[0].toUpperCase() + s.slice(1));
    const parts = zone.replace(DISPOSISI, ';').split(/;|\s(?:\d{1,2}\)|-|•|[a-z]\))\s+|\s\d{1,2}\.\s+(?=(?:Kode\s|\d+\s*\())|(?<=\.)\s+(?=\d+\s*\(\s*[A-Za-z])/).map(p => p.replace(/^\W*(?:\d{1,2}\s*[.)]\s*)?/, '').replace(/^[ .,:-]+|[ .,:-]+$/g, '')).filter(p => p.length > 8 && !/^(?:dan|serta|berupa|masing-masing)$/i.test(p));
    return [parts.join(';\n') + (parts.length ? ';' : ''), dispo];
}
const IDENT: Record<string, string[]> = { nama: ['Nama lengkap', 'Nama Terdakwa III', 'Nama Terdakwa II', 'Nama Terdakwa I', 'Nama Terdakwa', 'Nama'], 'tempat lahir': ['Tempat lahir'], 'umur/tanggal lahir': ['Umur/Tanggal lahir', 'Umur/tgl. lahir', 'Umur/tgl lahir', 'Umur', 'Tanggal lahir'], 'jenis kelamin': ['Jenis kelamin'], kebangsaan: ['Kebangsaan/Kewarganegaraan', 'Kewarganegaraan/Kebangsaan', 'Kebangsaan', 'Kewarganegaraan'], 'tempat tinggal': ['Tempat tinggal', 'Alamat'], agama: ['Agama'], pekerjaan: ['Pekerjaan', 'Pekarjaan'], pendidikan: ['Pendidikan'] };
export function defendants(text: string) {
    const aliases = new Map(Object.entries(IDENT).flatMap(([key, values]) => values.map(v => [v.toLowerCase(), key] as const)));
    const pattern = [...aliases.keys()].sort((a, b) => b.length - a.length).map(k => k.replaceAll('.', '\\.').replaceAll(' ', '\\s*').replaceAll('/', '\\s*/\\s*')).join('|');
    const marks = [...text.matchAll(new RegExp('(?:\\b\\d{1,2}\\s*\\.\\s*)?\\b(' + pattern + ')\\s*:', 'gi'))];
    const out: Record<string, string>[] = [];
    let cur: Record<string, string> | undefined;
    for (let i = 0; i < marks.length; i++) {
        const m = marks[i], field = aliases.get(m[1].replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').toLowerCase());
        if (!field)
            continue;
        let value = text.slice(m.index! + m[0].length, marks[i + 1]?.index ?? Math.min(text.length, m.index! + m[0].length + 200)).split(/;|\b(?:Para\s+)?Terdakwa\b|Pengadilan\s+Negeri\s+tersebut/i)[0].trim().replace(/\s+\d{1,2}\s*\.$/, '').replace(/^[ ;,.\-]+|[ ;,.\-]+$/g, '');
        if (field === 'nama') {
            cur = { nama: value };
            out.push(cur);
        }
        else if (cur && !(field in cur))
            cur[field] = value.slice(0, 200);
    }
    return out.filter(d => d.nama);
}
export function formatAmar(text: string) { return text.replace(/["\s;]*(?:\b\d{1,2}\s*[.)]\s*)?(?<![a-z])((?:Menyatakan|Menjatuhkan|Menghukum|Menetapkan|Memerintahkan|Membebankan|Memulihkan|Membebaskan|Melepaskan)\b)/g, ';\n$1').replace(/^[;\n ]+/, '').replace(/;\s*;/g, ';').trim(); }
export function extractAttributes(text: string, s: Sections, pages: number): CaseMetadata {
    const people = defendants(s.kepala.text), [bb, dispo] = barangBukti(s.amar.text), [tp, td] = pidana(s.tuntutan.text), [vp, vd, vs] = pidana(s.amar.text);
    const numbers = [...text.matchAll(/Nomor\s*:?\s*(\d+)\s*\/\s*Pid\.?\s*\.?\s*Sus\s*\/\s*(\d{4})\s*\/\s*PN\.?\s*([A-Za-z]+)/g)].map(m => [m[1], `${m[1]}/Pid.Sus/${m[2]}/PN ${m[3]}`]);
    const same = numbers.filter(n => n[0] === numbers[0]?.[0]);
    const counts = new Map<string, number>();
    same.forEach(n => counts.set(n[1], (counts.get(n[1]) ?? 0) + 1));
    const nomor = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const join = (key: string) => people.map(p => p[key] ?? '').join('; ');
    const closing = s.penutup.text, g = (r: RegExp) => r.exec(closing)?.[1]?.replace(/^[ ,;]+|[ ,;]+$/g, '') ?? '';
    const musyawarah = g(/(?:permusyawaratan|musyawarah).{0,120}?tanggal\s+(\d{1,2}\s+\w+\s+\d{4})/i);
    const dibacakan = g(/(?:diucapkan|dibacakan).{0,80}?tanggal\s+(\d{1,2}\s+\w+\s+\d{4})/i) || (/(?:diucapkan|dibacakan).{0,80}?hari\s+(?:dan\s+tanggal\s+)?itu\s+juga/i.test(closing) ? musyawarah : '');
    const tindak = /melakukan\s+tindak\s+pidana\s*['"]?\s*(.+?)\s*['"]?\s*(?:sebagaimana|;|\.\s*\d\.|$)/i.exec(s.amar.text)?.[1] ?? '';
    return { 'No Putusan': nomor, 'Lembaga Peradilan': (/Pengadilan\s+Negeri\s+([A-Z][a-z]+(?:\s+(?!Kelas\b)[A-Z][a-z]+)?)/.exec(s.kepala.text || text)?.[1] ?? '').replace(/^(.+)$/, 'PN $1'), 'Barang Bukti': bb, 'Amar Putusan': formatAmar(s.amar.text), 'Nama Terdakwa': join('nama'), 'Jumlah Terdakwa': people.length, 'Tempat Lahir': join('tempat lahir'), 'Umur/Tanggal Lahir': join('umur/tanggal lahir'), 'Jenis Kelamin': join('jenis kelamin'), 'Kebangsaan': join('kebangsaan'), 'Agama': join('agama'), 'Pekerjaan': join('pekerjaan'), 'Pendidikan': join('pendidikan'), 'Pasal Dakwaan': (pasal(s.dakwaan.text).length ? pasal(s.dakwaan.text) : pasal(s.pertimbangan.text.slice(0, 20000))).join(', '), 'Pasal Tuntutan': pasal(s.tuntutan.text).join(', '), 'Tuntutan Pidana Penjara (bulan)': tp, 'Tuntutan Denda (Rp)': td, 'Vonis Pidana Penjara (bulan)': vp, 'Vonis Denda (Rp)': vd, 'Subsider Denda (bulan)': vs, 'Tindak Pidana Terbukti': tindak.split(/["']\s*\d{1,2}\s*\.|\s\d{1,2}\s*\.\s+(?=Menjatuhkan|Menghukum)/)[0].replace(/^[ "']+|[ "']+$/g, ''), 'Jenis Narkotika': jenisNarkotika(bb || s.amar.text), 'Status Barang Bukti': dispo.join('; '), 'Tanggal Musyawarah': musyawarah, 'Tanggal Dibacakan': dibacakan, 'Hakim Ketua': g(/oleh\s+(?:kami,?\s*)?(.{5,80}?),?\s*(?:selaku|sebagai)\s+Hakim\s+Ketua/i), 'Hakim Anggota': g(/Hakim\s+Ketua\s*(?:Majelis)?,?\s*(.{5,120}?),?\s*(?:masing[\s-]+masing\s+)?(?:selaku|sebagai)\s+Hakim[\s-]+(?:Hakim\s+)?Anggota/i), 'Panitera Pengganti': g(/dibantu\s+oleh\s+(.{5,80}?),?\s*(?:selaku\s+|sebagai\s+)?Panitera\s+Pengganti/i), 'Penuntut Umum': g(/dihadiri\s+(?:pula\s+)?oleh\s+(.{5,80}?),?\s*(?:selaku\s+|sebagai\s+)?Penuntut\s+Umum/i), 'Jumlah Halaman': pages };
}
