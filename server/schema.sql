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
  aangemaakt INTEGER NOT NULL
);
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
  url TEXT
);
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

-- Mislukte inlogpogingen, tegen het raden van wachtwoorden
CREATE TABLE IF NOT EXISTS pogingen (
  email TEXT NOT NULL,
  tijd INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pogingen ON pogingen(email, tijd);
