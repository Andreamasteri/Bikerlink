/**
 * Provider status store — tracks tile provider availability.
 * Statuses are kept in memory for fast reads and flushed to app_settings.
 * Key: `tile_provider_status_<providerId>`
 */

import { storage } from "../../storage";

export enum ProviderStatus {
  active = "active",
  quota_exceeded = "quota_exceeded",
  unreachable = "unreachable",
}

const statusCache = new Map<string, ProviderStatus>();

function settingKey(providerId: string): string {
  return `tile_provider_status_${providerId}`;
}

export async function getStatus(providerId: string): Promise<ProviderStatus> {
  if (statusCache.has(providerId)) return statusCache.get(providerId)!;
  try {
    const setting = await storage.getAppSetting(settingKey(providerId));
    const val = (setting?.value ?? ProviderStatus.active) as ProviderStatus;
    const status = Object.values(ProviderStatus).includes(val) ? val : ProviderStatus.active;
    statusCache.set(providerId, status);
    return status;
  } catch {
    return ProviderStatus.active;
  }
}

async function setStatus(providerId: string, status: ProviderStatus): Promise<void> {
  statusCache.set(providerId, status);
  try {
    await storage.upsertAppSetting(settingKey(providerId), status);
  } catch (err) {
    console.error(`[provider-status] Failed to persist status for ${providerId}:`, err);
  }
}

export async function markQuotaExceeded(providerId: string): Promise<void> {
  console.warn(`[provider-status] Quota exceeded for provider: ${providerId}`);
  await setStatus(providerId, ProviderStatus.quota_exceeded);
}

export async function markUnreachable(providerId: string): Promise<void> {
  console.warn(`[provider-status] Provider unreachable: ${providerId}`);
  await setStatus(providerId, ProviderStatus.unreachable);
}

export async function resetStatus(providerId: string): Promise<void> {
  console.log(`[provider-status] Status reset to active for: ${providerId}`);
  await setStatus(providerId, ProviderStatus.active);
}
