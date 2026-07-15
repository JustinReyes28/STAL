import { getData, exportData, importData } from '../lib/storage.js';
import { formatSeconds, getTodayStr } from '../lib/utils.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Application State
let allData = null;
let currentRange = 'today'; // 'today' | '7d' | '30d' | 'custom'
let customFrom = '';
let customTo = '';

// Chart instances
let chartDaily = null;
let chartDomains = null;

// Sort state for domain table
let sortCol = 'totalTime';
let sortDir = 'desc'; // 'asc' | 'desc'

// Initialize dashboard page
async function init() {
  await loadData();
  setupNavigation();
  setupDateFilters();
  setupImportExport();
  setupTableSort();
  renderAll();
}

async function loadData() {
  try {
    allData = await getData();
  } catch (err) {
    console.error('Failed to load storage data:', err);
    showToast('❌ Error loading data', 'error');
  }
}

// Simple single-page section scrolling & active styling
function setupNavigation() {
  const links = document.querySelectorAll('.topbar-nav a');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });
}

// Date Range Filtering Events
function setupDateFilters() {
  const rangeButtons = document.querySelectorAll('.range-btn');
  const customInputs = document.getElementById('custom-range-inputs');
  const applyBtn = document.getElementById('btn-apply-range');
  const rangeFromInput = document.getElementById('range-from');
  const rangeToInput = document.getElementById('range-to');

  // Set default values for custom range to today
  const today = getTodayStr();
  rangeFromInput.value = today;
  rangeToInput.value = today;

  rangeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      rangeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const range = btn.dataset.range;
      currentRange = range;

      if (range === 'custom') {
        customInputs.style.display = 'flex';
      } else {
        customInputs.style.display = 'none';
        renderAll();
      }
    });
  });

  applyBtn.addEventListener('click', () => {
    customFrom = rangeFromInput.value;
    customTo = rangeToInput.value;
    if (!customFrom || !customTo) {
      showToast('⚠️ Please specify both start and end dates', 'error');
      return;
    }
    renderAll();
  });
}

// JSON Import & Export Binding
function setupImportExport() {
  document.getElementById('btn-export').addEventListener('click', async () => {
    try {
      await exportData();
      showToast('⬇️ Backup file downloaded');
    } catch (err) {
      showToast('❌ Export failed', 'error');
    }
  });

  document.getElementById('input-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      await importData(text);
      showToast('⬆️ Import successful!');
      await loadData();
      renderAll();
    } catch (err) {
      showToast(`❌ Import failed: ${err.message}`, 'error');
    }
    // Reset file input value to allow importing same file again
    e.target.value = '';
  });
}

// Table column headers sort binding
function setupTableSort() {
  const headers = document.querySelectorAll('#domain-table th[data-col]');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const col = header.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'desc';
      }
      
      // Update arrows UI
      headers.forEach(h => {
        const text = h.textContent.replace(/[↕↑↓]/g, '').trim();
        if (h.dataset.col === sortCol) {
          h.textContent = `${text} ${sortDir === 'asc' ? '↑' : '↓'}`;
        } else {
          h.textContent = `${text} ↕`;
        }
      });

      // Render updated table
      const filtered = getFilteredData();
      renderDomainTable(filtered.domains, allData.domains);
    });
  });
}

// Data Filtering & Aggregation Engine
function getFilteredData() {
  const todayStr = getTodayStr();
  let fromDate = todayStr;
  let toDate = todayStr;

  if (currentRange === '7d') {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    fromDate = d.toISOString().split('T')[0];
  } else if (currentRange === '30d') {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    fromDate = d.toISOString().split('T')[0];
  } else if (currentRange === 'custom') {
    fromDate = customFrom;
    toDate = customTo;
  }

  // Filter Days object
  const filteredDays = {};
  if (allData && allData.days) {
    Object.keys(allData.days).forEach(dateStr => {
      if (dateStr >= fromDate && dateStr <= toDate) {
        filteredDays[dateStr] = allData.days[dateStr];
      }
    });
  }

  // Filter Sessions list
  const filteredSessions = [];
  if (allData && allData.sessions) {
    allData.sessions.forEach(session => {
      const sessionDate = session.startTime.split('T')[0];
      if (sessionDate >= fromDate && sessionDate <= toDate) {
        filteredSessions.push(session);
      }
    });
  }

  // Aggregate domains time sum
  const domainsMap = {};
  Object.keys(filteredDays).forEach(dateStr => {
    const dayData = filteredDays[dateStr];
    Object.keys(dayData).forEach(domain => {
      if (!domainsMap[domain]) {
        domainsMap[domain] = { domain, totalTime: 0, sessions: 0 };
      }
      domainsMap[domain].totalTime += dayData[domain];
    });
  });

  // Calculate session count per domain
  filteredSessions.forEach(session => {
    if (domainsMap[session.domain]) {
      domainsMap[session.domain].sessions += 1;
    }
  });

  const domainsList = Object.values(domainsMap);

  return {
    days: filteredDays,
    sessions: filteredSessions,
    domains: domainsList,
    range: { from: fromDate, to: toDate }
  };
}

