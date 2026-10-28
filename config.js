// Veiling Analyser – instellingen voor deze installatie
// api:         adres van je server (Cloudflare Worker), bijv. 'https://veiling-analyser.jouwnaam.workers.dev'.
//              Leeg = de app werkt zonder server en vraagt elke gebruiker om een eigen Anthropic API-sleutel.
// prijzen:     prijzen die bij de abonnementen in de app worden getoond (stel dezelfde in bij Stripe).
// voorwaarden, privacy: links naar je algemene voorwaarden en privacybeleid (verplicht als je de app verkoopt).
window.VA_CONFIG = {
  api: '',
  prijzen: { basis: '€ 9,99 per maand', pro: '€ 24,99 per maand' },
  voorwaarden: '',
  privacy: ''
};
