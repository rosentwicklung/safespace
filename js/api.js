/**
 * SafeSpace API Client
 * Manages communication with backend /api endpoints
 * with transparent fallback to LocalStorage/Mailto for static deployments.
 */

const STORAGE_KEY = 'ss_reports';
const MAX_REPORTS_PER_DAY = 3;

export const ApiClient = {
    /**
     * Retrieves stored local reports from localStorage.
     */
    getLocalReports() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    },

    /**
     * Saves reports array to localStorage.
     */
    saveLocalReports(reports) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
        } catch (e) {
            console.error('Failed to save to localStorage', e);
        }
    },

    /**
     * Calculates how many reports were submitted in the last 24 hours.
     */
    getTodayCount() {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        return this.getLocalReports().filter(r => (now - (r.ts || r.created_ts || 0)) < oneDayMs).length;
    },

    /**
     * Generates a secure, human-readable reference ID.
     */
    generateId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let id = 'SS-';
        for (let i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    },

    /**
     * Submits a report to the backend API or falls back to local storage.
     * @param {Object} reportData - { category, location, datetime, severity, description, attachments }
     * @returns {Promise<{ success: boolean, id: string, mode: string, report: Object }>}
     */
    async submitReport(reportData) {
        const count = this.getTodayCount();
        if (count >= MAX_REPORTS_PER_DAY) {
            throw new Error('RATE_LIMIT_EXCEEDED');
        }

        const generatedId = this.generateId();
        const payload = {
            id: generatedId,
            category: reportData.category,
            location: reportData.location,
            incident_time: reportData.datetime,
            severity: reportData.severity,
            description: reportData.description,
            attachments: reportData.attachments || []
        };

        let responseMode = 'backend';
        let resultReport = null;

        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                resultReport = data.report || { ...payload, status: 'received', ts: Date.now() };
            } else {
                throw new Error('Server returned ' + res.status);
            }
        } catch (err) {
            // Graceful fallback to static offline mode
            console.warn('Backend API unavailable, using offline fallback mode:', err);
            responseMode = 'offline_fallback';
            resultReport = {
                id: generatedId,
                category: reportData.category,
                location: reportData.location,
                incident_time: reportData.datetime,
                severity: reportData.severity,
                description: reportData.description,
                status: 'received',
                ts: Date.now()
            };
        }

        // Always sync with localStorage for offline tracking
        const local = this.getLocalReports();
        local.push(resultReport);
        this.saveLocalReports(local);

        return {
            success: true,
            id: resultReport.id,
            mode: responseMode,
            report: resultReport
        };
    },

    /**
     * Checks report status by ID.
     * @param {string} id
     */
    async getReportStatus(id) {
        const cleanId = id.trim().toUpperCase();

        try {
            const res = await fetch(`/api/reports/${encodeURIComponent(cleanId)}`);
            if (res.ok) {
                const data = await res.json();
                return { found: true, report: data.report, messages: data.messages || [] };
            }
        } catch (err) {
            console.warn('API status lookup failed, checking local cache:', err);
        }

        // Check local cache
        const local = this.getLocalReports();
        const found = local.find(r => (r.id || '').toUpperCase() === cleanId);
        if (found) {
            return {
                found: true,
                report: found,
                messages: found.messages || []
            };
        }

        return { found: false, report: null, messages: [] };
    },

    /**
     * Sends an anonymous follow-up message to the awareness team.
     * @param {string} id
     * @param {string} messageText
     */
    async sendFollowUpMessage(id, messageText) {
        const cleanId = id.trim().toUpperCase();

        try {
            const res = await fetch(`/api/reports/${encodeURIComponent(cleanId)}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: messageText, sender: 'reporter' })
            });

            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.warn('Backend message delivery failed, caching locally:', err);
        }

        // Local cache fallback
        const local = this.getLocalReports();
        const report = local.find(r => (r.id || '').toUpperCase() === cleanId);
        if (report) {
            if (!report.messages) report.messages = [];
            report.messages.push({
                sender: 'reporter',
                text: messageText,
                ts: Date.now()
            });
            this.saveLocalReports(local);
            return { success: true, offline: true };
        }

        throw new Error('REPORT_NOT_FOUND');
    }
};
