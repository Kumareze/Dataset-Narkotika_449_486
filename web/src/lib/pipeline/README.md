# Pipeline Integration

Entry points: `index.ts` exports the environment-neutral pipeline; `protocol.ts`
defines the request and response union. The browser worker is
`../../workers/pipeline.worker.ts`. Create it with Vite's static URL pattern:

```ts
const worker = new Worker(new URL('../../workers/pipeline.worker.ts', import.meta.url), { type: 'module' });
worker.postMessage({ id: 'load-1', type: 'load', zipUrl: '/Dataset/Narkotika.zip' });
worker.postMessage({ id: 'query-1', type: 'search', query: 'perantara jual beli sabu', options: { k: 10 } });
```

Adjust those relative URLs to the importing module and deployment base. Wait for
`ready` before searching. Request IDs are echoed on every response, including
progress and errors. `inspect` returns one full document; `preprocess` returns
all token stages for arbitrary text. `evaluate` accepts `BM25`, `BM25F`, `TF-IDF`,
or `Boolean` and an optional `stemming` flag. Search defaults to BM25F without
stemming, with per-document BM25 fallback when amar is absent. Evaluation uses
the notebook's pure BM25F without fallback. `explain` defaults to search behavior.

## Data Model

`ProcessedDocument.text` is cleaned, whitespace-flattened text. Section and token
ranges use half-open UTF-16 offsets into this string. Sections retain triggers,
found flags, and boundaries. Raw items retain their original strings, transforms,
page numbers, horizontal flags, and offsets in the original visual-order stream.
`removedLines` identifies discarded items and reasons. Raw items include rotated
watermarks for inspection, although they never enter the index.

A token retains its normalized term and one or more `SourceRange`s. Each range
identifies the raw item, original item character offsets, original substring,
and a rectangle in unrotated PDF user space. Convert its corners through the
pdf.js viewport before drawing. Widths are proportional character sub-boxes;
item-level pdf.js text extraction does not supply glyph advances. These are
traceable text bounds, not pixel-precise glyph outlines. A compound normalized
term may have several rectangles, even across pages. Removed boilerplate items
are excluded from source resolution. Stemming changes the indexed term while
retaining the same original source ranges.

`CorpusIndex` stores positional postings and zone term frequencies, document and
zone lengths, and cosine norms. Construct a separate index with `{stemming:true}`
for the stemming variant. Statistics include token positions, term/document
postings, Zipf frequencies, and postings-only compression estimates: 32-bit
integers versus document gaps, position gaps, and variable-byte integers.
Dictionary bytes and JavaScript object overhead are excluded from both estimates.

The worker retains base documents and builds option-specific indexes on demand.
IndexedDB stores base documents under SHA-256(ZIP bytes) + `PIPELINE_VERSION`.
Reload still fetches and hashes the ZIP, then skips PDF processing on a cache hit.
Storage denial falls back to an in-memory corpus. Increment the version after
changes to extraction, cleaning, segmentation, or tokenization.

## Fidelity And Sources

The algorithms are ported from `.agent/reference/notebook_pipeline.py`.
`stopwords.json` is the exact ordered list returned by the installed
`Sastrawi.StopWordRemover.StopWordRemoverFactory`; the parity oracle verifies
list equality. Legal exceptions, domain stopwords, protected words, and the
`berisi`/`berisikan` override match the notebook. No Overview text is indexed.
The scanned PDF initially has `needsOcr: true`. After publishing the text-PDF
index, the browser worker renders scanned pages to OffscreenCanvas at scale 3
and recognizes Indonesian text with self-hosted Tesseract. Word boxes retain PDF
coordinates. OCR-only section matching accepts a duplicated L in MENGADILI,
including spaced letters, only before the opening Menyatakan clause. Text-PDF
section matching remains unchanged. The rebuilt index and OCR document are
saved together; a complete cache hit skips OCR. Increment PIPELINE_VERSION when
changing this behavior so older OCR results cannot bypass the fix.

