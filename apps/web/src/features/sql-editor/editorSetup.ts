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

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#6d8bff' },
  { tag: [t.string, t.special(t.string)], color: '#3fb884' },
  { tag: t.number, color: '#f0b429' },
  { tag: t.comment, color: '#5a6270', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#a78bfa' },
  { tag: t.operator, color: '#8b93a7' },
  { tag: [t.propertyName, t.attributeName], color: '#e4e7ee' },
  { tag: t.typeName, color: '#f2a15a' },
]);

const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#e4e7ee' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#4a5164',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: '#ffffff08' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#8b93a7' },
    '.cm-selectionBackground, ::selection': { backgroundColor: '#3d5afe33' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: '#3d5afe44' },
    '.cm-tooltip': {
      backgroundColor: '#1a1e28',
      border: '1px solid #262b38',
      borderRadius: '6px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: '#4f6bff',
      color: '#fff',
    },
  },
  { dark: true },
);

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
