/**
 * Glossar (Phase 4): Fachbegriffe jenseits der KPI-Definitionen.
 * Jeder Begriff: 2-Satz-Definition, ggf. Formel, Mini-Beispiel,
 * „für Mathematiker“-Herleitung wo sinnvoll.
 */
export interface GlossaryEntry {
  id: string;
  termDe: string;
  definitionDe: string;
  formulaDe?: string;
  exampleDe: string;
  mathDe?: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'covenant',
    termDe: 'Covenant',
    definitionDe: 'Vertragliche Auflage eines Kreditgebers (z. B. Mindestliquidität oder maximale Verschuldung relativ zum Umsatz). Bei Verletzung darf die Bank nachverhandeln, Gebühren verlangen oder den Kredit fällig stellen.',
    exampleDe: 'Dein Kreditvertrag verlangt mind. 150 k€ Kasse. Fällst du zwei Wochen darunter, ruft die Bank an — wie im Spiel.',
  },
  {
    id: 'liquidation-preference',
    termDe: 'Liquidation Preference',
    definitionDe: 'Vorrangregel im Beteiligungsvertrag: Beim Verkauf erhalten Investoren erst ihr Geld (×1, ×2 …) zurück, bevor Gründer/Mitarbeiter etwas sehen. Entscheidet bei mittelmäßigen Exits über alles.',
    formulaDe: 'Erlös an Investor = max(Investment × Faktor, Anteil × Verkaufspreis)',
    exampleDe: '1×-Preference auf 5 M€ Investment: Bei einem 8-M€-Exit gehen erst 5 M€ an den Investor — egal, wie klein sein Prozentsatz ist.',
  },
  {
    id: 'vesting',
    termDe: 'Vesting',
    definitionDe: 'Anteile werden über Zeit „verdient“ (üblich: 4 Jahre mit 1 Jahr Cliff). Wer früher geht, behält nur den bereits gevesteten Teil — schützt Firma und Mitgründer.',
    exampleDe: 'Ein Mitgründer geht nach 18 Monaten: Bei 4-Jahres-Vesting behält er 37,5 % seiner zugesagten Anteile.',
  },
  {
    id: 'term-sheet',
    termDe: 'Term Sheet',
    definitionDe: 'Unverbindliche Eckdaten-Vereinbarung einer Finanzierungsrunde: Bewertung, Anteil, Liquidation Preference, Board-Sitze, Vetorechte. Die Bewertung ist nur EINE dieser Stellschrauben — oft nicht die wichtigste.',
    exampleDe: 'Lieber 8 M€ Pre-Money mit 1×-Preference und ohne Veto-Katalog als 10 M€ mit 2× participating und Investor-Mehrheit im Board.',
  },
  {
    id: 'earn-out',
    termDe: 'Earn-Out',
    definitionDe: 'Teil des Kaufpreises bei M&A, der nur bei Erreichen künftiger Ziele fließt. Überbrückt Bewertungs-Differenzen — und ist die häufigste Streitquelle nach dem Closing.',
    exampleDe: '10 M€ sofort + 5 M€, falls der ARR in 24 Monaten 4 M€ erreicht. Wer kontrolliert nach dem Verkauf das Marketing-Budget? Genau.',
  },
  {
    id: 'dso',
    termDe: 'DSO (Days Sales Outstanding)',
    definitionDe: 'Durchschnittliche Tage von Rechnung bis Zahlungseingang. Jeder Tag DSO bindet Umsatz als Forderung — Wachstum mit hohem DSO frisst paradox Liquidität.',
    formulaDe: 'DSO = Forderungen ÷ Umsatz × 365',
    exampleDe: 'Bei 200 k€ Monatsumsatz bindet jeder zusätzliche DSO-Tag ~6,6 k€ Kasse.',
    mathDe: 'Cash-Effekt einer DSO-Änderung ΔD: ΔCash ≈ −Umsatz_täglich × ΔD. Deshalb kann ein wachsendes, profitables Unternehmen illiquide werden (Working-Capital-Falle).',
  },
  {
    id: 'deferred-revenue',
    termDe: 'Deferred Revenue',
    definitionDe: 'Erhaltene Vorauszahlungen für noch nicht erbrachte Leistung (z. B. Jahresverträge) — Cash ist da, Umsatz aber erst über die Laufzeit. Bilanz: Verbindlichkeit.',
    exampleDe: 'Ein Kunde zahlt 12 k€ fürs Jahr voraus: +12 k€ Kasse, +12 k€ Deferred; jeden Monat wandern 1 k€ in den Umsatz.',
  },
  {
    id: 'burn-multiple',
    termDe: 'Burn Multiple',
    definitionDe: 'Verbranntes Geld pro Euro Netto-Neu-ARR. Misst Wachstums-Effizienz brutaler als die Rule of 40: Unter 1,5 stark, über 3 alarmierend.',
    formulaDe: 'Burn Multiple = Netto-Burn ÷ Netto-Neu-ARR',
    exampleDe: '100 k€ Burn/Monat bei 40 k€ neuem ARR/Monat ⇒ Multiple 2,5 — jedes ARR-€ kostet 2,50 €.',
  },
  {
    id: 'unit-economics',
    termDe: 'Unit Economics',
    definitionDe: 'Ertragsrechnung pro Einheit (Kunde): Was kostet Gewinnung (CAC), was bringt die Beziehung (LTV)? Skalieren lohnt erst, wenn die Einheit profitabel ist.',
    formulaDe: 'Kern: LTV/CAC > 3 und CAC-Payback < 12–18 Monate',
    exampleDe: 'CAC 6 k€, ARPA 450 €, Marge 78 %, Churn 3 %/M ⇒ LTV ≈ 11,7 k€ ⇒ LTV/CAC ≈ 1,95 — Wachstum wäre hier noch Wertvernichtung.',
  },
  {
    id: 'cohort',
    termDe: 'Kohorte',
    definitionDe: 'Alle Kunden, die im selben Zeitraum gestartet sind, als Gruppe betrachtet. Kohortenanalyse trennt „unser Produkt wird besser“ von „wir kaufen nur schneller neue Kunden nach“.',
    exampleDe: 'Q1-Kohorte behält nach 6 Monaten 70 %, Q3-Kohorte 82 % ⇒ das Onboarding-Programm wirkt wirklich.',
  },
  {
    id: 'batna',
    termDe: 'BATNA',
    definitionDe: '„Best Alternative To a Negotiated Agreement“ — deine beste Alternative, falls die Verhandlung platzt. Wer die stärkere BATNA hat (und das weiß), verhandelt entspannter.',
    exampleDe: 'Zwei Term Sheets in der Tasche verhandeln besser als jedes Verhandlungstraining.',
  },
  {
    id: 'esop',
    termDe: 'ESOP',
    definitionDe: 'Mitarbeiterbeteiligungs-Pool (Employee Stock Option Pool), meist 10–15 % der Anteile. Investoren verlangen ihn oft VOR ihrer Runde — dann verwässert er nur die Bestandsgesellschafter.',
    exampleDe: '„10 % ESOP pre-money“ im Term Sheet heißt: Die Verwässerung zahlst du, nicht der neue Investor.',
  },
  {
    id: 'runway',
    termDe: 'Runway',
    definitionDe: 'Zeit bis zur Zahlungsunfähigkeit bei unverändertem Burn. Die wichtigste Überlebenskennzahl — Fundraising braucht selbst 6+ Monate Vorlauf.',
    formulaDe: 'Runway = Kasse ÷ Netto-Burn',
    exampleDe: 'Unter 12 Monaten Runway verhandelst du Finanzierungen aus Schwäche; unter 6 diktiert die Gegenseite.',
  },
  {
    id: 'churn-mrr',
    termDe: 'Logo- vs. Revenue-Churn',
    definitionDe: 'Logo-Churn zählt verlorene Kunden, Revenue-Churn verlorenen Umsatz. Ein Unternehmen kann viele kleine Logos verlieren und trotzdem Revenue-stabil sein — oder umgekehrt ein Großkunde reißt alles.',
    exampleDe: '5 verlorene Kleinkunden (à 450 €) tun weniger weh als ein Key-Account mit 14 k€ — HHI im Blick behalten.',
  },
  {
    id: 'adhoc',
    termDe: 'Ad-hoc-Publizität',
    definitionDe: 'Pflicht börsennotierter Unternehmen, kursrelevante Informationen unverzüglich zu veröffentlichen. Nach dem IPO gibt es keine „internen“ Hiobsbotschaften mehr.',
    exampleDe: 'Der Verlust deines größten Kunden ist dann keine Team-Info, sondern eine Pflichtmitteilung — binnen Stunden.',
  },
  {
    id: 'dpo',
    termDe: 'DPO (Days Payables Outstanding)',
    definitionDe: 'Wie lange du selbst brauchst, um Lieferanten zu bezahlen. Höherer DPO = Lieferanten finanzieren dich mit — bis zur Grenze der Beziehung.',
    formulaDe: 'DPO = Verbindlichkeiten ÷ Einkaufsvolumen × 365',
    exampleDe: 'DPO von 24 auf 45 Tage strecken bringt einmalig Liquidität — und irgendwann Vorkasse-Forderungen der Lieferanten.',
  },
  {
    id: 'bridge',
    termDe: 'Bridge-Finanzierung',
    definitionDe: 'Zwischenfinanzierung (oft Wandeldarlehen) bis zur nächsten Runde. Rettungsanker — aber ein Signal, das neue Investoren genau lesen.',
    exampleDe: 'Eine Bridge von Bestandsinvestoren mit hohem Discount schreit „die nächste Runde war nicht sicher“.',
  },
  {
    id: 'wandeldarlehen',
    termDe: 'Wandeldarlehen (Convertible)',
    definitionDe: 'Kredit, der bei der nächsten Runde in Anteile wandelt — meist mit Discount und Bewertungsdeckel (Cap). Schnell, aber die Konditionen wirken erst später sichtbar verwässernd.',
    exampleDe: '500 k€ Convertible mit 20 % Discount und 8-M€-Cap: Bei einer 12-M€-Runde wandelt der Geldgeber, als wäre die Firma nur 8 M€ wert.',
  },
  {
    id: 'nps-begriff',
    termDe: 'NPS (Net Promoter Score)',
    definitionDe: 'Weiterempfehlungs-Kennzahl: % Promotoren (9–10) minus % Detraktoren (0–6) auf die Frage „Würdest du uns empfehlen?“. Spanne −100 bis +100; im B2B-SaaS gilt >30 als stark.',
    formulaDe: 'NPS = %Promotoren − %Detraktoren',
    exampleDe: 'Von 100 Antworten: 40× 9–10, 35× 7–8, 25× 0–6 ⇒ NPS = 40 − 25 = 15.',
  },
  {
    id: 'gmv-arr',
    termDe: 'ARR vs. Umsatz',
    definitionDe: 'ARR annualisiert nur die WIEDERKEHRENDEN Verträge (Run-Rate); Umsatz nach HGB/IFRS zählt alles inkl. Einmalerlösen. Investoren bewerten SaaS auf ARR — vermischen gilt als Foul.',
    exampleDe: '„1 M€ ARR“ mit 300 k€ Einmal-Setup-Erlösen darin ist eine Due-Diligence-Zeitbombe.',
  },
];
