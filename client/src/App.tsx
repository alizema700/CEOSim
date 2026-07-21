import { useStore } from './store.js';
import { Layout } from './components/Layout.js';
import { SavesView } from './views/SavesView.js';
import { WizardView } from './views/WizardView.js';
import { DashboardView } from './views/DashboardView.js';
import { DecisionsView } from './views/DecisionsView.js';
import { EvaluationsView } from './views/EvaluationsView.js';
import { FinanceView } from './views/FinanceView.js';
import { StructureView } from './views/StructureView.js';
import { CeoView } from './views/CeoView.js';
import { TeamView } from './views/TeamView.js';
import { CustomersView } from './views/CustomersView.js';
import { MarketView } from './views/MarketView.js';
import { SettingsView } from './views/SettingsView.js';
import { WeekReportModal } from './views/WeekReportModal.js';
import { InboxView } from './views/InboxView.js';
import { ChatView } from './views/ChatView.js';
import { CalendarView } from './views/CalendarView.js';
import { ProductView } from './views/ProductView.js';
import { LegalView } from './views/LegalView.js';
import { PressView } from './views/PressView.js';
import { StrategyView } from './views/StrategyView.js';
import { BoerseView } from './views/BoerseView.js';
import { LearnView } from './views/LearnView.js';
import { LegacyModal } from './views/LegacyModal.js';
import { TakeoverModal } from './views/TakeoverModal.js';
import { Modal } from './components/ui.js';

export function App() {
  const { view, state, error, setError } = useStore();

  if (!state) {
    return view === 'wizard' ? <WizardView /> : <SavesView />;
  }

  return (
    <Layout>
      {error && (
        <div className="panel mb-4 flex items-center justify-between border-bad/60 px-3 py-2 text-xs text-bad">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {view === 'dashboard' && <DashboardView />}
      {view === 'inbox' && <InboxView />}
      {view === 'chat' && <ChatView />}
      {view === 'calendar' && <CalendarView />}
      {view === 'decisions' && <DecisionsView />}
      {view === 'evaluations' && <EvaluationsView />}
      {view === 'finance' && <FinanceView />}
      {view === 'structure' && <StructureView />}
      {view === 'ceo' && <CeoView />}
      {view === 'team' && <TeamView />}
      {view === 'customers' && <CustomersView />}
      {view === 'product' && <ProductView />}
      {view === 'market' && <MarketView />}
      {view === 'legal' && <LegalView />}
      {view === 'press' && <PressView />}
      {view === 'strategy' && <StrategyView />}
      {view === 'boerse' && <BoerseView />}
      {view === 'learn' && <LearnView />}
      {view === 'settings' && <SettingsView />}
      <TakeoverModal />
      <LegacyModal />
      <WeekReportModal />
      <BriefingModal />
    </Layout>
  );
}

/** Login-Begrüßung: Das aktuelle Briefing der Sekretärin (einmal pro Besuch). */
function BriefingModal() {
  const { state, showBriefing, dismissBriefing, setView, markMessage } = useStore();
  if (!state || !showBriefing) return null;
  const briefing = [...state.comms.messages].reverse().find((m) => m.kind === 'briefing');
  if (!briefing) return null;
  const close = () => {
    void markMessage(briefing.id, 'read');
    dismissBriefing();
  };
  return (
    <Modal title={`${briefing.from.name} · ${briefing.from.roleDe}`} onClose={close}>
      <div className="mb-1 text-sm font-bold">{briefing.subjectDe}</div>
      <p className="whitespace-pre-wrap text-xs leading-relaxed">{briefing.bodyDe}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          className="btn"
          onClick={() => {
            close();
            setView('inbox');
          }}
        >
          ✉ Zur Inbox
        </button>
        <button className="btn-primary" onClick={close}>
          Danke, los geht’s
        </button>
      </div>
    </Modal>
  );
}
