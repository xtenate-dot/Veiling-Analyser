-- Veiling Analyser – database (Cloudflare D1 / SQLite)
-- Aanmaken:  npx wrangler d1 execute veiling-analyser --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS gebruikers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  wachtwoord_hash TEXT NOT NULL,
  zout TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'gratis',
  stripe_klant TEXT,
  stripe_abonnement TEXT,
  abonnement_status TEXT,
  periode_einde INTEGER,
  aangemaakt INTEGER NOT NULL,
  -- Genormaliseerd adres (zonder +toevoeging, zonder punten bij Gmail) tegen dubbele accounts
  email_kanon TEXT,
  email_geverifieerd INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gebruikers_kanon ON gebruikers(email_kanon);
CREATE INDEX IF NOT EXISTS idx_gebruikers_stripe ON gebruikers(stripe_klant);

CREATE TABLE IF NOT EXISTS sessies (
  token_hash TEXT PRIMARY KEY,
  gebruiker_id INTEGER NOT NULL,
  verloopt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessies_gebruiker ON sessies(gebruiker_id);

-- Eén regel per analyse: telt mee voor de maandlimiet en het dagbudget
CREATE TABLE IF NOT EXISTS verbruik (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gebruiker_id INTEGER NOT NULL,
  tijd INTEGER NOT NULL,
  usd REAL NOT NULL DEFAULT 0,
  url TEXT,
  tokens TEXT   -- JSON: in, cache_schrijf, cache_lees, uit, zoek, ophalen, aanroepen
);
-- Bestaande database: ALTER TABLE verbruik ADD COLUMN tokens TEXT;
CREATE INDEX IF NOT EXISTS idx_verbruik_gebruiker ON verbruik(gebruiker_id, tijd);
CREATE INDEX IF NOT EXISTS idx_verbruik_tijd ON verbruik(tijd);

-- Gedeelde prijscache: hetzelfde product in dezelfde staat hoeft niet opnieuw opgezocht te worden
CREATE TABLE IF NOT EXISTS prijscache (
  sleutel TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  tijd INTEGER NOT NULL
);

-- Kavels van een gebruiker, zodat ze op alle apparaten gelijk zijn
CREATE TABLE IF NOT EXISTS kavels (
  gebruiker_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  bijgewerkt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS herstel (
  token_hash TEXT PRIMARY KEY,
  gebruiker_id INTEGER NOT NULL,
  verloopt INTEGER NOT NULL
);

-- Code van 6 cijfers om het e-mailadres te bevestigen
CREATE TABLE IF NOT EXISTS verificatie (
  gebruiker_id INTEGER PRIMARY KEY,
  code_hash TEXT NOT NULL,
  verloopt INTEGER NOT NULL,
  pogingen INTEGER NOT NULL DEFAULT 0,
  verstuurd INTEGER NOT NULL,
  dag TEXT NOT NULL,
  aantal_dag INTEGER NOT NULL DEFAULT 1
);

-- Mislukte inlogpogingen, tegen het raden van wachtwoorden
CREATE TABLE IF NOT EXISTS pogingen (
  email TEXT NOT NULL,
  tijd INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pogingen ON pogingen(email, tijd);

-- Kavels per regel (D1 staat maximaal 2 MB per regel toe; één regel per gebruiker liep daar tegenaan)
CREATE TABLE IF NOT EXISTS kavel_items (
  gebruiker_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  bijgewerkt INTEGER NOT NULL,
  PRIMARY KEY (gebruiker_id, id)
);

-- Tegoed dat niet verloopt: de welkomstbundel en gekochte losse bundels
CREATE TABLE IF NOT EXISTS tegoed (
  gebruiker_id INTEGER PRIMARY KEY,
  saldo INTEGER NOT NULL DEFAULT 0,
  bijgewerkt INTEGER NOT NULL
);
-- Gekochte bundels (één regel per Stripe-betaling, zodat een betaling nooit twee keer wordt bijgeschreven)
CREATE TABLE IF NOT EXISTS aankopen (
  stripe_sessie TEXT PRIMARY KEY,
  gebruiker_id INTEGER NOT NULL,
  bundel TEXT NOT NULL,
  analyses INTEGER NOT NULL,
  tijd INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aankopen_tijd ON aankopen(tijd);

-- "Klopt er iets niet?" bij een analyse
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gebruiker_id INTEGER NOT NULL,
  tijd INTEGER NOT NULL,
  soort TEXT NOT NULL,
  tekst TEXT,
  kavel_url TEXT,
  product TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_tijd ON feedback(tijd);

-- Reviews: één per gebruiker, alleen na minstens één echte analyse
CREATE TABLE IF NOT EXISTS reviews (
  gebruiker_id INTEGER PRIMARY KEY,
  sterren INTEGER NOT NULL,
  tekst TEXT NOT NULL,
  naam TEXT NOT NULL,
  analyses INTEGER NOT NULL,
  tijd INTEGER NOT NULL,
  zichtbaar INTEGER NOT NULL DEFAULT 1
);

-- Verstuurde meldingen aan de eigenaar (niet vaker dan nodig mailen)
CREATE TABLE IF NOT EXISTS meldingen (
  soort TEXT PRIMARY KEY,
  tijd INTEGER NOT NULL
);

-- Verwijderde accounts: alleen een hash van het genormaliseerde adres, een jaar bewaard,
-- zodat verwijderen en opnieuw aanmelden geen nieuwe welkomstbundel of lege maandteller oplevert
CREATE TABLE IF NOT EXISTS verwijderd (
  kanon_hash TEXT PRIMARY KEY,
  oud_id INTEGER NOT NULL,
  tijd INTEGER NOT NULL
);

-- Meldingen en agenda (worden ook automatisch aangemaakt door de server)
CREATE TABLE IF NOT EXISTS instellingen (sleutel TEXT PRIMARY KEY, waarde TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_abonnementen (id INTEGER PRIMARY KEY AUTOINCREMENT, gebruiker_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, minuten INTEGER NOT NULL DEFAULT 15, bij_sluiting INTEGER NOT NULL DEFAULT 1, gemaakt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_push_gebruiker ON push_abonnementen(gebruiker_id);
CREATE TABLE IF NOT EXISTS push_verstuurd (gebruiker_id INTEGER NOT NULL, kavel_id TEXT NOT NULL, soort TEXT NOT NULL, tijd INTEGER NOT NULL, PRIMARY KEY (gebruiker_id, kavel_id, soort));
CREATE TABLE IF NOT EXISTS agenda (gebruiker_id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, gemaakt INTEGER NOT NULL);
-- kavel_items krijgt een kolom sluit (sluittijd in ms) met index; de server voegt die zelf toe
