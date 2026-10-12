/**
 * SafeSpace Admin Portal Controller
 */

import { Sanitizer } from './sanitize.js';

const TOKEN_KEY = 'ss_admin_token';
let currentToken = localStorage.getItem(TOKEN_KEY) || '';
let currentReports = [];
let activeReportId = null;

// Helper: Toast alerts
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${Sanitizer.escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ── AUTHENTICATION ────────────────────────────────────────────────────────────
async function checkAuth() {
    if (!currentToken) {
        showLoginView();
        return;
    }

    try {
        const res = await fetch('/api/admin/reports', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (res.ok) {
            showDashboardView();
            loadReports();
        } else {
            logout();
        }
    } catch {
        // Server might be running in static mode without backend
        showToast('Hinweis: Backend-Server ist offline oder nicht erreichbar.', 'error');
        showLoginView();
    }
}

function showLoginView() {
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('dashboard-container').classList.add('hidden');
    document.getElementById('user-badge').classList.add('hidden');
}

function showDashboardView() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    document.getElementById('user-badge').classList.remove('hidden');
}

function logout() {
    currentToken = '';
    localStorage.removeItem(TOKEN_KEY);
    showLoginView();
    showToast('Erfolgreich abgemeldet.', 'info');
}

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value;

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (res.ok && data.token) {
            currentToken = data.token;
            localStorage.setItem(TOKEN_KEY, data.token);
            document.getElementById('username-display').textContent = data.username || username;
            showDashboardView();
            loadReports();
            showToast('Willkommen im Awareness-Dashboard!', 'success');
        } else {
            showToast(data.error || 'Ungültige Anmeldedaten', 'error');
        }
    } catch (err) {
        showToast('Verbindungsfehler zum Backend.', 'error');
    }
});

document.getElementById('logout-btn')?.addEventListener('click', logout);

// ── REPORTS MANAGEMENT ────────────────────────────────────────────────────────
async function loadReports() {
    try {
        const res = await fetch('/api/admin/reports', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            currentReports = data.reports || [];
            updateStats(currentReports);
            applyFiltersAndRender();
        } else if (res.status === 401) {
            logout();
        }
    } catch (err) {
        showToast('Fehler beim Laden der Vorfälle.', 'error');
    }
}

function applyFiltersAndRender() {
    const status = document.getElementById('filter-status')?.value || '';
    const cat = document.getElementById('filter-category')?.value || '';
    const sev = document.getElementById('filter-severity')?.value || '';
    const search = (document.getElementById('filter-search')?.value || '').trim().toLowerCase();

    const filtered = currentReports.filter(r => {
        if (status && r.status !== status) return false;
        if (cat && r.category !== cat) return false;
        if (sev && !(r.severity || '').includes(sev)) return false;
        if (search) {
            const text = `${r.id} ${r.category} ${r.location || ''} ${r.description || ''} ${r.public_notes || ''}`.toLowerCase();
            if (!text.includes(search)) return false;
        }
        return true;
    });

    renderTable(filtered);
    const counterEl = document.getElementById('reports-counter');
    if (counterEl) {
        counterEl.textContent = `${filtered.length} von ${currentReports.length}`;
    }
}

function updateStats(reports) {
    const counts = { received: 0, review: 0, action: 0, resolved: 0 };
    reports.forEach(r => {
        if (counts[r.status] !== undefined) counts[r.status]++;
    });

    document.getElementById('stat-count-received').textContent = counts.received;
    document.getElementById('stat-count-review').textContent = counts.review;
    document.getElementById('stat-count-action').textContent = counts.action;
    document.getElementById('stat-count-resolved').textContent = counts.resolved;
}

function getBadgeHtml(status) {
    const map = {
        received: { label: 'Eingegangen', cls: 'badge-received' },
        review:   { label: 'In Prüfung', cls: 'badge-review' },
        action:   { label: 'Maßnahme',   cls: 'badge-action' },
        resolved: { label: 'Abgeschlossen', cls: 'badge-resolved' }
    };
    const s = map[status] || { label: status, cls: 'badge-received' };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
}

