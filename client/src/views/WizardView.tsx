import { useState } from 'react';
import type { DifficultyId, GameSetup, LocationId, PlayerSkillArea, ScenarioId } from '@boardroom/shared';
import { DIFFICULTIES, LOCATIONS } from '@boardroom/shared';
import { useStore } from '../store.js';
import { eur, pct } from '../format.js';

/**
 * „Neues Unternehmen"-Wizard — individualisiert das Spiel auf den Spieler:
 * Szenario → Schwierigkeit → Identität (Name, Logo, Mission, WERTE, Motto)
 * → Standort → CEO-Profil (Stärken/Schwächen) → Zusammenfassung.
 *
 * Die Ideologie ist NICHT kosmetisch: Werte & Motto fließen in die
 * Bewertungs-Pipeline (Werte-Konsistenz) und in Folgeeffekte ein.
 */

const SCENARIOS: { id: ScenarioId; title: string; desc: string; available: boolean }[] = [
  { id: 'saas-turnaround', title: 'SaaS-Übernahme mit Churn-Problem', desc: 'Du übernimmst eine B2B-SaaS-Firma: ~200 k€ MRR, solides Produkt — aber die jungen Kunden-Kohorten laufen davon, Tech-Debt drückt, Runway ~10 Monate. Das Board erwartet einen Turnaround.', available: true },
  { id: 'manufacturing-concentration', title: 'Produktionsbetrieb mit Klumpenrisiko', desc: 'Ein Großkunde = 60 % vom Umsatz …', available: false },
  { id: 'ecommerce-cash', title: 'E-Commerce mit Cash-Conversion-Problem', desc: 'Lager frisst Liquidität …', available: false },
  { id: 'founding', title: 'Eigene Gründung ab Tag 0', desc: 'Leeres Blatt, erste Kunden, erstes Team …', available: false },
  { id: 'distressed', title: 'Sanierungsfall kurz vor Insolvenz', desc: '6 Wochen Cash. Viel Glück.', available: false },
];

const VALUE_SUGGESTIONS = ['Menschen zuerst', 'Ehrlichkeit', 'Kundenbesessenheit', 'Handwerk', 'Geschwindigkeit', 'Nachhaltigkeit', 'Sparsamkeit', 'Mut'];
const EMOJIS = ['☁️', '🚀', '⚡', '🛠️', '🧭', '🦉', '🌊', '🔥', '🏔️', '♟️'];
const COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#f472b6', '#94a3b8'];
const SKILLS: { id: PlayerSkillArea; label: string }[] = [
  { id: 'finanzen', label: 'Finanzen' }, { id: 'vertrieb', label: 'Vertrieb' }, { id: 'produkt', label: 'Produkt' },
  { id: 'leadership', label: 'Leadership' }, { id: 'kommunikation', label: 'Kommunikation' }, { id: 'recht', label: 'Recht' },
];

