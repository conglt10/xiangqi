import { AnalysisPage } from './pages/AnalysisPage';
import { PlayCoachPage } from './pages/PlayCoachPage';
import { ReviewPage } from './pages/ReviewPage';
import { EngineStatus } from './components/EngineStatus';
import { ThemePicker } from './components/ThemePicker';
import { useT } from './i18n';
import { useNav, type Tab } from './store/navStore';
import { useSettings } from './store/settingsStore';
import { useEngineState } from './hooks/useEngine';
import { useHeaderHeightVar } from './hooks/useHeaderHeightVar';
import styles from './App.module.css';

const TABS: { id: Tab; key: 'tab.analysis' | 'tab.coach' | 'tab.review' }[] = [
  { id: 'analysis', key: 'tab.analysis' },
  { id: 'coach', key: 'tab.coach' },
  { id: 'review', key: 'tab.review' },
];

export function App() {
  const t = useT();
  const { tab, setTab } = useNav();
  const { lang, setLang, sound, setSound } = useSettings();
  const { state, error } = useEngineState();
  const headerRef = useHeaderHeightVar();
  return (
    <div className={styles.app}>
      <header className={styles.header} ref={headerRef}>
        <div className={styles.brand}>
          <span className={styles.logo}>帥</span>
          <span>{t('app.title')}</span>
        </div>
        <nav className={styles.tabs}>
          {TABS.map((x) => (
            <button key={x.id} className={`${styles.tab} ${tab === x.id ? styles.tabActive : ''}`} onClick={() => setTab(x.id)}>
              {t(x.key)}
            </button>
          ))}
        </nav>
        <div className={styles.right}>
          <EngineStatus />
          <ThemePicker />
          <button className={styles.iconBtn} onClick={() => setSound(!sound)} title={t(sound ? 'sound.mute' : 'sound.unmute')} aria-label={t(sound ? 'sound.mute' : 'sound.unmute')}>
            {sound ? '🔊' : '🔇'}
          </button>
          <div className={styles.lang}>
            {(['en', 'vi'] as const).map((l) => (
              <button key={l} className={lang === l ? styles.langActive : ''} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>
      {(state === 'unsupported' || state === 'error') && (
        <div className={styles.banner}>
          {t(state === 'unsupported' ? 'engine.unsupportedLong' : 'engine.errorLong')} <span className="dim">{error}</span>
        </div>
      )}
      <main>
        {tab === 'analysis' && <AnalysisPage />}
        {tab === 'coach' && <PlayCoachPage />}
        {tab === 'review' && <ReviewPage />}
      </main>
    </div>
  );
}
