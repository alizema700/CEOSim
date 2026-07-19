# ▙ BOARDROOM — Der CEO-Simulator

Ein realistischer CEO-Simulator mit deterministischer Unternehmens-Simulation,
KI-gestützter Erzähl- und Bewertungsebene und einer starken Didaktik-Schicht.
Zielgruppe: angehende Gründer:innen, CEOs, CTOs, die Unternehmensführung
risikofrei trainieren wollen.

**Status: Phase 1 (MVP) — voll lauffähig.** SaaS-Turnaround-Szenario, komplette
Finanz-Engine mit harten Invarianten, Entscheidungs-Panel, Bewertungs-Pipeline
(Hypothese → Resultat → Analyse → Note → Lektion), mehrere Spielstände,
Event-Sourcing-Persistenz.

---

## Schnellstart

```bash
npm install
cp .env.example .env      # optional: ANTHROPIC_API_KEY eintragen
npm run dev               # startet Server (:3001) + Client (:5173)
```

Dann http://localhost:5173 öffnen, Unternehmen anlegen, führen.

**Ohne API-Key läuft alles** — die Simulation ist deterministischer Code; das
LLM liefert nur zusätzliche Analyse-Prosa. Tests: `npm test`. Typecheck:
`npm run typecheck`.

---

## Architekturprinzip: Trennung von Wahrheit und Erzählung

```
┌────────────────────────────┐      ┌─────────────────────────────┐
│  WAHRHEIT (deterministic)  │      │  ERZÄHLUNG (LLM, optional)  │
│  @boardroom/shared         │      │  server/src/llm.ts          │
│                            │      │                             │
│  CompanyState (SSoT)       │      │  Analyse-Prosa, Personas    │
│  Engine: applyAction,      │◄─────│  (ab P2), Ideen-Intents     │
│  closeWeek, Invarianten    │ nur  │  (ab P3) — IMMER zod-       │
│  KPIs immer berechnet      │ Text │  validiert, nie Zahlenmacht │
└────────────────────────────┘      └─────────────────────────────┘
         ▲          ▲
         │          │ Replay
┌────────┴───┐  ┌───┴──────────────┐
│ client     │  │ server (Express) │
│ React/Vite │  │ SQLite: Events   │
│ Tailwind   │  │ append-only +    │
│ recharts   │  │ Snapshot-Cache   │
└────────────┘  └──────────────────┘
```

1. **Nur die Engine verändert Zahlen.** Das LLM erzählt, bewertet, erklärt —
   liefert aber nie State-Mutationen. Note & Skill-Wirkung sind regelbasiert;
   LLM-Texte werden separat gespeichert.
2. **Determinismus:** Jede Session hat einen Seed. Jedes Subsystem zieht aus
   eigenen RNG-Substreams (`stream(seed, zweck, woche)`). Gleicher Seed +
   gleiche Entscheidungen ⇒ bit-identischer Verlauf (Golden-Master-Test).
3. **Event-Sourcing:** `GAME_CREATED / DECISION_MADE / WEEK_CLOSED` als
   append-only Log; der State ist jederzeit per Replay rekonstruierbar
   (Import macht genau das). Grundlage für Zeitreise & Was-wäre-wenn (P4).
4. **Harte Invarianten:** Nach jedem Wochentick werden Bilanz-Identität
   (Aktiva = Passiva) und Cash-Flow-Konsistenz geprüft — Verletzung wirft
   einen Fehler mit Diff, nichts wird still weitergerechnet.

## Projektlayout

```
shared/   Datenmodell (types/) + deterministische Engine (engine/) + Tests
server/   Express-API, SQLite (node:sqlite, ohne native Deps), LLM-Schicht
client/   React + Vite + TS + Tailwind v4 + recharts + zustand
```

Wochentick-Reihenfolge (`shared/src/engine/tick.ts`): fällige geplante
Effekte → Personal (Hiring/Attrition/Moral) → Produkt (Velocity/Tech-Debt/
Bugs/NPS) → Kunden (Pipeline/Churn/Renewals) → **Finanz-Ledger** (alle
Geldflüsse an einem Ort → GuV/CF/Bilanz) → Markt & Reputation →
Zufallsereignisse → Board-Vertrauen → KPI-Snapshot → Invarianten.

## Was Phase 1 spielerisch bietet

