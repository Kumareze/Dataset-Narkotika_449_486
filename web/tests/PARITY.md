# Parity Results

Measured 2026-11-12 on the final pipeline. All assertions passed using the
installed esbuild CLI and a separately invoked `.venv/Scripts/python.exe -I`
oracle. `npm run test:parity` was attempted, but this sandbox rejects Node child
processes with `spawn EPERM` before tsx can execute the test. The CLI route runs
the same test source; its oracle payload is SHA-256 checked.

- Documents: 50; pages: 1,758; text documents: 49; needs OCR: 392 only.
- Amar found: 49/49 text documents.
- Amar similarity: median 1.000000; minimum 0.977039.
- Highlight provenance: 79,644 matches and 80,603 rectangles passed, including
  compounds, phrases, exclusions, item substring checks, and boilerplate exclusion.
- Exact PySastrawi stopword-list equality: passed.
- SastrawiJs 1.1.0 raw stem agreement: 5,185/5,279 = 98.219360%.
- Phrase/exclusion and Jenis Narkotika filter checks: passed.
- `npm run check`: passed, zero errors and warnings.
- Browser OCR lifecycle was reviewed, but was not executed in this task.
  `/tests/worker.smoke.html?ocr=1` checks initial 49-document readiness, search
  during OCR, page progress, OCR search boxes, and cached OCR reuse.
- Opt-in OCR parity passed: amar similarity **0.9422066549912435**, threshold
  unchanged at **0.8**; OCR took **59.26 s** for 22 pages at scale 3.
- Raw and cleaned detector input both contained `MENGADILLI: 1. Menyatakan`.
  Closing text was correctly recognized as `Demikianlah diputuskan`.
  An OCR-only heading match accepts the extra L before the opening verdict
  clause. Footer/watermark noise remains in the OCR passage, explaining most
  of the residual similarity loss. No case-name special handling was added.
- OCR search and whole-word highlight rectangle assertions passed.
- Main production JS: 405.91 kB (90.44 kB gzip); pdf.js stays in a lazy chunk.
- Both parity modes passed via a temp-directory esbuild bundle and an isolated,
  SHA-256-checked Python oracle. Direct npm invocations encountered sandbox
  `spawn EPERM` at tsx or the Python subprocess. No generated test artifacts
  were written into the repository; the two requested leftovers were removed.

| Model | Stemming | P@5 | P@10 | R@10 | MAP | nDCG@10 | MRR |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BM25 | No | .640000 | .560000 | .723918 | .711405 | .748890 | .756111 |
| BM25F | No | .640000 | .600000 | .744913 | .733269 | .781867 | .764444 |
| TF-IDF | No | .540000 | .530000 | .575108 | .636284 | .664948 | .738286 |
| Boolean | No | .400000 | .420000 | .495563 | .518099 | .503872 | .503929 |
| BM25 | Yes | .600000 | .540000 | .598918 | .700204 | .703241 | .748377 |
| BM25F | Yes | .640000 | .590000 | .741342 | .721723 | .769232 | .748611 |
| TF-IDF | Yes | .540000 | .520000 | .550108 | .625129 | .646066 | .735441 |
| Boolean | Yes | .400000 | .400000 | .445563 | .510759 | .480836 | .503929 |

The final default test took 27.90 s (24.18 s processing). The OCR-enabled test
with the separately prepared oracle took 91.76 s, including 59.26 s OCR.
These are observed Node timings, not browser performance thresholds.

Review the stemmer's dictionary license and old Babel dependency audit findings,
and proportional character-width rectangles before UI release. Details and
reproduction commands are in `../src/lib/pipeline/README.md`.