// Primary Render Coordinator
function renderAll() {
  if (!allData) return;

  const filtered = getFilteredData();
  
  renderSummary(filtered);
  renderCharts(filtered);
  renderDomainTable(filtered.domains, allData.domains);
  renderSessionsTable(filtered.sessions);
}

// Stat summary cards render
function renderSummary(filtered) {
  // Total tracked time
  let totalSeconds = 0;
  filtered.domains.forEach(d => {
    totalSeconds += d.totalTime;
  });
  document.getElementById('stat-total-time').textContent = formatSeconds(totalSeconds);
  document.getElementById('stat-total-sub').textContent = `${filtered.domains.length} domains visited`;

  // Top domain
  let topDomain = 'None';
  let topDomainTime = 0;
  filtered.domains.forEach(d => {
    if (d.totalTime > topDomainTime) {
      topDomain = d.domain;
      topDomainTime = d.totalTime;
    }
  });
  document.getElementById('stat-top-site').textContent = topDomain;
  document.getElementById('stat-top-site').title = topDomain;
  document.getElementById('stat-top-site-time').textContent = topDomainTime > 0 ? `${formatSeconds(topDomainTime)} tracked` : '0m';

  // Active Days count
  const activeDaysCount = Object.keys(filtered.days).length;
  document.getElementById('stat-active-days').textContent = activeDaysCount;
  document.getElementById('stat-active-days-sub').textContent = `Log entries found`;

  // Longest session duration
  let longestSessionSec = 0;
  let longestDomain = 'None';
  filtered.sessions.forEach(s => {
    const duration = s.duration || 0;
    if (duration > longestSessionSec) {
      longestSessionSec = duration;
      longestDomain = s.domain;
    }
  });
  document.getElementById('stat-longest-session').textContent = formatSeconds(longestSessionSec);
  document.getElementById('stat-longest-session-domain').textContent = longestDomain;
  document.getElementById('stat-longest-session-domain').title = longestDomain;
}