function renderTable(reports) {
    const tbody = document.getElementById('reports-table-body');
    const noMsg = document.getElementById('no-reports-msg');
    tbody.innerHTML = '';

    if (!reports.length) {
        noMsg.classList.remove('hidden');
        return;
    }
    noMsg.classList.add('hidden');

    reports.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-900/50 transition-colors';

        const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '-';

        tr.innerHTML = `
            <td class="px-5 py-4 font-mono font-bold text-blue-400">${Sanitizer.escapeHtml(r.id)}</td>
            <td class="px-5 py-4 font-medium text-white">${Sanitizer.escapeHtml(r.category)}</td>
            <td class="px-5 py-4 text-slate-400">${Sanitizer.escapeHtml(r.location || 'Nicht angegeben')}</td>
            <td class="px-5 py-4 text-slate-400 text-xs">${dateStr}</td>
            <td class="px-5 py-4 text-slate-300 text-xs">${Sanitizer.escapeHtml(r.severity || '-')}</td>
            <td class="px-5 py-4">${getBadgeHtml(r.status)}</td>
            <td class="px-5 py-4">
                <span class="inline-flex items-center gap-1 text-xs text-slate-400">
                    <i class="far fa-comment"></i> ${r.message_count || 0}
                </span>
            </td>
            <td class="px-5 py-4 text-right">
                <button class="btn-ghost px-3 py-1.5 rounded-lg text-xs font-bold text-blue-400 hover:text-white view-btn" data-id="${Sanitizer.escapeHtml(r.id)}">
                    Öffnen <i class="fas fa-arrow-right ml-1"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => openDetailModal(btn.dataset.id));
    });
}

// ── DETAIL MODAL ──────────────────────────────────────────────────────────────
async function openDetailModal(id) {
    activeReportId = id;
    try {
        const res = await fetch(`/api/admin/reports/${encodeURIComponent(id)}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        const r = data.report;
        const messages = data.messages || [];

        document.getElementById('modal-report-id').textContent = r.id;
        document.getElementById('modal-status-badge').outerHTML = getBadgeHtml(r.status);
        // re-acquire element
        const badgeEl = document.querySelector('#detail-modal .badge');
        if (badgeEl) badgeEl.id = 'modal-status-badge';

        document.getElementById('modal-cat').textContent = r.category;
        document.getElementById('modal-loc').textContent = r.location || 'Keine Angabe';
        document.getElementById('modal-time').textContent = r.incident_time || 'Keine Zeitangabe';
        document.getElementById('modal-sev').textContent = r.severity || 'Unbekannt';
        document.getElementById('modal-created').textContent = new Date(r.created_at).toLocaleString('de-DE');
        document.getElementById('modal-desc').textContent = r.description;

        // Populate form
        document.getElementById('update-status-select').value = r.status || 'received';
        document.getElementById('update-public-notes').value = r.public_notes || '';
        document.getElementById('update-internal-notes').value = r.internal_notes || '';

        // Attachments
        const attContainer = document.getElementById('modal-attachments-container');
        const attList = document.getElementById('modal-attachments-list');
        attList.innerHTML = '';
        if (r.attachments && r.attachments.length) {
            attContainer.classList.remove('hidden');
            r.attachments.forEach(att => {
                const a = document.createElement('a');
                a.href = att.url;
                a.target = '_blank';
                a.className = 'btn-ghost px-3 py-2 rounded-xl text-xs flex items-center gap-2 hover:border-blue-400';
                a.innerHTML = `<i class="fas fa-file-image text-blue-400"></i><span>${Sanitizer.escapeHtml(att.filename)}</span> <i class="fas fa-external-link-alt text-[10px] opacity-60"></i>`;
                attList.appendChild(a);
            });
        } else {
            attContainer.classList.add('hidden');
        }

        renderMessagesThread(messages);

        const modal = document.getElementById('detail-modal');
        modal.classList.add('open');
    } catch (err) {
        showToast('Fehler beim Laden des Berichts.', 'error');
    }
}

