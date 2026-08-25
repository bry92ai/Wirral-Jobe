package com.wirraljobe.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.core.content.ContextCompat;

public class DriverBootReceiver extends BroadcastReceiver {

    private static final String TAG = "DriverBootReceiver";
    private static final String PREFS_NAME = "wirraljobe";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String driverId = prefs.getString("driverId", "");
        String driverToken = prefs.getString("driverToken", "");
        String apiUrl = prefs.getString("apiUrl", "https://wirraljobe.com/");
        String status = prefs.getString("status", "AVAILABLE");
        String jobId = prefs.getString("jobId", "");
        String fare = prefs.getString("fare", "0");

        if (driverId.isEmpty() || driverToken.isEmpty()) {
            Log.d(TAG, "No saved driver session; skipping service restart");
            return;
        }

        Intent serviceIntent = new Intent(context, DriverForegroundService.class);
        serviceIntent.setAction("START");
        serviceIntent.putExtra("apiUrl", apiUrl);
        serviceIntent.putExtra("driverId", driverId);
        serviceIntent.putExtra("driverToken", driverToken);
        serviceIntent.putExtra("status", status);
        serviceIntent.putExtra("jobId", jobId);
        serviceIntent.putExtra("fare", fare);

        Log.d(TAG, "Restarting driver service after " + action);
        ContextCompat.startForegroundService(context, serviceIntent);
    }
}
