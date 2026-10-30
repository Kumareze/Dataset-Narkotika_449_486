# Dataset-Narkotika_449_486

## Dataset Putusan Pidana Khusus Narkotika — PN Bekasi

Repositori ini berisi dataset putusan perkara **Narkotika dan Psikotropika** dari **Pengadilan Negeri Bekasi** yang diambil dari portal resmi Direktori Putusan Mahkamah Agung Republik Indonesia.

> Dataset ini dibuat untuk memenuhi Soal 2 UTS Temu Kembali Informasi, Semester Ganjil 2026/2027.

## Anggota Kelompok

| No | Nama | NIM |
|---:|---|---|
| 1 | Widya Kusuma | 202310370311449 |
| 2 | Farhan Kurnia Febriansyah | 202310370311486 |

## Cakupan Dataset

- **Pengadilan:** Pengadilan Negeri Bekasi
- **Kategori:** Pidana Khusus — Narkotika dan Psikotropika
- **Periode:** 2023–2025 sesuai ketentuan tugas; data yang berhasil dikumpulkan pada batch ini tercatat pada putusan tahun 2025.
- **Jumlah:** 50 putusan
- **Sumber:** [Direktori Putusan Mahkamah Agung](https://putusan3.mahkamahagung.go.id/)
- **Tanggal akses:** 30 Oktober 2026

## Struktur Repositori

```text
.
├── Dataset/
│   └── Narkotika.zip          # Arsip 50 PDF putusan
├── Overview/
│   └── Overview.xlsx          # Ringkasan metadata dataset
└── README.md
```

## Isi `Overview.xlsx`

| Kolom | Keterangan |
|---|---|
| `No` | Nomor urut data |
| `No Putusan` | Nomor putusan pengadilan |
| `Lembaga Peradilan` | Pengadilan penerbit putusan |
| `Barang Bukti` | Ringkasan barang bukti yang tercatat |
| `Amar Putusan` | Catatan amar putusan |

## Reproduksibilitas

Script akuisisi yang digunakan adalah `scrape_pn_bekasi_santai.py`. Script menjalankan akses secara bertahap dengan jeda, menangani verifikasi manual apabila muncul, menyimpan cache, dan mengunduh PDF satu per satu.

```bash
uv run --with pandas --with openpyxl --with playwright python scrape_pn_bekasi_santai.py
```

Kebutuhan utama:

- Python
- Playwright
- pandas
- openpyxl
- Microsoft Edge/Chromium

## Catatan Etika dan Batasan

1. Data hanya digunakan untuk keperluan akademik.
2. Akses dilakukan secara perlahan dan tidak dimaksudkan untuk membebani server.
3. Verifikasi Cloudflare, apabila muncul, diselesaikan secara manual oleh pengguna.
4. Metadata `Barang Bukti` merupakan ekstraksi berbasis pola halaman dan perlu dibandingkan kembali dengan PDF sumber sebelum digunakan sebagai ground truth penelitian.
5. Pembaca perlu memeriksa status hukum dan keutuhan setiap dokumen langsung pada sumber resmi.

## Lisensi dan Atribusi

Dokumen putusan tetap merupakan konten dari sumber resmi Mahkamah Agung Republik Indonesia. Repositori ini tidak mengklaim kepemilikan atas dokumen tersebut. Gunakan sesuai ketentuan sumber dan kebutuhan akademik.
