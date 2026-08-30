package com.wirraljobe.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

public class JobOfferChannel {

    public static final String CHANNEL_ID = "job_offers_v2";

    public static void create(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Job Offers",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("New job offer alerts - pops up even when using other apps");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] { 0, 500, 200, 500, 200, 800 });
            channel.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build()
            );
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);

            NotificationChannel updates = new NotificationChannel(
                "job_updates",
                "Job availability",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            updates.setDescription("New bids, Pool bookings and other available work");
            updates.enableVibration(true);
            updates.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
                manager.createNotificationChannel(updates);
            }
        }
    }
}
