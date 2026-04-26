# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ─── React Native Core ───────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ─── Hermes JS Engine ────────────────────────────────────────────────────────
-keep class com.facebook.hermes.unicode.** { *; }
-dontwarn com.facebook.hermes.**

# ─── expo-reanimated ─────────────────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }

# ─── Expo Modules ────────────────────────────────────────────────────────────
-keep class expo.** { *; }
-keepclassmembers class * {
    @expo.modules.kotlin.* *;
}
-keep class com.expo.modules.** { *; }

# ─── AndroidX / Jetpack ──────────────────────────────────────────────────────
-keep class androidx.** { *; }
-dontwarn androidx.**

# ─── OkHttp (networking used by React Native) ────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# ─── Annotations & Serialization ─────────────────────────────────────────────
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Signature
-keep public class * extends java.lang.Exception

# ─── JavaScript interface bridges ────────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ─── Suppress known-safe warnings ────────────────────────────────────────────
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**
