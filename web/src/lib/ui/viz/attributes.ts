import type { ProcessedDocument, SectionName } from '../../pipeline/types'
import { cases } from '../../data'
const fields: { key: string; zone: SectionName; pattern: RegExp; metadata?: string }[] = [
  { key: 'No Putusan', zone: 'kepala', pattern: /Nomor\s*:?\s*\d+\s*\/\s*Pid.{0,50}/i },
  { key: 'Lembaga Peradilan', zone: 'kepala', pattern: /Pengadilan\s+Negeri\s+\w+/i },
  { key: 'Barang Bukti', zone: 'amar', pattern: /barang\s+bukti.{0,240}/i },
  { key: 'Amar Putusan', zone: 'amar', pattern: /Menyatakan.{0,300}/i },
  { key: 'Nama Terdakwa', zone: 'kepala', pattern: /Nama(?:\s+lengkap|\s+Terdakwa)?\s*:.{0,140}/i },
  { key: 'Pasal Dakwaan', zone: 'dakwaan', pattern: /Pasal\s+\d{3}.{0,110}/i },
  { key: 'Tuntutan Pidana Penjara (bulan)', zone: 'tuntutan', pattern: /pidana\s+pena?jara.{0,200}/i },
  { key: 'Vonis Pidana Penjara (bulan)', zone: 'amar', pattern: /pidana\s+pena?jara.{0,200}/i, metadata: 'Pidana Penjara (bulan)' },
  { key: 'Vonis Denda (Rp)', zone: 'amar', pattern: /denda.{0,210}/i, metadata: 'Denda (Rp)' },
  { key: 'Jenis Narkotika', zone: 'amar', pattern: /(?:shabu|sabu|ganja|metamfetamina|tembakau|ekstasi).{0,100}/i },
  { key: 'Hakim Ketua', zone: 'penutup', pattern: /oleh.{0,160}Hakim\s+Ketua/i },
  { key: 'Tanggal Musyawarah', zone: 'penutup', pattern: /(?:permusyawaratan|musyawarah).{0,150}/i },
  { key: 'Tanggal Dibacakan', zone: 'penutup', pattern: /(?:diucapkan|dibacakan).{0,150}/i },
]
const canonical = (value: unknown) => String(value ?? '').toLowerCase().replace(/\s*([./])\s*/g, '$1').replace(/\s+/g, ' ').trim()
export function attributeRows(doc: ProcessedDocument) {
  const metadata = cases.find(c => parseInt(c['No Putusan']) === parseInt(doc.id)) as unknown as Record<string, unknown> | undefined
  return fields.map(field => {
    const value = doc.attributes[field.key], reference = metadata?.[field.metadata ?? field.key]
    let zone = field.zone
    if (field.key === 'Pasal Dakwaan' && !doc.sections.dakwaan.text) zone = 'pertimbangan'
    const text = doc.sections[zone].text
    const exact = typeof value === 'string' && value.length > 3 ? text.indexOf(value) : -1
    const match = field.pattern.exec(text)
    const start = exact >= 0 ? exact : match?.index ?? -1
    const length = exact >= 0 ? Math.min(String(value).length, 300) : match?.[0].length ?? 0
    return { ...field, zone, value, reference, equal: canonical(value) === canonical(reference), before: start >= 0 ? text.slice(Math.max(0,start-45),start) : '', source: start >= 0 ? text.slice(start,start+length) : '', after: start >= 0 ? text.slice(start+length,start+length+50) : '', offset: start >= 0 ? doc.sections[zone].start+start : null }
  })
}
