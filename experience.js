const GUIDE_KEY = 'project-lax-guide-v2';
const SOUND_KEY = 'project-lax-sound-v1';
export const LAST_GUIDE_STEP = 3;

export function readLaunch(storage) {
  try {
    const raw = storage.getItem(GUIDE_KEY);
    if (raw === 'done') return { phase: '', step: 0 };
    if (/^[0-3]$/.test(raw || '')) return { phase: 'guide', step: Number(raw) };
  } catch { /* A blocked storage API must not trap someone in onboarding. */ }
  return { phase: 'film', step: 0 };
}

export function saveLaunch(storage, value) {
  try { storage.setItem(GUIDE_KEY, value); } catch { /* Keep the current session usable. */ }
}

export function readSound(storage) {
  try { return storage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

export function saveSound(storage, enabled) {
  try { storage.setItem(SOUND_KEY, enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
}

let audioContext;
export function playCue(enabled, kind = 'tap') {
  if (!enabled || document.hidden) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audioContext ||= new Audio();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const start = audioContext.currentTime;
    if (kind === 'tap') {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(940, start);
      oscillator.frequency.exponentialRampToValueAtTime(420, start + .065);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.20, start + .004);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .08);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + .085);
      return;
    }
    const notes = kind === 'complete' ? [[530, 0], [720, .075]] : [[490, 0]];
    for (const [frequency, offset] of notes) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start + offset);
      gain.gain.setValueAtTime(.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(.16, start + offset + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + offset + .145);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + .15);
    }
  } catch { /* Audio is optional; navigation still works. */ }
}
