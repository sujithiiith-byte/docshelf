# Bundled libraries

All third-party code DocShelf uses lives here, unmodified, so it never needs the network.

| Library | Version | Files | License |
|---|---|---|---|
| [marked](https://github.com/markedjs/marked) | 14.1.4 | `marked.esm.js` | MIT ([LICENSE.marked.md](LICENSE.marked.md)) |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.2.4 | `purify.es.mjs` | Apache-2.0 or MPL-2.0 ([LICENSE.dompurify](LICENSE.dompurify)) |
| [highlight.js](https://github.com/highlightjs/highlight.js) | 11.10.0 | `highlight.min.js` | BSD-3-Clause ([LICENSE.highlightjs](LICENSE.highlightjs)) |
| [Mermaid](https://github.com/mermaid-js/mermaid) | 12.2.0 | `mermaid/` | MIT ([LICENSE.mermaid](LICENSE.mermaid)) |

`mermaid/` is the package's `dist/mermaid.esm.min.mjs` plus `dist/chunks/mermaid.esm.min/*.mjs` (source maps removed). It is split into chunks, so only the code for the diagram types a document uses gets loaded. Mermaid's bundle includes its own dependencies under their licenses, mostly MIT/ISC, plus Apache-2.0 (chevrotain) and EPL-2.0 (elkjs). See the Mermaid repository for the full list.

To update Mermaid: download `https://registry.npmjs.org/mermaid/-/mermaid-<version>.tgz`, replace the files above the same way, and run `python3 tools/e2e/run.py`.
