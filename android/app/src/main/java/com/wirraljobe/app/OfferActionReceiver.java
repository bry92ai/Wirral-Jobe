package com.wirraljobe.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class OfferActionReceiver extends BroadcastReceiver {

    private static final String TAG = "OfferActionReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String jobId = intent.getStringExtra("jobId");
        String driverId = intent.getStringExtra("driverId");
        String acceptToken = intent.getStringExtra("acceptToken");
        String declineToken = intent.getStringExtra("declineToken");

        String baseUrl = intent.getStringExtra("apiUrl");
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = context.getSharedPreferences("wirraljobe", Context.MODE_PRIVATE)
                .getString("apiUrl", "https://wirraljobe.com/");
        }
        final String apiUrl = baseUrl;

        if (jobId == null || driverId == null || acceptToken == null || declineToken == null) {
            Log.w(TAG, "Missing offer extras; action=" + action);
            return;
        }

        if ("com.wirraljobe.app.action.SHOW_OFFER".equals(action)) {
            openDriverApp(context);
            return;
        }

        String secureAction;
        String token;
        String toastMessage;

        if ("com.wirraljobe.app.action.ACCEPT_OFFER".equals(action)) {
            secureAction = "accept";
            token = acceptToken;
            toastMessage = "Accepting offer…";
        } else if ("com.wirraljobe.app.action.DECLINE_OFFER".equals(action)) {
            secureAction = "decline";
            token = declineToken;
            toastMessage = "Declining offer…";
        } else {
            return;
        }

        Toast.makeText(context, toastMessage, Toast.LENGTH_SHORT).show();

        final PendingResult pendingResult = goAsync();
        new Thread(() -> {
            try {
                sendSecureAction(context, apiUrl, jobId, driverId, secureAction, token);
            } finally {
                pendingResult.finish();
            }
        }).start();
    }

    private void openDriverApp(Context context) {
        Intent appIntent = new Intent(context, MainActivity.class);
        appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(appIntent);
    }

    private void sendSecureAction(Context context, String apiUrl, String jobId, String driverId, String secureAction, String token) {
        try {
            URL url = new URL(apiUrl.replaceAll("/+$", "") + "/api/driver/secure-action");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("action", "driver/secure-action");
            JSONObject payload = new JSONObject();
            payload.put("jobId", jobId);
            payload.put("driverId", driverId);
            payload.put("action", secureAction);
            payload.put("token", token);
            body.put("payload", payload);

            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream os = conn.getOutputStream();
            os.write(bytes);
            os.flush();
            os.close();

            int responseCode = conn.getResponseCode();
            String message;
            if (responseCode >= 200 && responseCode < 300) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                JSONObject response = new JSONObject(sb.toString());
                message = response.optString("message", secureAction.equals("accept") ? "Offer accepted" : "Offer declined");
            } else {
                message = "Could not process offer. Open the app.";
            }
            conn.disconnect();

            showToast(context, message);
        } catch (Exception e) {
            Log.e(TAG, "Error handling offer action", e);
            showToast(context, "Network error. Open the app.");
        }
    }

    private void showToast(Context context, String message) {
        android.os.Handler mainHandler = new android.os.Handler(context.getMainLooper());
        mainHandler.post(() -> Toast.makeText(context, message, Toast.LENGTH_LONG).show());
    }
}
