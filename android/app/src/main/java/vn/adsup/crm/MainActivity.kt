package vn.adsup.crm

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
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
                ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
            }
        }
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
    }
}
