import {
  getData,
  addTimeToDomain,
  addSession,
  getDomainMeta,
  updateDomainMeta,
  pruneOldData,
} from './lib/storage.js';
import { getDomain, getTodayStr } from './lib/utils.js';

// In-memory ephemeral tracking state
let activeTabId = null;
let activeDomain = null;
let sessionStart = null;      // Timestamp (ms) when current domain tracking began
let sessionStartDate = null;  // YYYY-MM-DD string when current tracking session began
let idleThreshold = 60;       // cached idle threshold in seconds

/**
 * Initializes/restores tracking state from settings and active tabs.
 */
async function initState() {
  try {
    const data = await getData();
    if (data && data.settings) {
      idleThreshold = data.settings.idleThreshold || 60;
    }
    chrome.idle.setDetectionInterval(idleThreshold);

    // Create periodic flush alarm (every 30 seconds)
    await chrome.alarms.create('periodic-flush', { periodInMinutes: 0.5 });

    // Perform background data pruning (housekeeping)
    await pruneOldData().catch(err => console.error('Pruning failed:', err));

    // Re-derive the active tab on start to resume tracking immediately
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.warn('Tab query error during initialization:', chrome.runtime.lastError.message);
        return;
      }
      if (tabs && tabs[0]) {
        const domain = getDomain(tabs[0].url);
        if (domain) {
          startTracking(domain, tabs[0].id);
        }
      }
    });
  } catch (err) {
    console.error('Error during background initialization:', err);
  }
}

/**
 * Starts tracking a domain.
 * @param {string} domain - Domain name to track
 * @param {number} tabId - ID of the tab holding this domain
 */
async function startTracking(domain, tabId) {
  if (!domain) return;
  
  activeTabId = tabId;
  activeDomain = domain;
  sessionStart = Date.now();
  sessionStartDate = getTodayStr();

  try {
    const meta = await getDomainMeta(domain);
    if (!meta) {
      await updateDomainMeta(domain, {
        firstSeen: new Date().toISOString(),
        category: null,
      });
    }
  } catch (err) {
    console.error(`Error updating metadata for domain ${domain}:`, err);
  }
}

/**
 * Commits elapsed time to storage and closes the active session.
 */
async function stopTracking() {
  if (!activeDomain || !sessionStart) {
    clearTrackingState();
    return;
  }

  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((now - sessionStart) / 1000));
  const startTimeISO = new Date(sessionStart).toISOString();
  const endTimeISO = new Date(now).toISOString();
  const domain = activeDomain;
  const startDate = sessionStartDate;

  clearTrackingState();

  if (elapsedSeconds > 0) {
    try {
      // 1. Commit time (handling midnight split if necessary)
      await flushTime(domain, elapsedSeconds, startDate);

      // 2. Add session log
      await addSession({
        id: crypto.randomUUID(),
        domain,
        startTime: startTimeISO,
        endTime: endTimeISO,
        duration: elapsedSeconds,
      });
    } catch (err) {
      console.error(`Error saving session/time for ${domain}:`, err);
    }
  }
}

/**
 * Resets the in-memory tracking variables.
 */
function clearTrackingState() {
  activeTabId = null;
  activeDomain = null;
  sessionStart = null;
  sessionStartDate = null;
}

/**
 * Flushes time, splitting it across the midnight boundary if the session spanned multiple days.
 * @param {string} domain 
 * @param {number} totalSeconds 
 * @param {string} startDayStr - YYYY-MM-DD when session started
 */
