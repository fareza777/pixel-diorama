// Cinematic intro (v1.3): the island itself is the film set. Camera moves, time of day and weather
// follow each line of the story; subtitles, a handwritten letter and letterbox bars sit on top, with
// the narrated voice (public/vo/*.mp3) and the island's own ambience (waves, wind, birds). No music.
// Skippable at any time. Also plays single narrated lines for the story chapters (voice()).
import * as THREE from 'three';
import { INTRO, STORY_TITLE } from '../game/story.js';
import { tileCenter } from '../game/island.js';

// az/el in degrees, zoom, drift: degrees of turn over the shot, dz: zoom change, off: target offset [x, y, z]
const SHOTS = {
  high: { az: 15, el: 55, zoom: 0.48, drift: 16, dz: 0.06, off: [0, 0, 0] },
  sweep: { az: 95, el: 32, zoom: 0.72, drift: 34, dz: 0.12, off: [2, 0, -2] },
  shore: { az: 205, el: 20, zoom: 1.3, drift: 12, dz: 0.15, off: [3, 0, 5] },
  plaza: { az: 228, el: 30, zoom: 1.75, drift: 9, dz: 0.18, off: [0.5, 0.3, 1.5] },
  rise: { az: 245, el: 30, zoom: 1.45, drift: 26, dz: -0.85, off: [0.5, 0.4, 1.5] },
};
const MOODS = {
  night: { hour: 22.5, weather: 'clear' },
  storm: { hour: 16.5, weather: 'storm' },
  dawn: { hour: 6.1, weather: 'clear' },
  day: { hour: 9.5, weather: 'clear' },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Play one narrated line (chapter cards). Returns the Audio element or null. */
export function voice(app, id) {
  const S = app.game.s.settings;
  if (!S.sound || S.voice === false) return null;
  try {
    const a = new Audio(`./vo/${id}.mp3`);
    a.volume = Math.min(1, (S.volume ?? 0.7) * 1.25);
    a.play().catch(() => {});
    return a;
  } catch {
    return null;
  }
}

export class Cinematic {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.hour = 10;
    this.weather = 'clear';
  }

  /** Play the intro film; onDone runs after the last card (or after Skip). */
  play(onDone) {
    if (this.active) return;
    this.active = true;
    this.onDone = onDone;
    this.i = -1;
    this.t = 0;
    document.body.classList.add('cine');
    const el = (this.el = document.createElement('div'));
    el.id = 'cine';
    el.innerHTML = `<i class="bar top"></i><i class="bar bot"></i><div class="cine-sub"></div><div class="cine-letter"></div>
      <div class="cine-title"><b>PIXEL DIORAMA</b><span>${esc(STORY_TITLE)}</span></div><div class="cine-black on"></div>
      <button class="cine-skip">Skip &rsaquo;</button>`;
    document.body.appendChild(el);
    el.querySelector('.cine-skip').addEventListener('click', () => this.finish());
    const I = this.app.game.I;
    const [x, z] = tileCenter(I.plaza.i, I.plaza.j);
    this.center = new THREE.Vector3(x, 0.6, z);
    setTimeout(() => this.next(), 700);
  }

  next() {
    if (!this.active) return;
    this.i++;
    clearTimeout(this._timer);
    this.audio?.pause();
    const L = INTRO[this.i];
    if (!L) return this.titleCard();
    const shot = SHOTS[L.shot] || SHOTS.high, mood = MOODS[L.mood] || MOODS.day;
    this.shot = shot;
    this.t = 0;
    this.hour = mood.hour;
    this.weather = mood.weather;
    const target = this.center.clone().add(new THREE.Vector3(...shot.off));
    this.app.cam.set({ az: shot.az, el: shot.el, zoom: shot.zoom, target });
    this.el.querySelector('.cine-black').classList.remove('on');
    const sub = this.el.querySelector('.cine-sub'), letter = this.el.querySelector('.cine-letter');
    sub.classList.remove('on');
    letter.classList.remove('on');
    setTimeout(() => {
      if (!this.active) return;
      if (L.letter) {
        letter.innerHTML = `<p>${esc(L.text).replace('Ellie, the old harbour master.', '</p><p class="sign">Ellie, the old harbour master</p>')}</p>`;
        letter.classList.add('on');
      } else {
        sub.textContent = L.text;
        sub.classList.add('on');
      }
    }, 250);
    // advance when the voice ends; without sound, after a reading pause based on the text length
    const reading = Math.max(4200, L.text.length * 62);
    this.audio = voice(this.app, L.vo);
    if (this.audio) {
      this.audio.addEventListener('ended', () => (this._timer = setTimeout(() => this.next(), 900)));
      this.audio.addEventListener('error', () => (this._timer = setTimeout(() => this.next(), reading)));
      this._timer = setTimeout(() => this.next(), reading + 9000); // safety net
    } else this._timer = setTimeout(() => this.next(), reading);
  }

  titleCard() {
    this.el.querySelector('.cine-sub').classList.remove('on');
    this.el.querySelector('.cine-letter').classList.remove('on');
    this.el.querySelector('.cine-title').classList.add('on');
    this.app.audio.play('quest');
    this._timer = setTimeout(() => this.finish(), 3200);
  }

  /** Called every frame by the app while active: slow camera drift and zoom through the shot. */
  update(dt) {
    if (!this.active || !this.shot) return;
    this.t += dt;
    const k = Math.min(1, this.t / 9);
    const ease = k * k * (3 - 2 * k);
    const g = this.app.cam.goal;
    g.az = this.shot.az + this.shot.drift * ease;
    g.zoom = Math.max(0.4, this.shot.zoom + this.shot.dz * ease);
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this._timer);
    this.audio?.pause();
    const el = this.el;
    el.querySelector('.cine-black').classList.add('on');
    setTimeout(() => {
      el.classList.add('out');
      document.body.classList.remove('cine');
      this.onDone?.();
      setTimeout(() => el.remove(), 700);
    }, 450);
  }
}
