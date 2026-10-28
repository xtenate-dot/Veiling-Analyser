# Veiling Analyser installeren en verkopen

De app bestaat uit twee delen:

- **De app** (deze map): een webapp die op GitHub Pages draait. Werkt op telefoon en computer en is te installeren als app.
- **De server** (map `server/`): een Cloudflare Worker. Die bewaart de Anthropic-sleutel geheim, regelt accounts en abonnementen, bewaakt limieten en synchroniseert kavels tussen apparaten.

Zonder server werkt de app ook: dan vraagt hij elke gebruiker om een eigen Anthropic API-sleutel. Voor verkoop heb je de server nodig.

---

## Snel starten: gratis, zonder betalen

Je kunt de app eerst gratis aanbieden, zonder Stripe. Iedereen krijgt dan een account met een vast aantal gratis analyses per maand, en jij betaalt de AI-kosten. Je volgt **stap 1, 2, 3, 5 en 6** hieronder en slaat stap 4 (Stripe) over.

Stel in `server/wrangler.toml` in:

- `LIMIET_GRATIS`: analyses per persoon per maand (standaard 10);
- `DAGBUDGET_USD`: maximaal AI-kosten per 24 uur voor iedereen samen (standaard $20; voor een testfase is $2 tot $5 ruim).

En zet eventueel een uitnodigingscode, zodat alleen mensen die jij de code geeft een account kunnen maken:

```bash
npx wrangler secret put UITNODIGINGSCODE
```

Wat het je kost, met de gemeten $0,015 per analyse:

| Gebruikers | Analyses per persoon per maand | AI-kosten per maand |
|---|---|---|
| 20 | 10 (volle limiet) | ongeveer $3 |
| 100 | 10 (volle limiet) | ongeveer $15 |

Daarbij komt $5 per maand voor Cloudflare Workers Paid. In de praktijk gebruikt niet iedereen de volle limiet, en herhaalde producten komen uit de gratis cache.

Zet voor je live gaat de e-mailcontrole aan (stap 5): dan moet iedereen een echt e-mailadres bevestigen voordat hij kan analyseren. Het dagbudget en eventueel de uitnodigingscode beschermen je daarnaast.

Wil je later toch laten betalen, dan volg je stap 4. De app laat abonnementen pas zien als Stripe is ingesteld.

---

## Wat je nodig hebt

