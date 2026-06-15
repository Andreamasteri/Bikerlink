package com.bikerlink.app

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(OverlayPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()

    // ── DIAGNOSTIC: native crash reporter ────────────────────────────────────
    // Catches any uncaught Java/Kotlin/JNI exception BEFORE React Native starts
    // and POSTs the stack trace to the server via plain HttpURLConnection.
    // Safe in release: fires only on crash, no overhead otherwise.
    val prevHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        fun String.je() = replace("\\", "\\\\").replace("\"", "\\\"")
          .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
        val err = (throwable.message ?: throwable.javaClass.name).take(300).je()
        val stack = throwable.stackTraceToString().take(1800).je()
        val body = """{"step":"native_crash","platform":"android","data":{"newArch":"${BuildConfig.IS_NEW_ARCHITECTURE_ENABLED}","thread":"${thread.name.je()}","error":"$err","stack":"$stack"}}"""
        val t = Thread {
          runCatching {
            val conn = java.net.URL("https://biker-link.replit.app/api/admin/startup-beacon")
              .openConnection() as java.net.HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.connectTimeout = 3000
            conn.readTimeout = 3000
            conn.doOutput = true
            conn.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            conn.responseCode
            conn.disconnect()
          }
        }
        t.isDaemon = false
        t.start()
        t.join(4500)
      } catch (_: Throwable) {}
      prevHandler?.uncaughtException(thread, throwable)
    }
    // ─────────────────────────────────────────────────────────────────────────

    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
