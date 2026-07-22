# Boardroom deployen (Railway)

Das Repo ist deploy-fertig für [Railway](https://railway.com): `railway.json`
steuert Build (`vite build` des Clients) und Start (Express-Server, der API
**und** gebautes Frontend unter einer URL ausliefert).

## Schritt für Schritt

1. **Projekt anlegen**: Railway → *New Project → Deploy from GitHub Repo* →
   `CEOSim` wählen. Branch in den Service-Settings prüfen/setzen.
   Railway erkennt `railway.json` automatisch — kein Build-/Start-Command
   von Hand nötig.

2. **Volume anhängen (wichtig!)**: Service → rechtsklick bzw. *Settings →
   Volumes → Attach Volume*, Mount-Pfad: `/data`.
   Dann unter *Variables* setzen:

   ```
   BOARDROOM_DATA_DIR=/data
   ```

   Ohne Volume liegt die SQLite-Datenbank im Container-Dateisystem und
   **alle Spielstände sind nach jedem Deploy/Neustart weg**.

3. **Optional — KI-Erzählschicht**: Unter *Variables* zusätzlich
   `ANTHROPIC_API_KEY` (oder `OPENAI_API_KEY`) setzen. Ohne Key läuft die
   Simulation vollständig regelbasiert — funktioniert auch für Tester.

4. **Öffentliche URL**: Service → *Settings → Networking → Generate Domain*.
   Fertig — der Link zeigt direkt die App (`/api/health` sollte
   `{"ok":true}` liefern).

## Hinweise

- Node ≥ 22.12 ist über `engines` gepinnt (nötig für `node:sqlite`);
  Railway wählt die Version automatisch passend.
- Jeder Push auf den verbundenen Branch löst automatisch ein Re-Deploy aus.
- Aktuell teilen sich alle Besucher der URL dieselbe Spielstand-Liste.
- Lokale Entwicklung bleibt unverändert: `npm run dev` (Vite auf :5173,
  API auf :3001).
