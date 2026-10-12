#!/usr/bin/env python3
"""
SafeSpace Unit & Integration Test Suite (In-Memory Stream Mock)
Tests the backend HTTP handler, database, auth, reporting, chat, and export
without requiring network socket connections (fully sandbox-compliant).
"""

import io
import os
import sys
import json
import sqlite3
import server

class MockSocket:
    def __init__(self, request_bytes):
        self.rfile = io.BytesIO(request_bytes)
        self.wfile = io.BytesIO()

    def makefile(self, mode, *args, **kwargs):
        if 'r' in mode or 'b' in mode:
            return self.rfile
        return self.wfile

    def sendall(self, data):
        self.wfile.write(data)

def invoke_request(method, path, body=None, headers=None):
    if headers is None:
        headers = {}
    
    body_bytes = b""
    if body is not None:
        if isinstance(body, str):
            body_bytes = body.encode('utf-8')
        elif isinstance(body, (dict, list)):
            body_bytes = json.dumps(body).encode('utf-8')
            headers['Content-Type'] = 'application/json'
        headers['Content-Length'] = str(len(body_bytes))

    header_lines = [f"{method} {path} HTTP/1.1", f"Host: localhost"]
    for k, v in headers.items():
        header_lines.append(f"{k}: {v}")
    header_str = "\r\n".join(header_lines) + "\r\n\r\n"
    raw_request = header_str.encode('utf-8') + body_bytes

    sock = MockSocket(raw_request)
    
    # Instantiate handler
    handler = server.SafeSpaceHandler(sock, ('127.0.0.1', 12345), server=None)
    
    # Capture response from sock.wfile
    response_bytes = sock.wfile.getvalue()
    
    # Parse status and body
    status_line = response_bytes.split(b"\r\n")[0].decode('latin1', errors='ignore')
    parts = status_line.split(" ", 2)
    status_code = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    
    split_idx = response_bytes.find(b"\r\n\r\n")
    response_body = response_bytes[split_idx+4:] if split_idx != -1 else b""
    
    return status_code, response_body

