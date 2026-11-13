// Town panel (v1.2): Research, Order Board, Daily Missions and Island Rating, plus the building
// panel extras for fires and repairs. Mixed into UI (see ui.js).
import { icon } from './icons.js';
import { RES, BUILDINGS, BIOMES, BIOME_KEYS } from '../game/data.js';
import { TECHS, TECH_BRANCHES, TECH_BY_ID, ORDER_CLIENTS, ORDERS_UNLOCK, STAR_AT } from '../game/systems.js';
import { buzz } from '../platform.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtN = (n) => {
  n = Math.floor(n);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e5) return Math.round(n / 1e3) + 'k';
  return n.toLocaleString('en-US');
};
const clock = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const starRow = (n, cls = '') => `<span class="tstars ${cls}">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;

export const TownMixin = {
  openTown(tab = this._townTab || 'research') {
    this._townTab = tab;
    const render = () => {
      const g = this.game;
      const nOrd = g.readyOrders(), nMis = g.claimableMissions();
      const tabs = [
        ['research', 'research', 'Research', g.s.research.cur ? '' : ''],
        ['orders', 'order', 'Orders', nOrd ? `<i class="tbadge">${nOrd}</i>` : ''],
        ['missions', 'mission', 'Missions', nMis ? `<i class="tbadge">${nMis}</i>` : ''],
        ['rating', 'star', 'Rating', ''],
        ['projects', 'build', 'Projects', ''],
      ].map(([id, ic, name, badge]) => `<button class="tab ${id === this._townTab ? 'on' : ''}" data-act="town-tab" data-arg="${id}">${icon(ic)} ${name}${badge}</button>`).join('');
      const body = { research: () => this._researchHTML(), orders: () => this._ordersHTML(), missions: () => this._missionsHTML(), rating: () => this._ratingHTML(), projects: () => this._projectsHTML() }[this._townTab]();
      return `<div class="tabs ttabs">${tabs}</div><div class="tpane" data-pane="${this._townTab}">${body}</div>`;
    };
    this.openSheet(`${icon('town')} Town`, render(), {
      kind: 'town',
      wide: true,
      live: () => {
        // never swap the buttons out from under a finger
        if (this._sheetTouch) return;
        const html = render();
        if (html !== this._tHTML) {
          const body = $('#sheet-body');
          const top = body.scrollTop;
          body.innerHTML = html;
          body.scrollTop = top;
          this._tHTML = html;
        }
      },
    });
    this._tHTML = '';
    if (!this._sheetTouchHooked) {
      this._sheetTouchHooked = true;
      const sh = $('#sheet');
      sh.addEventListener('pointerdown', () => (this._sheetTouch = true));
      const up = () => setTimeout(() => (this._sheetTouch = false), 60);
      sh.addEventListener('pointerup', up);
      sh.addEventListener('pointercancel', up);
    }
  },

  // ---------------- research

  _researchHTML() {
    const g = this.game, R = g.s.research;
    let head;
    if (R.cur) {
      const t = TECH_BY_ID[R.cur.id];
      const left = g.researchLeft();
      const pct = Math.min(100, Math.round(((Date.now() - R.cur.start) / Math.max(1, R.cur.end - R.cur.start)) * 100));
      head = `<div class="rnow">${icon('research', 'lg')}<div class="grow"><b>Researching: ${esc(t.name)}</b><div class="goal"><div class="bar sci"><i style="width:${pct}%"></i></div><small>${clock(left)}</small></div></div>
        <div class="ocol"><button class="btn buy sm" data-act="tech-rush">Finish ${icon('crystal')}${g.rushCost()}</button>${R.cur.ad ? '' : `<button class="btn sm" data-act="tech-ad">${icon('speed')} Ad: -50%</button>`}</div></div>`;
    } else head = `<p class="muted">${icon('info')} Pick a project. Research keeps going while the game is closed. Research Labs make it faster (now ${Math.round(g.researchSpeed() * 100)}% speed).</p>`;
    // phones show one branch at a time (picked with the chips); wide screens show every column
    const curBr = TECH_BRANCHES.some((br) => br.id === this._techBr) ? this._techBr : TECH_BRANCHES[0].id;
    const brTabs = TECH_BRANCHES.map((br) => {
      const done = TECHS.filter((t) => t.br === br.id && R.done.includes(t.id)).length;
      return `<button class="tab ${br.id === curBr ? 'on' : ''}" style="--c:${br.color}" data-act="tech-br" data-arg="${br.id}">${icon(br.icon)} ${esc(br.name)} <small>${done}/5</small></button>`;
    }).join('');
    const cols = TECH_BRANCHES.map((br) => {
      const cards = TECHS.filter((t) => t.br === br.id).map((t) => {
        const st = g.techStatus(t.id);
        const time = (t.time / g.researchSpeed());
        let foot;
        if (st.state === 'done') foot = `<span class="pill on">${icon('check')} Done</span>`;
        else if (st.state === 'cur') foot = `<span class="pill">${icon('research')} In progress</span>`;
        else if (st.state === 'locked') foot = `<span class="lockline">${icon('lock')} ${esc(st.reason)}</span>`;
        else foot = `<div class="costs">${this.costHTML(t.cost)}</div><button class="btn primary sm" data-act="tech-start" data-arg="${t.id}" ${st.busy || !g.has(t.cost) ? 'disabled' : ''}>${icon('research')} ${clock(time)}</button>`;
        return `<div class="tech ${st.state}" style="--c:${br.color}"><i class="tier">${'I II III IV V'.split(' ')[t.tier - 1]}</i><b>${esc(t.name)}</b><p>${esc(t.desc)}</p>${foot}</div>`;
      }).join('<i class="tlink"></i>');
      const done = TECHS.filter((t) => t.br === br.id && R.done.includes(t.id)).length;
      return `<div class="tcol ${br.id === curBr ? 'on' : ''}"><h3 style="color:${br.color}">${icon(br.icon)} ${esc(br.name)} <small>${done}/5</small></h3>${cards}</div>`;
    }).join('');
    return `${head}<div class="tabs brtabs">${brTabs}</div><div class="ttree">${cols}</div><p class="muted center">${R.done.length}/${TECHS.length} projects finished</p>`;
  },

  // ---------------- orders

  _ordersHTML() {
    const g = this.game;
    if (!g.ordersUnlocked()) return `<div class="empty">${icon('order', 'xl')}<p>The Order Board opens at level ${ORDERS_UNLOCK}.<br>Traders from far away will ask for your goods.</p></div>`;
    const now = Date.now();
    const cards = g.s.orders.slots.map((sl, i) => {
      if (!sl.o) return `<div class="order wait">${icon('order', 'lg')}<div class="grow"><b>A new trader is on the way</b><p class="muted">Arrives in ${clock(((sl.ready || 0) - now) / 1000)}</p></div></div>`;
      const o = sl.o, C = ORDER_CLIENTS[o.client] || ORDER_CLIENTS[0];
      const ok = g.has(o.need);
      const need = Object.entries(o.need).map(([k, v]) => {
        const have = g.s.res[k] || 0;
        return `<span class="need ${have >= v ? 'ok' : ''}">${icon(RES[k].icon)}<b>${fmtN(Math.min(have, v))}/${fmtN(v)}</b></span>`;
      }).join('');
      return `<div class="order ${ok ? 'ready' : ''}">${icon(C.icon, 'lg')}<div class="grow"><b>${esc(C.name)}</b><p>"${esc(C.line)}"</p><div class="needs-row">${need}</div><div class="costs">${icon('gift')} ${this.costHTML(o.reward, 1, true)}</div></div>
        <div class="ocol"><button class="btn primary sm" data-act="order-deliver" data-arg="${i}" ${ok ? '' : 'disabled'}>${icon('check')} Deliver</button><button class="btn sm" data-act="order-skip" data-arg="${i}">${icon('cross')} Skip</button></div></div>`;
    }).join('');
    const harbor = g.hasHarbor() ? `<p class="muted">${icon('fish')} Your Harbor adds a slot and +25% to every order.</p>` : `<p class="muted">${icon('info')} Build a Harbor (level 9) for an extra slot and +25% rewards.</p>`;
    return `${this._shipHTML()}${cards}${harbor}<p class="muted center">${fmtN(g.s.stats.orders)} orders delivered</p>`;
  },

  // ---------------- missions

  _missionsHTML() {
    const g = this.game, M = g.s.missions;
    const rows = M.list.map((m, i) => {
      const def = g.missionDef(m);
      const v = g.missionProgress(m), done = v >= m.n;
      return `<div class="quest ${done && !m.claimed ? 'done' : ''} ${m.claimed ? 'claimed' : ''}">${icon(def?.icon || 'mission', 'lg')}<div class="grow"><b>${esc(def ? def.text(m.n) : m.id)}</b>
        <div class="goal"><div class="bar"><i style="width:${Math.round((v / m.n) * 100)}%"></i></div><small>${fmtN(v)}/${fmtN(m.n)}</small></div><div class="costs">${this.costHTML(m.reward, 1, true)}</div></div>
        ${m.claimed ? `<span class="pill on">${icon('check')}</span>` : done ? `<button class="btn primary" data-act="mission-claim" data-arg="${i}">Claim</button>` : ''}</div>`;
    }).join('');
    const all = M.list.length && M.list.every((m) => m.claimed);
    const bonus = `<div class="mbonus ${M.bonus ? 'got' : all ? 'ready' : ''}">${icon('chest', 'xl')}<div class="grow"><b>Daily Chest</b><p class="muted">Finish all three missions to open it.</p><div class="costs">${this.costHTML(g.missionBonusReward(), 1, true)}</div></div>
      ${M.bonus ? `<span class="pill on">${icon('check')} Opened</span>` : `<button class="btn primary" data-act="mission-bonus" ${all ? '' : 'disabled'}>Open</button>`}</div>`;
    const mid = new Date();
    mid.setHours(24, 0, 0, 0);
    return `${rows}${bonus}<p class="muted center">${icon('calendar')} New missions in ${clock((mid - Date.now()) / 1000)}</p>`;
  },

  // ---------------- rating

  _ratingHTML() {
    const g = this.game;
    const S = g.islandScore();
    const parts = S.parts.map((p) => `<div class="mrow">${icon(p.icon)}<div class="grow"><b>${esc(p.name)}</b><div class="bar"><i style="width:${Math.round((p.v / p.max) * 100)}%"></i></div></div><b>${p.v}/${p.max}</b></div>`).join('');
    const next = S.next ? `<p class="muted center">${S.next - S.score} more points for the next star · each star: +3% production here</p>` : `<p class="muted center">Maximum rating! +15% production on this island.</p>`;
    const list = BIOME_KEYS.filter((id) => g.s.islands[id]).map((id) => {
      const I = g.s.islands[id];
      return `<div class="island ${id === g.biome ? 'cur' : ''}"><div class="swatch" style="--c:${BIOMES[id].color}"></div><div class="grow"><b>${esc(BIOMES[id].name)}</b><p>${I.npcs.length} villagers · best ${I.starBest || 0} stars</p></div>${starRow(I.starBest || 0, 'sm')}</div>`;
    }).join('');
    return `<div class="rating">${starRow(S.stars, 'big')}<div class="rscore"><b>${S.score}</b><small>/ ${STAR_AT[4]} points</small></div></div>${parts}${next}<h3>Your islands</h3>${list}`;
  },

  // ---------------- actions (from UI._click's default branch)

  _townClick(act, arg) {
    const g = this.game;
    switch (act) {
      case 'town': this.openTown(); return true;
      case 'town-tab': this.openTown(arg); return true;
      case 'tech-br': this._techBr = arg; this.openTown('research'); return true;
      case 'tech-start': {
        const r = g.startResearch(arg);
        if (!r.ok) {
          this.sfx('error');
          this.toast(r.reason, { kind: 'warn' });
        } else {
          this.sfx('craft');
          this.sfx('sparkle');
          buzz('medium');
          this.toast(`Research started: ${TECH_BY_ID[arg].name}`, { icon: 'research' });
        }
        return true;
      }
      case 'tech-ad': {
        this.app.rewardedAd().then((ok) => {
          if (ok && g.adSpeedResearch().ok) this.toast('Research time cut in half!', { icon: 'research' });
          this.openTown('research');
        });
        return true;
      }
      case 'tech-rush': {
        const r = g.rushResearch();
        if (!r.ok) {
          this.sfx('error');
          if (r.reason) this.toast(r.reason, { kind: 'warn' });
        }
        return true;
      }
      case 'order-deliver': {
        const r = g.deliverOrder(+arg);
        if (!r.ok) {
          this.sfx('error');
          if (r.reason) this.toast(r.reason, { kind: 'warn' });
          return true;
        }
        this.sfx('coin');
        this.sfx('quest');
        buzz('medium');
        const btn = document.querySelector(`[data-act="order-deliver"][data-arg="${arg}"]`);
        this.flyRewards(r.got, btn);
        this.toast(`${ORDER_CLIENTS[r.o.client]?.name || 'The trader'} is delighted!`, { icon: 'order', ms: 2200 });
        return true;
      }
      case 'order-skip':
        if (g.skipOrder(+arg)) this.sfx('back');
        return true;
      case 'mission-claim': {
        const got = g.claimMission(+arg);
        if (!got) return true;
        this.sfx('quest');
        buzz('medium');
        this.flyRewards(got, document.querySelector(`[data-act="mission-claim"][data-arg="${arg}"]`));
        return true;
      }
      case 'mission-bonus': {
        const got = g.claimMissionBonus();
        if (!got) return true;
        this.sfx('sparkle');
        this.sfx('levelup');
        buzz('heavy');
        this.queueModal(() => this.modal(`<div class="burst"></div>${icon('chest', 'xl')}<h2>Daily Chest!</h2><p>All of today's missions are done. See you tomorrow, Mayor!</p>${this.rewardHTML(got)}<button class="btn primary big" data-act="modal-ok">Collect</button>`, { cls: 'celebrate' }));
        return true;
      }
      case 'b-fire': {
        const rec = this._bRec;
        if (rec && this.world.mayorFight(rec)) {
          this.closeSheet();
          this.toast('The Mayor grabs a bucket!', { icon: 'fire', ms: 1600 });
        }
        return true;
      }
      case 'b-repair': {
        const r = g.repair(this._bRec);
        if (!r.ok) {
          this.sfx('error');
          if (r.reason) this.toast(r.reason, { kind: 'warn' });
          return true;
        }
        this.sfx('place');
        buzz('medium');
        this.toast('The builders are on their way.', { icon: 'build' });
        return true;
      }
      case 'b-orders': this.openTown('orders'); return true;
      case 'b-research': this.openTown('research'); return true;
    }
    return false;
  },

  /** Extra lines and buttons for the building panel (fire, ruins, links to the Town panel). */
  _buildingExtras(rec) {
    const g = this.game, lines = [], btns = [];
    const f = g.fireOf(rec);
    if (f) {
      lines.push(`<div class="stat alert">${icon('fire')} On fire! ${f.crew ? 'The fire crew is on it.' : 'Production has stopped.'}<div class="bar bad"><i style="width:${Math.round(f.hp * 100)}%"></i></div></div>`);
      btns.push(`<button class="btn danger" data-act="b-fire">${icon('fire')} Put out the fire</button>`);
    }
    if (rec.ruin) {
      lines.push(`<div class="stat alert">${icon('fire')} Burned down. Rebuild it to bring it back.</div>`);
      btns.push(`<button class="btn primary" data-act="b-repair">${icon('build')} Rebuild <span class="costs">${this.costHTML(g.repairCost(rec))}</span></button>`);
    }
    if (rec.type === 'pelabuhan' && rec.built) btns.push(`<button class="btn" data-act="b-orders">${icon('order')} Order Board</button>`);
    if (rec.type === 'lab' && rec.built) btns.push(`<button class="btn" data-act="b-research">${icon('research')} Research</button>`);
    if (BUILDINGS[rec.type].fireStation) lines.push(`<div class="stat">${icon('fire')} Protects buildings within 6 tiles</div>`);
    return { lines, btns };
  },
};
