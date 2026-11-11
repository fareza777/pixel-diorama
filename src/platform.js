// Platform glue: persistent storage, haptics and app lifecycle through Capacitor plugins
// (all of them work offline). In a plain browser the same calls fall back to web APIs.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { App } from '@capacitor/app';

export const native = Capacitor.isNativePlatform();
const KEY = 'pixel-diorama/save/v1';
const BAK = 'pixel-diorama/save/v1.bak';

export async function loadSave() {
  const read = async (key) => {
    try {
      const { value } = await Preferences.get({ key });
      return value;
    } catch {
      return null;
    }
  };
  let primary = await read(KEY);
  let local = null;
  try {
    local = localStorage.getItem(KEY);
  } catch {
    /* private mode */
  }
  // keep whichever copy is newer, in case one write was interrupted
  const pickNewest = (...list) => {
    let best = null, bt = -1;
    for (const s of list) {
      if (!s) continue;
      try {
        const t = JSON.parse(s).saved || 0;
        if (t > bt) {
          bt = t;
          best = s;
        }
      } catch {
        /* corrupt copy */
      }
    }
    return best;
  };
  const best = pickNewest(primary, local);
  if (best) return best;
  return pickNewest(await read(BAK));
}

let writing = false;
let pending = null;
export async function writeSave(json) {
  pending = json;
  if (writing) return;
  writing = true;
  try {
    while (pending) {
      const data = pending;
      pending = null;
      try {
        localStorage.setItem(KEY, data);
      } catch {
        /* quota */
      }
      const { value: prev } = await Preferences.get({ key: KEY }).catch(() => ({ value: null }));
      if (prev) await Preferences.set({ key: BAK, value: prev }).catch(() => {});
      await Preferences.set({ key: KEY, value: data }).catch(() => {});
    }
  } finally {
    writing = false;
  }
}

export async function wipeSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  await Preferences.remove({ key: KEY }).catch(() => {});
  await Preferences.remove({ key: BAK }).catch(() => {});
}

let hapticsOn = true;
export function setHaptics(on) {
  hapticsOn = on;
}
export function buzz(kind = 'light') {
  if (!hapticsOn || !native) return;
  const style = kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
  Haptics.impact({ style }).catch(() => {});
}

export function onLifecycle({ pause, resume, back }) {
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  window.addEventListener('pagehide', pause);
  if (native) {
    App.addListener('pause', pause);
    App.addListener('resume', resume);
    App.addListener('backButton', back);
  }
}

export function exitApp() {
  if (native) App.exitApp();
}
