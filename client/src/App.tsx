import { useStore } from './store.js';
import { Layout } from './components/Layout.js';
import { SavesView } from './views/SavesView.js';
import { WizardView } from './views/WizardView.js';
import { DashboardView } from './views/DashboardView.js';
import { DecisionsView } from './views/DecisionsView.js';
import { EvaluationsView } from './views/EvaluationsView.js';
import { FinanceView } from './views/FinanceView.js';
import { TeamView } from './views/TeamView.js';
import { CustomersView } from './views/CustomersView.js';
import { MarketView } from './views/MarketView.js';
import { SettingsView } from './views/SettingsView.js';
import { WeekReportModal } from './views/WeekReportModal.js';

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
      {view === 'decisions' && <DecisionsView />}
      {view === 'evaluations' && <EvaluationsView />}
      {view === 'finance' && <FinanceView />}
      {view === 'team' && <TeamView />}
      {view === 'customers' && <CustomersView />}
      {view === 'market' && <MarketView />}
      {view === 'settings' && <SettingsView />}
      <WeekReportModal />
    </Layout>
  );
}
