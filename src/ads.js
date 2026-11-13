// AdMob (v1.3): a bottom banner during play, an occasional interstitial at natural breaks (island
// travel) and opt-in rewarded ads. Every id below is Google's public TEST id: swap them (and the app id
// in android/app/src/main/res/values/strings.xml) for your own units before publishing.
// The navigation bar always stays visible (MainActivity); the plugin places the banner right above it and
// the game UI moves up by the banner height (--ad-h), so the banner never covers any button. In the browser (development) ads are simulated.
import { Capacitor } from '@capacitor/core';

export const AD_UNITS = {
  banner: 'ca-app-pub-3940256099942544/9214589741', // test: adaptive banner
  interstitial: 'ca-app-pub-3940256099942544/1033173712', // test: interstitial
  rewarded: 'ca-app-pub-3940256099942544/5224354917', // test: rewarded
};
const TESTING = true; // keep true while the test ids above are in use
const INTERSTITIAL_GAP_MS = 3 * 60 * 1000; // at most one interstitial every 3 minutes
const INTERSTITIAL_GRACE_MS = 4 * 60 * 1000; // and none in the first minutes of a session

const native = Capacitor.isNativePlatform();
let AdMob = null, E = null;
let ready = false, bannerOn = false, bannerWanted = false;
let lastInterstitial = 0;
const sessionStart = Date.now();
const root = document.documentElement;

export async function initAds() {
  if (!native) {
    ready = true;
    return;
  }
  try {
    const mod = await import('@capacitor-community/admob');
    AdMob = mod.AdMob;
    E = mod;
    await AdMob.initialize({ initializeForTesting: TESTING });
    // privacy: ask for consent where the law requires it (EEA/UK), with Google's consent form
    try {
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === mod.AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
    } catch (e) {
      console.warn('consent', e);
    }
    AdMob.addListener(mod.BannerAdPluginEvents.SizeChanged, (size) => {
      root.style.setProperty('--ad-h', `${Math.max(0, Math.round(size?.height || 0))}px`);
    });
    ready = true;
    prepareInterstitial();
    if (bannerWanted) showBanner();
  } catch (e) {
    console.warn('ads unavailable', e);
  }
}

export async function showBanner() {
  bannerWanted = true;
  if (!ready || bannerOn) return;
  if (!native) return;
  try {
    await AdMob.showBanner({ adId: AD_UNITS.banner, adSize: E.BannerAdSize.ADAPTIVE_BANNER, position: E.BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: TESTING });
    bannerOn = true;
  } catch (e) {
    console.warn('banner', e);
  }
}

export async function hideBanner() {
  bannerWanted = false;
  root.style.setProperty('--ad-h', '0px');
  if (!native || !bannerOn) return;
  bannerOn = false;
  try {
    await AdMob.removeBanner();
  } catch (e) {
    console.warn('banner', e);
  }
}

async function prepareInterstitial() {
  if (!native || !ready) return;
  try {
    await AdMob.prepareInterstitial({ adId: AD_UNITS.interstitial, isTesting: TESTING });
  } catch (e) {
    console.warn('interstitial', e);
  }
}

/** Show an interstitial at a natural break, if enough time has passed. Resolves when it is closed. */
export async function maybeInterstitial() {
  const now = Date.now();
  if (now - sessionStart < INTERSTITIAL_GRACE_MS || now - lastInterstitial < INTERSTITIAL_GAP_MS) return false;
  lastInterstitial = now;
  if (!native) return false;
  try {
    await AdMob.showInterstitial();
    return true;
  } catch (e) {
    console.warn('interstitial', e);
    return false;
  } finally {
    prepareInterstitial();
  }
}

/** Google's privacy options form (to change ad consent). Resolves false where it is not needed. */
export async function showAdPrivacy() {
  if (!native || !ready) return false;
  try {
    const info = await AdMob.requestConsentInfo();
    if (info.privacyOptionsRequirementStatus !== 'REQUIRED') return false;
    await AdMob.showPrivacyOptionsForm();
    return true;
  } catch (e) {
    console.warn('privacy', e);
    return false;
  }
}

/**
 * An opt-in rewarded ad. Resolves true only when the player earned the reward.
 * In the browser it simulates a short ad so the flow can be tested.
 */
export async function showRewarded() {
  if (!native) {
    await new Promise((r) => setTimeout(r, 900));
    return true;
  }
  if (!ready) return false;
  let earned = false, sub = null;
  try {
    sub = await AdMob.addListener(E.RewardAdPluginEvents.Rewarded, () => (earned = true));
    await AdMob.prepareRewardVideoAd({ adId: AD_UNITS.rewarded, isTesting: TESTING });
    const reward = await AdMob.showRewardVideoAd();
    return earned || (reward?.amount || 0) > 0;
  } catch (e) {
    console.warn('rewarded', e);
    return false;
  } finally {
    sub?.remove();
  }
}
