// Game sounds from src/sounds/, played through the Web Audio API (decoded once,
// low latency, overlapping playback). Falls back to <audio> if decoding fails.
import moveUrl from './sounds/move.mp3';
import captureUrl from './sounds/capture.mp3';
import notifyUrl from './sounds/chat-mention.mp3';
import gongUrl from './sounds/gong-game-start-end.mp3';
import { useSettings } from './store/settingsStore';

export type GameSound = 'move' | 'capture' | 'check' | 'notify' | 'gameStart' | 'gameEnd';

type Sample = 'move' | 'capture' | 'notify' | 'gong';
const URLS: Record<Sample, string> = { move: moveUrl, capture: captureUrl, notify: notifyUrl, gong: gongUrl };

let ctx: AudioContext | null = null;
const buffers: Partial<Record<Sample, AudioBuffer>> = {};
const loading: Partial<Record<Sample, Promise<AudioBuffer | null>>> = {};

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function load(name: Sample): Promise<AudioBuffer | null> {
  const ac = audio();
  if (!ac) return Promise.resolve(null);
  loading[name] ??= fetch(URLS[name])
    .then((r) => r.arrayBuffer())
    .then((b) => ac.decodeAudioData(b))
    .then((buf) => (buffers[name] = buf))
    .catch(() => null);
  return loading[name]!;
}

/** Starts decoding all samples so the first move doesn't lag. Safe to call repeatedly. */
export function preloadSounds() {
  (Object.keys(URLS) as Sample[]).forEach((s) => void load(s));
}

function play(name: Sample, { delay = 0, volume = 1, rate = 1 } = {}) {
  const ac = audio();
  const buf = buffers[name];
  if (!ac || !buf) {
    // Not decoded yet (or no Web Audio): play via an <audio> element instead.
    void load(name);
    const el = new Audio(URLS[name]);
    el.volume = Math.min(1, volume);
    el.playbackRate = rate;
    setTimeout(() => el.play().catch(() => {}), delay * 1000);
    return;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ac.createGain();
  g.gain.value = volume;
  src.connect(g).connect(ac.destination);
  src.start(ac.currentTime + delay);
}

export function playSound(kind: GameSound) {
  if (!useSettings.getState().sound) return;
  switch (kind) {
    case 'move':
      play('move');
      break;
    case 'capture':
      play('capture');
      break;
    case 'check':
      play('move');
      play('notify', { delay: 0.08, volume: 0.8 });
      break;
    case 'notify':
      play('notify', { volume: 0.8 });
      break;
    case 'gameStart':
    case 'gameEnd':
      play('gong', { volume: 0.6 });
      break;
  }
}