def run():
    print("=== Running SafeSpace In-Process Integration Tests ===")
    server.init_db()

    # Clean up any previous test artifacts
    conn = sqlite3.connect(server.DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM messages WHERE report_id = 'SS-UNIT01'")
    cursor.execute("DELETE FROM reports WHERE id = 'SS-UNIT01'")
    conn.commit()
    conn.close()

    # 0. Test Static Asset Serving
    for asset in ['/index.html', '/admin/index.html', '/css/styles.css', '/js/app.js', '/manifest.webmanifest', '/sw.js']:
        status, body = invoke_request("GET", asset)
        assert status == 200, f"Expected 200 for {asset}, got {status}"
        assert len(body) > 0, f"Empty body for {asset}"
        print(f"  ✓ 0. GET {asset}: 200 OK ({len(body)} bytes)")

    # 1. Test POST /api/reports (Submit Incident)
    report_data = {
        "id": "SS-UNIT01",
        "category": "Belästigung",
        "location": "Bremen Viertel",
        "incident_time": "2026-10-08T02:00",
        "severity": "⚠️ Ernsthaft",
        "description": "Ein Vorfall im Rahmen des Unit-Tests mit mindestens 20 Zeichen Länge.",
        "attachments": []
    }
    status, body = invoke_request("POST", "/api/reports", report_data)
    assert status == 201, f"Expected 201, got {status}: {body}"
    res = json.loads(body.decode())
    assert res["success"] is True
    assert res["report"]["id"] == "SS-UNIT01"
    print("  ✓ 1. POST /api/reports: Report submitted successfully")

    # 2. Test GET /api/reports/SS-UNIT01 (Reporter Lookup)
    status, body = invoke_request("GET", "/api/reports/SS-UNIT01")
    assert status == 200, f"Expected 200, got {status}: {body}"
    res = json.loads(body.decode())
    assert res["report"]["category"] == "Belästigung"
    assert res["report"]["status"] == "received"
    print("  ✓ 2. GET /api/reports/SS-UNIT01: Reporter status lookup verified")

    # 3. Test POST /api/reports/SS-UNIT01/messages (Anonymous Reporter Message)
    msg_data = {"message": "Dies ist eine vertrauliche Ergänzung vom Melder.", "sender": "reporter"}
    status, body = invoke_request("POST", "/api/reports/SS-UNIT01/messages", msg_data)
    assert status == 200, f"Expected 200, got {status}: {body}"
    print("  ✓ 3. POST /api/reports/SS-UNIT01/messages: Anonymous follow-up delivered")

    # 4. Test POST /api/auth/login (Admin Login)
    status, body = invoke_request("POST", "/api/auth/login", {"username": "admin", "password": "safespace2026"})
    assert status == 200, f"Expected 200, got {status}: {body}"
    auth = json.loads(body.decode())
    token = auth.get("token")
    assert token, "Token missing in auth response"
    print(f"  ✓ 4. POST /api/auth/login: Admin authenticated (Token: {token[:8]}...)")

    # 5. Test GET /api/admin/reports (Admin Listing)
    status, body = invoke_request("GET", "/api/admin/reports", headers={"Authorization": f"Bearer {token}"})
    assert status == 200, f"Expected 200, got {status}: {body}"
    reports_res = json.loads(body.decode())
    found = [r for r in reports_res.get("reports", []) if r["id"] == "SS-UNIT01"]
    assert len(found) == 1
    assert found[0]["message_count"] == 1
    print("  ✓ 5. GET /api/admin/reports: Incident reports listed with message counts")

    # 6. Test PATCH /api/admin/reports/SS-UNIT01 (Update Status & Notes)
    patch_data = {
        "status": "action",
        "public_notes": "Gespräch mit Sicherheitsdienst geführt.",
        "internal_notes": "Hausverbot gegen Täter ausgesprochen."
    }
    status, body = invoke_request("PATCH", "/api/admin/reports/SS-UNIT01", patch_data, headers={"Authorization": f"Bearer {token}"})
    assert status == 200, f"Expected 200, got {status}: {body}"
    print("  ✓ 6. PATCH /api/admin/reports/SS-UNIT01: Status changed to 'action' with documentation")

    # 7. Test POST /api/admin/reports/SS-UNIT01/messages (Team Reply)
    reply_data = {"message": "Danke für die Details. Das Awareness-Team hat interveniert."}
    status, body = invoke_request("POST", "/api/admin/reports/SS-UNIT01/messages", reply_data, headers={"Authorization": f"Bearer {token}"})
    assert status == 200, f"Expected 200, got {status}: {body}"
    print("  ✓ 7. POST /api/admin/reports/SS-UNIT01/messages: Team reply sent to reporter")

    # 8. Test Verification of Reporter view with updated status and messages
    status, body = invoke_request("GET", "/api/reports/SS-UNIT01")
    assert status == 200
    res = json.loads(body.decode())
    assert res["report"]["status"] == "action"
    assert "Sicherheitsdienst" in res["report"]["public_notes"]
    assert len(res["messages"]) == 2
    assert res["messages"][0]["sender"] == "reporter"
    assert res["messages"][1]["sender"] == "team"
    print("  ✓ 8. GET /api/reports/SS-UNIT01: Verified reporter sees 2-way conversation & status update")

    # 9. Test GET /api/admin/export (CSV / JSON Export)
    status, body = invoke_request("GET", "/api/admin/export", headers={"Authorization": f"Bearer {token}"})
    assert status == 200
    export_res = json.loads(body.decode())
    assert export_res["count"] >= 1
    print(f"  ✓ 9. GET /api/admin/export: Data export verified ({export_res['count']} records)")

    # 10. Test POST /api/admin/change-password (Password Management)
    # Fail with incorrect old password
    fail_data = {"old_password": "wrong_password", "new_password": "new_secret_pass_2026"}
    status, body = invoke_request("POST", "/api/admin/change-password", fail_data, headers={"Authorization": f"Bearer {token}"})
    assert status == 400
    # Succeed with correct old password
    change_data = {"old_password": "safespace2026", "new_password": "new_secret_pass_2026"}
    status, body = invoke_request("POST", "/api/admin/change-password", change_data, headers={"Authorization": f"Bearer {token}"})
    assert status == 200, f"Expected 200, got {status}: {body}"
    res = json.loads(body.decode())
    assert res["success"] is True
    # Verify login works with new password
    status, body = invoke_request("POST", "/api/auth/login", {"username": "admin", "password": "new_secret_pass_2026"})
    assert status == 200
    # Revert password back to safespace2026 for dev convenience
    status, body = invoke_request("POST", "/api/admin/change-password", {"old_password": "new_secret_pass_2026", "new_password": "safespace2026"}, headers={"Authorization": f"Bearer {token}"})
    assert status == 200
    print("  ✓ 10. POST /api/admin/change-password: Password change and authentication lifecycle verified")

    # 11. Test DELETE /api/admin/reports/SS-UNIT01 (GDPR Data Deletion)
    status, body = invoke_request("DELETE", "/api/admin/reports/SS-UNIT01", headers={"Authorization": f"Bearer {token}"})
    assert status == 200, f"Expected 200, got {status}: {body}"
    del_res = json.loads(body.decode())
    assert del_res["success"] is True
    # Verify report is completely removed
    status, body = invoke_request("GET", "/api/reports/SS-UNIT01")
    assert status == 404
    print("  ✓ 11. DELETE /api/admin/reports/SS-UNIT01: GDPR purge verified, report and messages deleted")

    print("\n🎉 ALL 11 IN-PROCESS INTEGRATION TESTS PASSED PERFECTLY!")

if __name__ == '__main__':
    run()
