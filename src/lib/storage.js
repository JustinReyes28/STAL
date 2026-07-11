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

  // Validate the data structure (log errors but return data to prevent locking the user out)
  const validation = validateData(data);
  if (!validation.success) {
    console.warn('Data validation warning:', validation.errors);
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
