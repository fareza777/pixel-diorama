// v1.3 UI, mixed into UI: the Grand Projects tab and the Harbor's merchant ship (both in the Town
// panel), hazard notes for the event card and villager skill stars.
import { icon } from './icons.js';
import { RES, BIOMES, BUILDINGS } from '../game/data.js';
import { PROJECTS, PROJECTS_UNLOCK, voyageCargo, SKILL_MAX } from '../game/frontier.js';
import { buzz } from '../platform.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clock = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const VOYAGE_STEPS = [20, 50, 100, 200];

export const FrontierUIMixin = {
  // ---------------- Grand Projects

  _projectsHTML() {
    const g = this.game;
    if (!g.projectsUnlocked()) return `<div class="empty">${icon('build', 'xl')}<p>Grand Projects open at level ${PROJECTS_UNLOCK}.<br>Huge works that help every island at once.</p></div>`;
    const rows = PROJECTS.map((P) => {
      const n = g.projectStage(P.id), max = P.stages.length;
      const pips = P.stages.map((_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('');
      const foot = n >= max
        ? `<span class="pill on">${icon('check')} Complete</span>`
        : `<div class="costs">${this.costHTML(P.stages[n].cost)}</div><button class="btn primary sm" data-act="project-build" data-arg="${P.id}" ${g.has(P.stages[n].cost) ? '' : 'disabled'}>${icon('build')} Build stage ${n + 1}</button>`;
      return `<div class="project ${n >= max ? 'done' : ''}">${icon(P.icon, 'lg')}<div class="grow"><b>${esc(P.name)} <span class="pips">${pips}</span></b><p>${esc(P.desc)}</p>${foot}</div></div>`;
    }).join('');
    return `<p class="muted">${icon('info')} Each stage adds a permanent bonus for all islands.</p>${rows}`;
  },

  // ---------------- merchant ship (top of the Orders tab)

  _shipHTML() {
    const g = this.game, from = g.biome;
    if (!g.harborIslands().includes(from)) {
      const any = g.harborIslands().length;
      return `<div class="ship idle">${icon('compass', 'lg')}<div class="grow"><b>Merchant Ship</b><p class="muted">${any ? 'This island has no Harbor yet.' : `Build a Harbor (level ${BUILDINGS.pelabuhan.unlock}) to send ships to your other islands.`}</p></div></div>`;
    }
    const v = g.voyageFrom(from);
    if (v) {
      const left = (v.end - Date.now()) / 1000;
      const back = `<div class="costs">${this.costHTML(v.ret, 1, true)}</div>`;
      return left <= 0
        ? `<div class="ship ready">${icon('compass', 'lg')}<div class="grow"><b>The ship is back from ${esc(BIOMES[v.to].short)}!</b>${back}</div><button class="btn primary sm" data-act="voyage-claim">${icon('check')} Unload</button></div>`
        : `<div class="ship">${icon('compass', 'lg')}<div class="grow"><b>Sailing to ${esc(BIOMES[v.to].short)}</b><p class="muted">${v.n} ${esc(RES[v.r].name)} on board · back in ${clock(left)}</p>${back}</div></div>`;
    }
    const dests = g.voyageDests(from);
    if (!dests.length) return `<div class="ship idle">${icon('compass', 'lg')}<div class="grow"><b>Merchant Ship</b><p class="muted">Unlock another island to start trading by sea.</p></div></div>`;
    this._vTo = dests.includes(this._vTo) ? this._vTo : dests[0];
    const cargo = voyageCargo().filter((r) => (g.s.res[r] || 0) >= VOYAGE_STEPS[0]);
    this._vR = cargo.includes(this._vR) ? this._vR : cargo[0];
    const n = this._vN || VOYAGE_STEPS[1];
    const destBtns = dests.map((d) => `<button class="seg ${d === this._vTo ? 'on' : ''}" data-act="voyage-to" data-arg="${d}">${esc(BIOMES[d].short)}</button>`).join('');
    if (!this._vR) return `<div class="ship idle">${icon('compass', 'lg')}<div class="grow"><b>Merchant Ship</b><p class="muted">Collect at least ${VOYAGE_STEPS[0]} of a trade good to load the ship.</p></div></div>`;
    const cargoBtns = cargo.map((r) => `<button class="seg ${r === this._vR ? 'on' : ''}" data-act="voyage-r" data-arg="${r}">${icon(RES[r].icon)}</button>`).join('');
    const nBtns = VOYAGE_STEPS.map((k) => `<button class="seg ${k === n ? 'on' : ''}" data-act="voyage-n" data-arg="${k}" ${(g.s.res[this._vR] || 0) < k ? 'disabled' : ''}>${k}</button>`).join('');
    const ret = g.voyageReturn(this._vTo, this._vR, n);
    return `<div class="ship plan">${icon('compass', 'lg')}<div class="grow"><b>Merchant Ship</b><p class="muted">Ship goods to another island. It comes back with coins and that island's goods.</p>
      <div class="segs">${destBtns}</div><div class="segs">${cargoBtns}</div><div class="segs">${nBtns}</div>
      <div class="costs">${icon('gift')} ${this.costHTML(ret, 1, true)}</div>
      <button class="btn primary sm" data-act="voyage-go" ${(g.s.res[this._vR] || 0) >= n ? '' : 'disabled'}>${icon('compass')} Set sail · ${clock(g.voyageMinutes(this._vTo) * 60)}</button></div></div>`;
  },

  // ---------------- hazard note on the event card, skill stars

  hazardNote(ev, def) {
    if (!def.counter) return '';
    if (ev.guarded) return `<p class="good">${icon('check')} ${esc(def.guardText)}</p>`;
    return `<p class="muted">${icon('info')} A ${esc(BUILDINGS[def.counter].name)} on this island would protect it from this.</p>`;
  },
  skillStars(p) {
    const n = this.game.skillOf(p);
    return `<span class="skill" title="Work skill: +${n * 6}% output">${'★'.repeat(n)}<i>${'★'.repeat(SKILL_MAX - n)}</i></span>`;
  },

  // ---------------- actions

  _frontierClick(act, arg) {
    const g = this.game;
    switch (act) {
      case 'project-build': {
        const r = g.buildProject(arg);
        if (!r.ok) {
          this.sfx('error');
          this.toast(r.reason, { kind: 'warn' });
        } else buzz('heavy');
        this.openTown('projects');
        return true;
      }
      case 'voyage-to': this._vTo = arg; this.openTown('orders'); return true;
      case 'voyage-r': this._vR = arg; this.openTown('orders'); return true;
      case 'voyage-n': this._vN = +arg; this.openTown('orders'); return true;
      case 'voyage-go': {
        const r = g.startVoyage(g.biome, this._vTo, this._vR, this._vN || VOYAGE_STEPS[1]);
        if (!r.ok) {
          this.sfx('error');
          this.toast(r.reason, { kind: 'warn' });
        } else {
          this.sfx('whoosh');
          buzz('medium');
        }
        this.openTown('orders');
        return true;
      }
      case 'voyage-claim': {
        g.claimVoyage(g.biome);
        this.openTown('orders');
        return true;
      }
      default: return false;
    }
  },
};
