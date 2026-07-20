import { useState } from 'react';
import type { Appointment } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Modal } from '../components/ui.js';
import { ThreadPane } from './ChatView.js';

/**
 * Kalender (Wochenansicht): Termine anklicken ⇒ Meeting als Chat-Szene mit
 * mehreren Personas. Agenda-Vorschläge kommen von der Sekretärin (Engine).
 */
export function CalendarView() {
  const { state } = useStore();
  const [openApt, setOpenApt] = useState<Appointment | null>(null);
  if (!state) return null;

  const week = state.meta.week;
  const weeks = [week, week + 1, week + 2, week + 3];
  const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
  const kindIcon: Record<Appointment['kind'], string> = { leadershipSync: '👔', boardCall: '🏛️', customerCall: '🤝', legal: '§', earningsCall: '📊', custom: '📌' };

  return (
    <div className="space-y-4">
      {weeks.map((w) => {
        const appts = state.calendar.appointments.filter((a) => a.week === w);
        return (
          <div key={w} className="panel">
            <div className="panel-title">
              Woche {w} {w === week && <span className="ml-2 rounded border border-accent/50 px-1 text-accent">AKTUELL</span>}
            </div>
            <div className="grid grid-cols-5 gap-px bg-line/40">
              {days.map((d, di) => (
                <div key={d} className="min-h-24 bg-panel p-2">
                  <div className="mb-1 text-[9px] uppercase tracking-wider text-dim">{d}</div>
                  {appts
                    .filter((a) => a.weekday === di)
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setOpenApt(a)}
                        className={`mb-1 block w-full rounded border px-2 py-1.5 text-left text-[11px] transition-colors hover:border-accent ${
                          a.kind === 'boardCall' ? 'border-warn/50 bg-warn/5' : 'border-line bg-panel2'
                        }`}
                      >
                        {kindIcon[a.kind]} {a.titleDe}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-dim">
        Termine entstehen automatisch: Leadership-Sync (wöchentlich), Board-Call (quartalsweise), Renewal-Gespräche (vor
        Key-Account-Verlängerungen). Verschieben/Absagen über {state.people.assistant.name} (Chat) — Phase 2.1.
      </p>

      {openApt && (
        <Modal title={`${openApt.titleDe} · Woche ${openApt.week}`} onClose={() => setOpenApt(null)} wide>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Agenda (Vorschlag: {state.people.assistant.name})</div>
              <ul className="space-y-0.5 text-xs">
                {openApt.agendaDe.map((a, i) => (
                  <li key={i}>· {a}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-dim">Teilnehmer</div>
              <ul className="space-y-0.5 text-xs">
                {openApt.participants.map((p, i) => (
                  <li key={i}>👤 {p}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="h-80">
            <ThreadPane threadKey={'meeting:' + openApt.id} meetingAptId={openApt.id} />
          </div>
        </Modal>
      )}
    </div>
  );
}
