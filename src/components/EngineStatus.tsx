import { useEngineState } from '../hooks/useEngine';
import { useT } from '../i18n';
import styles from './components.module.css';

export function EngineStatus() {
  const t = useT();
  const { state, progress, error, threads } = useEngineState();
  if (state === 'ready') return <span className={styles.engineOk} title={t('engine.threads', { n: threads })}>● Pikafish</span>;
  if (state === 'loading') {
    const pct = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;
    return (
      <span className={styles.engineLoading}>
        {t('engine.loading')} {pct ? `${pct}%` : ''}
        <span className={styles.progress}><span style={{ width: `${pct}%` }} /></span>
      </span>
    );
  }
  if (state === 'unsupported') return <span className={styles.engineErr} title={error}>{t('engine.unsupported')}</span>;
  if (state === 'error') return <span className={styles.engineErr} title={error}>{t('engine.error')}</span>;
  return <span className={styles.engineLoading}>{t('engine.idle')}</span>;
}