| Dienst | Waarvoor | Kosten |
|---|---|---|
| [Cloudflare](https://dash.cloudflare.com/sign-up) | Server en database | Workers Paid: $5 per maand. Het gratis plan geeft maar 10 ms rekentijd per verzoek; dat is te weinig voor veilig inloggen. |
| [Anthropic Console](https://console.anthropic.com) | De AI die pagina's leest en prijzen zoekt | Per gebruik, zie onder |
| [Stripe](https://dashboard.stripe.com/register) | Abonnementen en betalingen (alleen als je wilt laten betalen) | Per betaling een klein percentage, zie [stripe.com/nl/pricing](https://stripe.com/nl/pricing) |
| [Resend](https://resend.com) | E-mail: bevestigingscode bij aanmelden en "wachtwoord vergeten" | Gratis tot 3.000 e-mails per maand (100 per dag); je hebt een eigen domeinnaam nodig |
| Cloudflare Turnstile | Botcontrole bij aanmelden | Gratis |

Je hebt ook [Node.js](https://nodejs.org) nodig op je computer, voor het commando `npx wrangler`.

## Kosten per analyse

De server gebruikt standaard Claude Haiku 5.5 en hooguit één zoekopdracht per analyse:

- de kavelpagina haalt de server zelf op (gratis), Haiku leest een ingekorte versie: rond $0,001;
- prijzen zoeken: hooguit 3 pagina's lezen (alleen tekstkosten) en 1 zoekopdracht van $0,01;
- hetzelfde product in dezelfde staat binnen 3 dagen: de prijzen komen uit de gedeelde cache, dan kost het alleen het lezen van de kavelpagina.

In de tests kwam een analyse uit op $0,015, en $0,001 met de cache. Echte pagina's kunnen langer zijn. Controleer na de eerste week in de Anthropic Console wat het werkelijk kost. Zet in `wrangler.toml` `ZOEKOPDRACHTEN = "0"` als je de zoekopdracht wilt schrappen; dan blijft het onder een cent, maar vindt hij bij zeldzame producten minder.

Twee veiligheidsgrenzen zitten ingebouwd:

- `DAGBUDGET_USD`: boven dit bedrag per 24 uur (alle klanten samen) stopt de server met analyseren tot de volgende dag.
- Per klant hooguit `MAX_PER_UUR` analyses per uur.

Stel daarnaast in de Anthropic Console onder Limits een maandelijkse uitgavenlimiet in.

---

## Stap 1. Anthropic-sleutel

1. Maak een account op [console.anthropic.com](https://console.anthropic.com) en laad tegoed op.
2. Maak onder **API keys** een nieuwe sleutel. Bewaar hem; je ziet hem maar één keer.
3. Stel onder **Limits** een maandlimiet in.

## Al ingericht (28 oktober 2026)

- **Database:** D1-database `veiling-analyser`, opgeslagen in de EU (goed voor de AVG), met alle tabellen.
- **Server:** Worker `veiling-analyser` in je Cloudflare-account, gekoppeld aan deze GitHub-repository (map `server`, branch `live-prijzen-en-kostenmodel`). Elke push bouwt en publiceert de server vanzelf op `https://veiling-analyser.xtenate.workers.dev`.

Stap 2 hieronder is daarmee al gedaan, behalve het zetten van de geheime sleutels. Die zet je in het Cloudflare-dashboard: Workers & Pages → veiling-analyser → Settings → Variables and secrets → Add → type **Secret**.

Zodra je de app live zet, zet je de productiebranch terug op `main` (Settings → Builds → Production branch), nadat de pull request is samengevoegd.

## Stap 2. Server op Cloudflare

Open een terminal in de map `server/`:

```bash
npx wrangler login
npx wrangler d1 create veiling-analyser
```

Het tweede commando toont een `database_id`. Zet die in `server/wrangler.toml` op de plek van `VUL-HIER-HET-DATABASE-ID-IN`. Maak daarna de tabellen aan en zet de sleutel:

```bash
npx wrangler d1 execute veiling-analyser --remote --file=schema.sql
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Na `deploy` krijg je een adres zoals `https://veiling-analyser.jouwnaam.workers.dev`. Controleer het door `/api/gezondheid` erachter te openen; je hoort `{"ok":true}` te zien.

Controleer in `wrangler.toml` of `APP_URL` en `APP_ORIGIN` naar je app wijzen. Met GitHub Pages is dat:

```toml
APP_URL = "https://xtenate-dot.github.io/Veiling-Analyser/app.html"
APP_ORIGIN = "https://xtenate-dot.github.io"
```

Zet in het Cloudflare-dashboard het Workers Paid-abonnement aan.

## Stap 3. App aan de server koppelen

Zet in `config.js` het serveradres:

```js
api: 'https://veiling-analyser.jouwnaam.workers.dev',
```

Vanaf dan vraagt de app om een account in plaats van een API-sleutel. Iedereen krijgt elke maand `LIMIET_GRATIS` analyses gratis (standaard 10).

## Stap 4. Betalen met Stripe

Doe dit eerst in **testmodus** (schakelaar rechtsboven in het Stripe-dashboard).

1. **Producten:** maak onder Productcatalogus twee producten, "Basis" en "Pro", elk met een terugkerende maandprijs. Kopieer de prijs-ID's (beginnen met `price_`).
2. **Klantportaal:** zet onder Instellingen → Billing → Klantportaal het portaal aan, zodat klanten zelf kunnen opzeggen, wisselen en hun betaalgegevens bijwerken.
3. **Webhook:** voeg onder Ontwikkelaars → Webhooks een endpoint toe:
   - adres: `https://veiling-analyser.jouwnaam.workers.dev/api/stripe-webhook`
   - gebeurtenissen: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - kopieer de ondertekeningssleutel (begint met `whsec_`).
4. Zet de geheimen:

```bash
npx wrangler secret put STRIPE_SECRET_KEY        # sk_test_... (later sk_live_...)
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # whsec_...
npx wrangler secret put STRIPE_PRICE_BASIS       # price_...
npx wrangler secret put STRIPE_PRICE_PRO         # price_...
```

5. Pas de getoonde prijzen in `config.js` aan zodat ze gelijk zijn aan Stripe, en de limieten in `wrangler.toml` (`LIMIET_BASIS`, `LIMIET_PRO`). Voer `npx wrangler deploy` opnieuw uit.
6. Test met kaartnummer `4242 4242 4242 4242`, een datum in de toekomst en een willekeurige CVC. Na betalen moet in de app onder Account het nieuwe abonnement staan.

Werkt alles, herhaal stap 1 tot en met 4 in de live-modus van Stripe (nieuwe prijs-ID's, nieuwe webhook, `sk_live_` sleutel).

## Stap 5. E-mail: bevestigingscode en wachtwoord vergeten

**Nodig om live te gaan.** Zodra de server e-mail kan versturen, moet iedereen na het aanmelden zijn e-mailadres bevestigen met een code van 6 cijfers. Pas daarna kan hij analyseren. Zo kan niemand met verzonnen adressen eindeloos gratis accounts maken. Dezelfde koppeling verstuurt de link voor "wachtwoord vergeten".

1. Maak een account bij [Resend](https://resend.com) (gratis tot 3.000 e-mails per maand en 100 per dag) en verifieer je eigen domein. Daarvoor heb je een domeinnaam nodig, bijvoorbeeld `veilinganalyser.nl`.
2. Zet de geheimen:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_VAN        # bijv. Veiling Analyser <noreply@jouwdomein.nl>
```

Wat de server nog meer doet tegen misbruik:

- tijdelijke wegwerpadressen (zoals mailinator.com) worden geweigerd;
- `jan+1@gmail.com` en `j.a.n@gmail.com` tellen als hetzelfde adres als `jan@gmail.com`;
- na 5 foute codes moet er een nieuwe code komen, en er gaan hooguit 5 codes per dag naar één account.

Zonder Resend staat de e-mailcontrole uit. Dat is handig om te testen, maar zet hem aan voordat je live gaat.

## Stap 6 (aanbevolen). Botcontrole met Cloudflare Turnstile

Turnstile is de gratis, meestal onzichtbare controle van Cloudflare of er een mens aanmeldt.

1. Ga in het Cloudflare-dashboard naar Turnstile en voeg een widget toe voor het domein van je app (bijvoorbeeld `xtenate-dot.github.io`).
2. Zet de openbare sitekey in `server/wrangler.toml` bij `TURNSTILE_SITEKEY`, en de geheime sleutel als geheim:

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler deploy
```

De app laat de controle dan vanzelf zien bij Account maken.

---

## Testen

```bash
node server/test/server.test.mjs          # 70 controles van de server (Node 22 of nieuwer)
node server/test/lokaal.mjs               # server lokaal op poort 8787 met nep-AI, voor handmatig testen
```

Voor handmatig testen: start ook `python3 -m http.server 8080` in de hoofdmap en zet in `config.js` tijdelijk `api: 'http://localhost:8787'`.

---

## Voordat je gaat verkopen

Dit is geen juridisch advies; laat het nakijken.

- **Algemene voorwaarden en privacybeleid.** Je verwerkt e-mailadressen en betalingen, dus je hebt een privacybeleid nodig (AVG) en voorwaarden voor het abonnement. Zet de links in `config.js` (`voorwaarden`, `privacy`); de app toont ze bij het maken van een account.
- **Inschrijving en btw.** Voor verkoop heb je een KvK-inschrijving nodig en moet je btw afdragen over de abonnementen. Stripe kan btw voor je berekenen (Stripe Tax).
- **Gebruik van andere websites.** De app leest veilingpagina's en zoekt prijzen op Marktplaats, 2dehands, eBay en bol.com. Dat gebeurt per analyse op verzoek van de gebruiker, maar de voorwaarden van die sites beperken vaak automatisch uitlezen, zeker voor commercieel gebruik. Laat dit beoordelen voordat je op grote schaal verkoopt. eBay heeft een officiële API voor productgegevens, waarop de app kan overstappen.
- **Eerlijke verwachtingen.** Het advies is een berekening op basis van gevonden prijzen, geen garantie. De app zegt dat overal; zet het ook in je voorwaarden.
- **Merk.** Controleer of de naam "Veiling Analyser" vrij is bij het [BOIP](https://www.boip.int) als je hem als merk wilt gebruiken.
