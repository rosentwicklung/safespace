# SafeSpace Deutschland 🛡️

> **Gemeinsam für eine sicherere Event- und Nachtkultur.**  
> Anonyme, sichere und diskrete Plattform zur Meldung von Übergriffen, Belästigung und Diskriminierung bei Veranstaltungen.

Live-URL: [https://safespace-ev.netlify.app/](https://safespace-ev.netlify.app/)

---

## 🌟 Hauptfunktionen (Neu in v2.0)

### 1. Vollständiges Backend & Datenbank (SQLite + REST API)
- **Zero-Dependency Python 3 Server** (`server.py`): Läuft out-of-the-box ohne externe Pakete auf jedem Standard-System.
- **SQLite-Datenbank mit WAL-Modus** (`data/safespace.db`) für hochperformante, sichere Speicherung.
- **Ende-zu-Ende anonymes Tracking**:
  - Eindeutige, leicht merkbare Referenz-IDs (z. B. `SS-9X4K2A`).
  - **Live 2-Wege-Chat**: Betroffene können anonym mit dem Awareness-Team kommunizieren und Rückfragen beantworten – ohne Telefonnummer oder E-Mail angeben zu müssen!
- **Transparenter Fallback**: Kann nahtlos rein statisch auf Netlify / GitHub Pages betrieben werden (mit automatischem Fallback auf `localStorage` + `mailto:`-Vorlage, falls kein Backend erreichbar ist).

### 2. Awareness-Team Admin-Portal (`/admin/`)
- Gesicherter Login mit Passwort-Hashing (PBKDF2-HMAC-SHA256) und Token-Sitzungen.
- **Übersichts-Dashboard**: Live-Statistiken nach Bearbeitungsstatus (`Eingegangen`, `In Prüfung`, `Maßnahme`, `Abgeschlossen`).
- **Filter & Suche**: Volltextsuche nach ID, Ort, Kategorie oder Vorfallinhalt.
- **Detailbearbeitung**:
  - Status anpassen.
  - Öffentliche Notiz für die meldende Person hinterlegen (erscheint live im Status-Tracker!).
  - Interne, vertrauliche Team-Dokumentation für Vorfallanalysen.
  - Anonyme Antworten direkt an den Melder senden.
- **Daten-Export**: Export aller Vorfälle als **CSV** oder **JSON** für Auswertungen und Club-Präventionskonzepte.

### 3. Anonyme Beweisfotos mit EXIF- & GPS-Stripping
- Drag-and-Drop Dateiupload für Screenshots und Fotos (max. 3 Dateien).
- **Client-seitige Bereinigung** (`js/sanitize.js`): Jedes Bild wird vor der Übertragung im Browser über ein HTML5-Canvas neu gerendert. Alle Metadaten (GPS-Koordinaten, Kameramodell, Zeitstempel, Seriennummern) werden rückstandslos entfernt.

### 4. Barrierefreiheit (a11y) & Modernes Design
- **WCAG AA Konformität**: Hohe Kontraste (`--text: #e2e8f0` auf `--dark-bg: #0a0e16`), `:focus-visible` Tastaturnavigation, Skip-Link (`Zum Inhalt springen`).
- **Semantisches HTML5 & ARIA**: `aria-expanded`, `aria-live="polite"` für dynamische Meldungen und Chatverläufe.
- **Responsive Mobile Navigation**: Vollwertiges Hamburger-Menü für Smartphones und Tablets.
- **Toast-System**: Elegante, unaufdringliche Statusmeldungen statt blockierender `alert()`-Popups.

### 5. PWA (Progressive Web App) & Offline-Fähigkeit
- `manifest.webmanifest` mit App-Icons und Standalone-Modus.
- `sw.js` (Service Worker) mit Stale-While-Revalidate Caching für statische Assets und Netzwerk-Priorität für API-Endpunkte.

### 6. Mehrsprachigkeit (7 Sprachen)
- Vollständige Übersetzung aller Texte, Formulare und Glossare für:
  - 🇩🇪 Deutsch (DE)
  - 🇬🇧 Englisch (EN)
  - 🇹🇷 Türkisch (TR)
  - 🇷🇺 Russisch (RU)
  - 🇫🇷 Französisch (FR)
  - 🇪🇸 Spanisch (ES)
  - 🇮🇹 Italienisch (IT)

---

## 📁 Projektstruktur

```
safespace/
├── index.html              # Hauptseite (Meldeportal, Info, Status-Check, Chat)
├── manifest.webmanifest    # PWA Web App Manifest
├── sw.js                   # Service Worker (Offline-Cache)
├── netlify.toml            # Netlify-Konfiguration mit Sicherheits-Headern
├── server.py               # Zero-Dependency Python 3 Backend & API
├── test_suite.py           # Automatisierte End-to-End Testsuite
├── admin/
│   └── index.html          # Awareness-Team Admin Portal
├── css/
│   └── styles.css          # Modulares Stylesheet (Glassmorphism, a11y, Dark Mode)
├── js/
│   ├── app.js              # Haupt-Controller (Formular, Status, Dropzone, Chat)
│   ├── api.js              # API-Client mit automatischem Offline-Fallback
│   ├── i18n.js             # Übersetzungswörterbuch (7 Sprachen)
│   ├── glossary.js         # Awareness-Glossar (7 Sprachen)
│   ├── sanitize.js         # EXIF-/GPS-Metadaten Stripper via Canvas
│   └── admin.js            # Admin-Portal Controller (Auth, Filter, Detail, Export)
├── assets/
│   ├── icon-192.svg        # PWA Icon 192x192
│   └── icon-512.svg        # PWA Icon 512x512
└── data/                   # Lokale SQLite-Datenbank (automatisch initialisiert)
```

---

## 🚀 Schnellanleitung & Lokale Ausführung

### 1. Server starten
```bash
python3 server.py
```
Der Server startet standardmäßig auf Port `8080`:
- **Meldeportal:** [http://localhost:8080/](http://localhost:8080/)
- **Awareness-Team Admin:** [http://localhost:8080/admin/](http://localhost:8080/admin/)

### 2. Standard-Zugangsdaten für das Awareness-Team
- **Benutzername:** `admin`
- **Passwort:** `safespace2026`
*(Kann über die Umgebungsvariablen `ADMIN_USER` und `ADMIN_PASSWORD` angepasst werden)*

### 3. Tests ausführen
```bash
python3 test_suite.py
```
Führt 9 automatisierte In-Process-Integrationstests für alle REST-Endpunkte, Datenbankabfragen, Datei-Serving und Chats durch.

---

## 🌐 Deployment auf Netlify

Die Anwendung ist bereit für direktes Deployment auf Netlify:
1. `git push` in dein GitHub/GitLab-Repository.
2. In Netlify neues Projekt aus Git verknüpfen.
3. Build-Kommando leer lassen (kein Node-Build nötig).
4. Publish-Verzeichnis: `.` (Root-Verzeichnis).
5. Das Formular funktioniert auf Netlify statisch out-of-the-box (mit verschlüsseltem `localStorage` und `mailto:`-Backup) oder kann mit dem Python-Backend / Serverless Functions kombiniert werden.
