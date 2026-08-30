package com.wirraljobe.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class WirralJobeMessagingService extends FirebaseMessagingService {

    private static final String TAG = "WirralJobeMessagingService";
    private static final String CHANNEL_ID = JobOfferChannel.CHANNEL_ID;
    private static final String UPDATES_CHANNEL_ID = "job_updates";
    private static final int NOTIFICATION_ID_BASE = 2000;

    @Override
    public void onCreate() {
        super.onCreate();
        JobOfferChannel.create(this);
        createNotificationChannel();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);

        if (message.getData() == null || !"job_offer".equals(message.getData().get("type"))) {
            showUpdateNotification(message);
            return;
        }

        String jobId = message.getData().get("jobId");
        String driverId = message.getData().get("driverId");
        String acceptToken = message.getData().get("acceptToken");
        String declineToken = message.getData().get("declineToken");
        String pickup = message.getData().get("pickup");
        String dropoff = message.getData().get("dropoff");
        String fare = message.getData().get("fare");
        String title = message.getData().get("title");
        String body = message.getData().get("body");

        if (jobId == null || driverId == null || acceptToken == null || declineToken == null) {
            Log.w(TAG, "Offer push missing required tokens");
            return;
        }

        String apiUrl = getSharedPreferences("wirraljobe", Context.MODE_PRIVATE)
            .getString("apiUrl", "https://wirraljobe.com/");

        String displayTitle = title != null && !title.isEmpty() ? title : "New Job Offer!";
        String displayBody = body != null && !body.isEmpty() ? body : (pickup + " → " + dropoff);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle(displayTitle)
            .setContentText(displayBody)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setOngoing(false)
            .setContentIntent(openAppPendingIntent(jobId, driverId, acceptToken, declineToken, pickup, dropoff, fare, apiUrl))
            .addAction(android.R.drawable.ic_media_play, "Accept", actionPendingIntent("com.wirraljobe.app.action.ACCEPT_OFFER", jobId, driverId, acceptToken, declineToken, pickup, dropoff, fare, apiUrl))
            .addAction(android.R.drawable.ic_media_pause, "Decline", actionPendingIntent("com.wirraljobe.app.action.DECLINE_OFFER", jobId, driverId, acceptToken, declineToken, pickup, dropoff, fare, apiUrl))
            .build();

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(CHANNEL_ID, NOTIFICATION_ID_BASE + jobId.hashCode(), notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            UPDATES_CHANNEL_ID,
            "Job updates",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Booking and journey updates");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void showUpdateNotification(RemoteMessage message) {
        String title = message.getNotification() != null ? message.getNotification().getTitle() : message.getData().get("title");
        String body = message.getNotification() != null ? message.getNotification().getBody() : message.getData().get("body");
        if ((title == null || title.isEmpty()) && (body == null || body.isEmpty())) return;
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, message.getMessageId() != null ? message.getMessageId().hashCode() : (int) System.currentTimeMillis(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(this, UPDATES_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title != null ? title : "Wirral Jobe")
            .setContentText(body != null ? body : "")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build();
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(UPDATES_CHANNEL_ID, NOTIFICATION_ID_BASE + (message.getMessageId() != null ? message.getMessageId().hashCode() : (int) System.currentTimeMillis()), notification);
    }

    private PendingIntent openAppPendingIntent(String jobId, String driverId, String acceptToken, String declineToken, String pickup, String dropoff, String fare, String apiUrl) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("com.wirraljobe.app.action.SHOW_OFFER");
        intent.setData(Uri.parse("https://wirraljobe.com/driver?offer=" + Uri.encode(jobId)));
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        fillExtras(intent, jobId, driverId, acceptToken, declineToken, pickup, dropoff, fare, apiUrl);
        return PendingIntent.getActivity(this, jobId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent actionPendingIntent(String action, String jobId, String driverId, String acceptToken, String declineToken, String pickup, String dropoff, String fare, String apiUrl) {
        Intent intent = new Intent(this, OfferActionReceiver.class);
        intent.setAction(action);
        fillExtras(intent, jobId, driverId, acceptToken, declineToken, pickup, dropoff, fare, apiUrl);
        return PendingIntent.getBroadcast(this, (action + jobId).hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void fillExtras(Intent intent, String jobId, String driverId, String acceptToken, String declineToken, String pickup, String dropoff, String fare, String apiUrl) {
        intent.putExtra("jobId", jobId);
        intent.putExtra("driverId", driverId);
        intent.putExtra("acceptToken", acceptToken);
        intent.putExtra("declineToken", declineToken);
        intent.putExtra("pickup", pickup != null ? pickup : "");
        intent.putExtra("dropoff", dropoff != null ? dropoff : "");
        intent.putExtra("fare", fare != null ? fare : "");
        intent.putExtra("apiUrl", apiUrl);
    }
}
