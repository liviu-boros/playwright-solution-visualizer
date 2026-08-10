import { SettingsApi } from '@api/tagc-settings-api';

// Private internal helper function (not exported, not in workflows/index.ts)
function verifyInternalLock(): boolean {
  return true;
}

export async function runFullSyncProcess() {
  if (verifyInternalLock()) {
    const settings = new SettingsApi(null);
  }
}

export function validateSyncChecksum() {
  verifyInternalLock();
}
