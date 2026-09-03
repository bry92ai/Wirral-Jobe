package com.wirraljobe.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        // Lock WebView text zoom to 100% so the driver's Android system font size
        // does not blow up the app's fixed rem/pixel layouts (e.g. job offer card,
        // active job panel) or push buttons off screen.
        WebSettings settings = getBridge().getWebView().getSettings();
        if (settings != null) {
            settings.setTextZoom(100);
        }
        JobOfferChannel.create(this);
        registerPlugin(DriverServicePlugin.class);
        registerPlugin(LocationPermissionPlugin.class);
    }
}
