/**
 * Chrome Storage Quotas (reference):
 *  - chrome.storage.local  : 10 MB total (unlimited with "unlimitedStorage" permission)
 *  - chrome.storage.sync   : 100 KB total / 8 KB per item / 1,800 items max
 *  - chrome.storage.session: 10 MB (cleared when browser session ends)
 */

import { DEFAULT_DATA } from './schema.js';
import { migrateData } from './migrations.js';
import { validateData } from './validator.js';

const STORAGE_KEY = 'screenTimeData';

/**
 * Retrieves the data from chrome.storage.local, runs migration, validates structure, and returns it.
 * @returns {Promise<object>} The migrated and validated data
 */
export async function getData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  let data = result[STORAGE_KEY] || JSON.parse(JSON.stringify(DEFAULT_DATA));
  
  // Apply migrations
  data = migrateData(data);

  // Validate the data structure. If corrupt, fallback to DEFAULT_DATA.
  const validation = validateData(data);
  if (!validation.success) {
    console.warn('Data validation warning, falling back to DEFAULT_DATA. Errors:', validation.errors);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  return data;
}

/**
 * Saves data to chrome.storage.local.
 * @param {object} data - The complete data object to write
 */
export async function setData(data) {
  // Validate data prior to writing
  const validation = validateData(data);
  if (!validation.success) {
    console.error('Data validation failed on save! Data not written:', validation.errors);
    throw new Error(`Data validation failed: ${validation.errors.join(', ')}`);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

/**
 * Returns data for a specific date.
 * @param {string} dateStr - The date string formatted as YYYY-MM-DD
 * @returns {Promise<Record<string, number>>} Domain-to-seconds mapping
 */
export async function getDay(dateStr) {
  const data = await getData();
  return data.days[dateStr] || {};
}

/**
 * Adds seconds to a domain's tracked time on a given date.
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {string} domain - Domain name
 * @param {number} seconds - Number of seconds to add
 */
export async function addTimeToDomain(dateStr, domain, seconds) {
  const data = await getData();
  if (!data.days[dateStr]) {
    data.days[dateStr] = {};
  }
  if (!data.days[dateStr][domain]) {
    data.days[dateStr][domain] = 0;
  }
  data.days[dateStr][domain] += seconds;
  await setData(data);
}

/**
 * Updates/adds time to a domain on a given date (alias/wrapper for addTimeToDomain).
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @param {string} domain - Domain name
 * @param {number} seconds - Number of seconds to add
 */
export async function updateDay(dateStr, domain, seconds) {
  await addTimeToDomain(dateStr, domain, seconds);
}

/**
 * Retrieves the settings object.
 * @returns {Promise<object>} Settings object
 */
export async function getSettings() {
  const data = await getData();
  return data.settings;
}

/**
 * Deep-merges and updates the settings object.
 * @param {object} newSettings - Object containing settings to merge
 */
export async function updateSettings(newSettings) {
  const data = await getData();
  data.settings = {
    ...data.settings,
    ...newSettings,
    categories: {
      ...data.settings.categories,
      ...(newSettings.categories || {}),
    },
  };
  await setData(data);
}

/**
 * Retrieves metadata for a specific domain.
 * @param {string} domain - The domain name
 * @returns {Promise<object|null>} Metadata or null if not found
 */
export async function getDomainMeta(domain) {
  const data = await getData();
  return data.domains[domain] || null;
}

/**
 * Upserts metadata for a specific domain.
 * @param {string} domain - The domain name
 * @param {object} meta - Metadata object: { firstSeen: string, category: string|null }
 */
export async function updateDomainMeta(domain, meta) {
  const data = await getData();
  data.domains[domain] = {
    firstSeen: meta.firstSeen || new Date().toISOString(),
    category: meta.category !== undefined ? meta.category : null,
  };
  await setData(data);
}

/**
 * Appends a tracked session to the sessions list.
 * @param {object} session - Session object: { id, domain, startTime, endTime, duration }
 */
export async function addSession(session) {
  const data = await getData();
  data.sessions.push(session);
  await setData(data);
}

/**
 * Retrieves all sessions, optionally filtered by domain.
 * @param {string} [domain] - Optional domain filter
 * @returns {Promise<array>} Array of sessions
 */
export async function getSessions(domain) {
  const data = await getData();
  if (domain) {
    return data.sessions.filter(s => s.domain === domain);
  }
  return data.sessions;
}

/**
 * Clears tracked data for a specific date.
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 */
export async function clearDay(dateStr) {
  const data = await getData();
  if (data.days[dateStr]) {
    delete data.days[dateStr];
    await setData(data);
  }
}

/**
 * Fetches current data, converts to a JSON string, and triggers a browser file download.
 * File pattern: screenTime_backup_YYYY-MM-DD.json
 */
export async function exportData() {
  const data = await getData();
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const todayStr = new Date().toISOString().split('T')[0];
  const filename = `screenTime_backup_${todayStr}.json`;
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parses JSON, validates it using the Zod schema, and replaces the current storage data.
 * Throws clear errors if validation fails.
 * @param {string} jsonString - The raw JSON backup string
 */
export async function importData(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new SyntaxError(`Failed to parse JSON backup: ${err.message}`);
  }

  const validation = validateData(parsed);
  if (!validation.success) {
    throw new Error(`Import validation failed:\n- ${validation.errors.join('\n- ')}`);
  }

  await setData(validation.data || parsed);
}

/**
 * Deletes entries in the days object and sessions list older than the specified threshold
 * to prevent quota exhaustion.
 * @param {number} [daysToKeep=90] - Cutoff age in days
 * @returns {Promise<{ prunedDays: number, prunedSessions: number }>}
 */
export async function pruneOldData(daysToKeep = 90) {
  const data = await getData();
  const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  
  let prunedDays = 0;
  let prunedSessions = 0;

  // Prune days
  if (data.days) {
    for (const dateStr of Object.keys(data.days)) {
      const dateTime = new Date(dateStr).getTime();
      if (isNaN(dateTime) || dateTime < cutoffTime) {
        delete data.days[dateStr];
        prunedDays++;
      }
    }
  }

  // Prune sessions
  if (Array.isArray(data.sessions)) {
    const originalLength = data.sessions.length;
    data.sessions = data.sessions.filter(session => {
      const sessionTime = new Date(session.endTime || session.startTime).getTime();
      return !isNaN(sessionTime) && sessionTime >= cutoffTime;
    });
    prunedSessions = originalLength - data.sessions.length;
  }

  await setData(data);

  return {
    prunedDays,
    prunedSessions
  };
}
