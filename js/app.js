/**
 * SafeSpace Main Application Controller
 */

import { T } from './i18n.js';
import { glossary } from './glossary.js';
import { ApiClient } from './api.js';
import { Sanitizer } from './sanitize.js';

let currentLang = 'de';
let attachedFiles = []; // Array of sanitized attachments { blob, dataUrl, name, size }
const MAX_FILES = 3;

// ── TOAST NOTIFICATIONS ───────────────────────────────────────────────────────
export function showToast(message, type = 'info') {
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

// ── SERVICE WORKER (PWA) ──────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.debug('Service Worker Registration notice:', err);
        });
    });
}

// ── LANGUAGE & LOCALIZATION ───────────────────────────────────────────────────
export function applyLang(lang) {
    currentLang = lang;
    const t = T[lang] || T.de;
    document.documentElement.lang = lang;

    // Update Flag & Code button
    const curFlag = document.getElementById('cur-flag');
    const curCode = document.getElementById('cur-code');
    if (curFlag) curFlag.textContent = t.flag;
    if (curCode) curCode.textContent = t.code;

    // Update text elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (t[key] !== undefined) {
            el.textContent = t[key];
        }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        const key = el.dataset.i18nPh;
        if (t[key] !== undefined) {
            el.placeholder = t[key];
        }
    });

    // Update active dropdown item
    document.querySelectorAll('.lang-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.lang === lang);
    });

    buildGlossary(lang);
    updateRateLimitUI();
}

// Language selector events
document.querySelectorAll('.lang-opt').forEach(opt => {
    opt.addEventListener('click', () => {
        applyLang(opt.dataset.lang);
        document.getElementById('lang-dd')?.classList.remove('open');
    });
});

const langBtn = document.getElementById('lang-btn');
const langDd = document.getElementById('lang-dd');
if (langBtn && langDd) {
    langBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        langDd.classList.toggle('open');
    });
    document.addEventListener('click', () => langDd.classList.remove('open'));
}

// ── MOBILE NAVIGATION ─────────────────────────────────────────────────────────
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');

if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
        const isOpen = mobileMenu.classList.contains('open');
        mobileMenu.classList.toggle('open');
        mobileMenuBtn.setAttribute('aria-expanded', !isOpen);
        const icon = mobileMenuBtn.querySelector('i');
        if (icon) {
            icon.className = isOpen ? 'fas fa-bars text-xl' : 'fas fa-times text-xl';
        }
    });

    mobileMenu.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
            mobileMenu.classList.remove('open');
            mobileMenuBtn.setAttribute('aria-expanded', 'false');
            const icon = mobileMenuBtn.querySelector('i');
            if (icon) icon.className = 'fas fa-bars text-xl';
        });
    });
}

