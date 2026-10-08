#!/usr/bin/env python3
"""
SafeSpace Secure Backend Server
A zero-dependency Python 3 HTTP server providing SQLite-backed storage,
anonymous incident tracking, secure awareness admin API, and static asset serving.
"""

import os
import sys
import json
import sqlite3
import hashlib
import hmac
import secrets
import mimetypes
import datetime
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get('PORT', 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
DB_PATH = os.path.join(DATA_DIR, 'safespace.db')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        location TEXT,
        incident_time TEXT,
        severity TEXT,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'received',
        internal_notes TEXT DEFAULT '',
        public_notes TEXT DEFAULT '',
        attachments_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(report_id) REFERENCES reports(id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        expires_at TEXT NOT NULL
    )
    """)

    # Seed default admin if table is empty
    cursor.execute("SELECT COUNT(*) FROM admin_users")
    if cursor.fetchone()[0] == 0:
        default_user = os.environ.get('ADMIN_USER', 'admin')
        default_pass = os.environ.get('ADMIN_PASSWORD', 'safespace2026')
        salt = secrets.token_hex(16)
        pw_hash = hashlib.pbkdf2_hmac('sha256', default_pass.encode(), salt.encode(), 100000).hex()
        cursor.execute(
            "INSERT INTO admin_users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
            (default_user, pw_hash, salt, datetime.datetime.now(datetime.timezone.utc).isoformat())
        )
        print(f"[SECURITY] Initialized default admin user: '{default_user}' (password: '{default_pass}')")

    conn.commit()
    conn.close()


def verify_password(stored_hash, salt, provided_password):
    calc_hash = hashlib.pbkdf2_hmac('sha256', provided_password.encode(), salt.encode(), 100000).hex()
    return hmac.compare_digest(stored_hash, calc_hash)


def get_authenticated_user(token):
    if not token:
        return None
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    cursor.execute("SELECT username FROM sessions WHERE token = ? AND expires_at > ?", (token, now_iso))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else None


class SafeSpaceHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def _get_bearer_token(self):
        auth = self.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            return auth[7:].strip()
        return None

    def _read_json_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        raw = self.rfile.read(content_length).decode('utf-8')
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path.rstrip('/')

        # ── API: Check status of single report (Reporter view) ──
        if path.startswith('/api/reports/') and not path.startswith('/api/reports/messages'):
            parts = path.split('/')
            if len(parts) == 4:
                report_id = parts[3].upper()
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id, category, location, incident_time, severity, status, public_notes, created_at, attachments_json FROM reports WHERE id = ?",
                    (report_id,)
                )
                row = cursor.fetchone()
                if not row:
                    conn.close()
                    return self._send_json({"error": "Report not found"}, 404)

                cursor.execute(
                    "SELECT id, sender, message, created_at FROM messages WHERE report_id = ? ORDER BY id ASC",
                    (report_id,)
                )
                msgs = [dict(m) for m in cursor.fetchall()]
                conn.close()

                report = dict(row)
                report['attachments'] = json.loads(report.pop('attachments_json', '[]'))
                return self._send_json({"report": report, "messages": msgs})

        # ── API: Admin - List Reports ──
        if path == '/api/admin/reports':
            user = get_authenticated_user(self._get_bearer_token())
            if not user:
                return self._send_json({"error": "Unauthorized"}, 401)

            qs = urllib.parse.parse_qs(url.query)
            status_filter = qs.get('status', [None])[0]
            search_query = qs.get('search', [None])[0]

            query = "SELECT id, category, location, incident_time, severity, status, public_notes, created_at, updated_at FROM reports WHERE 1=1"
            params = []
            if status_filter:
                query += " AND status = ?"
                params.append(status_filter)
            if search_query:
                query += " AND (id LIKE ? OR description LIKE ? OR location LIKE ?)"
                term = f"%{search_query}%"
                params.extend([term, term, term])

            query += " ORDER BY created_at DESC"

            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(query, params)
            reports = [dict(r) for r in cursor.fetchall()]

            # Fetch message counts
            for r in reports:
                cursor.execute("SELECT COUNT(*) FROM messages WHERE report_id = ?", (r['id'],))
                r['message_count'] = cursor.fetchone()[0]

            conn.close()
            return self._send_json({"reports": reports})

        # ── API: Admin - Full report details ──
        if path.startswith('/api/admin/reports/'):
            user = get_authenticated_user(self._get_bearer_token())
            if not user:
                return self._send_json({"error": "Unauthorized"}, 401)

            report_id = path.split('/')[4].upper()
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
            row = cursor.fetchone()
            if not row:
                conn.close()
                return self._send_json({"error": "Report not found"}, 404)

            cursor.execute("SELECT * FROM messages WHERE report_id = ? ORDER BY id ASC", (report_id,))
            msgs = [dict(m) for m in cursor.fetchall()]
            conn.close()

            report = dict(row)
            report['attachments'] = json.loads(report.pop('attachments_json', '[]'))
            return self._send_json({"report": report, "messages": msgs})

        # ── API: Admin - CSV / JSON Export ──
        if path == '/api/admin/export':
            user = get_authenticated_user(self._get_bearer_token())
            if not user:
                return self._send_json({"error": "Unauthorized"}, 401)

            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT id, category, location, incident_time, severity, status, description, created_at FROM reports ORDER BY created_at DESC")
            rows = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return self._send_json({"export": rows, "count": len(rows), "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()})

        # Fallback to serving static frontend
        return super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path.rstrip('/')

        # ── API: Submit Incident Report ──
        if path == '/api/reports':
            data = self._read_json_body()
            category = data.get('category', '').strip()
            description = data.get('description', '').strip()

            if not category or len(description) < 20:
                return self._send_json({"error": "Ungültige Eingaben. Beschreibung muss mind. 20 Zeichen haben."}, 400)

            # Generate or reuse verified ID
            report_id = data.get('id') or ('SS-' + secrets.token_hex(3).upper())
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            # Process sanitized attachments
            attachments = data.get('attachments', [])
            saved_attachments = []
            for att in attachments:
                if 'dataUrl' in att and att['dataUrl'].startswith('data:image/'):
                    try:
                        # Extract and write clean sanitized file
                        header, base64_data = att['dataUrl'].split(',', 1)
                        import base64
                        file_bytes = base64.b64decode(base64_data)
                        filename = f"{report_id}_{secrets.token_hex(4)}.jpg"
                        file_path = os.path.join(UPLOAD_DIR, filename)
                        with open(file_path, 'wb') as f:
                            f.write(file_bytes)
                        saved_attachments.append({
                            "filename": filename,
                            "url": f"/uploads/{filename}",
                            "size": len(file_bytes)
                        })
                    except Exception as e:
                        print(f"Error saving attachment: {e}")

            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO reports (id, category, location, incident_time, severity, description, status, attachments_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?, ?)
            """, (
                report_id,
                category,
                data.get('location', ''),
                data.get('incident_time', ''),
                data.get('severity', ''),
                description,
                json.dumps(saved_attachments),
                now_iso,
                now_iso
            ))
            conn.commit()
            conn.close()

            return self._send_json({
                "success": True,
                "report": {
                    "id": report_id,
                    "category": category,
                    "status": "received",
                    "created_at": now_iso
                }
            }, 201)

        # ── API: Reporter or Admin Follow-up Message ──
        if path.startswith('/api/reports/') and path.endswith('/messages'):
            report_id = path.split('/')[3].upper()
            data = self._read_json_body()
            message_text = data.get('message', '').strip()
            sender = data.get('sender', 'reporter')

            if not message_text:
                return self._send_json({"error": "Nachricht darf nicht leer sein"}, 400)

            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM reports WHERE id = ?", (report_id,))
            if not cursor.fetchone():
                conn.close()
                return self._send_json({"error": "Report not found"}, 404)

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            cursor.execute(
                "INSERT INTO messages (report_id, sender, message, created_at) VALUES (?, ?, ?, ?)",
                (report_id, sender, message_text, now_iso)
            )
            cursor.execute("UPDATE reports SET updated_at = ? WHERE id = ?", (now_iso, report_id))
            conn.commit()
            conn.close()

            return self._send_json({"success": True, "created_at": now_iso})

        # ── API: Admin Login ──
        if path == '/api/auth/login':
            data = self._read_json_body()
            username = data.get('username', '').strip()
            password = data.get('password', '')

            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT password_hash, salt FROM admin_users WHERE username = ?", (username,))
            row = cursor.fetchone()

            if not row or not verify_password(row[0], row[1], password):
                conn.close()
                return self._send_json({"error": "Ungültige Anmeldedaten"}, 401)

            token = secrets.token_hex(32)
            expires = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)).isoformat()
            cursor.execute("INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)", (token, username, expires))
            conn.commit()
            conn.close()

            return self._send_json({"token": token, "username": username, "expires_at": expires})

        # ── API: Admin Send Message ──
        if path.startswith('/api/admin/reports/') and path.endswith('/messages'):
            user = get_authenticated_user(self._get_bearer_token())
            if not user:
                return self._send_json({"error": "Unauthorized"}, 401)

            report_id = path.split('/')[4].upper()
            data = self._read_json_body()
            message_text = data.get('message', '').strip()

            if not message_text:
                return self._send_json({"error": "Nachricht darf nicht leer sein"}, 400)

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO messages (report_id, sender, message, created_at) VALUES (?, 'team', ?, ?)",
                (report_id, message_text, now_iso)
            )
            cursor.execute("UPDATE reports SET updated_at = ? WHERE id = ?", (now_iso, report_id))
            conn.commit()
            conn.close()
            return self._send_json({"success": True, "created_at": now_iso})

        self.send_error(404, "Endpoint not found")

    def do_PATCH(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path.rstrip('/')

        # ── API: Admin Update Report Status & Notes ──
        if path.startswith('/api/admin/reports/'):
            user = get_authenticated_user(self._get_bearer_token())
            if not user:
                return self._send_json({"error": "Unauthorized"}, 401)

            report_id = path.split('/')[4].upper()
            data = self._read_json_body()

            updates = []
            params = []
            if 'status' in data:
                updates.append("status = ?")
                params.append(data['status'])
            if 'internal_notes' in data:
                updates.append("internal_notes = ?")
                params.append(data['internal_notes'])
            if 'public_notes' in data:
                updates.append("public_notes = ?")
                params.append(data['public_notes'])

            if not updates:
                return self._send_json({"error": "No fields to update"}, 400)

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            updates.append("updated_at = ?")
            params.append(now_iso)
            params.append(report_id)

            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute(f"UPDATE reports SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
            conn.close()

            return self._send_json({"success": True, "updated_at": now_iso})

        self.send_error(404, "Endpoint not found")


def run():
    init_db()
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, SafeSpaceHandler)
    print(f"SafeSpace Backend running at http://localhost:{PORT}")
    print(f"  - Incident Reporting: http://localhost:{PORT}/")
    print(f"  - Awareness Admin:    http://localhost:{PORT}/admin/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()


if __name__ == '__main__':
    run()
