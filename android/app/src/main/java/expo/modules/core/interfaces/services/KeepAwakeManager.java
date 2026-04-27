package expo.modules.core.interfaces.services;

/**
 * Stub for expo.modules.core.interfaces.services.KeepAwakeManager.
 *
 * This class was removed from expo-modules-core in SDK 55, but expo-av 16.0.8
 * still references it in FullscreenVideoPlayer. R8 needs the class to exist at
 * compile time. At runtime, getLegacyModuleRegistry() returns null so this code
 * path is never reached.
 */
public interface KeepAwakeManager {
    boolean isActivated();
}