function renderMessagesThread(messages) {
    const thread = document.getElementById('modal-messages-thread');
    thread.innerHTML = '';

    if (!messages.length) {
        thread.innerHTML = '<div class="text-slate-600 text-center py-3">Noch keine Nachrichten im Dialog.</div>';
        return;
    }

    messages.forEach(m => {
        const isTeam = m.sender === 'team';
        const div = document.createElement('div');
        div.className = `p-2.5 rounded-xl max-w-[85%] ${isTeam ? 'ml-auto bg-blue-600/20 border border-blue-500/30 text-blue-100' : 'mr-auto bg-slate-900 border border-slate-800 text-slate-300'}`;
        div.innerHTML = `
            <div class="flex justify-between items-center gap-3 text-[10px] text-slate-400 mb-1">
                <span class="font-bold">${isTeam ? 'Awareness Team' : 'Meldende Person (Anonym)'}</span>
                <span>${new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="leading-relaxed">${Sanitizer.escapeHtml(m.message)}</div>
        `;
        thread.appendChild(div);
    });
    thread.scrollTop = thread.scrollHeight;
}

// Update report status & documentation
document.getElementById('update-status-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeReportId) return;

    const status = document.getElementById('update-status-select').value;
    const public_notes = document.getElementById('update-public-notes').value.trim();
    const internal_notes = document.getElementById('update-internal-notes').value.trim();

    try {
        const res = await fetch(`/api/admin/reports/${encodeURIComponent(activeReportId)}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status, public_notes, internal_notes })
        });

        if (res.ok) {
            showToast('Änderungen erfolgreich gespeichert!', 'success');
            loadReports();
            openDetailModal(activeReportId);
        } else {
            showToast('Speichern fehlgeschlagen.', 'error');
        }
    } catch {
        showToast('Netzwerkfehler beim Speichern.', 'error');
    }
});

// Reply message to reporter
document.getElementById('team-reply-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeReportId) return;

    const input = document.getElementById('team-reply-input');
    const msg = input.value.trim();
    if (!msg) return;

    try {
        const res = await fetch(`/api/admin/reports/${encodeURIComponent(activeReportId)}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: msg })
        });

        if (res.ok) {
            input.value = '';
            showToast('Nachricht an Melder gesendet!', 'success');
            openDetailModal(activeReportId);
        } else {
            showToast('Senden fehlgeschlagen.', 'error');
        }
    } catch {
        showToast('Netzwerkfehler.', 'error');
    }
});

// Close modal
document.getElementById('close-modal-btn')?.addEventListener('click', () => {
    document.getElementById('detail-modal').classList.remove('open');
    activeReportId = null;
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeReportId) {
        document.getElementById('detail-modal').classList.remove('open');
        activeReportId = null;
    }
});

// Filters & Refresh
document.getElementById('filter-status')?.addEventListener('change', applyFiltersAndRender);
document.getElementById('filter-category')?.addEventListener('change', applyFiltersAndRender);
document.getElementById('filter-severity')?.addEventListener('change', applyFiltersAndRender);
document.getElementById('filter-search')?.addEventListener('input', applyFiltersAndRender);
document.getElementById('refresh-btn')?.addEventListener('click', () => {
    loadReports();
    showToast('Daten aktualisiert.', 'info');
});