// ── GLOSSARY ──────────────────────────────────────────────────────────────────
function buildGlossary(lang) {
    const list = document.getElementById('glossary-list');
    if (!list) return;
    const terms = glossary[lang] || glossary.de;

    list.innerHTML = terms.map((item, index) => `
        <div class="gloss-term card p-5" data-index="${index}" tabindex="0" role="button" aria-expanded="false">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <span class="gloss-tag">${Sanitizer.escapeHtml(item.tag)}</span>
                    <span class="font-bold text-white">${Sanitizer.escapeHtml(item.term)}</span>
                </div>
                <i class="fas fa-chevron-down text-slate-500 text-sm transition-transform" id="gloss-chevron-${index}"></i>
            </div>
            <div class="gloss-body mt-3 text-sm text-slate-300 leading-relaxed" id="gloss-body-${index}">
                ${Sanitizer.escapeHtml(item.def)}
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.gloss-term').forEach(termEl => {
        const idx = termEl.dataset.index;
        const toggle = () => {
            const body = document.getElementById(`gloss-body-${idx}`);
            const chev = document.getElementById(`gloss-chevron-${idx}`);
            const isOpen = body.classList.toggle('open');
            termEl.setAttribute('aria-expanded', isOpen);
            if (chev) chev.style.transform = isOpen ? 'rotate(180deg)' : '';
        };

        termEl.addEventListener('click', toggle);
        termEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });
    });
}

// ── RATE LIMIT UI ─────────────────────────────────────────────────────────────
function updateRateLimitUI() {
    const count = ApiClient.getTodayCount();
    const t = T[currentLang] || T.de;
    const rateCountEl = document.getElementById('rate-count');
    const rateFillEl = document.getElementById('rate-fill');
    const warnEl = document.getElementById('spam-warn');
    const submitBtn = document.getElementById('submit-btn');

    if (rateCountEl) rateCountEl.textContent = `${count} ${t.rate_of} 3`;
    if (rateFillEl) rateFillEl.style.width = `${Math.min((count / 3) * 100, 100)}%`;

    if (count >= 3) {
        if (warnEl) warnEl.classList.remove('hidden');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';
        }
    } else {
        if (warnEl) warnEl.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
        }
    }
}

// ── CHARACTER COUNTER ─────────────────────────────────────────────────────────
const msgInput = document.getElementById('f-msg');
const charCount = document.getElementById('char-count');
if (msgInput && charCount) {
    msgInput.addEventListener('input', () => {
        const len = msgInput.value.length;
        charCount.textContent = len;
        charCount.style.color = len >= 20 ? 'var(--emerald)' : 'var(--red)';
    });
}

// ── ANONYMOUS EVIDENCE UPLOAD & EXIF STRIPPING ────────────────────────────────
const dropzone = document.getElementById('file-dropzone');
const fileInput = document.getElementById('file-input');
const filePreviewContainer = document.getElementById('file-preview-list');

if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files) {
            handleFiles(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files) {
            handleFiles(fileInput.files);
            fileInput.value = '';
        }
    });
}

async function handleFiles(files) {
    for (const file of Array.from(files)) {
        if (attachedFiles.length >= MAX_FILES) {
            showToast('Maximal 3 Dateien erlaubt.', 'error');
            break;
        }

        if (!file.type.startsWith('image/')) {
            showToast('Nur Bilddateien (JPG, PNG, WebP) werden akzeptiert.', 'error');
            continue;
        }

        try {
            showToast('Entferne EXIF- & GPS-Metadaten...', 'info');
            const sanitized = await Sanitizer.sanitizeImage(file);
            attachedFiles.push(sanitized);
            renderFilePreviews();
            showToast('Metadaten erfolgreich entfernt ✓', 'success');
        } catch (err) {
            showToast('Fehler bei der Bildanonymisierung: ' + err.message, 'error');
        }
    }
}

function renderFilePreviews() {
    if (!filePreviewContainer) return;
    filePreviewContainer.innerHTML = '';

    attachedFiles.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'file-preview-item mt-2';
        div.innerHTML = `
            <div class="flex items-center gap-2 overflow-hidden">
                <i class="fas fa-file-image text-blue-400"></i>
                <span class="truncate font-mono text-xs">${Sanitizer.escapeHtml(file.name)}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold whitespace-nowrap">EXIF entfernt ✓</span>
            </div>
            <button type="button" class="text-red-400 hover:text-red-300 p-1 remove-file-btn" data-index="${index}" aria-label="Datei entfernen">
                <i class="fas fa-trash-alt text-xs"></i>
            </button>
        `;
        filePreviewContainer.appendChild(div);
    });

    filePreviewContainer.querySelectorAll('.remove-file-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            attachedFiles.splice(idx, 1);
            renderFilePreviews();
        });
    });
}

// ── FORM SUBMISSION ───────────────────────────────────────────────────────────
const reportForm = document.getElementById('report-form');
let lastReportRefId = '';
let lastEmailBody = '';

if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const t = T[currentLang] || T.de;

        // Honeypot check
        const hp = document.getElementById('hp-name');
        if (hp && hp.value) return;

        const msg = document.getElementById('f-msg').value.trim();
        if (msg.length < 20) {
            showToast(t.alert_empty, 'error');
            return;
        }

        const cat = document.getElementById('f-cat').value;
        const loc = document.getElementById('f-loc').value.trim() || t.no_loc;
        const dt = document.getElementById('f-dt').value || t.no_time;
        const sev = document.getElementById('f-sev').value;

        const submitBtn = document.getElementById('submit-btn');
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = t.btn_processing;

        try {
            const reportPayload = {
                category: cat,
                location: loc,
                datetime: dt,
                severity: sev,
                description: msg,
                attachments: attachedFiles.map(f => ({
                    name: f.name,
                    dataUrl: f.dataUrl,
                    size: f.size
                }))
            };

            const result = await ApiClient.submitReport(reportPayload);
            lastReportRefId = result.id;

            // Generate backup email body
            lastEmailBody = `${t.email_hdr}
${t.email_ref}: ${result.id}
${t.email_cat}: ${cat}
${t.email_sev}: ${sev}
${t.email_loc}: ${loc}
${t.email_time}: ${dt}

${t.email_desc}:
${msg}

---------------------------------
${t.email_ftr}`;

            showConfirmation(result.id, cat, sev, loc);
            showToast(t.toast_submitted, 'success');
            attachedFiles = [];
            renderFilePreviews();
        } catch (err) {
            if (err.message === 'RATE_LIMIT_EXCEEDED') {
                showToast(t.spam_msg, 'error');
            } else {
                showToast('Ein Fehler ist aufgetreten: ' + err.message, 'error');
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = t.btn_submit;
            updateRateLimitUI();
        }
    });
}

function showConfirmation(refId, cat, sev, loc) {
    document.getElementById('form-card').style.display = 'none';
    const rateInfo = document.getElementById('rate-info');
    if (rateInfo) rateInfo.style.display = 'none';

    const conf = document.getElementById('confirmation-screen');
    conf.classList.add('show');
    document.getElementById('conf-ref-id').textContent = refId;
    document.getElementById('conf-cat').textContent = cat;
    document.getElementById('conf-sev').textContent = sev;
    document.getElementById('conf-loc').textContent = loc;
    conf.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Copy ID button
document.getElementById('copy-id-btn')?.addEventListener('click', () => {
    const id = document.getElementById('conf-ref-id').textContent;
    navigator.clipboard.writeText(id).then(() => {
        showToast(T[currentLang].toast_copied, 'success');
        const b = document.getElementById('copy-id-btn');
        b.innerHTML = '<i class="fas fa-check"></i> ✓';
        setTimeout(() => {
            b.innerHTML = `<i class="far fa-copy"></i> <span data-i18n="copy_id">${T[currentLang].copy_id}</span>`;
        }, 2000);
    });
});

// Copy email text button
document.getElementById('copy-email-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(lastEmailBody).then(() => {
        showToast('E-Mail-Text kopiert!', 'success');
        const b = document.getElementById('copy-email-btn');
        b.innerHTML = '<i class="fas fa-check mr-2"></i> ✓';
        setTimeout(() => {
            b.innerHTML = `<i class="far fa-copy mr-2"></i> <span>${T[currentLang].copy_email_text}</span>`;
        }, 2000);
    });
});

// New report button
document.getElementById('new-report-btn')?.addEventListener('click', () => {
    document.getElementById('confirmation-screen').classList.remove('show');
    document.getElementById('form-card').style.display = '';
    const rateInfo = document.getElementById('rate-info');
    if (rateInfo) rateInfo.style.display = '';
    document.getElementById('report-form').reset();
    document.getElementById('char-count').textContent = '0';
    updateRateLimitUI();
    document.getElementById('report').scrollIntoView({ behavior: 'smooth' });
});

// ── STATUS CHECK & ANONYMOUS CHAT ─────────────────────────────────────────────
const statusBtn = document.getElementById('status-btn');
const statusInput = document.getElementById('status-input');
let currentLookupId = null;

if (statusBtn && statusInput) {
    statusBtn.addEventListener('click', async () => {
        const id = statusInput.value.trim().toUpperCase();
        if (!id) return;
        currentLookupId = id;

        const resultEl = document.getElementById('status-result');
        const foundEl = document.getElementById('status-found');
        const notFoundEl = document.getElementById('status-not-found');
        const t = T[currentLang] || T.de;

        statusBtn.disabled = true;
        statusBtn.textContent = '...';

        try {
            const res = await ApiClient.getReportStatus(id);
            resultEl.classList.remove('hidden');

            if (res.found && res.report) {
                foundEl.classList.remove('hidden');
                notFoundEl.classList.add('hidden');

                const r = res.report;
                const statusMap = {
                    received: { text: t.status_received, cls: 'badge-received' },
                    review:   { text: t.status_review,   cls: 'badge-review' },
                    action:   { text: t.status_action || 'Maßnahme', cls: 'badge-action' },
                    resolved: { text: t.status_resolved, cls: 'badge-resolved' }
                };

                const badge = statusMap[r.status] || { text: r.status, cls: 'badge-received' };
                const badgeEl = document.getElementById('status-badge-el');
                badgeEl.textContent = badge.text;
                badgeEl.className = `badge ${badge.cls}`;

                document.getElementById('st-cat').textContent = r.category;
                const dateVal = r.created_at || r.ts;
                document.getElementById('st-time').textContent = dateVal ? new Date(dateVal).toLocaleString() : '-';
                document.getElementById('st-note').textContent = r.public_notes || t.stat_note_team;

                renderFollowUpMessages(res.messages || []);
            } else {
                foundEl.classList.add('hidden');
                notFoundEl.classList.remove('hidden');
            }
        } catch {
            showToast('Fehler bei der Statusabfrage.', 'error');
        } finally {
            statusBtn.disabled = false;
            statusBtn.textContent = t.stat_btn;
        }
    });

    statusInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') statusBtn.click();
    });
}

function renderFollowUpMessages(messages) {
    const thread = document.getElementById('user-chat-thread');
    if (!thread) return;
    thread.innerHTML = '';

    if (!messages.length) {
        thread.innerHTML = '<div class="text-slate-500 text-center py-2 text-xs">Noch keine Nachrichten ausgetauscht.</div>';
        return;
    }

    messages.forEach(m => {
        const isTeam = m.sender === 'team';
        const bubble = document.createElement('div');
        bubble.className = `p-2.5 rounded-xl max-w-[85%] text-xs ${isTeam ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 mr-auto' : 'bg-slate-800 border border-slate-700 text-slate-200 ml-auto'}`;
        bubble.innerHTML = `
            <div class="flex justify-between items-center gap-3 text-[10px] text-slate-400 mb-1">
                <span class="font-bold">${isTeam ? 'Awareness Team' : 'Deine Nachricht'}</span>
                <span>${new Date(m.created_at || m.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div>${Sanitizer.escapeHtml(m.message || m.text)}</div>
        `;
        thread.appendChild(bubble);
    });
    thread.scrollTop = thread.scrollHeight;
}

// Send anonymous follow-up message from reporter
document.getElementById('user-chat-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentLookupId) return;

    const input = document.getElementById('user-chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    try {
        await ApiClient.sendFollowUpMessage(currentLookupId, msg);
        input.value = '';
        showToast('Nachricht gesendet!', 'success');
        // Refresh messages
        const res = await ApiClient.getReportStatus(currentLookupId);
        if (res.found) renderFollowUpMessages(res.messages || []);
    } catch {
        showToast('Nachricht konnte nicht übermittelt werden.', 'error');
    }
});

// ── INITIALIZATION ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    applyLang('de');
});
