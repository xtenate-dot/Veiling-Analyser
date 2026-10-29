// Veiling Analyser – instellingen voor deze installatie
// api:         adres van je server (Cloudflare Worker).
//              Draait de app op veilinganalyser.nl of op het workers.dev-adres van de Worker, dan is dat
//              hetzelfde adres als de app zelf. Elders (bijv. GitHub Pages) leeg: dan werkt de app zonder
//              server en vraagt hij elke gebruiker om een eigen Anthropic API-sleutel.
// prijzen:     prijzen die bij de abonnementen in de app worden getoond (stel dezelfde in bij Stripe), inclusief btw.
// voorwaarden, privacy: links naar je algemene voorwaarden en privacybeleid (verplicht als je de app verkoopt).
window.VA_CONFIG = {
  api: (function() {
    var h = location.hostname;
    return /(^|\.)veilinganalyser\.nl$/.test(h) || h === 'veiling-analyser.xtenate.workers.dev' ? location.origin : '';
  })(),
  prijzen: { basis: '€ 9,99 per maand incl. btw', pro: '€ 24,99 per maand incl. btw' },
  voorwaarden: 'voorwaarden.html',
  privacy: 'privacy.html'
};