[SastrawiJs 1.1.0](https://github.com/damzaky/sastrawijs) is the sole added direct
package. Its raw stems are `menyimpan -> simpan`, `penjualan -> jual`, and
`perantara -> antara`; the pipeline protects `perantara`. Its package declares
MIT for code and CC-BY-NC-SA 3.0 for the Kateglo dictionary. Review the dictionary
license before wider reuse. `npm audit --omit=dev` reports five critical entries
through its old Babel transformation dependency. That Babel dependency is not
imported by the stemmer's distributed runtime or present in the worker bundle;
it remains in the installation dependency tree. No blanket audit fix was run.

## Verification

Run `npm run test:parity` and `npm run check` from `web/`. The parity test runs all
50 PDFs through the same modules, calls `.venv/Scripts/python.exe -I` for the
reference oracle, and checks exact copied stopwords, section count, amar
similarity, BM25 MAP, phrase/exclusion behavior, filters, and highlight sources.
Amar similarity is Python `difflib.SequenceMatcher(autojunk=False).ratio()` on
lowercase ASCII alphanumerics. Turning off autojunk preserves frequent letters
in long legal texts. Stem agreement compares raw package output against raw
PySastrawi, before protected-word rules and overrides.

Run `PARITY_OCR=1 npm run test:parity` to additionally recognize all 22 scanned
pages, check amar similarity >= 0.8, and verify searchable OCR source boxes.
In PowerShell, set `$env:PARITY_OCR='1'` before the command. Set
`PARITY_OCR_DUMP` to an absolute path in the system temp directory to inspect raw
OCR lines, cleaned detector input, removed lines, word boxes, and section bounds.
No reference metadata is used to repair OCR text.

When child-process spawning is blocked, bundle the test with the installed
esbuild executable into the system temp directory. Preserve the source test's
`import.meta.url` with esbuild's `--define` option and resolve external packages
from `web/node_modules`. Set `PARITY_PREPARE` to an absolute temporary input path;
the test writes oracle input there and exits. Invoke `tests/reference.py` with
that input and a temporary output path using the repository's Python interpreter,
then rerun the test with `PARITY_PREPARE` unset and `PARITY_ORACLE` pointing to the
output. The input hash rejects stale or mismatched oracle results. Keep all
bundles, oracle files, and diagnostic dumps outside the repository.

`worker.smoke.mjs` now runs in a real browser: start Vite and open
`/tests/worker.smoke.html`. It rejects foreign pdf.js messages, checks search and
explanation, requests the same PDF twice to catch detached buffers, and reloads
from IndexedDB. This replaces the Node loopback smoke, which cannot represent
nested browser workers. The Node parity test continues using the legacy build.
Use `/tests/worker.smoke.html?ocr=1` for a fresh OCR run, search during OCR,
page-progress checks, OCR search rectangles, and a cache reload that must skip
OCR. This mode clears the pipeline cache before testing.

## Search UI Integration (Task C)

`../corpus.svelte.ts` owns one pipeline worker and reactive load state. App mount
starts loading. `search` also returns parsed terms, phrases, and exclusions;
worker filters use exact values from cases metadata before applying the result
limit. Other exported calls are explain, evaluate, inspect, preprocess, fetchPdf,
and clearStoredData. The latter clears all cached corpus versions and forces
processing. Storage-clear errors are surfaced rather than claiming deletion.

pdf.js uses a dedicated nested module worker via Vite's `?url` asset import and
GlobalWorkerOptions.workerPort. The pipeline never imports the worker handler.
Unzipped PDF bytes remain in the pipeline worker; extraction and each `pdf`
response use independent copies, with the response buffer transferred to the UI.
Cache reload still fetches/hashes/unzips the ZIP but skips PDF text processing.

Cari renders escaped passage segments and passes all source rectangles to
PdfViewer. The modal renders one page at device-pixel resolution, converts box
corners with the pdf.js 6 viewport, traps focus through native dialog, and restores
focus on close. Text PDF highlights use the viewer text layer; scanned pages fall back to the
stored Tesseract word rectangles. The summary distinguishes pending OCR from
searchable documents and updates when OCR completes.

Task C verification: check and production build passed. Direct parity invocation
hit sandbox `spawn EPERM` at the Python oracle; use the documented separate oracle
route above.
Parity passed with the freshly generated, input-hash-checked oracle: 50 documents,
1,758 pages, 49 text documents, median amar similarity 1.0, BM25 MAP 0.7114,
and 98.22% raw stemmer agreement. The development server was stopped.
Browser verification could not run because the browser access host was unavailable;
the smoke page, viewer at 375px, and IndexedDB reload still need a browser run.
No package installation, commit, or changes outside web/ were made.
