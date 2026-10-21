# Diffs

A small, local-first app for comparing two text files. Edit either version and see additions, removals, and changes side by side as you type.

## Run locally

Requires [Node.js](https://nodejs.org/) 22.12 or later.

```sh
npm ci
npm run dev
```

Open the local URL printed in the terminal (usually <http://localhost:5173>).

### Use offline

```sh
npm run build
```

Open **`dist/index.html`** directly in your browser. The build bundles everything into that single file, so you can copy it anywhere and use it without Node.js, a server, or an internet connection.

## Compare files

1. Use **Open file** in each panel, drop one file into each panel, or paste text.
2. Edit either pane. Differences update automatically after a short pause in typing.
3. Red marks removed lines; green marks added lines. Stronger highlights show changes within a replaced line. Both panes stay editable, with line numbers, undo/redo, search, and aligned unchanged lines.

Use **Copy** in either version's header to copy its full text, **Swap** to reverse the comparison, or **Clear** to start over. **Ignore whitespace** ignores leading/trailing whitespace when matching lines. **Wrap lines** controls wrapping in both panes. The footer shows a missing final newline when applicable.

## Privacy and limits

- All comparison happens in your browser. No backend, uploads, analytics, external fonts, or CDN requests.
- Text is held in memory and discarded when you refresh or close the page. The app never changes your source files.
- Designed for UTF-8 text files, source code, JSON, Markdown, and similar text. Binary files and invalid UTF-8 are rejected. PDFs, images, Word documents, and other document formats are not supported.
- Up to 1 MiB and 10,000 lines per input. Very complex diffs may reach a time limit; compare smaller sections in that case.
- CRLF and CR line endings are normalized to LF. A missing final newline is shown explicitly. Whitespace-ignore mode follows [jsdiff's `diffLines` behavior](https://github.com/kpdecker/jsdiff#api).

## Development

Vanilla JavaScript, CSS, [CodeMirror](https://codemirror.net/) for editable diff panes, [Vite](https://vite.dev/), and [jsdiff](https://github.com/kpdecker/jsdiff) for line comparisons. No framework or server required.

```sh
npm test          # Comparison correctness and input validation
npm run build    # Single-file production build
npm run preview  # Serve the production build locally (optional)
```

## License

[MIT](LICENSE)
