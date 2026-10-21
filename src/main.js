import './style.css';
import { compareTexts, inlineChanges, normalize, splitLines, validateText, MAX_BYTES } from './compare.js';

const $ = (id) => document.getElementById(id);
const sides = ['left', 'right'];
const names = { left: 'Pasted text', right: 'Pasted text' };
const loadVersion = { left: 0, right: 0 };
let result = null;

function message(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
}

function updateMeta(side) {
  const text = $(`${side}-text`).value;
  $(`${side}-meta`).textContent = `${splitLines(text).length.toLocaleString()} lines · ${text.length.toLocaleString()} characters`;
  $(`${side}-name`).textContent = names[side];
  $(`${side}-name`).title = names[side];
}

function edit() {
  $('editors').hidden = false;
  $('comparison').hidden = true;
  $('edit').hidden = true;
  $('view-title').textContent = 'Files';
  $('compare').firstChild.textContent = 'Compare texts ';
  $('change-count').hidden = true;
  result = null;
}

function createCell(data, side, changes) {
  const element = document.createElement('div');
  element.className = `diff-cell ${data?.kind ?? 'gap'}`;
  const number = document.createElement('span');
  number.className = 'line-number';
  number.textContent = data?.number ?? '';
  number.setAttribute('aria-hidden', 'true');
  const sign = document.createElement('span');
  sign.className = 'line-sign';
  sign.textContent = data?.kind === 'added' ? '+' : data?.kind === 'removed' ? '−' : ' ';
  sign.setAttribute('aria-hidden', 'true');
  const content = document.createElement('span');
  content.className = 'line-content';
  if (data) {
    if (changes) {
      for (const part of changes) {
        if ((side === 'left' && part.added) || (side === 'right' && part.removed)) continue;
        const span = document.createElement('span');
        span.textContent = part.value;
        if (part.added || part.removed) span.className = 'inline-change';
        content.append(span);
      }
    } else content.textContent = data.text;
  }
  element.append(number, sign, content);
  return element;
}

function renderComparison() {
  try {
    const next = compareTexts($('left-text').value, $('right-text').value, { ignoreWhitespace: $('ignore-whitespace').checked });
    const fragment = document.createDocumentFragment();
    for (const row of next.rows) {
      const element = document.createElement('div');
      element.className = 'diff-row';
      const changes = row.left?.kind === 'removed' && row.right?.kind === 'added'
        ? inlineChanges(row.left.text, row.right.text) : null;
      element.append(createCell(row.left, 'left', changes), createCell(row.right, 'right', changes));
      fragment.append(element);
    }
    if (next.leftMissingNewline || next.rightMissingNewline) {
      const note = document.createElement('div');
      note.className = 'diff-row newline-row';
      for (const missing of [next.leftMissingNewline, next.rightMissingNewline]) {
        const cell = document.createElement('div');
        cell.textContent = missing ? '↵ No newline at end of file' : '';
        note.append(cell);
      }
      fragment.append(note);
    }
    if (!next.rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-result';
      empty.textContent = 'Both versions are empty.';
      fragment.append(empty);
    }
    $('diff-rows').replaceChildren(fragment);
    for (const side of sides) $(`result-${side}-name`).textContent = names[side];
    $('editors').hidden = true;
    $('comparison').hidden = false;
    $('edit').hidden = false;
    $('view-title').textContent = 'Comparison';
    $('compare').firstChild.textContent = 'Compare again ';
    $('result-lines').textContent = `${next.rows.length.toLocaleString()} aligned rows`;
    $('change-count').hidden = false;
    $('change-count').textContent = `+${next.added} added  /  −${next.removed} removed`;
    $('change-count').classList.toggle('is-identical', next.identical);
    message(next.identical
      ? $('ignore-whitespace').checked ? 'Identical (ignoring whitespace).' : 'Identical.'
      : '');
    result = next;
    $('diff-scroll').scrollTop = 0;
  } catch (error) {
    message(error.message, true);
  }
}

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
    edit();
    $(`${side}-text`).value = normalize(text);
    names[side] = file.name;
    updateMeta(side);
    message('');
  } catch (error) {
    if (loadVersion[side] === version) message(error.message, true);
  }
}

for (const side of sides) {
  const input = $(`${side}-file`);
  document.querySelector(`[data-open="${side}"]`).addEventListener('click', () => input.click());
  input.addEventListener('change', () => { loadFile(side, input.files[0]); input.value = ''; });
  $(`${side}-text`).addEventListener('input', () => {
    loadVersion[side]++;
    updateMeta(side);
    message('');
  });
  const panel = document.querySelector(`[data-side="${side}"]`);
  panel.addEventListener('dragover', (event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    panel.classList.add('drag-over');
  });
  panel.addEventListener('dragleave', (event) => {
    if (!panel.contains(event.relatedTarget)) panel.classList.remove('drag-over');
  });
  panel.addEventListener('drop', (event) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    panel.classList.remove('drag-over');
    if (event.dataTransfer.files.length !== 1) { message('Drop one file into each panel.', true); return; }
    loadFile(side, event.dataTransfer.files[0]);
  });
}

$('compare').addEventListener('click', renderComparison);
$('edit').addEventListener('click', () => { edit(); $('left-text').focus(); message(''); });
$('ignore-whitespace').addEventListener('change', () => { if (result) renderComparison(); });
$('wrap').addEventListener('change', () => document.querySelector('.workspace').classList.toggle('no-wrap', !$('wrap').checked));
$('swap').addEventListener('click', () => {
  for (const side of sides) loadVersion[side]++;
  [$('left-text').value, $('right-text').value] = [$('right-text').value, $('left-text').value];
  [names.left, names.right] = [names.right, names.left];
  sides.forEach(updateMeta);
  if (result) renderComparison();
  else message('');
});
$('clear').addEventListener('click', () => {
  edit();
  for (const side of sides) {
    loadVersion[side]++;
    $(`${side}-text`).value = '';
    names[side] = 'Pasted text';
    updateMeta(side);
  }
  $('diff-rows').replaceChildren();
  message('');
  $('left-text').focus();
});
$('sample').addEventListener('click', () => {
  for (const side of sides) loadVersion[side]++;
  $('left-text').value = '{\n  "name": "project",\n  "version": "1.0.0",\n  "private": false,\n  "features": [\n    "compare text",\n    "upload files"\n  ]\n}\n';
  $('right-text').value = '{\n  "name": "project",\n  "version": "1.1.0",\n  "private": true,\n  "features": [\n    "compare text",\n    "open local files",\n    "ignore whitespace"\n  ]\n}\n';
  names.left = 'before.json';
  names.right = 'after.json';
  sides.forEach(updateMeta);
  renderComparison();
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    renderComparison();
  }
});
if (/Mac|iPhone|iPad/.test(navigator.platform)) $('shortcut').textContent = '⌘';
