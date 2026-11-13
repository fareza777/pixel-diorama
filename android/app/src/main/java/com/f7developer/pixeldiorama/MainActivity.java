package com.f7developer.pixeldiorama;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // games keep the screen on while playing
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings s = webView.getSettings();
            // the UI is laid out in its own units: ignore the system font scale
            s.setTextZoom(100);
            s.setMediaPlaybackRequiresUserGesture(false);
            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        }
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /**
     * Full screen for the status bar only (it slides in with a swipe). The navigation bar stays visible so
     * its buttons never sit on top of the game or the ad banner (v1.3): the AdMob plugin lifts the banner by
     * the navigation bar inset itself, and Capacitor passes the same inset to CSS (--safe-area-inset-bottom),
     * which moves the game UI above the bar and the banner.
     */
    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.statusBars());
        c.show(WindowInsetsCompat.Type.navigationBars());
        getWindow().setNavigationBarColor(0xFF0B0D1A);
    }
}
