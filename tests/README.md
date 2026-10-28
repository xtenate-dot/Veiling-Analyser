# Tests van de app

Deze tests openen de app in een browser (Playwright) met nagebootste AI-antwoorden.

```bash
npm install playwright && npx playwright install chromium
node tests/app-zonder-server.test.js app.html uitvoer      # eigen API-sleutel, 50+ controles
# Met server: start eerst de app en de lokale server
python3 -m http.server 8080 &
node server/test/lokaal.mjs 8787 http://localhost:8080 &
node tests/app-met-server.test.js uitvoer                   # klantreis: account, analyse, sync, limiet, winst, export
```

`uitvoer` is een map voor schermafbeeldingen.
