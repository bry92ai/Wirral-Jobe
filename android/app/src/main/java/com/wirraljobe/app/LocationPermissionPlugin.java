package com.wirraljobe.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "LocationPermission",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "fineLocation"),
        @Permission(strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }, alias = "backgroundLocation")
    }
)
public class LocationPermissionPlugin extends Plugin {

    @PluginMethod
    public void requestBackgroundLocation(PluginCall call) {
        if (getPermissionState("backgroundLocation") == PermissionState.GRANTED) {
            call.resolve(result("granted", false));
            return;
        }

        // On Android 12+ the system usually rejects a direct background-location request and
        // expects the user to enable it from Settings. We still request it where possible.
        if (getPermissionState("fineLocation") != PermissionState.GRANTED) {
            requestPermissionForAlias("fineLocation", call, "fineLocationCallback");
        } else {
            requestPermissionForAlias("backgroundLocation", call, "backgroundLocationCallback");
        }
    }

    @PluginMethod
    public void checkLocationPermissions(PluginCall call) {
        call.resolve(result(
            getPermissionState("backgroundLocation") == PermissionState.GRANTED ? "granted" : "denied",
            false
        ));
    }

    @PermissionCallback
    private void fineLocationCallback(PluginCall call) {
        if (getPermissionState("fineLocation") == PermissionState.GRANTED) {
            requestPermissionForAlias("backgroundLocation", call, "backgroundLocationCallback");
        } else {
            call.resolve(result("denied", true));
        }
    }

    @PermissionCallback
    private void backgroundLocationCallback(PluginCall call) {
        boolean granted = getPermissionState("backgroundLocation") == PermissionState.GRANTED;
        call.resolve(result(granted ? "granted" : "denied", !granted));
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private JSObject result(String status, boolean needsSettings) {
        JSObject r = new JSObject();
        r.put("backgroundLocation", status);
        r.put("needsSettings", needsSettings);
        return r;
    }
}
