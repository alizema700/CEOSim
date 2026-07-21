import { useState } from 'react';
import type { Appointment } from '@boardroom/shared';
import { useStore } from '../store.js';
import { Modal } from '../components/ui.js';
import { Icon, type IconName } from '../components/Icon.js';
import { ThreadPane } from './ChatView.js';

/**
 * Kalender (Wochenansicht): Termine anklicken ⇒ Meeting als Chat-Szene mit
 * mehreren Personas. Agenda-Vorschläge kommen von der Sekretärin (Engine).
 */
export function CalendarView() {
  const { state, act, busy } = useStore();
  const [openApt, setOpenApt] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [inWeeks, setInWeeks] = useState(0);
  const [weekday, setWeekday] = useState(2);
  const [agenda, setAgenda] = useState('');
  if (!state) return null;

  const week = state.meta.week;
  const weeks = [week, week + 1, week + 2, week + 3];
  const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
  const kindIcon: Record<Appointment['kind'], IconName> = { leadershipSync: 'briefcase', boardCall: 'institution', customerCall: 'handshake', legal: 'scale', earningsCall: 'bar-chart', custom: 'pin' };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="kicker">Dein Kalender · Termine sind als Meeting-Szene spielbar</span>
        <button className="btn-primary" onClick={() => setCreating(true)} disabled={state.meta.status !== 'active'}>
          + Eigenen Termin ansetzen
        </button>
      </div>
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
                        <Icon name={kindIcon[a.kind]} size={12} className="mr-1" />{a.titleDe}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-dim">
        Termine entstehen automatisch (Leadership-Sync, Board-Call, Renewals, Earnings-Calls) — oder du setzt eigene an:
        „+ Eigenen Termin" oben rechts. Das Führungsteam nimmt teil.
      </p>

      {creating && (
        <Modal title="Eigenen Termin ansetzen" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <div>
              <label className="kicker mb-1 block text-[9.5px]">Titel *</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="z. B. „Strategie-Offsite: Pricing 2027“" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="kicker mb-1 block text-[9.5px]">Woche</label>
                <select className="input" value={inWeeks} onChange={(e) => setInWeeks(Number(e.target.value))}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                    <option key={w} value={w}>{w === 0 ? `Diese Woche (W${week})` : `In ${w} Woche(n) (W${week + w})`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="kicker mb-1 block text-[9.5px]">Wochentag</label>
                <select className="input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                  {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="kicker mb-1 block text-[9.5px]">Agenda (eine Zeile pro Punkt, max. 5)</label>
              <textarea className="input h-20 resize-none" value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder={'Pricing-Optionen durchgehen\nEntscheidungsvorlage fürs Board'} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setCreating(false)}>Abbrechen</button>
              <button
                className="btn-primary"
                disabled={busy || title.trim().length < 3}
                onClick={() => {
                  setCreating(false);
                  void act(
                    {
                      type: 'CREATE_APPOINTMENT',
                      titleDe: title.trim(),
                      week: week + inWeeks,
                      weekday,
                      agendaDe: agenda.split('\n').map((a) => a.trim()).filter(Boolean).slice(0, 5),
                    },
                    null,
                  );
                  setTitle('');
                  setAgenda('');
                }}
              >
                Termin ansetzen
              </button>
            </div>
          </div>
        </Modal>
      )}

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
                  <li key={i} className="flex items-center gap-1.5"><Icon name="user" size={12} className="text-dim" /> {p}</li>
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
