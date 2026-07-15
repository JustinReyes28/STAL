import {
  getSettings,
  updateSettings,
  exportData,
  importData,
  pruneOldData
} from '../lib/storage.js';

// Setup navigation handler
function initNav() {
  const links = document.querySelectorAll('.sidebar-link');
  const sections = document.querySelectorAll('.settings-section');

  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const targetId = link.getAttribute('href').slice(1);

      sections.forEach(sec => {
        sec.style.display = sec.id === targetId ? 'block' : 'none';
      });

      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });
}

// Section 1: General settings
async function initGeneral() {
  const settings = await getSettings();
  
  const idleInput = document.getElementById('input-idle-threshold');
  const pruneInput = document.getElementById('input-prune-days');
  const saveBtn = document.getElementById('btn-save-general');

  // Populate values
  idleInput.value = settings.idleThreshold ?? 60;
  pruneInput.value = settings.pruneDays ?? 90;

  saveBtn.addEventListener('click', async () => {
    const idleThreshold = parseInt(idleInput.value, 10);
    const pruneDays = parseInt(pruneInput.value, 10);

    if (isNaN(idleThreshold) || idleThreshold < 10 || idleThreshold > 600) {
      showToast('Idle threshold must be between 10 and 600 seconds.', 'error');
      return;
    }
    if (isNaN(pruneDays) || pruneDays < 7 || pruneDays > 365) {
      showToast('Retention period must be between 7 and 365 days.', 'error');
      return;
    }

    try {
      await updateSettings({ idleThreshold, pruneDays });
      showToast('General settings saved successfully!', 'success');
    } catch (err) {
      showToast(`Error saving settings: ${err.message}`, 'error');
    }
  });
}

// Section 2: Categories management
async function initCategories() {
  await renderCategories();

  const addBtn = document.getElementById('btn-add-category');
  const nameInput = document.getElementById('input-cat-name');
  const domainsTextarea = document.getElementById('input-cat-domains');

  addBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const rawDomains = domainsTextarea.value;
    const domains = rawDomains
      .split('\n')
      .map(d => d.trim().toLowerCase())
      .filter(Boolean);

    if (!name) {
      showToast('Category name cannot be empty.', 'error');
      return;
    }

    if (domains.length === 0) {
      showToast('At least one domain must be provided.', 'error');
      return;
    }

    try {
      const settings = await getSettings();
      settings.categories = settings.categories || {};
      
      // Update/add category
      settings.categories[name] = domains;
      await updateSettings({ categories: settings.categories });

      // Reset fields & re-render
      nameInput.value = '';
      domainsTextarea.value = '';
      await renderCategories();
      showToast(`Category "${name}" saved!`, 'success');
    } catch (err) {
      showToast(`Failed to add category: ${err.message}`, 'error');
    }
  });
}

async function renderCategories() {
  const settings = await getSettings();
  const listEl = document.getElementById('categories-list');
  const categories = settings.categories || {};
  const entries = Object.entries(categories);

  if (entries.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No categories configured yet. Add one below.</p>';
    return;
  }

  listEl.innerHTML = entries
    .map(([name, domains]) => {
      const tags = domains.map(d => `<span class="domain-tag">${escapeHtml(d)}</span>`).join('');
      return `
        <div class="category-item">
          <div class="category-item__header">
            <span class="category-item__name">${escapeHtml(name)}</span>
            <button class="btn btn-secondary btn-sm btn-delete-cat" data-name="${escapeHtml(name)}">Delete</button>
          </div>
          <div class="category-item__domains">
            ${tags}
          </div>
        </div>
      `;
    })
    .join('');

  // Wire delete buttons
  listEl.querySelectorAll('.btn-delete-cat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const catName = btn.getAttribute('data-name');
      const confirmed = confirm(`Are you sure you want to delete category "${catName}"?`);
      if (!confirmed) return;

      try {
        const settings = await getSettings();
        if (settings.categories && settings.categories[catName]) {
          delete settings.categories[catName];
          await updateSettings({ categories: settings.categories });
          await renderCategories();
          showToast(`Category "${catName}" deleted.`, 'success');
        }
      } catch (err) {
        showToast(`Failed to delete category: ${err.message}`, 'error');
      }
    });
  });
}

// Section 3: Data Management
async function initData() {
  await refreshStorageUsage();

  // Export
  document.getElementById('btn-export').addEventListener('click', async () => {
    try {
      await exportData();
      showToast('Export file download initiated.', 'success');
    } catch (err) {
      showToast(`Export failed: ${err.message}`, 'error');
    }
  });

  // Import
  const fileInput = document.getElementById('input-import');
  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const fileText = await file.text();
      await importData(fileText);
      showToast('Backup data successfully imported!', 'success');
      await refreshStorageUsage();
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error');
    } finally {
      // Clear file selection to allow triggering change on same file
      fileInput.value = '';
    }
  });

  // Prune
  document.getElementById('btn-prune').addEventListener('click', async () => {
    const settings = await getSettings();
    const daysToKeep = settings.pruneDays ?? 90;
    
    try {
      const result = await pruneOldData(daysToKeep);
      showToast(`Pruned ${result.prunedDays} day(s) and ${result.prunedSessions} session(s) older than ${daysToKeep} days.`, 'success');
      await refreshStorageUsage();
    } catch (err) {
      showToast(`Pruning failed: ${err.message}`, 'error');
    }
  });

  // Clear All
  document.getElementById('btn-clear-all').addEventListener('click', async () => {
    const confirmed = confirm(
      'DANGER: Are you absolutely sure you want to delete ALL logged history, settings, and categories? This cannot be undone.'
    );
    if (!confirmed) return;

    try {
      await chrome.storage.local.clear();
      showToast('Factory reset complete. All data cleared.', 'success');
      // Re-initialize options page display values
      await initGeneral();
      await renderCategories();
      await refreshStorageUsage();
    } catch (err) {
      showToast(`Failed to clear storage: ${err.message}`, 'error');
    }
  });
}

async function refreshStorageUsage() {
  const LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB limit for local extension storage
  const barInner = document.getElementById('storage-bar-inner');
  const labelText = document.getElementById('storage-label');

  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    const pct = Math.min(100, (bytesInUse / LIMIT_BYTES) * 100).toFixed(2);
    
    barInner.style.width = `${pct}%`;
    const kb = (bytesInUse / 1024).toFixed(2);
    labelText.textContent = `${kb} KB / 10 MB (${pct}%) used`;
  } catch (err) {
    labelText.textContent = 'Unable to fetch storage details';
    console.error(err);
  }
}

// Section 4: About details
function initAbout() {
  try {
    const manifest = chrome.runtime.getManifest();
    document.getElementById('about-version').textContent = manifest.version || '1.0.0';
  } catch {
    document.getElementById('about-version').textContent = '1.0.0';
  }
}

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s ease';
    setTimeout(() => toast.remove(), 500);
  }, 3500);
}

// Simple HTML escaping helper
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  await initGeneral();
  await initCategories();
  await initData();
  initAbout();
});
