import { create } from 'zustand';
import type { BoardThemeId, PieceStyle, PieceThemeId } from '../components/Board/themes';

export type Lang = 'en' | 'vi';

interface Settings {
  lang: Lang;
  showArrows: boolean;
  multipv: number;
  sound: boolean;
  boardTheme: BoardThemeId;
  pieceTheme: PieceThemeId;
  pieceStyle: PieceStyle;
  setLang: (l: Lang) => void;
  setShowArrows: (v: boolean) => void;
  setMultipv: (n: number) => void;
  setSound: (v: boolean) => void;
  setTheme: (t: Partial<Pick<Settings, 'boardTheme' | 'pieceTheme' | 'pieceStyle'>>) => void;
}

const KEY = 'xq_settings_v1';

function load(): Partial<Settings> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function save(s: Settings) {
  try {
    const { lang, showArrows, multipv, sound, boardTheme, pieceTheme, pieceStyle } = s;
    localStorage.setItem(KEY, JSON.stringify({ lang, showArrows, multipv, sound, boardTheme, pieceTheme, pieceStyle }));
  } catch {
    /* storage unavailable */
  }
}

const initial = load();
const browserLang: Lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('vi') ? 'vi' : 'en';

export const useSettings = create<Settings>((set, get) => ({
  lang: initial.lang ?? browserLang,
  showArrows: initial.showArrows ?? true,
  multipv: initial.multipv ?? 3,
  sound: initial.sound ?? true,
  boardTheme: initial.boardTheme ?? 'wood',
  pieceTheme: initial.pieceTheme ?? 'ivory',
  pieceStyle: initial.pieceStyle ?? '3d',
  setLang: (lang) => { set({ lang }); save(get()); },
  setShowArrows: (showArrows) => { set({ showArrows }); save(get()); },
  setMultipv: (multipv) => { set({ multipv }); save(get()); },
  setSound: (sound) => { set({ sound }); save(get()); },
  setTheme: (t) => { set(t); save(get()); },
}));
