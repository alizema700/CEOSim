import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExecutiveRole, InboxMessage } from '@boardroom/shared';
import { EVENT_CARDS } from '@boardroom/shared';
import { useStore } from '../store.js';
import { api, type ThreadTurn } from '../api.js';

/**
 * E-Mail-Postfach: Inbox / Erledigt / Archiv, Suche, Prioritäts-Flags der
 * Sekretärin. Mails frei beantworten (LLM spielt die Gegenseite), ans Team
 * delegieren oder ignorieren — Ereignis-Mails tragen ihre Antwort-Optionen.
 */
export function InboxView() {
  const { state, messageStatus, markMessage, act, busy } = useStore();
  const [folder, setFolder] = useState<'inbox' | 'done' | 'archiv'>('inbox');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const messages = useMemo(() => {
    if (!state) return [];
    const all = [...state.comms.messages].reverse();
    const q = search.trim().toLowerCase();
    return all.filter((m) => {
      const st = messageStatus[m.id];
      const inFolder =
        folder === 'archiv' ? st === 'archived'
        : folder === 'done' ? st !== 'archived' && m.handledWeek !== null
        : st !== 'archived' && m.handledWeek === null;
      if (!inFolder) return false;
      if (!q) return true;
      return (m.subjectDe + m.bodyDe + m.from.name + (m.from.company ?? '')).toLowerCase().includes(q);
    });
  }, [state, folder, search, messageStatus]);

  const selected = messages.find((m) => m.id === selectedId) ?? messages[0] ?? null;

  useEffect(() => {
    if (selected && messageStatus[selected.id] === undefined) void markMessage(selected.id, 'read');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  if (!state) return null;
  const unreadCount = state.comms.messages.filter((m) => messageStatus[m.id] === undefined).length;

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* Liste */}
      <div className="flex w-96 shrink-0 flex-col">
        <div className="mb-2 flex gap-1">
          {(
            [
              ['inbox', `Inbox`],
              ['done', 'Erledigt'],
              ['archiv', 'Archiv'],
            ] as const
          ).map(([f, label]) => (
            <button key={f} className={`chip ${folder === f ? 'chip-on' : ''}`} onClick={() => setFolder(f)}>
              {label}
            </button>
          ))}
          <span className="ml-auto self-center text-[10px] text-dim">{unreadCount} ungelesen</span>
        </div>
        <input className="input mb-2" placeholder="Suchen …" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="panel min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 && <p className="p-4 text-xs text-dim">Keine Nachrichten hier.</p>}
          {messages.map((m) => {
            const unread = messageStatus[m.id] === undefined;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={`block w-full border-b border-line/40 px-3 py-2 text-left transition-colors last:border-0 ${
                  selected?.id === m.id ? 'bg-accent/10' : 'hover:bg-panel2'
                }`}
              >
                <div className="flex items-baseline gap-1.5">
                  {m.priority === 'hoch' && <span className="text-bad">●</span>}
                  <span className={`truncate text-xs ${unread ? 'font-bold text-ink' : 'text-dim'}`}>{m.from.name}</span>
                  <span className="ml-auto shrink-0 text-[9px] text-dim">W{m.week}</span>
                </div>
                <div className={`truncate text-xs ${unread ? 'text-ink' : 'text-dim'}`}>{icon(m)} {m.subjectDe}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div className="panel min-h-0 flex-1 overflow-y-auto">
        {selected ? <MessageDetail key={selected.id} msg={selected} onAct={act} busy={busy} onArchive={() => void markMessage(selected.id, 'archived')} /> : (
          <p className="p-6 text-xs text-dim">Wähle eine Nachricht.</p>
        )}
      </div>
    </div>
  );
}

function icon(m: InboxMessage): string {
  return { briefing: '📋', exec: '👔', employee: '👤', event: '🚨', external: '🌐', delegation: '↩️', system: '⚙' }[m.kind] ?? '✉';
}

function MessageDetail({ msg, onAct, busy, onArchive }: { msg: InboxMessage; onAct: ReturnType<typeof useStore.getState>['act']; busy: boolean; onArchive: () => void }) {
  const { state, setView } = useStore();
  const [turns, setTurns] = useState<ThreadTurn[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadKey = 'msg:' + msg.id;

  useEffect(() => {
    if (!state) return;
    void api.getThread(state.meta.gameId, threadKey).then((r) => setTurns(r.turns)).catch(() => setTurns([]));
  }, [state, threadKey]);

  if (!state) return null;
  const event = msg.eventInstanceId ? state.openEvents.find((e) => e.instanceId === msg.eventInstanceId) : null;
  const card = event ? EVENT_CARDS.find((c) => c.id === event.cardId) : null;
  const execRoles: { role: ExecutiveRole; label: string }[] = [
    { role: 'cto', label: 'CTO' },
    { role: 'headOfSales', label: 'Head of Sales' },
    { role: 'headOfCs', label: 'Head of CS' },
    { role: 'cfo', label: 'CFO' },
  ];

  async function send() {
    if (!state || reply.trim().length === 0) return;
    setSending(true);
    try {
      const r = await api.sendThread(state.meta.gameId, threadKey, reply.trim());
      setTurns((t) => [...t, ...r.turns]);
      setReply('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold">{msg.subjectDe}</div>
            <div className="mt-0.5 text-[11px] text-dim">
              {msg.from.name} · {msg.from.roleDe}
              {msg.from.company ? ` · ${msg.from.company}` : ''} · Woche {msg.week}
              {msg.priority === 'hoch' && <span className="ml-2 rounded border border-bad/50 px-1 text-[9px] text-bad">PRIO ⚑ Sekretärin</span>}
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {msg.delegable && msg.handledWeek === null && (
              <button className="btn" onClick={() => setDelegateOpen((o) => !o)}>↪ Delegieren</button>
            )}
            {msg.suggestedActionType && (
              <button className="btn" onClick={() => setView('decisions')}>⌘ Passende Aktion</button>
            )}
            <button className="btn" onClick={onArchive}>🗄 Archiv</button>
          </div>
        </div>
        {delegateOpen && msg.handledWeek === null && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border border-line bg-panel2 p-2">
            <span className="text-[10px] uppercase text-dim">„Kümmer dich drum" an:</span>
            {execRoles.map((e) => (
              <button
                key={e.role}
                className="chip"
                disabled={busy}
                onClick={() => {
                  setDelegateOpen(false);
                  void onAct({ type: 'DELEGATE_MESSAGE', messageId: msg.id, execRole: e.role }, null);
                }}
              >
                {e.label}
              </button>
            ))}
            <span className="w-full text-[9px] text-dim">Ergebnis hängt an Kompetenz & Beziehung — und kommt in 1–2 Wochen als Mail zurück.</span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="whitespace-pre-wrap text-xs leading-relaxed">{msg.bodyDe}</p>

        {msg.handledWeek !== null && (
          <div className="mt-3 rounded border border-good/40 bg-good/5 px-2 py-1 text-[11px] text-good">✓ Mechanisch erledigt in Woche {msg.handledWeek}.</div>
        )}

        {/* Ereignis-Optionen direkt in der Mail */}
        {event && card && event.status === 'open' && (
          <div className="mt-4 rounded border border-warn/50 bg-warn/5 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-warn">Reaktion erforderlich (sonst greift nach {card.autoResolveAfterWeeks} W die Default-Folge)</div>
            <div className="flex flex-col gap-1.5">
              {card.options.map((opt) => (
                <button key={opt.id} className="btn text-left" disabled={busy} onClick={() => void onAct({ type: 'RESPOND_EVENT', eventInstanceId: event.instanceId, optionId: opt.id }, null)}>
                  {opt.labelDe}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Freier Antwort-Thread */}
        {turns.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-line pt-3">
            {turns.map((t, i) => (
              <div key={i} className={`max-w-[85%] rounded border p-2 text-xs leading-relaxed ${t.isPlayer ? 'ml-auto border-accent/40 bg-accent/5' : 'border-line bg-panel2'}`}>
                <div className="mb-0.5 text-[9px] uppercase tracking-wider text-dim">{t.author} · {t.authorRole}</div>
                <p className="whitespace-pre-wrap">{t.text}</p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-line p-3">
        <textarea
          className="input h-16 flex-1 resize-none"
          placeholder="Antwort schreiben … (die Gegenseite antwortet in Rolle)"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <button className="btn-primary self-end" disabled={sending || reply.trim().length === 0} onClick={() => void send()}>
          {sending ? '…' : 'Senden'}
        </button>
      </div>
    </div>
  );
}
