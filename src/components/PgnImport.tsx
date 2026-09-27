import { useState } from 'react';
import { parsePgn } from '../xiangqi';
import { useT } from '../i18n';
import styles from '../pages/pages.module.css';

export interface ImportedGame {
  startFen: string;
  moves: string[];
  headers: Record<string, string>;
}

/** Paste or open a xiangqi PGN (WXF, Chinese or ICCS move text). */
export function PgnImport({ onLoad, compact }: { onLoad: (g: ImportedGame) => void; compact?: boolean }) {
  const t = useT();
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const load = (src: string) => {
    const r = parsePgn(src);
    if (!r.moves.length) {
      setError(r.error ? t('pgn.errorAt', { ply: r.error.ply, token: r.error.token }) : t('pgn.empty'));
      return;
    }
    setError(r.error ? t('pgn.partial', { n: r.moves.length, token: r.error.token }) : '');
    onLoad({ startFen: r.startFen, moves: r.moves, headers: r.headers });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const buf = await f.arrayBuffer();
    // Many Chinese PGN files are GB18030-encoded; fall back when UTF-8 decoding fails.
    let src: string;
    try {
      src = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      src = new TextDecoder('gb18030').decode(buf);
    }
    setText(src);
    load(src);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>{t('pgn.title')}</div>
      <textarea rows={compact ? 4 : 7} value={text} placeholder={t('pgn.placeholder')} onChange={(e) => setText(e.target.value)} />
      <div className={styles.row}>
        <button className="primary" onClick={() => load(text)} disabled={!text.trim()}>
          {t('pgn.load')}
        </button>
        <label className={styles.hint}>
          <input type="file" accept=".pgn,.txt" onChange={(e) => onFile(e.target.files?.[0])} style={{ maxWidth: 190 }} />
        </label>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
