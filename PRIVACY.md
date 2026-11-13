# Privacy policy

_Last updated: 13 November 2026_

DocShelf is a document reader that runs entirely inside your browser.

**What it accesses:** only the folders you pick with the "Open folder" dialog. It reads the Markdown, PDF and text files in those folders so it can show them to you. It never writes to, uploads or deletes your files.

**What it stores, and where:** on your own computer, in the browser's storage for this extension:
- the list of folders you opened recently, so you can reopen them with one click;
- your settings (theme, sidebar width, file-type filters) and which tabs were open in each folder.

You can remove a folder from the recent list at any time. Uninstalling the extension deletes all of this.

**What it sends:** nothing. DocShelf makes no network requests. It has no analytics, no tracking, no ads, no accounts and no remote code. All its libraries are bundled inside the extension. The automated test suite checks that no network request is ever made.

**Permissions:**
- `activeTab`: when you click the toolbar icon, DocShelf checks whether the current tab is an empty New Tab page so it can open there instead of adding another tab. It does not read or change any web page.

**Questions:** open an issue in the project's GitHub repository.
