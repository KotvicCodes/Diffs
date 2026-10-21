import { diffLines, diffChars } from 'diff';

export const MAX_BYTES = 1024 * 1024;
export const MAX_LINES = 10000;

export function normalize(text) {
  return text.replace(/\r\n?/g, '\n');
}

export function splitLines(text) {
  if (!text) return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

export function validateText(text) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) {
    throw new Error('Please use text files smaller than 1 MB each.');
  }
  if (splitLines(normalize(text)).length > MAX_LINES) {
    throw new Error('Please use files with 10,000 lines or fewer.');
  }
  if (text.includes('\0')) {
    throw new Error('This looks like a binary file. Please choose a UTF-8 text file.');
  }
}

// Keep the displayed text intact when matching whitespace-insensitive lines.
export function compareTexts(original, changed, { ignoreWhitespace = false } = {}) {
  validateText(original);
  validateText(changed);
  const left = normalize(original);
  const right = normalize(changed);
  const parts = diffLines(left, right, { ignoreWhitespace, timeout: 1500 });
  if (!parts) throw new Error('These files are too different to compare quickly. Try smaller sections.');
  const leftLines = splitLines(left);
  const rightLines = splitLines(right);
  const rows = [];
  let leftIndex = 0;
  let rightIndex = 0;
  let added = 0;
  let removed = 0;
  const cell = (lines, index, kind, text) => ({ number: index + 1, text: text ?? lines[index], kind });

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      for (let j = 0; j < part.count; j++) {
        rows.push({ left: cell(leftLines, leftIndex++, 'equal'), right: cell(rightLines, rightIndex++, 'equal') });
      }
      continue;
    }
    const deleted = part.removed ? part.count : 0;
    let inserted = part.added ? part.count : 0;
    if (part.removed && parts[i + 1]?.added) inserted = parts[++i].count;
    removed += deleted;
    added += inserted;
    for (let j = 0; j < Math.max(deleted, inserted); j++) {
      rows.push({
        left: j < deleted ? cell(leftLines, leftIndex++, 'removed') : null,
        right: j < inserted ? cell(rightLines, rightIndex++, 'added') : null,
      });
    }
  }

  return { rows, added, removed, identical: added === 0 && removed === 0,
    leftMissingNewline: left.length > 0 && !left.endsWith('\n'),
    rightMissingNewline: right.length > 0 && !right.endsWith('\n') };
}

export function inlineChanges(left, right) {
  if (left.length + right.length > 1000) return null;
  return diffChars(left, right, { timeout: 10, maxEditLength: 120 }) ?? null;
}
