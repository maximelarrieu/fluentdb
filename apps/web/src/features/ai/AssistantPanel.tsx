import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles,
  X,
  Send,
  Play,
  ClipboardCopy,
  CornerDownLeft,
} from 'lucide-react';
import type { AiMode, AiStreamEvent, ChatMessage } from '@fluentdb/shared';
import { api } from '../../api/client.js';
import { Button } from '../../components/ui/Button.js';
import { Spinner } from '../../components/ui/misc.js';
import { useWorkspace } from '../../stores/workspace.js';

interface Msg extends ChatMessage {
  suggestions?: string[];
}

export function AssistantPanel() {
  const { active, database, aiOpen, toggleAi, openQuery } = useWorkspace();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const status = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  // "Explain" / "Fix" / "Index advice" entry points dispatched from the editor
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        mode: AiMode;
        sql?: string;
        planSummary?: string;
        error?: string;
        object?: { name: string; schema?: string; kind: string };
      };
      if (detail.mode === 'explain_object' && detail.object) {
        const label =
          detail.object.kind === 'matview'
            ? 'la vue matérialisée'
            : detail.object.kind === 'view'
              ? 'la vue'
              : 'la table';
        send(`Explique ${label} « ${detail.object.name} ».`, 'explain_object', {
          object: detail.object as never,
        });
        return;
      }
      const prompt =
        detail.mode === 'explain'
          ? 'Explique cette requête SQL.'
          : detail.mode === 'index_advice'
            ? 'Propose un ou des index pour accélérer cette requête.'
            : detail.mode === 'chartable_sql'
              ? 'Adapte cette requête pour qu’elle renvoie au moins une valeur numérique traçable dans un graphique de tendance (garde une colonne de libellé pour les séries).'
              : 'Corrige cette requête SQL.';
      send(prompt, detail.mode, {
        currentSql: detail.sql,
        planSummary: detail.planSummary,
        error: detail.error,
      });
    };
    window.addEventListener('fluentdb:ai', handler);
    return () => window.removeEventListener('fluentdb:ai', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, database, messages]);

  const send = async (
    text: string,
    mode: AiMode = 'chat',
    context?: {
      currentSql?: string;
      error?: string;
      planSummary?: string;
      object?: { name: string; schema?: string; kind: 'table' | 'view' | 'matview' };
    },
  ) => {
    if (!text.trim() || streaming) return;
    const userMsg: Msg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await api.chat(
        {
          connectionId: active?.id,
          database,
          mode,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          context,
        },
        abort.signal,
      );
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        appendAssistant(err.error ?? 'Erreur', []);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      const suggestions: string[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const event = JSON.parse(part.slice(6)) as AiStreamEvent;
          if (event.type === 'text') {
            text += event.delta;
            updateLastAssistant(text, suggestions);
          } else if (event.type === 'sql_suggestion') {
            suggestions.push(event.sql);
            updateLastAssistant(text, [...suggestions]);
          } else if (event.type === 'error') {
            text += `\n\n⚠️ ${event.message}`;
            updateLastAssistant(text, suggestions);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        appendAssistant(`Erreur : ${(err as Error).message}`, []);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const updateLastAssistant = (content: string, suggestions: string[]) =>
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { role: 'assistant', content, suggestions };
      return next;
    });
  const appendAssistant = (content: string, suggestions: string[]) =>
    updateLastAssistant(content, suggestions);

  if (!aiOpen) return null;

  return (
    <div className="w-96 shrink-0 flex flex-col border-l border-border bg-panel h-full">
      <div className="flex items-center justify-between px-3 h-11 border-b border-border">
        <span className="text-[13px] font-semibold flex items-center gap-2">
          <Sparkles size={15} className="text-accent" /> Assistant IA
        </span>
        <button
          onClick={() => toggleAi(false)}
          className="text-muted hover:text-text"
        >
          <X size={16} />
        </button>
      </div>

      {!status.data?.configured ? (
        <div className="p-4 text-[13px] text-muted leading-relaxed">
          Aucun fournisseur IA configuré. Renseigne{' '}
          <code className="mono text-accent">GEMINI_API_KEY</code> dans le
          fichier <code className="mono">.env</code> puis redémarre le serveur
          FluentDB.
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-auto p-3 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="text-[13px] text-muted flex flex-col gap-2">
                <p>Demande-moi par exemple :</p>
                {[
                  'Montre les 10 dernières commandes avec le nom du client',
                  'Combien d’utilisateurs par pays ?',
                  'Optimise ma dernière requête',
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s, 'generate_sql')}
                    className="text-left rounded-md border border-border bg-panel-2 px-2.5 py-1.5 hover:border-accent/50"
                  >
                    {s}
                  </button>
                ))}
                <p className="text-[11px] text-muted/60 mt-1">
                  {status.data.provider} · {status.data.model} — le schéma de la
                  base connectée est envoyé comme contexte (structure
                  uniquement).
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <Message key={i} msg={m} onRun={(sql) => openQuery(sql)} />
            ))}
            {streaming && messages.at(-1)?.content === '' && (
              <Spinner className="ml-1" />
            )}
          </div>

          <div className="p-2.5 border-t border-border">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input, active ? 'generate_sql' : 'chat');
                  }
                }}
                rows={2}
                placeholder="Pose ta question en langage naturel…"
                className="w-full resize-none rounded-lg bg-bg border border-border px-3 py-2 pr-10 text-[13px] outline-none focus:border-accent"
              />
              <button
                onClick={() => send(input, active ? 'generate_sql' : 'chat')}
                disabled={streaming || !input.trim()}
                className="absolute right-2 bottom-2 text-accent disabled:text-muted/40"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-[10px] text-muted/60 mt-1 flex items-center gap-1">
              <CornerDownLeft size={10} /> Entrée pour envoyer · Maj+Entrée pour
              un saut de ligne
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Message({ msg, onRun }: { msg: Msg; onRun: (sql: string) => void }) {
  const isUser = msg.role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : ''}>
      <div
        className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed max-w-[92%] ${
          isUser ? 'bg-accent-strong text-white' : 'bg-panel-2'
        }`}
      >
        <Markdownish text={msg.content} />
        {msg.suggestions?.map((sql, i) => (
          <div
            key={i}
            className="mt-2 rounded-md border border-border bg-bg overflow-hidden"
          >
            <pre className="p-2.5 text-[12px] mono text-green whitespace-pre-wrap overflow-auto max-h-48">
              {sql}
            </pre>
            <div className="flex border-t border-border-soft">
              <button
                onClick={() => onRun(sql)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs hover:bg-panel-2 text-accent"
              >
                <Play size={12} /> Insérer & ouvrir
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(sql)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs hover:bg-panel-2 border-l border-border-soft"
              >
                <ClipboardCopy size={12} /> Copier
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renders assistant text, hiding raw ```sql blocks (shown as cards). */
function Markdownish({ text }: { text: string }) {
  const withoutSql = text.replace(/```sql[\s\S]*?```/gi, '').trim();
  return <span className="whitespace-pre-wrap">{withoutSql}</span>;
}
