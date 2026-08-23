package com.wirraljobe.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class DriverForegroundService extends Service {

    private static final String CHANNEL_ID = "driver_active";
    private static final int NOTIFICATION_ID = 1001;
    private static final String TAG = "DriverForegroundService";
    private static final long LOCATION_INTERVAL_MS = 10000;
    private static final long FASTEST_LOCATION_INTERVAL_MS = 5000;
    private static final long MIN_DISTANCE_METERS = 20;

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private ExecutorService executor;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private String apiUrl = "https://wirraljobe.com/";
    private String driverId = "";
    private String driverToken = "";
    private String status = "AVAILABLE";
    private String jobId = "";
    private String fare = "0";
    private double lastLat = 0;
    private double lastLng = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        executor = Executors.newSingleThreadExecutor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("STOP".equals(action)) {
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            }
            if (intent.hasExtra("apiUrl")) apiUrl = intent.getStringExtra("apiUrl");
            if (intent.hasExtra("driverId")) driverId = intent.getStringExtra("driverId");
            if (intent.hasExtra("driverToken")) driverToken = intent.getStringExtra("driverToken");
            if (intent.hasExtra("status")) status = intent.getStringExtra("status");
            if (intent.hasExtra("jobId")) jobId = intent.getStringExtra("jobId");
            if (intent.hasExtra("fare")) fare = intent.getStringExtra("fare");
        }

        startForeground(NOTIFICATION_ID, buildNotification());
        startLocationUpdates();
        return START_STICKY;
    }

    private Notification buildNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent, PendingIntent.FLAG_IMMUTABLE
        );

        String title = "Wirral Jobe - Driver Active";
        String text = "You're online and receiving job offers";

        if ("ASSIGNED".equals(status)) {
            title = "Wirral Jobe - Job assigned";
            text = "Head to pickup location";
        } else if ("ON_WAY".equals(status)) {
            title = "Wirral Jobe - On the way";
            text = "Navigating to pickup";
        } else if ("ARRIVED".equals(status)) {
            title = "Wirral Jobe - Arrived";
            text = "Waiting at pickup";
        } else if ("POB".equals(status)) {
            title = "Wirral Jobe - Meter running";
            text = "Fare: " + formatCurrency(fare);
        }

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private String formatCurrency(String value) {
        try {
            double amount = Double.parseDouble(value);
            return NumberFormat.getCurrencyInstance(Locale.UK).format(amount);
        } catch (Exception e) {
            return "£" + value;
        }
    }

    private void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Driver Active",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows when you are online and tracking location");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startLocationUpdates() {
        if (locationCallback != null) return;

        LocationRequest locationRequest = new LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            LOCATION_INTERVAL_MS
        )
            .setMinUpdateDistanceMeters(MIN_DISTANCE_METERS)
            .setMinUpdateIntervalMillis(FASTEST_LOCATION_INTERVAL_MS)
            .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null) return;
                Location location = result.getLastLocation();
                if (location == null) return;
                lastLat = location.getLatitude();
                lastLng = location.getLongitude();
                sendLocationUpdate(lastLat, lastLng);
            }
        };

        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission not granted", e);
        }
    }

    private void sendLocationUpdate(double lat, double lng) {
        if (driverId.isEmpty() || driverToken.isEmpty()) return;

        executor.execute(() -> {
            try {
                String urlString = apiUrl.replaceAll("/+$", "") + "/api/driver/location";
                URL url = new URL(urlString);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("x-driver-id", driverId);
                conn.setRequestProperty("x-driver-token", driverToken);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setDoOutput(true);

                JSONObject body = new JSONObject();
                body.put("action", "driver/location");
                JSONObject payload = new JSONObject();
                payload.put("lat", lat);
                payload.put("lng", lng);
                body.put("payload", payload);
                JSONObject auth = new JSONObject();
                auth.put("driverId", driverId);
                auth.put("driverToken", driverToken);
                body.put("auth", auth);

                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                OutputStream os = conn.getOutputStream();
                os.write(bytes);
                os.flush();
                os.close();

                int responseCode = conn.getResponseCode();
                if (responseCode >= 200 && responseCode < 300) {
                    Log.d(TAG, "Location update sent successfully");
                    maybeFetchMeterUpdate();
                } else {
                    Log.w(TAG, "Location update failed: " + responseCode);
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Error sending location update", e);
            }
        });
    }

    private void maybeFetchMeterUpdate() {
        if (jobId.isEmpty() || !"POB".equals(status)) return;
        try {
            String urlString = apiUrl.replaceAll("/+$", "") + "/api/driver/jobs";
            URL url = new URL(urlString);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-driver-id", driverId);
            conn.setRequestProperty("x-driver-token", driverToken);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("action", "driver/jobs");
            body.put("payload", new JSONObject());
            JSONObject auth = new JSONObject();
            auth.put("driverId", driverId);
            auth.put("driverToken", driverToken);
            body.put("auth", auth);

            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream os = conn.getOutputStream();
            os.write(bytes);
            os.flush();
            os.close();

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();

            JSONObject response = new JSONObject(sb.toString());
            if (response.has("jobs")) {
                for (int i = 0; i < response.getJSONArray("jobs").length(); i++) {
                    JSONObject job = response.getJSONArray("jobs").getJSONObject(i);
                    if (jobId.equals(job.optString("jobId")) && job.has("meterFare")) {
                        fare = job.optString("meterFare", fare);
                        mainHandler.post(this::updateNotification);
                        break;
                    }
                }
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "Error fetching meter update", e);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
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
