package com.bikerlink.app

import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OverlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BikerLinkOverlay"

    @ReactMethod
    fun checkPermission(promise: Promise) {
        try {
            val granted = Settings.canDrawOverlays(reactContext)
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestPermission() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:${reactContext.packageName}")
        ).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        try {
            reactContext.startActivity(intent)
        } catch (_: Exception) {
            val fallback = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            try { reactContext.startActivity(fallback) } catch (_: Exception) {}
        }
    }

    @ReactMethod
    fun showOverlay(badgeChat: Int, badgeNotif: Int) {
        if (!Settings.canDrawOverlays(reactContext)) return
        val intent = Intent(reactContext, OverlayService::class.java).apply {
            putExtra(OverlayService.EXTRA_BADGE_CHAT, badgeChat)
            putExtra(OverlayService.EXTRA_BADGE_NOTIF, badgeNotif)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun hideOverlay() {
        val intent = Intent(reactContext, OverlayService::class.java)
        reactContext.stopService(intent)
    }

    @ReactMethod
    fun updateBadges(badgeChat: Int, badgeNotif: Int) {
        val intent = Intent(OverlayService.ACTION_UPDATE_BADGES).apply {
            `package` = reactContext.packageName
            putExtra(OverlayService.EXTRA_BADGE_CHAT, badgeChat)
            putExtra(OverlayService.EXTRA_BADGE_NOTIF, badgeNotif)
        }
        reactContext.sendBroadcast(intent)
    }
}
