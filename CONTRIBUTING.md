# Contributing

Thanks for helping! DocShelf aims to stay **small, calm and private**, so please keep these in mind:

- **No network access**, ever. All libraries are bundled in `extension/lib/`.
- **No build step and no framework.** It's plain JavaScript modules. Edit, reload the extension, done.
- **Light on resources.** New libraries should load only when they're needed (see `src/viewers/registry.js`) and must justify their size.
- **Reading first.** New UI should stay out of the way: a shortcut or a right-click action before a new button.

## Run it

1. Open `chrome://extensions`, turn on Developer mode, then **Load unpacked** → `extension/`.
2. After changing code, click the reload icon on the extension card and reload the DocShelf tab.

## Test it

```sh
python3 tools/e2e/run.py            # headless end-to-end tests (needs Chromium/Chrome)
CHROME=/path/to/chrome python3 tools/e2e/run.py
```

The tests use the browser's private file system (OPFS) as a stand-in folder, so no dialog is needed. Please add a check for new behaviour in `tools/e2e/e2e_page.js`.

## Release

1. Bump `version` in `extension/manifest.json` and add a `CHANGELOG.md` entry.
2. Commit, then tag and push: `git tag v0.3.0 && git push --tags`.
3. The release workflow builds `docshelf-<version>.zip` and attaches it to a GitHub Release. To build it locally instead, run `sh tools/package.sh` → `dist/`.
