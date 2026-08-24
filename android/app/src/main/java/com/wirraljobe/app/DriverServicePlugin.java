package com.wirraljobe.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DriverService")
public class DriverServicePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), DriverForegroundService.class);
        intent.setAction("START");
        String apiUrl = call.getString("apiUrl", "https://wirraljobe.com/");
        getContext().getSharedPreferences("wirraljobe", android.content.Context.MODE_PRIVATE)
            .edit().putString("apiUrl", apiUrl).apply();
        intent.putExtra("apiUrl", apiUrl);
        intent.putExtra("driverId", call.getString("driverId", ""));
        intent.putExtra("driverToken", call.getString("driverToken", ""));
        intent.putExtra("status", call.getString("status", "AVAILABLE"));
        intent.putExtra("jobId", call.getString("jobId", ""));
        intent.putExtra("fare", call.getString("fare", "0"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        Intent intent = new Intent(getContext(), DriverForegroundService.class);
        intent.setAction("UPDATE");
        intent.putExtra("status", call.getString("status", "AVAILABLE"));
        intent.putExtra("jobId", call.getString("jobId", ""));
        intent.putExtra("fare", call.getString("fare", "0"));
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), DriverForegroundService.class);
        intent.setAction("STOP");
        getContext().startService(intent);
        call.resolve();
    }
}
