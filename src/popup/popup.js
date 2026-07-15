import { getData } from '../lib/storage.js';
import { formatSeconds, getDomain, getTodayStr } from '../lib/utils.js';

// Local Globe SVG path string to render the local placeholder icon
const GLOBE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"></circle>
  <line x1="2" y1="12" x2="22" y2="12"></line>
  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
</svg>`;

let activeDomain = null;
let localStartTime = null;
let timerInterval = null;

// Track total time for today + add local live increments
let todayTotalSeconds = 0;
let todayDomainSeconds = {};

// DOM Elements
const totalTimeEl = document.getElementById('total-time');
const liveSectionEl = document.getElementById('live-section');
const liveDomainEl = document.getElementById('live-domain');
const liveTimerEl = document.getElementById('live-timer');
const siteListEl = document.getElementById('site-list');

/**
 * Renders the list of top sites
 * @param {Array<{domain: string, seconds: number}>} sites
 * @param {number} topSitesCount
 */
function renderSiteList(sites, topSitesCount) {
  siteListEl.innerHTML = '';
  
  if (sites.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'site-list__empty';
    emptyLi.id = 'empty-msg';
    emptyLi.textContent = 'No data yet. Start browsing!';
    siteListEl.appendChild(emptyLi);
    return;
  }

  // Display up to topSitesCount sites
  const displaySites = sites.slice(0, topSitesCount);
  const maxSeconds = Math.max(...displaySites.map(s => s.seconds), 1);

  displaySites.forEach(site => {
    const li = document.createElement('li');
    li.className = 'site-item';

    const pct = ((site.seconds / maxSeconds) * 100).toFixed(1);

    li.innerHTML = `
      <div class="site-icon">${GLOBE_SVG}</div>
      <div class="site-info">
        <div class="site-header">
          <span class="site-name" title="${site.domain}">${site.domain}</span>
          <span class="site-time">${formatSeconds(site.seconds)}</span>
        </div>
        <div class="bar-container">
          <div class="bar" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
    siteListEl.appendChild(li);
  });
}

/**
 * Processes today's stats, calculates live elapsed time, and renders the UI
 */
async function loadAndRender() {
  try {
    const data = await getData();
    const todayStr = getTodayStr();
    todayDomainSeconds = data.days[todayStr] || {};
    
    // Calculate initial total
    todayTotalSeconds = Object.values(todayDomainSeconds).reduce((sum, s) => sum + s, 0);

    // Read topSitesCount setting from schema (or fallback to 5)
    const settings = data.settings || {};
    const topSitesCount = settings.topSitesCount !== undefined ? settings.topSitesCount : 5;

    // Detect currently active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeDomain = tab ? getDomain(tab.url) : null;

    if (activeDomain) {
      // Local tracking starts when popup is opened
      localStartTime = Date.now();
      liveSectionEl.removeAttribute('hidden');
      liveDomainEl.textContent = activeDomain;
      liveTimerEl.textContent = '0s';
      
      // Setup interval to increment active site & total site time locally every second
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - localStartTime) / 1000);
        liveTimerEl.textContent = formatSeconds(elapsed);

        // Compute live values
        const currentDomainBase = todayDomainSeconds[activeDomain] || 0;
        const liveDomainTotal = currentDomainBase + elapsed;
        const liveTodayTotal = todayTotalSeconds + elapsed;

        // Render current totals
        totalTimeEl.textContent = formatSeconds(liveTodayTotal);

        // Re-construct the list with live increment
        const mergedDomains = { ...todayDomainSeconds };
        mergedDomains[activeDomain] = liveDomainTotal;

        const sortedSites = Object.entries(mergedDomains)
          .map(([domain, seconds]) => ({ domain, seconds }))
          .sort((a, b) => b.seconds - a.seconds);

        renderSiteList(sortedSites, topSitesCount);
      }, 1000);
    } else {
      liveSectionEl.setAttribute('hidden', '');
      if (timerInterval) clearInterval(timerInterval);
    }

    // Render initial view
    totalTimeEl.textContent = formatSeconds(todayTotalSeconds);
    const sortedSites = Object.entries(todayDomainSeconds)
      .map(([domain, seconds]) => ({ domain, seconds }))
      .sort((a, b) => b.seconds - a.seconds);

    renderSiteList(sortedSites, topSitesCount);

  } catch (err) {
    console.error('Failed to load and render popup:', err);
    totalTimeEl.textContent = 'Error';
    siteListEl.innerHTML = `<li class="site-list__empty">Could not load tracker data.</li>`;
  }
}

// Navigation & Actions
document.getElementById('btn-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
});

const openOptions = () => chrome.runtime.openOptionsPage();
document.getElementById('btn-options').addEventListener('click', openOptions);
document.getElementById('btn-options-footer').addEventListener('click', openOptions);

// Initialize
document.addEventListener('DOMContentLoaded', loadAndRender);
