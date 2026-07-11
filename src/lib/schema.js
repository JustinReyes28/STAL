export const SCHEMA_VERSION = 1;

export const DEFAULT_DATA = {
  schemaVersion: SCHEMA_VERSION,
  settings: {
    categories: {}, // { [categoryName]: string[] } (domain arrays per category)
    idleThreshold: 60, // seconds
    trackStartTime: null, // ISO string or null
  },
  days: {}, // { [dateStr]: { [domain]: seconds } }
  sessions: [], // Array of { id, domain, startTime, endTime, duration }
  domains: {}, // { [domain]: { firstSeen: string, category: string | null } }
};