- **Szenario „SaaS-Übernahme mit Churn-Problem":** ~200 k€ MRR, 26 benannte
  Mitarbeitende, 4 Exec-Personas mit eigener Agenda, 5 benannte Key-Accounts,
  3 Wettbewerber, ~10 Monate Runway — und junge Kunden-Kohorten, die davonlaufen.
- **8 Entscheidungstypen** mit Sofort- und verzögerten Folgeeffekten
  (Preiserhöhung ⇒ Churn-Spike beim Renewal; Layoffs ⇒ Kündigungswelle &
  Reputationsschaden; CS-Invest ⇒ Churn-Senkung mit Anlauf …).
- **Werte sind nicht kosmetisch:** „Menschen zuerst" + harte Entlassung ⇒
  Moral-/Presse-Malus und Abwertung der Werte-Konsistenz in der Note.
- **Ereignisse** (Key-Account droht zu kündigen, Abwerbe-Offer, Outage) mit
  Optionen — Ignorieren löst nach Frist die Default-Folge aus.
- **Bewertungs-Pipeline:** Vor der Entscheidung Hypothese abgeben; 4 Wochen
  später Zahlen-Diff, Kausalkette, Prozess-Note (1–6) und Lektion.
- **Board ohne Blackbox:** Jeder Vertrauenspunkt hat eine protokollierte
  Begründung. < 40 ⇒ Abmahnung + Bewährung, < 20 ⇒ Abwahl. Cash < 0 ⇒ Insolvenz.
- **Mehrere Unternehmen** als getrennte Spielstände, Export/Import als JSON.

## Roadmap (strikt in lauffähigen Phasen)

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Engine, CompanyState, SaaS-Szenario, Dashboard+KPIs mit Formeln, Wochen-Loop, Entscheidungs-Panel, Bewertungs-Pipeline, Persistenz, Invarianten-Tests | ✅ |
| 2 | Inbox + Sekretärin/Chief-of-Staff, Kalender, Führungs-Personas (Mail/Chat), Event-Deck auf 10+ Karten (DSGVO-Breach 72h, Shitstorm, Covenant-Bruch …) | ⬜ |
| 3 | Anwalts-Chat (frei chatbar, Stundenabrechnung, permanenter Disclaimer), Board-Meetings, Presse-Modul (PM-Editor + Medienecho), Ideen-System (freie Ideen → LLM-Intent → Engine-Projekt) | ⬜ |
| 4 | Präzedenzfall-Bibliothek (100+ reale Cases, Embeddings), KI-Berater, **Was-wäre-wenn-Labor** (Fork per Event-Replay), Lern-Journal, Skill-Tree | ⬜ |
| 5 | Konkurrenz-Agenten (kontern, wildern, Partnerschafts-Mails, Übernahmeangebote), Fundraising (Term Sheets, Cap-Table live), M&A beide Richtungen | ⬜ |
| 6 | IPO + Earnings-Calls, weitere Szenarien (Produktion, E-Commerce, Gründung, Sanierung), Englisch, Tutorial-Kampagne, PDF-Berichte, Logo-Upload | ⬜ |

Das Datenmodell trägt bereits Vorbauten für spätere Phasen (Cap Table,
Covenants, Präzedenzfall-Referenzen, Persona-Gedächtnisfelder, Event-Deck-
Infrastruktur), damit keine Phase ein Schema-Rewrite braucht.

## Qualität

- **28 Tests** (`shared/test/`): Invarianten über 52 Wochen, KPI-Formeln,
  Delayed Effects, Determinismus, Golden-Master (fester Seed + Skript ⇒
  eingefrorener Endzustand als Vitest-Snapshot).
- **LLM-Verträge:** Ausgaben immer zod-validiert; bei Schema-Verletzung
  2 Retries mit Fehlerhinweis, dann regelbasierter Fallback. Response-Cache
  gegen Doppelkosten; Token-Kosten-Dashboard unter Einstellungen.
- **i18n-Grundgerüst** (`client/src/i18n.ts`): Deutsch aktiv, Englisch als
  zweite Locale vorbereitet (P6).

## Hinweis

Boardroom ist ein Trainings-Simulator. Alle Zahlen, Personen und Firmen sind
fiktiv; nichts hierin ist Rechts-, Steuer- oder Anlageberatung.
