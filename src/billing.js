// Google Play Billing: the one-time "Remove Ads" purchase (product id `remove_ads`).
// Ownership is cached locally (localStorage + Capacitor Preferences) so the game starts ad-free offline,
// and is re-checked against Google Play on every start and resume: purchases are acknowledged if needed,
// and a refunded purchase turns ads back on. Uses @capgo/native-purchases (Play Billing Library 8+).
// In the browser (development) the purchase is simulated.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { setAdsRemoved } from './ads.js';

export const REMOVE_ADS_ID = 'remove_ads';
const KEY = 'pixel-diorama/remove-ads/v1';
const native = Capacitor.isNativePlatform();

let NP = null, TYPE_INAPP = 'inapp';
let owned = false;
let price = null; // localized price string from Google Play, e.g. "$4.99" or "Rp 79.000"
let checking = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn({ owned, price });
    } catch (e) {
      console.warn('billing listener', e);
    }
  }
}

async function persist(value) {
  owned = value;
  setAdsRemoved(value);
  try {
    if (value) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  if (value) await Preferences.set({ key: KEY, value: '1' }).catch(() => {});
  else await Preferences.remove({ key: KEY }).catch(() => {});
  notify();
}

async function plugin() {
  if (!native) return null;
  if (NP) return NP;
  const mod = await import('@capgo/native-purchases');
  NP = mod.NativePurchases;
  TYPE_INAPP = mod.PURCHASE_TYPE?.INAPP || 'inapp';
  return NP;
}

const isRemoveAds = (t) => t && t.productIdentifier === REMOVE_ADS_ID;
const isPurchased = (t) => String(t.purchaseState ?? '1') === '1';

/** Ask Google Play which purchases this account owns; acknowledge any that are still unacknowledged. */
async function syncWithStore() {
  const P = await plugin();
  if (!P) return;
  const { purchases = [] } = await P.getPurchases({ productType: TYPE_INAPP });
  const mine = purchases.filter(isRemoveAds);
  const ok = mine.find(isPurchased);
  if (ok) {
    if (ok.isAcknowledged === false && ok.purchaseToken) {
      await P.acknowledgePurchase({ purchaseToken: ok.purchaseToken }).catch((e) => console.warn('acknowledge', e));
    }
    if (!owned) await persist(true);
  } else if (owned && !mine.length) {
    // the query succeeded and the purchase is gone (refunded or revoked)
    await persist(false);
  }
}

async function loadPrice() {
  const P = await plugin();
  if (!P) return;
  try {
    const { product } = await P.getProduct({ productIdentifier: REMOVE_ADS_ID, productType: TYPE_INAPP });
    if (product?.priceString) {
      price = product.priceString;
      notify();
    }
  } catch (e) {
    console.warn('billing product', e);
  }
}

/** Re-check ownership with Google Play (start-up, resume). Safe to call often. */
export function refreshPurchases() {
  if (!native) return Promise.resolve();
  if (!checking) {
    checking = syncWithStore()
      .catch((e) => console.warn('billing sync', e))
      .finally(() => (checking = null));
  }
  return checking;
}

export async function initBilling() {
  let cached = false;
  try {
    cached = localStorage.getItem(KEY) === '1';
  } catch {
    /* private mode */
  }
  if (!cached) {
    const { value } = await Preferences.get({ key: KEY }).catch(() => ({ value: null }));
    cached = value === '1';
  }
  if (cached) {
    owned = true;
    setAdsRemoved(true);
    notify();
  }
  if (!native) return;
  try {
    const P = await plugin();
    const { isBillingSupported } = await P.isBillingSupported();
    if (!isBillingSupported) return;
  } catch (e) {
    console.warn('billing unavailable', e);
    return;
  }
  await refreshPurchases();
  loadPrice();
}

export const adsRemovedOwned = () => owned;
export const removeAdsPrice = () => price;

/** Subscribe to { owned, price } changes. Returns an unsubscribe function. */
export function onBillingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Start the Google Play purchase flow for Remove Ads.
 * Resolves 'owned' | 'pending' | 'cancelled' | 'error'.
 */
export async function buyRemoveAds() {
  if (owned) return 'owned';
  if (!native) {
    await new Promise((r) => setTimeout(r, 600));
    await persist(true);
    return 'owned';
  }
  try {
    const P = await plugin();
    const t = await P.purchaseProduct({ productIdentifier: REMOVE_ADS_ID, productType: TYPE_INAPP, autoAcknowledgePurchases: true });
    if (isRemoveAds(t) && isPurchased(t)) {
      if (t.isAcknowledged === false && t.purchaseToken) await P.acknowledgePurchase({ purchaseToken: t.purchaseToken }).catch(() => {});
      await persist(true);
      return 'owned';
    }
    await refreshPurchases();
    return owned ? 'owned' : 'error';
  } catch (e) {
    const msg = String(e?.message || e || '').toLowerCase();
    if (msg.includes('pending')) return 'pending';
    if (msg.includes('already') || msg.includes('owned')) {
      await refreshPurchases();
      return owned ? 'owned' : 'error';
    }
    if (msg.includes('cancel')) return 'cancelled';
    console.warn('purchase', e);
    return 'error';
  }
}

/** "Restore purchases": re-read this Google account's purchases. Resolves true when Remove Ads is owned. */
export async function restorePurchases() {
  if (!native) return owned;
  try {
    const P = await plugin();
    await P.restorePurchases().catch((e) => console.warn('restore', e));
    await syncWithStore();
  } catch (e) {
    console.warn('restore', e);
  }
  return owned;
}
