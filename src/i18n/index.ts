import { useCallback } from 'react';
import { useSettings, type Lang } from '../store/settingsStore';
import type { PieceType } from '../xiangqi/types';
import { en } from './en';
import { vi } from './vi';

export type MessageKey = keyof typeof en;
/** A param that is rendered as a localized piece name. */
export interface PieceParam {
  p: PieceType;
}
export type Param = string | number | PieceParam;
export type Params = Record<string, Param>;

/** A translatable message; analysis modules return these so text follows the language toggle. */
export interface Msg {
  key: MessageKey;
  params?: Params;
}

const dicts: Record<Lang, Record<MessageKey, string>> = { en, vi };

export function pieceName(lang: Lang, p: PieceType): string {
  return dicts[lang][`piece.${p}` as MessageKey];
}

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const template = dicts[lang][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined) return `{${name}}`;
    if (typeof v === 'object') return pieceName(lang, v.p);
    return String(v);
  });
}

export function useT() {
  const lang = useSettings((s) => s.lang);
  return useCallback(
    (key: MessageKey | Msg, params?: Params) =>
      typeof key === 'string' ? translate(lang, key, params) : translate(lang, key.key, key.params),
    [lang],
  );
}
