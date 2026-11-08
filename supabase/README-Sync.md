# st0cks: Daten nach Supabase

Datenbank: Supabase-Projekt "st0cks" (uuxymefcvplbkdondbpg), Tabelle `docs` (coll = 'st0cks').
Die App (GitHub Pages, Ordner /docs) liest die Datenbloecke direkt aus Supabase (oeffentlicher Lese-Schluessel).
Schreiben kann nur der Besitzer (Claude ueber die Supabase-Verbindung oder die Funktion unten).

Aktualisieren: Daten (data/blocks/*.json) im Repo ersetzen, dann in Supabase ausfuehren:
    select public.st0cks_sync();   -- holt alle Bloecke von raw.githubusercontent.com/ThSt90/st0cks/main
Das Depot (data/depot.json, dashboard.html) gehoert nie ins Repo.
