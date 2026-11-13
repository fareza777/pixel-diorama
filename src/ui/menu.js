// Main menu (v1.3): the title screen buttons (Play / Continue, New Game, Settings, About, Share, Rate,
// replay the intro). Mixed into UI. Share uses the system share sheet; Rate opens the Play Store page.
import { Share } from '@capacitor/share';
import { AppLauncher } from '@capacitor/app-launcher';
import { icon } from './icons.js';
import { STORY_TITLE } from '../game/story.js';
import * as platform from '../platform.js'; // native check for share / rate

export const APP_ID = 'com.f7developer.pixeldiorama';
const STORE_URL = `https://play.google.com/store/apps/details?id=${APP_ID}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const MenuMixin = {
  titleHTML() {
    return `<div id="title">
        <div class="title-box">
          <div class="logo"><span class="l1">PIXEL</span><span class="l2">DIORAMA</span><span class="l3">World Builder</span></div>
          <div class="tagline">${esc(STORY_TITLE)}</div>
          <div class="menu">
            <button class="btn primary big" data-act="start" id="btn-start">Loading...</button>
            <button class="btn hidden" data-act="menu-new" id="btn-new">${icon('build')} New Game</button>
            <div class="menu-grid">
              <button class="mbtn" data-act="settings">${icon('gear')}<small>Settings</small></button>
              <button class="mbtn" data-act="menu-intro">${icon('camera')}<small>Story</small></button>
              <button class="mbtn" data-act="menu-about">${icon('info')}<small>About</small></button>
              <button class="mbtn" data-act="menu-share">${icon('chat')}<small>Share</small></button>
              <button class="mbtn" data-act="menu-rate">${icon('star')}<small>Rate</small></button>
            </div>
          </div>
          <div class="credit">F7 Developer</div>
        </div>
      </div>`;
  },

  openAbout() {
    const v = this.app.version;
    this.modal(`<div class="about">
      <h2>Pixel Diorama</h2><p class="muted">World Builder · version ${esc(v)}</p>
      <p><b>${esc(STORY_TITLE)}</b><br>After the Great Storm the Seven Isles fell quiet. With a box of tools and a letter from Ellie, the old harbour master, you set out to bring them back to life, one island at a time.</p>
      <p class="muted">Made by <b>F7 Developer</b>. 3D pixel-art renderer adapted from noxe-pixel-engine (MIT) on three.js (MIT). Voices generated with neural text-to-speech.</p>
      <p class="muted">The game plays offline. It shows ads from Google AdMob, which may use device identifiers to show ads; you can change consent at any time below.</p>
      <div class="row"><button class="btn" data-act="menu-privacy">${icon('eye')} Ad privacy</button><button class="btn primary" data-act="modal-ok">Close</button></div>
    </div>`);
  },

  async shareGame() {
    const text = `I am rebuilding the Seven Isles in Pixel Diorama: World Builder. Come and build your own little world!`;
    try {
      if (platform.native) await Share.share({ title: 'Pixel Diorama: World Builder', text, url: STORE_URL, dialogTitle: 'Share Pixel Diorama' });
      else if (navigator.share) await navigator.share({ title: 'Pixel Diorama', text, url: STORE_URL });
      else {
        await navigator.clipboard?.writeText(`${text} ${STORE_URL}`);
        this.toast('Link copied. Paste it anywhere to share!', { icon: 'chat' });
      }
    } catch (e) {
      // the player closed the share sheet: nothing to do
    }
  },

  async rateGame() {
    try {
      if (platform.native) {
        const r = await AppLauncher.openUrl({ url: `market://details?id=${APP_ID}` });
        if (r?.completed) return;
      }
      window.open(STORE_URL, '_blank');
    } catch {
      window.open(STORE_URL, '_blank');
    }
  },

  confirmNewGame() {
    this.confirm('Start a new game?', 'Your islands, villagers and progress will be erased. This cannot be undone.', 'Erase and start', () => {
      try {
        sessionStorage.setItem('pd-newgame', '1');
      } catch {}
      this.app.wipe(); // stops autosaves, clears the save and reloads into the intro
    });
  },

  _menuClick(act) {
    switch (act) {
      case 'menu-new': this.confirmNewGame(); return true;
      case 'menu-about': this.openAbout(); return true;
      case 'menu-share': this.shareGame(); return true;
      case 'menu-rate': this.rateGame(); return true;
      case 'menu-intro': this.app.playIntro(); return true;
      case 'menu-privacy': this.app.adPrivacy?.(); return true;
      case 'offline-x2': this.app.offlineDouble(); return true;
      default: return false;
    }
  },
};
