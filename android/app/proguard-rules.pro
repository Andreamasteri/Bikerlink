# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ─── React Native Core (required — JNI + bridge cannot be shrunk) ─────────────
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# ─── Hermes JS Engine (symbols needed by JNI reflection) ─────────────────────
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.hermes.reactexecutor.** { *; }

# ─── expo-reanimated (uses reflection on these packages) ──────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# ─── Expo native modules (module registration uses reflection) ────────────────
-keep class expo.modules.core.** { *; }
-keep class expo.modules.kotlin.** { *; }
-keep class host.exp.exponent.** { *; }

# ─── JavaScript bridges (JavascriptInterface annotation) ─────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ─── Annotations & debugging info ────────────────────────────────────────────
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Signature
-keep public class * extends java.lang.Exception

# ─── OkHttp — keep only what reflection needs ────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**

# ─── Suppress known-safe warnings ────────────────────────────────────────────
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
