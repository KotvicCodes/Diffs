import { Compartment, EditorState, StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import { Decoration, drawSelection, EditorView, highlightSpecialChars, keymap, lineNumbers, placeholder, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { MergeView } from '@codemirror/merge';
import { inlineChanges, validateText, type ComparisonResult } from './compare.ts';
import { sides, type Side } from './types.ts';

const setHighlights = StateEffect.define<DecorationSet>();
const highlights = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  /** Map highlights through edits, replacing them when a comparison effect arrives. */
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) if (effect.is(setHighlights)) value = effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});

/** Mount two aligned, editable documents with validation and custom diff highlights. */
export function createLiveEditors(parent: HTMLElement, onChange: (side: Side) => void, onError: (message: string) => void) {
  const wrapping = { left: new Compartment(), right: new Compartment() };
  /** Configure one pane's input, history, accessibility, validation, and wrapping. */
  const extensions = (side: Side, label: string): Extension[] => [
    lineNumbers(), highlightSpecialChars(), drawSelection(), history(), search({ top: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    EditorState.tabSize.of(2),
    wrapping[side].of(EditorView.lineWrapping),
    placeholder('Paste text or drop a file'),
    EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
    EditorState.transactionFilter.of(transaction => {
      if (transaction.docChanged) {
        try { validateText(transaction.newDoc.toString()); }
        catch (error) { onError(error instanceof Error ? error.message : String(error)); return []; }
      }
      return transaction;
    }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) onChange(side);
    }),
    highlights,
  ];

  const merge = new MergeView({
    parent,
    a: { extensions: extensions('left', 'Original text') },
    b: { extensions: extensions('right', 'Changed text') },
    // MergeView aligns the editable documents. Our line diff supplies consistent
    // counts and decorations, including the ignore-whitespace option.
    highlightChanges: false,
    gutter: false,
    diffConfig: { scanLimit: 500, timeout: 100 },
  });
  const views = { left: merge.a, right: merge.b };

  /** Apply line and budget-limited character highlights; null clears both panes. */
  function updateHighlights(result: ComparisonResult | null): void {
    const decorations: Record<Side, Range<Decoration>[]> = { left: [], right: [] };
    let inlineBudget = 200;
    const inlineDeadline = performance.now() + 30;
    for (const row of result?.rows ?? []) {
      const parts = row.left?.kind === 'removed' && row.right?.kind === 'added' && inlineBudget-- > 0 && performance.now() < inlineDeadline
        ? inlineChanges(row.left.text, row.right.text) : null;
      for (const side of sides) {
        const cell = row[side];
        if (!cell || cell.kind === 'equal') continue;
        const line = views[side].state.doc.line(cell.number);
        decorations[side].push(Decoration.line({ class: `diff-${cell.kind}` }).range(line.from));
        if (!parts) continue;
        let offset = line.from;
        for (const part of parts) {
          if ((side === 'left' && part.added) || (side === 'right' && part.removed)) continue;
          if ((part.added || part.removed) && part.value.length) {
            decorations[side].push(Decoration.mark({ class: 'diff-inline' }).range(offset, offset + part.value.length));
          }
          offset += part.value.length;
        }
      }
    }
    for (const side of sides) {
      views[side].dispatch({ effects: setHighlights.of(Decoration.set(decorations[side], true)) });
    }
  }

  /** Toggle wrapping in both panes without replacing their documents or history. */
  function setWrap(enabled: boolean): void {
    for (const side of sides) {
      views[side].dispatch({ effects: wrapping[side].reconfigure(enabled ? EditorView.lineWrapping : []) });
    }
  }

  return { views, updateHighlights, setWrap };
}
