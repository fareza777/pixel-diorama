// AdMob configuration in one place.
// - Release builds (`vite build --mode release`, used by `npm run android:release`) use the REAL ids below
//   and turn test mode off.
// - Every other build (dev server, `npm run build`, debug APKs) keeps Google's public TEST ids, so a
//   developer never taps a live ad by accident.
// The matching AdMob APP id lives in android/app/src/main/res/values/strings.xml (`admob_app_id`);
// debug builds override it with the test app id in android/app/src/debug/res/values/admob.xml.

export const ADS_RELEASE = import.meta.env.MODE === 'release';

/** Real AdMob ad units for Pixel Diorama (publisher pub-6279186647593327). */
const RELEASE_UNITS = {
  banner: 'ca-app-pub-6279186647593327/6575149536',
  interstitial: 'ca-app-pub-6279186647593327/5262067867',
  rewarded: 'ca-app-pub-6279186647593327/4302220311',
};

/** Google's public test units. */
const TEST_UNITS = {
  banner: 'ca-app-pub-3940256099942544/9214589741', // adaptive banner
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

export const AD_UNITS = ADS_RELEASE ? RELEASE_UNITS : TEST_UNITS;
export const TESTING = !ADS_RELEASE;

// vite.config.js refuses a release build while any id above is still a REPLACE_ placeholder.