export function WizardView() {
  const { createGame, setView, busy } = useStore();
  const [step, setStep] = useState(0);

  const [scenarioId, setScenarioId] = useState<ScenarioId>('saas-turnaround');
  const [difficulty, setDifficulty] = useState<DifficultyId>('manager');
  const [companyName, setCompanyName] = useState('');
  const [logoEmoji, setLogoEmoji] = useState('☁️');
  const [logoColor, setLogoColor] = useState('#22d3ee');
  const [productPitch, setProductPitch] = useState('');
  const [mission, setMission] = useState('');
  const [vision, setVision] = useState('');
  const [values, setValues] = useState<string[]>(['Menschen zuerst', 'Ehrlichkeit']);
  const [customValue, setCustomValue] = useState('');
  const [motto, setMotto] = useState('');
  const [locationId, setLocationId] = useState<LocationId>('muenchen');
  const [ceoName, setCeoName] = useState('');
  const [strengths, setStrengths] = useState<PlayerSkillArea[]>([]);
  const [weaknesses, setWeaknesses] = useState<PlayerSkillArea[]>([]);
  const [seed, setSeed] = useState('');

  const steps = ['Szenario', 'Schwierigkeit', 'Identität & Werte', 'Standort', 'Dein CEO-Profil', 'Los geht’s'];
  const canNext = [
    true,
    true,
    companyName.trim().length >= 2 && motto.trim().length >= 2 && values.length >= 1,
    true,
    ceoName.trim().length >= 2,
    true,
  ][step];

  function toggle(list: PlayerSkillArea[], setList: (l: PlayerSkillArea[]) => void, id: PlayerSkillArea, max: number) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);
  }

  async function start() {
    const setup: GameSetup = {
      scenarioId,
      difficulty,
      identity: {
        companyName: companyName.trim(),
        logoColor,
        logoEmoji,
        productPitch: productPitch.trim(),
        mission: mission.trim(),
        vision: vision.trim(),
        values,
        motto: motto.trim(),
        locationId,
      },
      playerProfile: { ceoName: ceoName.trim(), strengths, weaknesses },
      ...(seed.trim() !== '' && Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}),
    };
    await createGame(setup);
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <button className="mb-4 text-xs text-dim hover:text-ink" onClick={() => setView('saves')}>
        ← Zurück zur Übersicht
      </button>
      <div className="mb-6 flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <span className={`text-[10px] uppercase tracking-wider ${i === step ? 'text-accent' : i < step ? 'text-good' : 'text-dim/50'}`}>
              {i < step ? '✓ ' : ''}{s}
            </span>
            {i < steps.length - 1 && <span className="text-dim/40">·</span>}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-2">
          <h2 className="mb-3 text-lg font-bold">Welches Unternehmen willst du führen?</h2>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              disabled={!s.available}
              onClick={() => setScenarioId(s.id)}
              className={`panel w-full p-4 text-left transition-colors ${scenarioId === s.id ? 'border-accent' : ''} ${!s.available ? 'opacity-40' : 'hover:border-accent/60'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{s.title}</span>
                {!s.available && <span className="rounded border border-line px-1.5 py-0.5 text-[9px] text-dim">Phase 6</span>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-dim">{s.desc}</p>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          <h2 className="mb-3 text-lg font-bold">Wie hart soll es werden?</h2>
          {Object.values(DIFFICULTIES).map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={`panel w-full p-4 text-left transition-colors hover:border-accent/60 ${difficulty === d.id ? 'border-accent' : ''}`}
            >
              <span className="text-sm font-bold">{d.nameDe}</span>
              <p className="mt-1 text-xs text-dim">{d.descriptionDe}</p>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Identität & Ideologie</h2>
          <p className="text-xs text-warn">
            ⚠ Nicht kosmetisch: Deine Werte und dein Motto werden gespeichert — jede spätere Entscheidung wird auf Konsistenz
            damit bewertet. „Menschen zuerst" + brutale Entlassungsrunde = Kultur- und Reputations-Malus.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase text-dim">Firmenname *</label>
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="z. B. NimbusDesk GmbH" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-dim">Produkt/Branche (Freitext)</label>
              <input className="input" value={productPitch} onChange={(e) => setProductPitch(e.target.value)} placeholder="Helpdesk-Software für den Mittelstand" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="mb-1 block text-[10px] uppercase text-dim">Logo</label>
              <div className="flex gap-1">
                {EMOJIS.map((e) => (
                  <button key={e} className={`chip ${logoEmoji === e ? 'chip-on' : ''}`} onClick={() => setLogoEmoji(e)}>{e}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-dim">Farbe</label>
              <div className="flex gap-1">
                {COLORS.map((c) => (
                  <button key={c} className="h-6 w-6 rounded border" style={{ background: c, borderColor: logoColor === c ? '#fff' : 'transparent' }} onClick={() => setLogoColor(c)} />
                ))}
              </div>
            </div>
            <div className="ml-auto flex h-12 w-12 items-center justify-center rounded text-2xl" style={{ background: logoColor + '22', border: `1px solid ${logoColor}` }}>
              {logoEmoji}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase text-dim">Mission</label>
              <input className="input" value={mission} onChange={(e) => setMission(e.target.value)} placeholder="Wozu gibt es euch?" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-dim">Vision</label>
              <input className="input" value={vision} onChange={(e) => setVision(e.target.value)} placeholder="Wo wollt ihr hin?" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-dim">Werte (1–4) *</label>
            <div className="flex flex-wrap gap-1.5">
              {VALUE_SUGGESTIONS.map((v) => (
                <button key={v} className={`chip ${values.includes(v) ? 'chip-on' : ''}`} onClick={() => setValues(values.includes(v) ? values.filter((x) => x !== v) : values.length < 4 ? [...values, v] : values)}>
                  {v}
                </button>
              ))}
              <input
                className="input w-40"
                placeholder="+ eigener Wert ⏎"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customValue.trim().length >= 2 && values.length < 4) {
                    setValues([...values, customValue.trim()]);
                    setCustomValue('');
                  }
                }}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-dim">Motto *</label>
            <input className="input" value={motto} onChange={(e) => setMotto(e.target.value)} placeholder="z. B. „Menschen zuerst.“ — wird dich verfolgen." />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <h2 className="mb-3 text-lg font-bold">Wo sitzt der Hauptsitz?</h2>
          {Object.values(LOCATIONS).map((l) => (
            <button key={l.id} onClick={() => setLocationId(l.id)} className={`panel w-full p-4 text-left transition-colors hover:border-accent/60 ${locationId === l.id ? 'border-accent' : ''}`}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold">{l.nameDe}</span>
                <span className="text-[10px] text-dim">{l.country}</span>
              </div>
              <div className="num mt-1 grid grid-cols-2 gap-x-4 text-[11px] text-dim md:grid-cols-5">
                <span>Lohnniveau ×{l.payrollIndex.toLocaleString('de-DE')}</span>
                <span>Talentpool {pct(l.talentPool, 0)}</span>
                <span>Steuer {pct(l.taxRate, 0)}</span>
                <span>Regulierung: {l.regulationDensity}</span>
                <span>Büro {eur(l.officeCostPerEmployeeMonthly, false)}/MA/M</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Dein CEO-Profil</h2>
          <p className="text-xs text-dim">
            Ehrliche Selbsteinschätzung lohnt sich: Das Spiel nutzt dein Profil, um Bewertungen zu kontextualisieren — und ab
            Phase 2 fordern dich Ereignisse gezielt dort, wo du dich schwach einschätzt.
          </p>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-dim">Dein Name als CEO *</label>
            <input className="input max-w-xs" value={ceoName} onChange={(e) => setCeoName(e.target.value)} placeholder="Vor- und Nachname" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-dim">Deine Stärken (max. 3)</label>
            <div className="flex flex-wrap gap-1.5">
              {SKILLS.map((s) => (
                <button key={s.id} className={`chip ${strengths.includes(s.id) ? 'chip-on' : ''}`} onClick={() => toggle(strengths, setStrengths, s.id, 3)}>
                  💪 {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-dim">Deine Schwächen (max. 3)</label>
            <div className="flex flex-wrap gap-1.5">
              {SKILLS.map((s) => (
                <button key={s.id} className={`chip ${weaknesses.includes(s.id) ? 'chip-on' : ''}`} onClick={() => toggle(weaknesses, setWeaknesses, s.id, 3)}>
                  🎯 {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Bereit?</h2>
          <div className="panel space-y-1.5 p-4 text-xs">
            <div><span className="text-dim">Szenario: </span>{SCENARIOS.find((s) => s.id === scenarioId)?.title}</div>
            <div><span className="text-dim">Schwierigkeit: </span>{DIFFICULTIES[difficulty].nameDe}</div>
            <div><span className="text-dim">Unternehmen: </span>{logoEmoji} {companyName} · {LOCATIONS[locationId].nameDe}</div>
            <div><span className="text-dim">Werte: </span>{values.join(' · ')}</div>
            <div><span className="text-dim">Motto: </span>„{motto}"</div>
            <div><span className="text-dim">CEO: </span>{ceoName}</div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase text-dim">Seed (optional — gleicher Seed + gleiche Entscheidungen = gleicher Verlauf)</label>
            <input className="input max-w-xs" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="leer = zufällig" />
          </div>
          <p className="text-xs leading-relaxed text-dim">
            Am Montag deiner ersten Woche findest du vor: ein Team mit Namen und Meinungen, fünf Key-Accounts, drei Wettbewerber —
            und ein Churn-Problem, das keine Woche wartet.
          </p>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <button className="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          ← Zurück
        </button>
        {step < steps.length - 1 ? (
          <button className="btn-primary" onClick={() => setStep(step + 1)} disabled={!canNext}>
            Weiter →
          </button>
        ) : (
          <button className="btn-primary" onClick={() => void start()} disabled={busy || !canNext}>
            {busy ? 'Erstelle …' : '🏁 Unternehmen übernehmen'}
          </button>
        )}
      </div>
    </div>
  );
}
