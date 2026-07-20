import PDFDocument from 'pdfkit';
import type { CompanyState, WeekReport } from '@boardroom/shared';
import { getDb } from './db.js';

/**
 * PDF-Quartalsbericht (Phase 6). Reines Reporting über den deterministischen
 * State + Wochenberichte — kein LLM. Standard-Helvetica (WinAnsi) rendert
 * Umlaute & €-Zeichen; Emojis bewusst vermieden.
 */

const NUM = (v: number, digits = 0) =>
  v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const EUR = (v: number) => `${NUM(Math.round(v))} €`;
const K = (v: number) => `${NUM(Math.round(v / 1000))} k€`;

export function getLogo(gameId: string): string | null {
  const row = getDb().prepare('SELECT data_url FROM logos WHERE game_id = ?').get(gameId) as { data_url: string } | undefined;
  return row?.data_url ?? null;
}

export function saveLogo(gameId: string, dataUrl: string): void {
  getDb().prepare('INSERT OR REPLACE INTO logos (game_id, data_url) VALUES (?, ?)').run(gameId, dataUrl);
}

function loadReports(gameId: string, fromWeek: number, toWeek: number): WeekReport[] {
  const rows = getDb()
    .prepare('SELECT report FROM week_reports WHERE game_id = ? AND week >= ? AND week < ? ORDER BY week')
    .all(gameId, fromWeek, toWeek) as { report: string }[];
  return rows.map((r) => JSON.parse(r.report) as WeekReport);
}

