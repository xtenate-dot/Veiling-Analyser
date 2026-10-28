# Veiling Analyser

Plak de link van een veilingkavel en zie of bieden loont en tot hoeveel.

De app leest de kavelpagina (product, staat, huidig bod, sluitingstijd en veilingkosten), zoekt vergelijkbare advertenties op Marktplaats, 2dehands en eBay en de nieuwprijs bij Nederlandse winkels, en rekent opgeld, vaste kosten en btw door tot een maximaal bod.

- **App:** `app.html` met `styles.css`, `kern.js` (rekenregels en AI-stappen, gedeeld met de server), `app.js`, `account.js`, `functies.js`, `start.js`. Instellingen in `config.js`.
- **Server:** `server/` (Cloudflare Worker + D1): accounts, abonnementen via Stripe, limieten, gedeelde prijscache en synchronisatie.

Installeren en verkopen: zie [SETUP.md](SETUP.md).
