import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
} from '@codemirror/autocomplete';
import {
  sql,
  PostgreSQL,
  MySQL,
  SQLite,
  type SQLDialect,
} from '@codemirror/lang-sql';
import {
  syntaxHighlighting,
  HighlightStyle,
  bracketMatching,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { AutocompleteCatalog } from '@fluentdb/shared';

const dialects: Record<string, SQLDialect> = {
  postgres: PostgreSQL,
  mysql: MySQL,
  sqlite: SQLite,
};

/*
 * Syntax + editor theme driven entirely by the app's CSS tokens, so the
 * editor follows light/dark automatically (no hardcoded hex — the old theme
 * had near-white base text that vanished on a light background).
 */
const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--color-accent)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--color-green)' },
  { tag: t.number, color: 'var(--color-amber)' },
  { tag: t.comment, color: 'var(--color-muted)', fontStyle: 'italic' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: 'var(--color-accent-strong)',
  },
  { tag: t.operator, color: 'var(--color-muted)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--color-text)' },
  { tag: t.typeName, color: 'var(--color-amber)' },
]);

const theme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--color-text)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--color-muted)',
    opacity: '0.6',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--color-text) 4%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--color-muted)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--color-accent) 22%, transparent)',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--color-accent) 32%, transparent)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--color-accent)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--color-panel-2)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    color: 'var(--color-text)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'color-mix(in oklab, var(--color-accent) 22%, transparent)',
    color: 'var(--color-text)',
  },
});

export interface EditorConfig {
  dialect: string;
  catalog: AutocompleteCatalog;
  onChange: (value: string) => void;
  onRun: () => void;
  onRunSelection: () => void;
}

export function buildExtensions(config: EditorConfig): Extension[] {
  const dialect = dialects[config.dialect] ?? PostgreSQL;
  const schema: Record<string, string[]> = { ...config.catalog };

  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ activateOnTyping: true }),
    syntaxHighlighting(highlightStyle),
    theme,
    sql({ dialect, schema, upperCaseKeywords: true }),
    keymap.of([
      {
        key: 'Mod-Enter',
        preventDefault: true,
        run: () => {
          config.onRun();
          return true;
        },
      },
      {
        key: 'Shift-Mod-Enter',
        preventDefault: true,
        run: () => {
          config.onRunSelection();
          return true;
        },
      },
      indentWithTab,
      ...completionKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        config.onChange(update.state.doc.toString());
      }
    }),
    EditorView.lineWrapping,
  ];
}

export function makeState(doc: string, extensions: Extension[]): EditorState {
  return EditorState.create({ doc, extensions });
}