/** Baut den Quartalsbericht als PDF-Buffer (letzte 13 abgeschlossene Wochen). */
export async function quarterlyReportPdf(state: CompanyState): Promise<Buffer> {
  const gameId = state.meta.gameId;
  const toWeek = state.meta.week; // exklusiv: alles bis zur aktuellen Woche
  const fromWeek = Math.max(0, toWeek - 13);
  const reports = loadReports(gameId, fromWeek, toWeek);
  const logo = getLogo(gameId);

  const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 60, left: 54, right: 54 }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const accent = state.identity.logoColor || '#2563eb';
  const W = doc.page.width - 108;

  // ── Kopf ────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 6).fill(accent);
  let logoDrawn = false;
  if (logo?.startsWith('data:image/')) {
    try {
      const b64 = logo.slice(logo.indexOf(',') + 1);
      doc.image(Buffer.from(b64, 'base64'), 54, 34, { fit: [56, 56] });
      logoDrawn = true;
    } catch {
      /* defektes Bild ignorieren */
    }
  }
  if (!logoDrawn) {
    doc.save().roundedRect(54, 34, 56, 56, 8).fill(accent);
    doc
      .fill('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(state.identity.companyName.slice(0, 2).toUpperCase(), 54, 52, { width: 56, align: 'center' });
    doc.restore();
  }
  doc.fill('#111').font('Helvetica-Bold').fontSize(20).text(state.identity.companyName, 124, 38);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fill('#444')
    .text(`Quartalsbericht · Woche ${fromWeek}–${toWeek - 1} · Szenario: ${state.meta.scenarioId === 'distressed' ? 'Sanierungsfall' : 'SaaS-Turnaround'} · Schwierigkeit: ${state.meta.difficulty}`, 124, 64)
    .text(`Motto: „${state.identity.motto}"`, 124, 78);
  doc.moveTo(54, 104).lineTo(54 + W, 104).lineWidth(0.5).stroke('#bbb');

  let y = 118;
  const section = (title: string) => {
    doc.font('Helvetica-Bold').fontSize(12).fill(accent).text(title.toUpperCase(), 54, y);
    y += 18;
  };
  const line = (label: string, value: string, bold = false) => {
    doc.font('Helvetica').fontSize(9.5).fill('#333').text(label, 54, y, { width: W * 0.55 });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fill('#111').text(value, 54 + W * 0.55, y, { width: W * 0.45, align: 'right' });
    y += 14;
  };
  const ensureSpace = (needed: number) => {
    if (y + needed > doc.page.height - 70) {
      doc.addPage();
      y = 60;
    }
  };

  // ── Kennzahlen ─────────────────────────────────────────────────────
  const first = reports[0];
  const last = reports[reports.length - 1];
  const kFirst = first?.kpis.values;
  const kLast = last?.kpis.values ?? state.history[state.history.length - 1]?.values;
  section('Kennzahlen im Quartal');
  if (kFirst && kLast) {
    const delta = (a: number, b: number) => `${b >= a ? '+' : ''}${NUM(b - a)}`;
    line('MRR (Start » Ende)', `${EUR(kFirst.mrr)}  »  ${EUR(kLast.mrr)}   (${delta(kFirst.mrr, kLast.mrr)} €)`, true);
    line('Kunden (Logos)', `${NUM(kFirst.customers)}  »  ${NUM(kLast.customers)}`);
    line('Logo-Churn (Monatsrate, Ende)', `${NUM(kLast.logoChurnMonthly * 100, 2)} %`);
    line('Kasse (Ende)', EUR(last ? last.balanceSheet.assets.cash : state.finance.cash), true);
    line('Runway (Ende)', `${NUM(kLast.runwayWeeks)} Wochen`);
    line('Netto-Burn (Ende, monatlich)', EUR(kLast.netBurnMonthly));
    line('Team-Zufriedenheit (Ende)', `${NUM(kLast.avgSatisfaction)}/100`);
    line('Board-Vertrauen (Ende)', `${NUM(kLast.boardTrust)}/100`);
    if (state.ipo.status === 'public' && state.ipo.sharePrice !== null) {
      line('Aktienkurs (Ende)', `${state.ipo.sharePrice.toFixed(2)} € (Ausgabepreis ${state.ipo.offerPrice?.toFixed(2)} €)`, true);
    }
  } else {
    doc.font('Helvetica').fontSize(9.5).fill('#333').text('Noch keine abgeschlossenen Wochen im Berichtszeitraum.', 54, y);
    y += 16;
  }
  y += 8;

  // ── GuV aggregiert ─────────────────────────────────────────────────
  ensureSpace(180);
  section('Gewinn- und Verlustrechnung (Summe Quartal)');
  if (reports.length > 0) {
    const sum = (f: (r: WeekReport) => number) => reports.reduce((s, r) => s + f(r), 0);
    const rev = sum((r) => r.incomeStatement.revenue);
    const cogs = sum((r) => r.incomeStatement.cogs);
    const opex = sum((r) => r.incomeStatement.opexTotal);
    const ebitda = sum((r) => r.incomeStatement.ebitda);
    const oneOffs = sum((r) => r.incomeStatement.oneOffs);
    const interest = sum((r) => r.incomeStatement.interest);
    const tax = sum((r) => r.incomeStatement.tax);
    const net = sum((r) => r.incomeStatement.netIncome);
    line('Umsatzerlöse', K(rev), true);
    line('Umsatzkosten (COGS)', '-' + K(cogs));
    line('Rohertrag', K(rev - cogs));
    line('Betriebsausgaben (OpEx)', '-' + K(opex));
    line('EBITDA', K(ebitda), true);
    line('Einmaleffekte (Abfindungen, Deals, Bußgelder …)', (oneOffs >= 0 ? '-' : '+') + K(Math.abs(oneOffs)));
    line('Zinsergebnis', '-' + K(interest));
    line('Steuern', '-' + K(tax));
    line('Periodenergebnis', K(net), true);
    const cffEquity = sum((r) => r.cashFlow.financing.equityRaised ?? 0);
    if (cffEquity > 0) line('Nachrichtlich: Eigenkapitalzuflüsse (CFF)', K(cffEquity));
  }
  y += 8;

  // ── Entscheidungen des Quartals ────────────────────────────────────
  ensureSpace(80);
  section('Entscheidungen & Prozess-Noten');
  const decisions = state.decisionLog.filter((d) => d.week >= fromWeek && d.week < toWeek);
  if (decisions.length === 0) {
    doc.font('Helvetica').fontSize(9.5).fill('#333').text('Keine Entscheidungen im Berichtszeitraum — auch das ist eine Entscheidung.', 54, y);
    y += 16;
  }
  for (const d of decisions.slice(0, 14)) {
    ensureSpace(30);
    const ev = state.evaluations.find((e) => e.decisionId === d.id);
    const grade = ev ? `Note ${ev.grade.overall}` : 'Bewertung ausstehend';
    doc.font('Helvetica-Bold').fontSize(9.5).fill('#111').text(`W${d.week} · ${d.summaryDe}`, 54, y, { width: W * 0.8 });
    doc.font('Helvetica').fontSize(9.5).fill(ev && ev.grade.overall <= 2 ? '#15803d' : ev && ev.grade.overall >= 5 ? '#b91c1c' : '#444').text(grade, 54 + W * 0.8, y, { width: W * 0.2, align: 'right' });
    y = doc.y + 4;
  }
  y += 6;

  // ── Lektionen ──────────────────────────────────────────────────────
  ensureSpace(80);
  section('Lektionen des Quartals');
  const lessons = state.evaluations.filter((e) => e.week >= fromWeek && e.week < toWeek).map((e) => e.lessonDe);
  if (lessons.length === 0) {
    doc.font('Helvetica').fontSize(9.5).fill('#333').text('Noch keine ausgewerteten Entscheidungen im Zeitraum.', 54, y);
    y += 16;
  }
  for (const l of lessons.slice(0, 6)) {
    ensureSpace(26);
    doc.font('Helvetica').fontSize(9.5).fill('#333').text('•  ' + l, 54, y, { width: W });
    y = doc.y + 4;
  }

  // ── Wichtige Ereignisse ────────────────────────────────────────────
  const highlights = reports
    .flatMap((r) => r.occurrences.filter((o) => o.severity === 'bad' || o.severity === 'good').map((o) => ({ week: r.week, o })))
    .slice(-10);
  if (highlights.length > 0) {
    ensureSpace(60);
    y += 6;
    section('Wichtige Ereignisse');
    for (const h of highlights) {
      ensureSpace(26);
      doc.font('Helvetica').fontSize(9).fill(h.o.severity === 'bad' ? '#b91c1c' : '#15803d').text(`W${h.week}  ${h.o.textDe.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()}`, 54, y, { width: W });
      y = doc.y + 3;
    }
  }

  // ── Fußzeile auf allen Seiten ──────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const keepMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // Fußzeile darf keinen Seitenumbruch auslösen
    doc
      .font('Helvetica')
      .fontSize(7)
      .fill('#888')
      .text(
        `Boardroom-Simulation · ${gameId} · Seed ${state.meta.seed} · S. ${i + 1}/${range.count} · Trainingsbericht, kein echtes Finanzdokument`,
        54,
        doc.page.height - 38,
        { width: W, align: 'center', lineBreak: false },
      );
    doc.page.margins.bottom = keepMargin;
  }
  doc.end();
  return done;
}
