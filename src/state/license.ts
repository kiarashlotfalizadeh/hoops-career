// The full game's licence: a short signed note that a Stripe checkout paid for it. The server
// (worker/api.ts) signs it with an ECDSA P-256 key; the game checks it with the public half, offline,
// so an unlocked game never needs the network again. Shared by both sides (no DOM, no Node).

export interface LicenseBody {
  v: 1;
  /** The Stripe Checkout Session that paid: the server re-checks it now and then (a refund takes it back). */
  sid: string;
  /** When it was issued (ms). */
  at: number;
}

const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIG = { name: 'ECDSA', hash: 'SHA-256' };
const enc = new TextEncoder();

export function toB64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A licence for `body`, signed with the private key (a JWK). */
export async function signLicense(body: LicenseBody, privateJwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', privateJwk, ALG, false, ['sign']);
  const head = toB64u(enc.encode(JSON.stringify(body)));
  const sig = new Uint8Array(await crypto.subtle.sign(SIG, key, enc.encode(head)));
  return `${head}.${toB64u(sig)}`;
}

/** What a licence says, if the public key (raw P-256 point, base64url) signed it; null for anything else. */
export async function readLicense(token: unknown, publicKey: string): Promise<LicenseBody | null> {
  if (typeof token !== 'string' || !publicKey || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const key = await crypto.subtle.importKey('raw', fromB64u(publicKey), ALG, false, ['verify']);
    if (!(await crypto.subtle.verify(SIG, key, fromB64u(parts[1]), enc.encode(parts[0])))) return null;
    const body = JSON.parse(new TextDecoder().decode(fromB64u(parts[0]))) as Partial<LicenseBody> | null;
    return body?.v === 1 && typeof body.sid === 'string' && typeof body.at === 'number' ? (body as LicenseBody) : null;
  } catch {
    return null;
  }
}
