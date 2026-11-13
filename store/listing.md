# Chrome Web Store listing

Copy these into the developer dashboard (https://chrome.google.com/webstore/devconsole).

## Store listing tab

**Name:** DocShelf

**Summary** (max 132 characters):
> Read local Markdown, PDF and text docs in tabs. Offline, private and lightweight, with no code files cluttering the view.

**Category:** Tools (Productivity)  **Language:** English

**Description:**
> DocShelf turns a folder of design docs into a calm reading space in your browser.
>
> • Pick a folder once. DocShelf shows only Markdown, PDF and text files, and folders without documents are hidden.
> • One click shows a rendered Markdown file. Double-click keeps it open in a tab, like VS Code.
> • Markdown with tables, task lists, highlighted code, an "On this page" outline, local images, and links between documents.
> • PDFs open in Chrome's own viewer, with pages, zoom and search.
> • Ctrl+P opens a document by name. Ctrl+Shift+F searches inside all your documents.
> • Docs refresh automatically when the file changes on disk, which is handy while you or an AI assistant edit them.
> • Several folders at once: each browser tab can show a different folder.
> • Light and dark themes. Print or save any document as PDF.
>
> Private by design: DocShelf makes no network connections, has no analytics and no accounts, and your files never leave your computer.
> Lightweight: under 500 KB, no frameworks, and only the libraries a document needs are loaded.
>
> Open source (MIT): <REPO URL>

**Screenshots** (1280×800): `store/screenshots/1-setup.png` … `5-pdf.png`
(regenerate with `python3 tools/e2e/run.py --store`)

**Icon:** `extension/icons/icon128.png`

## Privacy tab

**Single purpose:**
> Display Markdown, PDF and plain-text documents from a local folder that the user picks, in a tabbed reader.

**Permission justification, activeTab:**
> When the user clicks the toolbar icon, the extension checks whether the current tab is an empty New Tab page so it can open the reader there instead of adding another tab. No page content is read or modified.

**Remote code:** No, I am not using remote code. All code is bundled in the package.

**Data usage:** tick nothing. The extension does not collect or transmit any user data. Then tick all three certifications (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL:** link to `PRIVACY.md` in the GitHub repository (e.g. `<REPO URL>/blob/main/PRIVACY.md`).

## Distribution tab

Public, all regions, free.