// Delete report (GDPR Purge)
document.getElementById('delete-report-btn')?.addEventListener('click', async () => {
    if (!activeReportId) return;
    const confirmed = window.confirm(`Möchtest du den Vorfall "${activeReportId}" und alle zugehörigen Daten unwiderruflich aus der Datenbank und vom Server löschen?`);
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/admin/reports/${encodeURIComponent(activeReportId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (res.ok) {
            showToast(`Vorfall ${activeReportId} erfolgreich gelöscht.`, 'success');
            document.getElementById('detail-modal').classList.remove('open');
            activeReportId = null;
            loadReports();
        } else {
            const err = await res.json().catch(() => ({}));
            showToast(err.error || 'Löschen fehlgeschlagen.', 'error');
        }
    } catch {
        showToast('Netzwerkfehler beim Löschen.', 'error');
    }
});

// Password Change Modal
const passwordModal = document.getElementById('password-modal');
const openPassBtn = document.getElementById('open-password-btn');
const closePassBtn = document.getElementById('close-password-btn');
const cancelPassBtn = document.getElementById('cancel-password-btn');
const changePassForm = document.getElementById('change-password-form');

if (openPassBtn && passwordModal) {
    openPassBtn.addEventListener('click', () => {
        changePassForm?.reset();
        passwordModal.classList.add('open');
    });
}

function closePasswordModal() {
    passwordModal?.classList.remove('open');
    changePassForm?.reset();
}

closePassBtn?.addEventListener('click', closePasswordModal);
cancelPassBtn?.addEventListener('click', closePasswordModal);

changePassForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const old_password = document.getElementById('old-pass').value;
    const new_password = document.getElementById('new-pass').value;
    const confirm_password = document.getElementById('confirm-pass').value;

    if (new_password.length < 8) {
        showToast('Das neue Passwort muss mindestens 8 Zeichen lang sein.', 'error');
        return;
    }
    if (new_password !== confirm_password) {
        showToast('Die neuen Passwörter stimmen nicht überein.', 'error');
        return;
    }

    try {
        const res = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ old_password, new_password })
        });

        const data = await res.json();
        if (res.ok) {
            showToast(data.message || 'Passwort erfolgreich geändert!', 'success');
            closePasswordModal();
        } else {
            showToast(data.error || 'Passwortänderung fehlgeschlagen.', 'error');
        }
    } catch {
        showToast('Verbindungsfehler beim Ändern des Passworts.', 'error');
    }
});


// ── EXPORT CSV & JSON ─────────────────────────────────────────────────────────
document.getElementById('export-csv-btn')?.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/admin/export', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        const rows = data.export || [];

        const headers = ['ID', 'Kategorie', 'Ort', 'Zeitpunkt', 'Schweregrad', 'Status', 'Beschreibung', 'Eingegangen'];
        const csvRows = [headers.join(';')];

        rows.forEach(r => {
            const cleanDesc = (r.description || '').replace(/"/g, '""').replace(/\n/g, ' ');
            csvRows.push([
                `"${r.id}"`,
                `"${r.category}"`,
                `"${r.location || ''}"`,
                `"${r.incident_time || ''}"`,
                `"${r.severity || ''}"`,
                `"${r.status}"`,
                `"${cleanDesc}"`,
                `"${r.created_at}"`
            ].join(';'));
        });

        const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `safespace_meldungen_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV-Export heruntergeladen!', 'success');
    } catch {
        showToast('Export fehlgeschlagen.', 'error');
    }
});

document.getElementById('export-json-btn')?.addEventListener('click', async () => {
    try {
        const res = await fetch('/api/admin/export', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `safespace_export_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('JSON-Export heruntergeladen!', 'success');
    } catch {
        showToast('Export fehlgeschlagen.', 'error');
    }
});

// ── THEME SUPPORT ─────────────────────────────────────────────────────────────
const THEME_STORAGE_KEY = 'ss_theme';

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        if (theme === 'light') {
            themeIcon.className = 'fas fa-moon text-sm';
        } else {
            themeIcon.className = 'fas fa-sun text-sm';
        }
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const initialTheme = savedTheme || (prefersLight ? 'light' : 'dark');
    applyTheme(initialTheme);

    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            localStorage.setItem(THEME_STORAGE_KEY, next);
            showToast(next === 'light' ? 'Helles Design aktiviert' : 'Dunkles Design aktiviert', 'info');
        });
    }
}

// Init
initTheme();
checkAuth();
