package com.bikerlink.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import kotlin.math.sqrt

class OverlayService : Service() {

    companion object {
        const val ACTION_UPDATE_BADGES = "com.bikerlink.app.UPDATE_BADGES"
        const val EXTRA_BADGE_CHAT = "badge_chat"
        const val EXTRA_BADGE_NOTIF = "badge_notif"
        const val CHANNEL_ID = "bikerlink_overlay"
        const val NOTIFICATION_ID = 9001
    }

    private lateinit var windowManager: WindowManager
    private lateinit var overlayRoot: View
    private lateinit var badgeView: TextView
    private lateinit var layoutParams: WindowManager.LayoutParams

    private var badgeChat = 0
    private var badgeNotif = 0

    private val badgeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == ACTION_UPDATE_BADGES) {
                badgeChat = intent.getIntExtra(EXTRA_BADGE_CHAT, 0)
                badgeNotif = intent.getIntExtra(EXTRA_BADGE_NOTIF, 0)
                updateBadge()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        registerBadgeReceiver()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        buildOverlayView()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null) {
            badgeChat = intent.getIntExtra(EXTRA_BADGE_CHAT, 0)
            badgeNotif = intent.getIntExtra(EXTRA_BADGE_NOTIF, 0)
            if (::badgeView.isInitialized) updateBadge()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(badgeReceiver) } catch (_: Exception) {}
        try { windowManager.removeView(overlayRoot) } catch (_: Exception) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun registerBadgeReceiver() {
        val filter = IntentFilter(ACTION_UPDATE_BADGES)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(badgeReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(badgeReceiver, filter)
        }
    }

    private fun buildOverlayView() {
        val sizePx = dp(56)

        layoutParams = WindowManager.LayoutParams(
            sizePx, sizePx,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = resources.displayMetrics.widthPixels - sizePx - dp(16)
            y = resources.displayMetrics.heightPixels / 2
        }

        val container = FrameLayout(this)

        val ballBg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.parseColor("#FF6600"))
        }

        val ball = FrameLayout(this)
        ball.background = ballBg
        ball.elevation = dp(8).toFloat()

        val icon = TextView(this)
        icon.text = "\uD83D\uDD14"
        icon.textSize = 20f
        icon.gravity = Gravity.CENTER
        ball.addView(icon, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

        badgeView = TextView(this)
        badgeView.gravity = Gravity.CENTER
        badgeView.textSize = 9f
        badgeView.setTextColor(Color.WHITE)
        badgeView.typeface = Typeface.DEFAULT_BOLD
        badgeView.visibility = View.GONE
        val badgeBg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.parseColor("#E63946"))
        }
        badgeView.background = badgeBg
        val badgeSize = dp(18)
        val badgeParams = FrameLayout.LayoutParams(badgeSize, badgeSize).apply {
            gravity = Gravity.TOP or Gravity.END
            topMargin = 0
            marginEnd = 0
        }
        ball.addView(badgeView, badgeParams)

        container.addView(ball, FrameLayout.LayoutParams(sizePx, sizePx))
        overlayRoot = container

        var lastRawX = 0f
        var lastRawY = 0f
        var downRawX = 0f
        var downRawY = 0f

        container.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    lastRawX = event.rawX
                    lastRawY = event.rawY
                    downRawX = event.rawX
                    downRawY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - lastRawX
                    val dy = event.rawY - lastRawY
                    layoutParams.x += dx.toInt()
                    layoutParams.y += dy.toInt()
                    lastRawX = event.rawX
                    lastRawY = event.rawY
                    try { windowManager.updateViewLayout(overlayRoot, layoutParams) } catch (_: Exception) {}
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val totalDx = event.rawX - downRawX
                    val totalDy = event.rawY - downRawY
                    val dist = sqrt(totalDx * totalDx + totalDy * totalDy)
                    if (dist < dp(8)) {
                        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                        }
                        if (launchIntent != null) startActivity(launchIntent)
                    }
                    true
                }
                else -> false
            }
        }

        windowManager.addView(overlayRoot, layoutParams)
        updateBadge()
    }

    private fun updateBadge() {
        if (!::badgeView.isInitialized) return
        val total = badgeChat + badgeNotif
        overlayRoot.post {
            if (total > 0) {
                badgeView.text = if (total > 99) "99+" else total.toString()
                badgeView.visibility = View.VISIBLE
            } else {
                badgeView.visibility = View.GONE
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "BikerLink Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
            }
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("BikerLink")
            .setContentText("Widget notifiche attivo")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .setOngoing(true)
            .build()
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density + 0.5f).toInt()
}
