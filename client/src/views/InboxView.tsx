import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExecutiveRole, InboxMessage } from '@boardroom/shared';
import { EVENT_CARDS } from '@boardroom/shared';
import { useStore } from '../store.js';
import { api, type ThreadTurn } from '../api.js';

/**
 * Postfach im Redaktions-Stil (2-Spalten-Mailclient): links die 400-px-Liste
 * mit Rubriken (Eingang/Erledigt/Archiv) & Suche, rechts der Lesesaal mit
 * Serifen-Schlagzeile, Fließtext und angehefteter Antwort-Leiste. Mails frei
 * beantworten (LLM spielt die Gegenseite), delegieren oder ignorieren —
 * Ereignis-Mails tragen ihre Antwort-Optionen mit.
 */
export function InboxView() {
  const { state, messageStatus, markMessage, act, busy } = useStore();
  const [folder, setFolder] = useState<'inbox' | 'done' | 'archiv'>('inbox');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const folderOf = (m: InboxMessage): 'inbox' | 'done' | 'archiv' => {
    if (messageStatus[m.id] === 'archived') return 'archiv';
    return m.handledWeek !== null ? 'done' : 'inbox';
  };

  const all = useMemo(() => (state ? [...state.comms.messages].reverse() : []), [state]);
  const counts = useMemo(() => {
    const c = { inbox: 0, done: 0, archiv: 0 };
    for (const m of all) c[folderOf(m)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, messageStatus]);

  const messages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((m) => {
      if (folderOf(m) !== folder) return false;
      if (!q) return true;
      return (m.subjectDe + m.bodyDe + m.from.name + (m.from.company ?? '')).toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, folder, search, messageStatus]);

  const selected = messages.find((m) => m.id === selectedId) ?? messages[0] ?? null;

  useEffect(() => {
    if (selected && messageStatus[selected.id] === undefined) void markMessage(selected.id, 'read');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  if (!state) return null;
  const unreadCount = state.comms.messages.filter((m) => messageStatus[m.id] === undefined).length;
  const openEventIds = new Set(state.openEvents.filter((e) => e.status === 'open').map((e) => e.instanceId));

  return (
    <div className="grid h-[calc(100vh-215px)] min-h-[520px] grid-cols-[380px_1px_1fr] gap-x-8">
      {/* ── Liste ─────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-col">
        <div className="flex items-baseline gap-1.5 pb-2">
          {(
            [
              ['inbox', 'Eingang'],
              ['done', 'Erledigt'],
              ['archiv', 'Archiv'],
            ] as const
          ).map(([f, label]) => (
            <button key={f} className={`chip ${folder === f ? 'chip-on' : ''}`} onClick={() => { setFolder(f); setSelectedId(null); }}>
              {label} {counts[f]}
            </button>
          ))}
          <span className="ml-auto self-center kicker text-[10px] text-bad">{unreadCount} ungelesen</span>
        </div>

        <input
          className="mb-1 w-full border-0 border-b border-line bg-transparent px-1 py-2 text-[13px] text-ink outline-none focus:border-accent"
          placeholder="Suchen …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 && <p className="serif px-1 py-6 text-[17px] italic text-dim">Keine Nachrichten in dieser Rubrik.</p>}
          {messages.map((m) => {
            const unread = messageStatus[m.id] === undefined;
            const urgent = !!(m.eventInstanceId && openEventIds.has(m.eventInstanceId));
            const active = selected?.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className="block w-full border-b border-line py-3 pl-3 pr-3.5 text-left transition-colors hover:bg-panel2"
                style={{ borderLeft: `3px solid ${active ? '#171a1c' : 'transparent'}` }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: unread ? '#c2453d' : 'transparent' }} />
                  <span className={`truncate text-[13px] ${unread ? 'font-semibold text-ink' : 'text-dim'}`}>{m.from.name}</span>
                  {urgent && <span className="kicker shrink-0 text-[9.5px] text-bad">DRINGEND</span>}
                  {!urgent && m.priority === 'hoch' && <span className="kicker shrink-0 text-[9.5px] text-warn">PRIO</span>}
                  <span className="num ml-auto shrink-0 text-[10px] text-faint">W{m.week}</span>
                </div>
                <div className={`serif mt-0.5 truncate pl-[15px] text-[15.5px] ${unread ? 'text-ink' : 'text-dim'}`}>{m.subjectDe}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Trennlinie ────────────────────────────────────────────────── */}
      <div className="hair h-full w-px" />

      {/* ── Lesesaal ──────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-col">
        {selected ? (
          <MessageDetail key={selected.id} msg={selected} onAct={act} busy={busy} urgent={!!(selected.eventInstanceId && openEventIds.has(selected.eventInstanceId))} onArchive={() => void markMessage(selected.id, 'archived')} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="kicker">Lesesaal</div>
            <p className="serif mt-2 text-[22px] italic text-dim">Wähle links eine Nachricht.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageDetail({ msg, onAct, busy, urgent, onArchive }: { msg: InboxMessage; onAct: ReturnType<typeof useStore.getState>['act']; busy: boolean; urgent: boolean; onArchive: () => void }) {
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

  const kicker = urgent
    ? { txt: 'Dringend · Frist läuft', cls: 'text-bad' }
    : msg.priority === 'hoch'
      ? { txt: 'Prio · vorsortiert von der Assistenz', cls: 'text-warn' }
      : { txt: 'Korrespondenz', cls: 'text-dim' };

  async function send() {
    if (!state || reply.trim().length === 0) return;
    setSending(true);
    try {
      const r = await api.sendThread(state.meta.gameId, threadKey, reply.trim());
      setTurns((t) => [...t, ...r.turns]);
      setReply('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Kopf */}
      <div className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className={`kicker ${kicker.cls}`}>{kicker.txt}</div>
          <div className="flex shrink-0 gap-4">
            {msg.delegable && msg.handledWeek === null && (
              <button className="edlink text-[12.5px] text-dim" style={{ borderColor: '#ddd9d0' }} onClick={() => setDelegateOpen((o) => !o)}>Delegieren</button>
            )}
            {msg.suggestedActionType && (
              <button className="edlink text-[12.5px] text-dim" style={{ borderColor: '#ddd9d0' }} onClick={() => setView('decisions')}>Passende Aktion</button>
            )}
            {(msg.templateId === 'tarif-demand' || msg.templateId === 'works-council') && (
              <button className="edlink text-[12.5px] text-accent" style={{ borderColor: '#ddd9d0' }} onClick={() => setView('team')}>Zu den Arbeitsbeziehungen</button>
            )}
            <button className="edlink text-[12.5px] text-dim" style={{ borderColor: '#ddd9d0' }} onClick={onArchive}>Archivieren</button>
          </div>
        </div>
        <h2 className="serif mt-2 text-[32px] leading-[1.12] text-ink" style={{ maxWidth: '30ch', textWrap: 'balance' }}>{msg.subjectDe}</h2>
        <div className="kicker mt-2">
          Von {msg.from.name} · {msg.from.roleDe}{msg.from.company ? ` · ${msg.from.company}` : ''} · Eingegangen W{msg.week}
        </div>
        {delegateOpen && msg.handledWeek === null && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border border-line bg-panel2 p-2.5" style={{ borderRadius: 2 }}>
            <span className="kicker text-[10px]">„Kümmer dich drum" an:</span>
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
            <span className="w-full kicker mt-1 text-[9px]">Ergebnis hängt an Kompetenz &amp; Beziehung — und kommt in 1–2 Wochen als Mail zurück.</span>
          </div>
        )}
      </div>

      {/* Körper */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line pt-4">
        <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-ink2" style={{ maxWidth: '62ch' }}>{msg.bodyDe}</p>

        {msg.handledWeek !== null && (
          <div className="mt-4 border-l-2 border-good bg-good/5 px-2.5 py-1.5 text-[12px] text-good">✓ Mechanisch erledigt in Woche {msg.handledWeek}.</div>
        )}

        {/* Ereignis-Optionen direkt in der Mail */}
        {event && card && event.status === 'open' && (
          <div className="mt-5 border border-warn/50 bg-warn/5 p-3.5" style={{ borderRadius: 2 }}>
            <div className="kicker text-warn">Reaktion erforderlich · sonst greift nach {card.autoResolveAfterWeeks} W die Default-Folge</div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {card.options.map((opt) => (
                <button key={opt.id} className="btn justify-start text-left" disabled={busy} onClick={() => void onAct({ type: 'RESPOND_EVENT', eventInstanceId: event.instanceId, optionId: opt.id }, null)}>
                  {opt.labelDe}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Antwort-Thread */}
        {turns.length > 0 && (
          <div className="mt-5 flex flex-col gap-4">
            {turns.map((t, i) => (
              <div key={i} className="border-t border-line pt-3" style={{ maxWidth: '62ch' }}>
                <div className={`kicker text-[10px] ${t.isPlayer ? 'text-accent' : 'text-dim'}`}>
                  {t.isPlayer ? `Du · ${t.author}, CEO · gerade eben` : `${t.author} · antwortet in Rolle`}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[14.5px] leading-[1.6] text-ink2">{t.text}</p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Antwort-Leiste */}
      <div className="border-t-2 border-ink pt-3">
        <div className="kicker mb-1.5 text-[10px]">Antwort · die Gegenseite antwortet in Rolle</div>
        <div className="flex items-end gap-3">
          <textarea
            className="h-14 flex-1 resize-none border-0 border-b border-line bg-transparent px-1 py-1.5 text-[14.5px] text-ink outline-none focus:border-accent"
            placeholder="Antwort schreiben … (Strg/⌘+Enter sendet)"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
            }}
          />
          <button className="btn-primary shrink-0" disabled={sending || reply.trim().length === 0} onClick={() => void send()}>
            {sending ? '…' : 'Senden →'}
          </button>
        </div>
      </div>
    </div>
  );
}
