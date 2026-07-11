import { getData, setData } from './storage.js';
import { validateData } from './validator.js';

const BACKUP_KEY = 'screenTimeBackup';

/**
 * Snapshots the current tracking data and saves it under the screenTimeBackup storage key.
 * @returns {Promise<object>} The backup metadata { createdAt, schemaVersion }
 */
export async function createBackup() {
  const currentData = await getData();
  const backupObject = {
    createdAt: new Date().toISOString(),
    schemaVersion: currentData.schemaVersion,
    data: currentData,
  };
  await chrome.storage.local.set({ [BACKUP_KEY]: backupObject });
  return {
    createdAt: backupObject.createdAt,
    schemaVersion: backupObject.schemaVersion,
  };
}

/**
 * Restores data from the backup storage key, runs schema validation, and saves it as active tracking data.
 * @returns {Promise<boolean>} Success status of restore
 */
export async function restoreBackup() {
  const result = await chrome.storage.local.get(BACKUP_KEY);
  const backupObject = result[BACKUP_KEY];
  
  if (!backupObject || !backupObject.data) {
    throw new Error('No backup data found to restore.');
  }

  // Validate the backup data before applying
  const validation = validateData(backupObject.data);
  if (!validation.success) {
    throw new Error(`Backup data failed validation: ${validation.errors.join(', ')}`);
  }

  await setData(backupObject.data);
  return true;
}

/**
 * Gets info about the current backup without pulling the entire payload.
 * @returns {Promise<{ createdAt: string, schemaVersion: number } | null>}
 */
export async function getBackupInfo() {
  const result = await chrome.storage.local.get(BACKUP_KEY);
  const backupObject = result[BACKUP_KEY];
  if (!backupObject) return null;
  return {
    createdAt: backupObject.createdAt,
    schemaVersion: backupObject.schemaVersion,
  };
}

/**
 * Deletes the backup from chrome.storage.local.
 */
export async function clearBackup() {
  await chrome.storage.local.remove(BACKUP_KEY);
}
