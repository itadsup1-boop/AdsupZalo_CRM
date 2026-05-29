package vn.adsup.crm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.util.Random

class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        // Trích xuất tiêu đề và nội dung tin nhắn
        val title = remoteMessage.notification?.title ?: remoteMessage.data["title"] ?: "Adsup CRM"
        val body = remoteMessage.notification?.body ?: remoteMessage.data["body"] ?: "Bạn có tin nhắn mới"
        
        // Trích xuất path tương đối (VD: /chat/conversation-uuid)
        val relativeUrl = remoteMessage.data["url"] ?: "/chat"
        val fullUrl = "https://crm.adsup.vn$relativeUrl"

        Log.d("FCM_RECEIVE", "Received FCM message. Content: $body. Target URL: $fullUrl")
        sendNotification(title, body, fullUrl)
    }

    private fun sendNotification(title: String, messageBody: String, targetUrl: String) {
        // Tạo Intent mở MainActivity kèm theo Deep Link URL
        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(targetUrl)
            // FLAG_ACTIVITY_CLEAR_TOP và FLAG_ACTIVITY_SINGLE_TOP tránh việc tạo lại nhiều Activity chồng chéo
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 
            Random().nextInt(10000), 
            intent,
            flags
        )

        val channelId = "adsup_crm_notifications"
        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        
        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification) // Icon thông báo vector trắng
            .setContentTitle(title)
            .setContentText(messageBody)
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Tạo kênh thông báo cho Android 8.0 trở lên
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "Tin nhắn Adsup CRM", NotificationManager.IMPORTANCE_HIGH)
            notificationManager.createNotificationChannel(channel)
        }

        notificationManager.notify(Random().nextInt(10000), notificationBuilder.build())
    }
}
