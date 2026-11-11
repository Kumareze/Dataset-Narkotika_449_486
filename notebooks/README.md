# Notebook Soal 3 dan 4

[UTS_IR_Narkotika_449_486.ipynb](UTS_IR_Narkotika_449_486.ipynb) mengerjakan dua soal berurutan atas 50 putusan dalam dataset ini:

- **Soal 3:** meng-crawl putusan dari Direktori Putusan, menyimpan PDF dan TXT, lalu mengekstrak atribut ke `hasil_ekstraksi_putusan.csv`.
- **Soal 4:** membangun index posisional dari `Narkotika.zip`, lalu membandingkan Boolean, TF-IDF, BM25, dan BM25F dengan qrels dari `Overview.xlsx`.

Dataset dipakai sebagai cadangan PDF bila crawl gagal, korpus Soal 4, dan ground truth evaluasi.

## Menjalankan

Di Colab: unggah notebook, lalu pilih **Runtime > Run all**. Dataset diunduh dari repositori ini; jika gagal, notebook meminta unggahan manual. Sel terakhir mengunduh ZIP berisi semua keluaran.

Di lokal (Python 3.10+ dan [uv](https://docs.astral.sh/uv/)), dari folder hasil clone:

```bash
uv sync --frozen
uv run jupyter lab
```

Notebook membaca `Dataset/` dan `Overview/` dari clone tanpa unduhan. Keluaran ditulis ke `outputs/` dan tidak disimpan di repositori.

## Pengaturan Crawler

| Variabel | Bawaan | Fungsi |
|---|---|---|
| `ALLOW_DATASET_FALLBACK` | `True` | PDF yang gagal diunduh diambil dari `Narkotika.zip` dan dicatat sumbernya di `crawl_log.csv`. `False` menghentikan notebook bila crawl gagal. |
| `USE_RELAY` | `False` | Crawler mengakses situs secara langsung. `True` mengirim permintaan lewat relay; URL dan token diminta melalui input tersembunyi. |

## Relay

Situs Direktori Putusan memblokir IP Google Colab, sehingga crawl dari Colab mendapat HTTP 403. Crawl yang sama dari jaringan rumah berhasil. Relay mengatasi ini dengan merutekan permintaan crawler melalui server milik sendiri yang IP-nya tidak diblokir:

```text
Colab ──► relay (PC/VPS sendiri) ──► putusan3.mahkamahagung.go.id
```

Notebook tetap mengatur jeda, `robots.txt`, dan retry; relay hanya meneruskan permintaan dan mengembalikan HTML/PDF asli. Cara membuat relay ada di [docs/relay.md](../docs/relay.md).

## Hasil Lokal

| Bagian | Hasil |
|---|---|
| Crawl | 50 PDF, 1.758 halaman |
| Ekstraksi | Amar 0,998; barang bukti 0,945 |
| TF-IDF | MAP 0,624 |
| BM25 | MAP 0,700 |
| BM25F | MAP 0,722; nDCG@10 0,769 |

Putusan 392 adalah PDF pindai. Tanpa Tesseract di lokal teksnya kosong; Colab menjalankan OCR sehingga hasil dapat sedikit berbeda.
