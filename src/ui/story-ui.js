// Story UI (v1.3), mixed into UI: the objective pill under the HUD (always says what to do next and
// points at the right button), the Journal with Ellie's letter and every chapter, and the narrated
// chapter cards. This is the game's onboarding: chapter 1 walks a new player through the basics.
import { icon } from './icons.js';
import { CHAPTERS, INTRO, STORY_TITLE } from '../game/story.js';
import { voice } from './cinematic.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LETTER = INTRO.find((l) => l.letter)?.text || '';

export const StoryUIMixin = {
  /** Refresh the objective pill (called with the HUD). */
  refreshStory() {
    const el = document.getElementById('story');
    if (!el) return;
    const g = this.game, ch = g.chapter();
    if (!ch) {
      el.classList.add('hidden');
      return;
    }
    const goals = g.chapterGoals(ch);
    const cur = goals.find((x) => !x.ok);
    const done = goals.filter((x) => x.ok).length;
    const prog = cur?.prog ? ` <em>${cur.prog[0]}/${cur.prog[1]}</em>` : '';
    const html = `<b>${icon('quest')} Chapter ${g.s.story.ch + 1}</b><span>${esc(cur ? cur.text : ch.title)}${prog}</span><i>${done}/${goals.length}</i>`;
    if (html !== this._storyHTML) {
      el.innerHTML = html;
      this._storyHTML = html;
      el.classList.remove('hidden');
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    this._storyGoal = cur || null;
  },

  /** The pill was tapped: run the goal's shortcut (open Build, Map...) or show the Journal. */
  storyGo() {
    const goal = this._storyGoal;
    if (!goal?.act) return this.openJournal();
    if (goal.act.startsWith('town-')) return this.openTown(goal.act.slice(5));
    const map = { build: () => this.openBuild('home'), quests: () => this.openQuests(), map: () => this.openMap() };
    (map[goal.act] || (() => this.openJournal()))();
  },

  openJournal() {
    const g = this.game, S = g.s.story;
    const rows = CHAPTERS.map((ch, n) => {
      const state = n < S.ch ? 'done' : n === S.ch ? 'cur' : 'locked';
      const goals = n === S.ch ? `<ul>${g.chapterGoals(ch).map((x) => `<li class="${x.ok ? 'ok' : ''}">${icon(x.ok ? 'check' : 'quest')} ${esc(x.text)}${x.prog && !x.ok ? ` <small>${x.prog[0]}/${x.prog[1]}</small>` : ''}</li>`).join('')}</ul>` : '';
      const body = state === 'locked' ? '<p class="muted">???</p>' : `<p>${esc(ch.text)}</p>${goals}`;
      return `<div class="chap ${state}"><div class="chap-n">${n + 1}</div><div class="grow"><b>${esc(state === 'locked' ? 'Chapter ' + (n + 1) : ch.title)}</b>${body}</div>
        ${state !== 'locked' ? `<button class="ibtn sm" data-act="story-voice" data-arg="${ch.vo}">${icon('sound')}</button>` : ''}</div>`;
    }).join('');
    this.openSheet(`${icon('quest')} Journal · ${esc(STORY_TITLE)}`, `<div class="letter-card"><p>${esc(LETTER)}</p></div>${rows}`, { kind: 'journal' });
  },

  /** A narrated chapter card. */
  showChapter({ ch, n }) {
    this.queueModal(() => {
      this.modal(`<div class="chapter-card"><small>Chapter ${n}</small><h2>${esc(ch.title)}</h2><p>${esc(ch.text)}</p>
        <ul>${ch.goals.map((x) => `<li>${icon('quest')} ${esc(x.text)}</li>`).join('')}</ul>
        <button class="btn primary big" data-act="modal-ok">Let's go</button></div>`);
      this._chapterVO?.pause();
      this._chapterVO = voice(this.app, ch.vo);
    });
  },

  showFinale(F) {
    this.queueModal(() => {
      this.modal(`<div class="chapter-card finale"><div class="burst"></div><small>The End... for now</small><h2>${esc(F.title)}</h2><p>${esc(F.text)}</p><button class="btn primary big" data-act="modal-ok">Keep building</button></div>`);
      this._chapterVO?.pause();
      this._chapterVO = voice(this.app, F.vo);
    });
  },

  _storyClick(act, arg) {
    switch (act) {
      case 'story': this.storyGo(); return true;
      case 'journal': this.openJournal(); return true;
      case 'story-voice':
        this._chapterVO?.pause();
        this._chapterVO = voice(this.app, arg);
        return true;
      default: return false;
    }
  },
};
