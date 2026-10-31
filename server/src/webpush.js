// Web Push zonder externe bibliotheek: versleuteling volgens RFC 8291 (aes128gcm)
// en afzenderbewijs volgens RFC 8292 (VAPID). Alles met de WebCrypto van de Worker.

const te = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function vanB64url(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function samen(...delen) {
  const n = delen.reduce((t, d) => t + d.length, 0), u = new Uint8Array(n);
  let o = 0;
  for (const d of delen) { u.set(d, o); o += d.length; }
  return u;
}
async function hkdf(zout, ikm, info, lengte) {
  const sleutel = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: zout, info }, sleutel, lengte * 8));
}

// Nieuw VAPID-sleutelpaar: publiek als 65 bytes (base64url), privé als JWK
export async function maakVapidSleutels() {
  const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publiek = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  const prive = await crypto.subtle.exportKey('jwk', paar.privateKey);
  return { publiek: b64url(publiek), prive: JSON.stringify(prive) };
}

// Versleutel een bericht voor één abonnement (p256dh en auth zoals de browser ze geeft)
export async function versleutel(tekst, p256dh, auth, opties = {}) {
  const uaPubliek = vanB64url(p256dh), authGeheim = vanB64url(auth);
  if (uaPubliek.length !== 65 || authGeheim.length < 16) throw new Error('Ongeldig abonnement');
  const eigen = opties.eigenSleutel || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPubliek = new Uint8Array(await crypto.subtle.exportKey('raw', eigen.publicKey));
  const uaSleutel = await crypto.subtle.importKey('raw', uaPubliek, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const gedeeld = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaSleutel }, eigen.privateKey, 256));
  const ikm = await hkdf(authGeheim, gedeeld, samen(te.encode('WebPush: info\0'), uaPubliek, asPubliek), 32);
  const zout = opties.zout || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(zout, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(zout, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const inhoud = samen(te.encode(tekst), new Uint8Array([2])); // 2 = laatste (en enige) record
  const geheim = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, inhoud));
  const kop = new Uint8Array(21);
  kop.set(zout, 0);
  new DataView(kop.buffer).setUint32(16, 4096);
  kop[20] = asPubliek.length;
  return samen(kop, asPubliek, geheim);
}

// VAPID-handtekening (JWT met ES256) voor de server van de browser
export async function vapidKop(endpoint, vapid, contact, nu = Date.now()) {
  const aud = new URL(endpoint).origin;
  const sleutel = await crypto.subtle.importKey('jwk', JSON.parse(vapid.prive), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const kop = b64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(te.encode(JSON.stringify({ aud, exp: Math.floor(nu / 1000) + 12 * 3600, sub: contact })));
  const handtekening = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sleutel, te.encode(kop + '.' + claims)));
  return 'vapid t=' + kop + '.' + claims + '.' + b64url(handtekening) + ', k=' + vapid.publiek;
}

// Verstuur één melding. Geeft de HTTP-status terug (404/410 = abonnement bestaat niet meer).
export async function verstuurPush(abonnement, bericht, vapid, contact) {
  const body = await versleutel(JSON.stringify(bericht), abonnement.p256dh, abonnement.auth);
  const r = await fetch(abonnement.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': await vapidKop(abonnement.endpoint, vapid, contact),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '1800',
      'Urgency': 'high'
    },
    body
  });
  return r.status;
}
