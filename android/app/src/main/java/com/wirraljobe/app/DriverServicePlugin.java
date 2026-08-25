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
        String driverId = call.getString("driverId", "");
        String driverToken = call.getString("driverToken", "");
        String status = call.getString("status", "AVAILABLE");
        String jobId = call.getString("jobId", "");
        String fare = call.getString("fare", "0");
        getContext().getSharedPreferences("wirraljobe", android.content.Context.MODE_PRIVATE)
            .edit()
            .putString("apiUrl", apiUrl)
            .putString("driverId", driverId)
            .putString("driverToken", driverToken)
            .putString("status", status)
            .putString("jobId", jobId)
            .putString("fare", fare)
            .apply();
        intent.putExtra("apiUrl", apiUrl);
        intent.putExtra("driverId", driverId);
        intent.putExtra("driverToken", driverToken);
        intent.putExtra("status", status);
        intent.putExtra("jobId", jobId);
        intent.putExtra("fare", fare);
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
        getContext().getSharedPreferences("wirraljobe", android.content.Context.MODE_PRIVATE)
            .edit()
            .remove("driverId")
            .remove("driverToken")
            .remove("status")
            .remove("jobId")
            .remove("fare")
            .apply();
        call.resolve();
    }
}
