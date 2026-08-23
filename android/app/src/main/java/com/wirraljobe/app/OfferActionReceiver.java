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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class OfferActionReceiver extends BroadcastReceiver {

    private static final String TAG = "OfferActionReceiver";
    private static final String API_URL = "https://wirraljobe.com/api/driver/secure-action";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String jobId = intent.getStringExtra("jobId");
        String driverId = intent.getStringExtra("driverId");
        String acceptToken = intent.getStringExtra("acceptToken");
        String declineToken = intent.getStringExtra("declineToken");

        if (jobId == null || driverId == null || acceptToken == null || declineToken == null) return;

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

        executor.execute(() -> {
            try {
                URL url = new URL(API_URL);
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
                String message = "";
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

                final String finalMessage = message;
                android.os.Handler mainHandler = new android.os.Handler(context.getMainLooper());
                mainHandler.post(() -> Toast.makeText(context, finalMessage, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                Log.e(TAG, "Error handling offer action", e);
                android.os.Handler mainHandler = new android.os.Handler(context.getMainLooper());
                mainHandler.post(() -> Toast.makeText(context, "Network error. Open the app.", Toast.LENGTH_LONG).show());
            }
        });
    }
}
