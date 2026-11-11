# Panduan Membuat Relay

Situs Direktori Putusan memblokir IP Google Colab: crawler dari Colab mendapat HTTP 403 (Access Denied), sedangkan permintaan yang sama dari jaringan rumah berhasil. Relay adalah server kecil di jaringan yang tidak diblokir. Notebook mengirim path yang ingin diambil ke relay, lalu relay meneruskan permintaan ke situs dan mengembalikan HTML/PDF aslinya.

```text
Colab ──HTTPS + token──► relay (PC/VPS sendiri) ──curl_cffi Chrome──► putusan3.mahkamahagung.go.id
```

Jeda, `robots.txt`, dan retry tetap diatur oleh notebook. Relay hanya mengganti jalur jaringan.

## 1. Pastikan Jaringan Relay Tidak Diblokir

Jalankan di mesin yang akan menjadi relay:

```bash
pip install "curl_cffi>=0.17,<0.18" flask waitress
python -c "from curl_cffi import requests; r = requests.get('https://putusan3.mahkamahagung.go.id/robots.txt', impersonate='chrome'); print(r.status_code)"
```

Lanjutkan hanya jika hasilnya `200`. Jika `403`, IP mesin ini juga diblokir dan relay di sana tidak akan membantu.

## 2. Kode Relay

Simpan sebagai `relay.py`:

```python
import hmac, os, re, threading, time

from curl_cffi import requests
from flask import Flask, Response, request

ORIGIN = "https://putusan3.mahkamahagung.go.id"
TOKEN = os.environ["RELAY_TOKEN"]
MIN_INTERVAL = 3.0  # jeda minimum antarpermintaan ke situs, detik
ALLOWED = [re.compile(p) for p in (
    r"/robots\.txt",
    r"/direktori/index/pengadilan/pn-bekasi/kategori/narkotika-dan-psikotropika-1"
    r"/tahunjenis/regis/tahun/2025(/page/\d{1,3})?\.html",
    r"/direktori/putusan/[0-9a-z]+\.html",
    r"/direktori/download_file/[0-9a-f]+/pdf/[0-9a-z]+",
)]
PASS_HEADERS = ("Content-Type", "Content-Disposition", "Retry-After", "Location", "cf-mitigated")

app = Flask(__name__)
session = requests.Session(impersonate="chrome")
lock = threading.Lock()
last_request = 0.0


def relay_error(status, code):
    return Response(code, status=status, headers={"X-Relay-Error": code}, mimetype="text/plain")


@app.get("/health")
def health():
    return "ok"


@app.post("/v1/fetch")
def fetch():
    global last_request
    if not hmac.compare_digest(request.headers.get("Authorization", ""), "Bearer " + TOKEN):
        return relay_error(401, "unauthorized")
    path = (request.get_json(silent=True) or {}).get("path")
    if not isinstance(path, str) or not any(p.fullmatch(path) for p in ALLOWED):
        return relay_error(403, "path_not_allowed")
    with lock:  # satu permintaan ke situs pada satu waktu
        time.sleep(max(0.0, last_request + MIN_INTERVAL - time.monotonic()))
        try:
            r = session.get(ORIGIN + path, allow_redirects=False, timeout=60)
        except requests.RequestsError:
            return relay_error(502, "upstream_unreachable")
        finally:
            last_request = time.monotonic()
    headers = {h: r.headers[h] for h in PASS_HEADERS if h in r.headers}
    headers["X-Relay-Upstream-Status"] = str(r.status_code)
    return Response(r.content, status=r.status_code, headers=headers)
```

Hal yang dijaga kode ini:

- Hanya path milik target tugas yang boleh diambil, sehingga relay tidak bisa dipakai sebagai proxy umum.
- Token dicek sebelum ada permintaan ke situs.
- Redirect tidak diikuti; notebook yang memeriksa tujuannya.
- `X-Relay-Upstream-Status` memberi tahu notebook bahwa status berasal dari situs. Kesalahan relay sendiri ditandai `X-Relay-Error`.

## 3. Menjalankan Relay

Buat token acak, lalu jalankan server di port lokal:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
RELAY_TOKEN=<token> waitress-serve --listen=127.0.0.1:8080 relay:app
```

Di PowerShell, ganti baris kedua dengan `$env:RELAY_TOKEN="<token>"; waitress-serve --listen=127.0.0.1:8080 relay:app`.

Notebook hanya menerima URL HTTPS. Pilih salah satu cara membuka relay ke internet:

- **Tanpa domain (PC rumah):** pasang `cloudflared`, lalu jalankan `cloudflared tunnel --url http://127.0.0.1:8080`. Salin URL `https://....trycloudflare.com` yang muncul. URL berubah setiap kali tunnel dijalankan ulang.
- **VPS dengan domain:** pakai Caddy sebagai reverse proxy; HTTPS dibuat otomatis.

  ```text
  relay.domainanda.com {
      reverse_proxy 127.0.0.1:8080
  }
  ```

## 4. Uji Dari Colab

```python
import requests
from getpass import getpass

base, token = getpass("URL relay: ").strip(), getpass("Token: ").strip()
r = requests.post(base.rstrip("/") + "/v1/fetch", json={"path": "/robots.txt"},
                  headers={"Authorization": f"Bearer {token}"}, timeout=120)
print(r.status_code, r.headers.get("X-Relay-Upstream-Status"), r.headers.get("X-Relay-Error"))
print(r.text[:200])
```

Hasil yang benar: `200 200 None` diikuti isi `robots.txt`. Setelah itu, di sel konfigurasi notebook ubah `USE_RELAY = True`, jalankan **Run all**, lalu masukkan URL dan token saat diminta.

| Gejala | Penyebab |
|---|---|
| `401 ... unauthorized` | Token salah |
| `403 ... path_not_allowed` | Path di luar daftar `ALLOWED` |
| `403 403 None` | Situs juga memblokir IP relay |
| `429 429 None` | Rate limit situs; notebook menunggu sesuai `Retry-After` |

Jangan simpan URL atau token relay di notebook atau repositori. Matikan relay dan tunnel setelah crawl selesai.
