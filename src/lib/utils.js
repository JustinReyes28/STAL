// Placeholder for helper utilities
export const formatTime = (ms) => {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ${sec % 60}s`;
};

/**
 * Formats seconds into a human-readable "Xh Xm" string.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatSeconds(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${totalSeconds}s`;
}

/**
 * Extracts the hostname from a URL string.
 * Returns null for invalid URLs, chrome:// pages, or empty inputs.
 * @param {string} url
 * @returns {string|null}
 */
export function getDomain(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Returns today's date as a YYYY-MM-DD string in local time.
 * @returns {string}
 */
export function getTodayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
