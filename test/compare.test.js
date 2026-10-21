import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTexts, inlineChanges, validateText, MAX_BYTES, MAX_LINES } from '../src/compare.js';

test('empty and identical files have no differences', () => {
  assert.deepEqual(compareTexts('', '').rows, []);
  const result = compareTexts('hello\nworld\n', 'hello\nworld\n');
  assert.equal(result.identical, true);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map(row => [row.left.number, row.right.number]), [[1, 1], [2, 2]]);
});

test('aligns replacements, extra inserted lines, and subsequent line numbers', () => {
  const result = compareTexts('start\nold\nend\n', 'start\nnew\nextra\nend\n');
  assert.equal(result.added, 2);
  assert.equal(result.removed, 1);
  assert.deepEqual(result.rows, [
    { left: { number: 1, text: 'start', kind: 'equal' }, right: { number: 1, text: 'start', kind: 'equal' } },
    { left: { number: 2, text: 'old', kind: 'removed' }, right: { number: 2, text: 'new', kind: 'added' } },
    { left: null, right: { number: 3, text: 'extra', kind: 'added' } },
    { left: { number: 3, text: 'end', kind: 'equal' }, right: { number: 4, text: 'end', kind: 'equal' } },
  ]);
});

test('handles additions and deletions against empty text', () => {
  assert.equal(compareTexts('', 'one\ntwo').added, 2);
  assert.equal(compareTexts('one\ntwo', '').removed, 2);
  assert.equal(compareTexts('', '\n').added, 1);
  assert.equal(compareTexts('a\n\n', 'a\n').removed, 1);
});

test('normalizes Windows and classic Mac line endings', () => {
  assert.equal(compareTexts('a\r\nb\r\n', 'a\nb\n').identical, true);
  assert.equal(compareTexts('a\rb\r', 'a\nb\n').identical, true);
});

test('detects final-newline changes without rendering phantom lines', () => {
  const result = compareTexts('hello', 'hello\n');
  assert.equal(result.identical, false);
  assert.equal(result.rows.length, 1);
  assert.equal(result.leftMissingNewline, true);
  assert.equal(result.rightMissingNewline, false);
});

test('ignoring whitespace preserves the original display on both sides', () => {
  const result = compareTexts('  hello  \nbye\n', 'hello\n bye \n', { ignoreWhitespace: true });
  assert.equal(result.identical, true);
  assert.equal(result.rows[0].left.text, '  hello  ');
  assert.equal(result.rows[0].right.text, 'hello');
  assert.equal(result.rows[1].right.text, ' bye ');
  assert.equal(compareTexts('  hello\n', 'hello\n').identical, false);
});

test('keeps Unicode and HTML as literal text', () => {
  const result = compareTexts('😀 café\n<script>bad()</script>', '😀 čaj\n<script>bad()</script>');
  assert.equal(result.rows[1].left.text, '<script>bad()</script>');
  assert.equal(result.rows[0].right.text, '😀 čaj');
  assert.ok(inlineChanges('café', 'čaj').some(part => part.added));
});

test('rejects binary input, excessive bytes, and excessive line counts', () => {
  assert.throws(() => validateText('file\0bytes'), /binary/);
  assert.throws(() => validateText('a'.repeat(MAX_BYTES + 1)), /1 MB/);
  assert.throws(() => validateText('é'.repeat(MAX_BYTES / 2 + 1)), /1 MB/);
  assert.throws(() => validateText('a\n'.repeat(MAX_LINES + 1)), /10,000/);
  assert.doesNotThrow(() => validateText('a\n'.repeat(MAX_LINES)));
});

test('comparison row stream reconstructs both original inputs', () => {
  // Cover insertions, deletions, repeated/blank lines, and asymmetric replacements.
  let seed = 42;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let iteration = 0; iteration < 200; iteration++) {
    const createText = () => Array.from({ length: Math.floor(random() * 20) }, () => ['a', 'b', '', 'same', '😀'][Math.floor(random() * 5)]).map(line => line + '\n').join('');
    const left = createText();
    const right = createText();
    const { rows } = compareTexts(left, right);
    for (const [side, source] of [['left', left], ['right', right]]) {
      const cells = rows.map(row => row[side]).filter(Boolean);
      assert.equal(cells.map(cell => cell.text + '\n').join(''), source);
      assert.deepEqual(cells.map(cell => cell.number), cells.map((_, index) => index + 1));
    }
  }
});
