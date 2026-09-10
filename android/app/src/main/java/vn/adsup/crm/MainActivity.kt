package vn.adsup.crm

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var cachedFcmToken: String? = null
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var mediaPlayer: MediaPlayer? = null

    companion object {
        private const val NOTIFICATION_PERMISSION_REQUEST = 1001
        private const val MICROPHONE_PERMISSION_REQUEST = 1002
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        
        // 1. Cấp quyền nhận thông báo cho Android 13+
        checkNotificationPermission()
        
        // 2. Lấy FCM Token từ Google Firebase SDK
        fetchFcmToken()

        // 3. Phân tích Cold Start: Xem có mở app từ thông báo lúc đang TẮT HẲN hay không
        var startUrl = "https://crm.adsup.vn"
        val data = intent.data
        if (Intent.ACTION_VIEW == intent.action && data != null) {
            startUrl = data.toString()
            Log.d("FCM_CLICK", "Cold Start - Loading Target URL directly: $startUrl")
        } else {
            Log.d("FCM_CLICK", "Normal Start - Loading Homepage: $startUrl")
        }

        setupWebView(startUrl)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView(initialUrl: String) {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

        // Thêm Javascript Interface (Cầu nối Android Bridge cho web Vue 3 gọi lấy Token)
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Đẩy token xuống web khi trang load hoàn thành
                cachedFcmToken?.let { sendTokenToWeb(it) }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val asksForAudio = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if (!asksForAudio) {
                        request.deny()
                        return@runOnUiThread
                    }

                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        pendingWebPermissionRequest?.deny()
                        pendingWebPermissionRequest = request
                        ActivityCompat.requestPermissions(
                            this@MainActivity,
                            arrayOf(Manifest.permission.RECORD_AUDIO),
                            MICROPHONE_PERMISSION_REQUEST
                        )
                    }
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                if (pendingWebPermissionRequest === request) {
                    pendingWebPermissionRequest = null
                }
            }
        }

        // Tải trang web (Tránh xung đột tải đi tải lại)
        webView.loadUrl(initialUrl)
    }

    // 4. Xử lý Warm Start: Khi app đang MỞ SẴN hoặc CHẠY NGẦM mà click vào thông báo
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let {
            val data = it.data
            if (Intent.ACTION_VIEW == it.action && data != null) {
                val targetUrl = data.toString()
                Log.d("FCM_CLICK", "Warm Start - Switching URL directly: $targetUrl")
                webView.post {
                    webView.loadUrl(targetUrl)
                }
            }
        }
    }

    private fun checkNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_REQUEST)
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != MICROPHONE_PERMISSION_REQUEST) return

        val webRequest = pendingWebPermissionRequest ?: return
        pendingWebPermissionRequest = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            webRequest.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        } else {
            webRequest.deny()
            Toast.makeText(this, "Cần cấp quyền microphone để ghi âm", Toast.LENGTH_LONG).show()
        }
    }

    override fun onDestroy() {
        mediaPlayer?.release()
        mediaPlayer = null
        webView.destroy()
        super.onDestroy()
    }

    private fun fetchFcmToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                cachedFcmToken = task.result
                Log.d("FCM_TOKEN", "FCM Token Fetched: $cachedFcmToken")
                cachedFcmToken?.let { sendTokenToWeb(it) }
            } else {
                Log.e("FCM_TOKEN", "Failed to fetch FCM token", task.exception)
            }
        }
    }

    private fun sendTokenToWeb(token: String) {
        webView.post {
            // Thực thi đoạn mã javascript truyền token cho hàm toàn cục của Vue 3
            webView.evaluateJavascript("javascript:if(window.onFcmTokenReceived) { window.onFcmTokenReceived('$token'); }", null)
        }
    }

    // Định nghĩa đối tượng Cầu nối Javascript Interface
    inner class AndroidBridge {
        @JavascriptInterface
        fun getFcmToken(): String = cachedFcmToken ?: ""
        
        @JavascriptInterface
        fun showToast(msg: String) {
            Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
        }

        @JavascriptInterface
        fun playAudio(url: String) {
            if (!url.startsWith("https://crm.adsup.vn/")) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Đường dẫn âm thanh không hợp lệ", Toast.LENGTH_SHORT).show()
                }
                return
            }

            runOnUiThread {
                try {
                    mediaPlayer?.release()
                    mediaPlayer = MediaPlayer().apply {
                        setAudioAttributes(
                            AudioAttributes.Builder()
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .build()
                        )
                        setDataSource(url)
                        setOnPreparedListener { it.start() }
                        setOnCompletionListener {
                            it.release()
                            if (mediaPlayer === it) mediaPlayer = null
                        }
                        setOnErrorListener { player, _, _ ->
                            player.release()
                            if (mediaPlayer === player) mediaPlayer = null
                            Toast.makeText(this@MainActivity, "Không phát được tin nhắn thoại", Toast.LENGTH_SHORT).show()
                            true
                        }
                        prepareAsync()
                    }
                } catch (error: Exception) {
                    Log.e("VOICE_PLAYER", "Failed to play audio", error)
                    Toast.makeText(this@MainActivity, "Không phát được tin nhắn thoại", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun stopAudio() {
            runOnUiThread {
                mediaPlayer?.release()
                mediaPlayer = null
            }
        }
    }
}
