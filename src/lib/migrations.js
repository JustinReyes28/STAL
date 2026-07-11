import { SCHEMA_VERSION } from './schema.js';

const MIGRATIONS = {
  1: (data) => {
    // Version 1 is the baseline schema structure
    if (!data.schemaVersion) {
      data.schemaVersion = 1;
    }
    return data;
  },
  // Future migrations:
  // 2: (data) => { ... updates ... data.schemaVersion = 2; return data; }
};

/**
 * Migrates data sequentially through schema versions until it reaches the target version.
 * @param {object} data - The data object to migrate
 * @param {number} targetVersion - The target schema version to reach (defaults to current SCHEMA_VERSION)
 * @returns {object} The migrated data
 */
export function migrateData(data, targetVersion = SCHEMA_VERSION) {
  let currentVersion = data.schemaVersion || 0;

  // Hydrate baseline properties if migrating from nothing
  if (currentVersion === 0) {
    data = MIGRATIONS[1](data);
    currentVersion = 1;
  }

  // Sequentially apply migrations
  for (let v = currentVersion + 1; v <= targetVersion; v++) {
    if (MIGRATIONS[v]) {
      data = MIGRATIONS[v](data);
    }
  }

  data.schemaVersion = targetVersion;
  return data;
}
