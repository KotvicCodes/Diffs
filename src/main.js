import './style.css';
import { compareTexts, normalize, splitLines, validateText, MAX_BYTES } from './compare.js';
import { createLiveEditors } from './live-editor.js';

/** Find a workspace element by its unique ID. */
const $ = (id) => document.getElementById(id);
const sides = ['left', 'right'];
const names = { left: 'Pasted text', right: 'Pasted text' };
const loadVersion = { left: 0, right: 0 };
let comparisonTimer;

/** Set the workspace status text and optional error styling; empty text clears it. */
function message(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
}

const editors = createLiveEditors($('editors'), side => {
  loadVersion[side]++;
  updateMeta(side);
  scheduleComparison();
}, text => {
  clearTimeout(comparisonTimer);
  message(text, true);
});

/** Read the complete document from the requested editor pane. */
function getText(side) {
  return editors.views[side].state.doc.toString();
}

/** Replace a pane's document with normalized text and move its cursor to the start. */
function setText(side, text) {
  const view = editors.views[side];
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: normalize(text) },
    selection: { anchor: 0 },
    scrollIntoView: true,
  });
}

/** Refresh a pane's filename, logical line count, and character count. */
function updateMeta(side) {
  const text = getText(side);
  $(`${side}-meta`).textContent = `${splitLines(text).length.toLocaleString()} lines · ${text.length.toLocaleString()} characters`;
  $(`${side}-name`).textContent = names[side];
  $(`${side}-name`).title = names[side];
}

/** Hide stale counts and compare after a 120 ms pause in editing. */
function scheduleComparison() {
  clearTimeout(comparisonTimer);
  $('change-count').hidden = true;
  message('');
  comparisonTimer = setTimeout(compare, 120);
}

/** Refresh highlights, counts, and newline flags, or display a comparison error. */
function compare() {
  clearTimeout(comparisonTimer);
  try {
    const left = getText('left');
    const right = getText('right');
    const result = compareTexts(left, right, { ignoreWhitespace: $('ignore-whitespace').checked, timeout: 100 });
    editors.updateHighlights(result);
    $('change-count').hidden = !left && !right;
    $('change-count').textContent = result.identical ? 'Identical' : `+${result.added} added  /  −${result.removed} removed`;
    $('change-count').classList.toggle('is-identical', result.identical);
    for (const side of sides) {
      const missing = side === 'left' ? result.leftMissingNewline : result.rightMissingNewline;
      $(`${side}-newline`).hidden = !missing;
    }
    message('');
  } catch (error) {
    editors.updateHighlights(null);
    $('change-count').hidden = true;
    message(error.message, true);
  }
}

/** Copy complete text, falling back to a temporary textarea for local HTML files. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Support browsers that restrict Clipboard API access to local HTML files.
  }
  const focused = document.activeElement;
  const buffer = document.createElement('textarea');
  buffer.className = 'clipboard-buffer';
  buffer.value = text;
  buffer.readOnly = true;
  document.body.append(buffer);
  try {
    buffer.select();
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
  } finally {
    buffer.remove();
    focused?.focus({ preventScroll: true });
  }
}

for (const button of document.querySelectorAll('[data-copy]')) {
  const label = button.getAttribute('aria-label');
  let resetTimer;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await copyText(getText(button.dataset.copy));
      clearTimeout(resetTimer);
      button.textContent = 'Copied';
      button.setAttribute('aria-label', label.replace('Copy', 'Copied'));
      resetTimer = setTimeout(() => {
        button.textContent = 'Copy';
        button.setAttribute('aria-label', label);
      }, 1500);
    } catch {
      message('Could not copy. Select the text and copy it manually.', true);
    } finally {
      button.disabled = false;
    }
  });
}

/** Load validated UTF-8 text, discarding reads superseded by another load or edit. */
async function loadFile(side, file) {
  if (!file) return;
  const version = ++loadVersion[side];
  try {
    if (file.size > MAX_BYTES) throw new Error('Please use text files smaller than 1 MB each.');
    const buffer = await file.arrayBuffer();
    if (loadVersion[side] !== version) return;
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new Error('Could not read this as UTF-8 text. Please choose a UTF-8 text file.'); }
    validateText(text);
    names[side] = file.name;
    setText(side, text);
    updateMeta(side);
    compare();
  } catch (error) {
    if (loadVersion[side] === version) message(error.message, true);
  }
}

for (const side of sides) {
  const input = $(`${side}-file`);
  document.querySelector(`[data-open="${side}"]`).addEventListener('click', () => input.click());
  input.addEventListener('change', () => { loadFile(side, input.files[0]); input.value = ''; });
  const header = document.querySelector(`[data-side="${side}"]`);
  const editor = editors.views[side].dom;
  for (const target of [header, editor]) {
    target.addEventListener('dragover', event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      header.classList.add('drag-over');
      editor.classList.add('drag-over');
    });
    target.addEventListener('dragleave', event => {
      if (target.contains(event.relatedTarget)) return;
      header.classList.remove('drag-over');
      editor.classList.remove('drag-over');
    });
    target.addEventListener('drop', event => {
      if (!event.dataTransfer.files.length) return;
      event.preventDefault();
      event.stopPropagation();
      header.classList.remove('drag-over');
      editor.classList.remove('drag-over');
      if (event.dataTransfer.files.length !== 1) { message('Drop one file into each panel.', true); return; }
      loadFile(side, event.dataTransfer.files[0]);
    }, true);
  }
}

$('ignore-whitespace').addEventListener('change', compare);
$('wrap').addEventListener('change', () => editors.setWrap($('wrap').checked));
$('swap').addEventListener('click', () => {
  const left = getText('left');
  const right = getText('right');
  for (const side of sides) loadVersion[side]++;
  [names.left, names.right] = [names.right, names.left];
  setText('left', right);
  setText('right', left);
  sides.forEach(updateMeta);
  compare();
});
$('clear').addEventListener('click', () => {
  for (const side of sides) {
    loadVersion[side]++;
    names[side] = 'Pasted text';
    setText(side, '');
    updateMeta(side);
  }
  compare();
  editors.views.left.focus();
});
$('sample').addEventListener('click', () => {
  for (const side of sides) loadVersion[side]++;
  names.left = 'before.json';
  names.right = 'after.json';
  setText('left', '{\n  "name": "project",\n  "version": "1.0.0",\n  "private": false,\n  "features": [\n    "compare text",\n    "upload files"\n  ]\n}\n');
  setText('right', '{\n  "name": "project",\n  "version": "1.1.0",\n  "private": true,\n  "features": [\n    "compare text",\n    "open local files",\n    "ignore whitespace"\n  ]\n}\n');
  sides.forEach(updateMeta);
  compare();
});

compare();
