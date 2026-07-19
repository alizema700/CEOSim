import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { api, type ThreadTurn } from '../api.js';

/**
 * Chat (Slack-artig): DMs mit Sekretärin und Führungsteam. Die Personas
 * antworten in Rolle (LLM); gute/schlechte Gespräche bewegen die Beziehung
 * (als protokollierter Intent, nie direkt durchs LLM).
 */
export function ChatView() {
  const { state } = useStore();
  const [activeKey, setActiveKey] = useState<string>('dm:assistant');
  if (!state) return null;

  const roleDe: Record<string, string> = { cto: 'CTO', headOfSales: 'Head of Sales', headOfCs: 'Head of CS', cfo: 'CFO' };
  const channels = [
    { key: 'dm:assistant', name: state.people.assistant.name, sub: 'Chief of Staff · erste Anlaufstelle', rel: null as number | null },
    ...state.people.executives.map((ex) => {
      const emp = state.people.employees.find((e) => e.id === ex.employeeId);
      return {
        key: 'dm:' + ex.id,
        name: emp ? `${emp.firstName} ${emp.lastName}` : `(${roleDe[ex.role]} vakant)`,
        sub: roleDe[ex.role] ?? ex.role,
        rel: ex.relationshipToCeo,
      };
    }),
  ];

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="panel w-64 shrink-0 overflow-y-auto">
        <div className="panel-title">Direktnachrichten</div>
        {channels.map((c) => (
          <button
            key={c.key}
            onClick={() => setActiveKey(c.key)}
            className={`block w-full border-b border-line/40 px-3 py-2 text-left last:border-0 ${activeKey === c.key ? 'bg-accent/10' : 'hover:bg-panel2'}`}
          >
            <div className="text-xs font-bold">{c.name}</div>
            <div className="flex items-center justify-between text-[10px] text-dim">
              <span>{c.sub}</span>
              {c.rel !== null && <span className={`num ${c.rel >= 65 ? 'text-good' : c.rel >= 45 ? 'text-dim' : 'text-bad'}`}>♥ {c.rel}</span>}
            </div>
          </button>
        ))}
        <p className="p-3 text-[9px] leading-relaxed text-dim/70">
          Kanäle #leadership & #all-hands sowie DMs mit allen Mitarbeitenden folgen; Meetings laufen über den Kalender.
        </p>
      </div>
      <ThreadPane key={activeKey} threadKey={activeKey} />
    </div>
  );
}

export function ThreadPane({ threadKey, meetingAptId }: { threadKey: string; meetingAptId?: string }) {
  const { state } = useStore();
  const [turns, setTurns] = useState<ThreadTurn[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    void api.getThread(state.meta.gameId, threadKey).then((r) => setTurns(r.turns)).catch(() => setTurns([]));
  }, [state, threadKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [turns.length]);

  if (!state) return null;

  async function send() {
    if (!state || text.trim().length === 0) return;
    setSending(true);
    try {
      const r = meetingAptId
        ? await api.sendMeeting(state.meta.gameId, meetingAptId, text.trim())
        : await api.sendThread(state.meta.gameId, threadKey, text.trim());
      setTurns((t) => [...t, ...r.turns]);
      setText('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {turns.length === 0 && (
          <p className="text-xs text-dim">
            {meetingAptId ? 'Eröffne das Meeting — die Teilnehmer antworten in Rolle.' : 'Schreib die erste Nachricht — die Person antwortet in Rolle, mit eigener Agenda.'}
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`max-w-[80%] rounded border p-2 text-xs leading-relaxed ${t.isPlayer ? 'ml-auto border-accent/40 bg-accent/5' : 'border-line bg-panel2'}`}>
            <div className="mb-0.5 text-[9px] uppercase tracking-wider text-dim">{t.author} · {t.authorRole}</div>
            <p className="whitespace-pre-wrap">{t.text}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <textarea
          className="input h-14 flex-1 resize-none"
          placeholder="Nachricht … (Strg/⌘+Enter zum Senden)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <button className="btn-primary self-end" disabled={sending || text.trim().length === 0} onClick={() => void send()}>
          {sending ? '…' : 'Senden'}
        </button>
      </div>
    </div>
  );
}