async function flushTime(domain, totalSeconds, startDayStr) {
  const currentDayStr = getTodayStr();
  
  if (startDayStr === currentDayStr) {
    // Standard case: session is entirely within today
    await addTimeToDomain(currentDayStr, domain, totalSeconds);
  } else {
    // Boundary case: session crossed midnight.
    // Pro-rate time: split based on when midnight occurred.
    try {
      const startDateObj = new Date(startDayStr + 'T23:59:59'); // approximate end of starting day
      const midnightTime = new Date(startDateObj.getTime() + 1000).getTime(); // midnight timestamp
      const sessionStartMs = Date.now() - (totalSeconds * 1000);
      
      if (sessionStartMs < midnightTime) {
        const secondsBeforeMidnight = Math.max(0, Math.floor((midnightTime - sessionStartMs) / 1000));
        const secondsAfterMidnight = Math.max(0, totalSeconds - secondsBeforeMidnight);

        if (secondsBeforeMidnight > 0) {
          await addTimeToDomain(startDayStr, domain, secondsBeforeMidnight);
        }
        if (secondsAfterMidnight > 0) {
          await addTimeToDomain(currentDayStr, domain, secondsAfterMidnight);
        }
      } else {
        // Fallback: commit everything to today if timestamps don't align cleanly
        await addTimeToDomain(currentDayStr, domain, totalSeconds);
      }
    } catch (err) {
      console.error('Error calculating midnight split, falling back:', err);
      await addTimeToDomain(currentDayStr, domain, totalSeconds);
    }
  }
}

/**
 * Periodic flush to commit ongoing time without resetting/stopping the session.
 * Prevents data loss if the service worker terminates unexpectedly.
 */
async function periodicFlush() {
  if (!activeDomain || !sessionStart) return;

  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((now - sessionStart) / 1000));
  const domain = activeDomain;
  const startDate = sessionStartDate;

  // Reset session start to now for the next interval
  sessionStart = now;
  sessionStartDate = getTodayStr();

  if (elapsedSeconds > 0) {
    try {
      await flushTime(domain, elapsedSeconds, startDate);
    } catch (err) {
      console.error(`Error performing periodic flush for ${domain}:`, err);
    }
  }
}

/**
 * Handles tab transitions.
 * @param {number} tabId 
 */
async function handleTabChange(tabId) {
  await stopTracking();
  
  if (!tabId) return;

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      // Tab may have closed before we could inspect it
      return;
    }
    if (tab && tab.url) {
      const domain = getDomain(tab.url);
      if (domain) {
        startTracking(domain, tabId);
      }
    }
  });
}

// --- Event Listeners ---

// 1. Tab Focus changes
chrome.tabs.onActivated.addListener(({ tabId }) => {
  handleTabChange(tabId).catch(err => console.error('Error in onActivated:', err));
});

// 2. Tab URL updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    handleTabChange(tabId).catch(err => console.error('Error in onUpdated:', err));
  }
});

// 3. Window Focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    stopTracking().catch(err => console.error('Error in onFocusChanged (lost focus):', err));
  } else {
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (chrome.runtime.lastError) return;
      if (tabs && tabs[0]) {
        handleTabChange(tabs[0].id).catch(err => console.error('Error in onFocusChanged (gained focus):', err));
      }
    });
  }
});

// 4. Idle State transitions
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') {
    stopTracking().catch(err => console.error('Error during idle transition:', err));
  } else if (state === 'active') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return;
      if (tabs && tabs[0]) {
        const domain = getDomain(tabs[0].url);
        if (domain) {
          startTracking(domain, tabs[0].id).catch(err => console.error('Error resuming tracking after idle:', err));
        }
      }
    });
  }
});

// 5. Alarms for periodic flush
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodic-flush') {
    periodicFlush().catch(err => console.error('Error in periodic flush alarm:', err));
  }
});

// 6. Settings updates - dynamically change idle threshold
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.screenTimeData) {
    const newVal = changes.screenTimeData.newValue;
    if (newVal && newVal.settings && newVal.settings.idleThreshold !== undefined) {
      if (newVal.settings.idleThreshold !== idleThreshold) {
        idleThreshold = newVal.settings.idleThreshold;
        chrome.idle.setDetectionInterval(idleThreshold);
      }
    }
  }
});

// 7. Service Worker Lifecycle Hooks
chrome.runtime.onInstalled.addListener(() => {
  initState().catch(err => console.error('Error onInstalled:', err));
});

chrome.runtime.onStartup.addListener(() => {
  initState().catch(err => console.error('Error onStartup:', err));
});
