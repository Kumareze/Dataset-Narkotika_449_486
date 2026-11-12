import datasetZipUrl from '../../../Dataset/Narkotika.zip?url'
import caseData from '../data/cases.json'
import crawlData from '../data/crawl-log.json'
export interface CaseRecord {
  "No": number
  "No Putusan": string
  "Lembaga Peradilan": string
  "Barang Bukti": string
  "Amar Putusan": string
  "Nomor Perkara": number
  "Tahun": number
  "Jenis Narkotika": string
  "Pidana Penjara (bulan)": null | number
  "Denda (Rp)": number
  "Subsider Denda (bulan)": number
  "Rehabilitasi": string
  "Jumlah Terdakwa": number
  "Tanggal Musyawarah": string
  "Tanggal Dibacakan": string
  "File PDF": string
  "Tanggal Register": string
  "Tingkat Proses": string
  "Status Hukum": string
  "URL Putusan": string
  "URL PDF": string
}
export interface CasesData { source: string; cases: CaseRecord[] }
export type RequestKind = 'robots' | 'listing' | 'detail' | 'pdf'
export interface CrawlRequest { t: number; kind: RequestKind; url: string; status: number; bytes: number }
export interface RateLimitedExample { time: string; kind: RequestKind; url: string; status: number; next_request_after_s: number; next_status: number }
export interface CrawlLog { source: string; verified_run: { date: string; start_utc: string; requests: CrawlRequest[] }; rate_limited_examples: RateLimitedExample[] }
export const zipUrl = datasetZipUrl
export const cases: CaseRecord[] = (caseData satisfies CasesData).cases
export const crawlLog = crawlData as CrawlLog
