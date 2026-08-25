package com.wirraljobe.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class FloatingOfferService extends Service {

    private static final String TAG = "FloatingOfferService";
    private static final int NOTIFICATION_ID = 1;
    private static final String CHANNEL_ID = "floating_offers";

    private String apiUrl = "https://wirraljobe.com/";

    private WindowManager windowManager;
    private View floatingView;
    private ExecutorService executor;

    private float initialX;
    private float initialY;
    private float initialTouchX;
    private float initialTouchY;

    @Override
    public void onCreate() {
        super.onCreate();
        executor = Executors.newSingleThreadExecutor();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        String jobId = intent.getStringExtra("jobId");
        String driverId = intent.getStringExtra("driverId");
        String acceptToken = intent.getStringExtra("acceptToken");
        String declineToken = intent.getStringExtra("declineToken");
        String pickup = intent.getStringExtra("pickup");
        String dropoff = intent.getStringExtra("dropoff");
        String fare = intent.getStringExtra("fare");
        if (intent.hasExtra("apiUrl")) apiUrl = intent.getStringExtra("apiUrl");

        if (jobId == null || driverId == null || acceptToken == null || declineToken == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildForegroundNotification());

        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Allow display over other apps for floating offers", Toast.LENGTH_LONG).show();
            removeFloatingView();
            return START_NOT_STICKY;
        }

        if (floatingView == null) {
            showFloatingWindow(jobId, driverId, acceptToken, declineToken, pickup, dropoff, fare);
        } else {
            updateFloatingWindow(jobId, driverId, acceptToken, declineToken, pickup, dropoff, fare);
        }

        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Floating offers",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shown while a job offer overlay is active");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildForegroundNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Job offer")
            .setContentText("Tap to view the current job offer")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void showFloatingWindow(String jobId, String driverId, String acceptToken, String declineToken,
                                     String pickup, String dropoff, String fare) {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        floatingView = LayoutInflater.from(this).inflate(R.layout.floating_offer, null);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 50;
        params.y = 100;

        floatingView.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = params.x;
                    initialY = params.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    params.x = (int) (initialX + (event.getRawX() - initialTouchX));
                    params.y = (int) (initialY + (event.getRawY() - initialTouchY));
                    windowManager.updateViewLayout(floatingView, params);
                    return true;
            }
            return false;
        });

        updateFloatingContent(jobId, driverId, acceptToken, declineToken, pickup, dropoff, fare);

        try {
            windowManager.addView(floatingView, params);
        } catch (Exception e) {
            Log.e(TAG, "Failed to add floating view", e);
            stopSelf();
        }
    }

    private void updateFloatingWindow(String jobId, String driverId, String acceptToken, String declineToken,
                                       String pickup, String dropoff, String fare) {
        if (floatingView == null) return;
        updateFloatingContent(jobId, driverId, acceptToken, declineToken, pickup, dropoff, fare);
    }

    private void updateFloatingContent(String jobId, String driverId, String acceptToken, String declineToken,
                                        String pickup, String dropoff, String fare) {
        TextView pickupView = floatingView.findViewById(R.id.offer_pickup);
        TextView dropoffView = floatingView.findViewById(R.id.offer_dropoff);
        TextView fareView = floatingView.findViewById(R.id.offer_fare);
        Button acceptBtn = floatingView.findViewById(R.id.btn_accept);
        Button declineBtn = floatingView.findViewById(R.id.btn_decline);
        Button closeBtn = floatingView.findViewById(R.id.btn_close);

        if (pickupView != null) pickupView.setText("Pickup: " + (pickup != null ? pickup : ""));
        if (dropoffView != null) dropoffView.setText("Drop-off: " + (dropoff != null ? dropoff : ""));
        if (fareView != null) fareView.setText(fare != null ? fare : "£0.00");

        if (acceptBtn != null) {
            acceptBtn.setOnClickListener(v -> {
                Toast.makeText(this, "Accepting…", Toast.LENGTH_SHORT).show();
                sendSecureAction(jobId, driverId, "accept", acceptToken);
                removeFloatingView();
            });
        }

        if (declineBtn != null) {
            declineBtn.setOnClickListener(v -> {
                Toast.makeText(this, "Declining…", Toast.LENGTH_SHORT).show();
                sendSecureAction(jobId, driverId, "decline", declineToken);
                removeFloatingView();
            });
        }

        if (closeBtn != null) {
            closeBtn.setOnClickListener(v -> removeFloatingView());
        }
    }

    private void sendSecureAction(String jobId, String driverId, String action, String token) {
        executor.execute(() -> {
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
                payload.put("action", action);
                payload.put("token", token);
                body.put("payload", payload);

                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                OutputStream os = conn.getOutputStream();
                os.write(bytes);
                os.flush();
                os.close();

                int responseCode = conn.getResponseCode();
                String message = responseCode >= 200 && responseCode < 300
                    ? (action.equals("accept") ? "Offer accepted" : "Offer declined")
                    : "Could not process offer";
                conn.disconnect();

                android.os.Handler mainHandler = new android.os.Handler(getMainLooper());
                mainHandler.post(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                Log.e(TAG, "Error sending secure action", e);
                android.os.Handler mainHandler = new android.os.Handler(getMainLooper());
                mainHandler.post(() -> Toast.makeText(this, "Network error", Toast.LENGTH_LONG).show());
            }
        });
    }

    private void removeFloatingView() {
        if (windowManager != null && floatingView != null) {
            try {
                windowManager.removeView(floatingView);
            } catch (Exception e) {
                Log.e(TAG, "Error removing floating view", e);
            }
            floatingView = null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (windowManager != null && floatingView != null) {
            try {
                windowManager.removeView(floatingView);
            } catch (Exception ignored) {}
            floatingView = null;
        }
        if (executor != null) {
            executor.shutdown();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
