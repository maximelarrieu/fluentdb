import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import type { AutocompleteCatalog } from '@fluentdb/shared';
import { buildExtensions, makeState } from './editorSetup.js';

interface Props {
  value: string;
  dialect: string;
  catalog: AutocompleteCatalog;
  onChange: (value: string) => void;
  onRun: () => void;
  onRunSelection: (selection: string) => void;
}

export interface EditorHandle {
  getSelection: () => string;
  insertText: (text: string) => void;
}

export function CodeEditor({
  value,
  dialect,
  catalog,
  onChange,
  onRun,
  onRunSelection,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // keep latest callbacks without recreating the editor
  const cbs = useRef({ onChange, onRun, onRunSelection });
  cbs.current = { onChange, onRun, onRunSelection };

  useEffect(() => {
    if (!ref.current) return;
    const getSelection = (view: EditorView) => {
      const { from, to } = view.state.selection.main;
      return from === to ? '' : view.state.sliceDoc(from, to);
    };
    const extensions = buildExtensions({
      dialect,
      catalog,
      onChange: (v) => cbs.current.onChange(v),
      onRun: () => cbs.current.onRun(),
      onRunSelection: () => {
        const sel = viewRef.current ? getSelection(viewRef.current) : '';
        cbs.current.onRunSelection(sel);
      },
    });
    const view = new EditorView({
      state: makeState(value, extensions),
      parent: ref.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // recreate only when the dialect/catalog changes
  }, [dialect, catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep external value in sync (e.g. AI inserts) without clobbering typing
  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={ref} className="h-full overflow-hidden" />;
}