// Charts (Bar & Doughnut) generation using Chart.js
function renderCharts(filtered) {
  // Destroy old charts to clean canvas state
  if (chartDaily) {
    chartDaily.destroy();
    chartDaily = null;
  }
  if (chartDomains) {
    chartDomains.destroy();
    chartDomains = null;
  }

  // 1. Daily Breakdown Bar Chart
  const sortedDates = Object.keys(filtered.days).sort();
  const dailyLabels = [];
  const dailyData = [];

  // If showing today, slice into 1h or show just today bar. Let's show bars for all dates in date range.
  if (sortedDates.length === 0) {
    // Empty state
  } else {
    sortedDates.forEach(dateStr => {
      // Formatted date label (e.g., 'Jul 15')
      try {
        const parts = dateStr.split('-');
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        dailyLabels.push(dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
      } catch {
        dailyLabels.push(dateStr);
      }

      // Compute total minutes for the day
      let daySeconds = 0;
      Object.values(filtered.days[dateStr]).forEach(sec => {
        daySeconds += sec;
      });
      dailyData.push(Math.round(daySeconds / 60)); // in minutes
    });
  }

  const ctxDaily = document.getElementById('chart-daily').getContext('2d');
  chartDaily = new Chart(ctxDaily, {
    type: 'bar',
    data: {
      labels: dailyLabels.length > 0 ? dailyLabels : ['No Data'],
      datasets: [{
        label: 'Minutes Browsed',
        data: dailyData.length > 0 ? dailyData : [0],
        backgroundColor: '#6c63ff',
        borderRadius: 4,
        maxBarThickness: 32
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#7a8194', font: { family: 'system-ui' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#7a8194', font: { family: 'system-ui' } },
          title: { display: true, text: 'Minutes', color: '#7a8194' }
        }
      }
    }
  });

  // 2. Top Domains Doughnut Chart
  const sortedDomains = [...filtered.domains].sort((a, b) => b.totalTime - a.totalTime);
  const topCount = 6;
  const doughnutLabels = [];
  const doughnutData = [];
  let otherTime = 0;

  sortedDomains.forEach((d, idx) => {
    if (idx < topCount) {
      doughnutLabels.push(d.domain);
      doughnutData.push(Math.round(d.totalTime / 60)); // in minutes
    } else {
      otherTime += d.totalTime;
    }
  });

  if (otherTime > 0) {
    doughnutLabels.push('Other');
    doughnutData.push(Math.round(otherTime / 60));
  }

  const ctxDomains = document.getElementById('chart-domains').getContext('2d');
  chartDomains = new Chart(ctxDomains, {
    type: 'doughnut',
    data: {
      labels: doughnutLabels.length > 0 ? doughnutLabels : ['No Data'],
      datasets: [{
        data: doughnutData.length > 0 ? doughnutData : [1],
        backgroundColor: [
          '#6c63ff', // Primary
          '#22d3a5', // Success
          '#3b82f6', // Blue
          '#f59e0b', // Amber
          '#ec4899', // Pink
          '#8b5cf6', // Violet
          '#4b5563'  // Gray for "Other"
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#e2e8f0', boxWidth: 12, font: { family: 'system-ui', size: 11 } }
        }
      },
      cutout: '65%'
    }
  });
}

// Render Domain list table body
function renderDomainTable(domainAgg, metaDomains) {
  const tbody = document.getElementById('table-body');
  const emptyMsg = document.getElementById('table-empty');
  tbody.innerHTML = '';

  if (domainAgg.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';

  // Apply sorting
  const sorted = [...domainAgg].sort((a, b) => {
    let aVal = a[sortCol];
    let bVal = b[sortCol];

    // Fallback if sorting metadata
    if (sortCol === 'firstSeen') {
      const metaA = metaDomains[a.domain];
      const metaB = metaDomains[b.domain];
      aVal = metaA ? metaA.firstSeen : '';
      bVal = metaB ? metaB.firstSeen : '';
    }

    if (typeof aVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    } else {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
  });

  // Calculate maximum totalTime for comparative percentages
  let maxTime = 1;
  sorted.forEach(d => {
    if (d.totalTime > maxTime) maxTime = d.totalTime;
  });

  sorted.forEach(d => {
    const meta = metaDomains[d.domain] || {};
    const firstSeenDate = meta.firstSeen ? meta.firstSeen.split('T')[0] : '—';
    const categoryName = meta.category || null;

    const row = document.createElement('tr');
    
    // Domain column
    const domainTd = document.createElement('td');
    domainTd.className = 'domain-cell';
    const fav = document.createElement('img');
    fav.className = 'domain-favicon';
    fav.src = `https://www.google.com/s2/favicons?domain=${d.domain}&sz=16`;
    fav.onerror = () => { fav.src = '../../assets/icons/icon16.png'; }; // fallback
    const domainSpan = document.createElement('span');
    domainSpan.textContent = d.domain;
    domainTd.appendChild(fav);
    domainTd.appendChild(domainSpan);
    row.appendChild(domainTd);

    // Total Time column (with comparative micro progress bar)
    const timeTd = document.createElement('td');
    const percent = Math.round((d.totalTime / maxTime) * 100);
    timeTd.innerHTML = `
      <div class="time-bar-wrapper">
        <span>${formatSeconds(d.totalTime)}</span>
        <div class="time-bar-outer">
          <div class="time-bar-inner" style="width: ${percent}%;"></div>
        </div>
      </div>
    `;
    row.appendChild(timeTd);

    // Sessions count
    const sessionsTd = document.createElement('td');
    sessionsTd.textContent = d.sessions;
    row.appendChild(sessionsTd);

    // First Seen
    const firstSeenTd = document.createElement('td');
    firstSeenTd.textContent = firstSeenDate;
    row.appendChild(firstSeenTd);

    // Category badge
    const categoryTd = document.createElement('td');
    if (categoryName) {
      const badge = document.createElement('span');
      badge.className = 'badge badge--category';
      badge.textContent = categoryName;
      categoryTd.appendChild(badge);
    } else {
      categoryTd.innerHTML = '<span style="color: var(--muted); font-size: 0.8rem;">—</span>';
    }
    row.appendChild(categoryTd);

    tbody.appendChild(row);
  });
}

// Render recent sessions table
function renderSessionsTable(sessions) {
  const tbody = document.getElementById('sessions-body');
  const emptyMsg = document.getElementById('sessions-empty');
  tbody.innerHTML = '';

  if (sessions.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }
  emptyMsg.style.display = 'none';

  // Sort sessions descending by start time
  const sortedSessions = [...sessions].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  
  // Render up to 50 sessions
  const limit = 50;
  const list = sortedSessions.slice(0, limit);

  list.forEach(session => {
    const row = document.createElement('tr');
    
    // Domain
    const domainTd = document.createElement('td');
    domainTd.textContent = session.domain;
    domainTd.style.fontWeight = '500';
    row.appendChild(domainTd);

    // Started Timestamp
    const startedTd = document.createElement('td');
    try {
      const date = new Date(session.startTime);
      startedTd.textContent = date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      startedTd.textContent = session.startTime;
    }
    row.appendChild(startedTd);

    // Duration
    const durationTd = document.createElement('td');
    durationTd.textContent = formatSeconds(session.duration || 0);
    row.appendChild(durationTd);

    tbody.appendChild(row);
  });
}

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', init);
