# DWH’s Serien Streamer – Login (öffentliches Repository)

Öffentliche Login-Seite. Nach der Anmeldung wird das Dashboard aus dem **privaten** Repository
`DWH-Serienboard` über die GitHub-API geladen, im Browser gespeichert und unter `…/Serien/app/` gestartet.

- `users.json` enthält pro Nutzer den GitHub-Token, verschlüsselt mit dem Passwort
  (PBKDF2-SHA256, 600.000 Runden + AES-256-GCM). Benutzernamen nur als SHA-256-Hash.
- Ohne gültiges Login gibt es unter `app/` nichts – das private Repository bleibt privat.
- Nutzer werden mit `SerienNutzer.ps1` oder `Nutzerverwaltung.html` gepflegt (nicht in dieses Repo legen).

| Datei | Aufgabe |
|---|---|
| `index.html`, `login.css` | Login-Seite |
| `login.js` | Anmeldung, Sitzung, Weiterleitung |
| `vault-crypto.js` | Entschlüsselung (Web Crypto) |
| `repo-sync.js` | Dashboard-Dateien aus dem privaten Repo laden (nur geänderte) |
| `sw.js` | Liefert `app/` aus dem Browser-Speicher aus |
| `users.json` | Verschlüsselte Nutzer |
