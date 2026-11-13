# Changelog

## 0.3.0
- Split view: open a document to the side with Ctrl+\\, Alt+click in the explorer, the split button in the path bar, or right-click → "Open to the side". Drag the divider to resize; closing the last tab on one side removes the split. The layout is remembered per folder.
- Explorer hide/show button (top-left). When hidden, a slim rail keeps the show and search buttons in reach.
- The tab strip no longer shows a scrollbar over the titles.
- Mermaid diagrams in Markdown (```` ```mermaid ````), drawn offline in light or dark. The library loads only for documents that contain a diagram.
- Click a diagram or image to view it full-window, with zoom and pan.
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) and footnotes (`[^1]`).
- Back / forward with Alt+← / Alt+→ or the mouse side buttons, returning to the same scroll position. These keys no longer take the browser tab away from DocShelf.
- Stricter privacy: a Content Security Policy blocks every internet request, and web images in Markdown show their alt text instead of loading.

## 0.2.0
- Each browser tab can show a different folder. Clicking the icon opens a new workspace; reloads and session restore bring back each tab's folder.
- Ctrl+P: go to a document by name (fuzzy).
- Ctrl+Shift+F: search inside all Markdown and text files, with matches highlighted in the document.
- Right-click menus for tabs (close others / to the right / all, copy path) and files.
- Print / Save as PDF for Markdown and text, always printed in light colours.
- Tidier welcome screen.

## 0.1.0
- First version: folder tree that shows only Markdown, PDF and text files, with file-type and name filters.
- VS Code-style preview and pinned tabs.
- Markdown rendering with code highlighting, an outline, local images and links between docs.
- Built-in Chrome PDF viewer; plain-text view.
- Live reload when a file changes on disk; light and dark themes; offline, no permissions.
