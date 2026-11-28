// Makes the licence signing key pair (ECDSA P-256). The Worker signs with the private half; the
// game checks with the public half, built into it.
//
//   npm run license:keys            local testing: the private key into .dev.vars (wrangler dev),
//                                   the public key into .env.webtest.local (npm run build:webtest)
//   npm run license:keys -- --live  clipboardgm.com: the public key into .env.web (commit it), the
//                                   private key straight into the Worker's secrets (never on disk)
//
// A new live pair voids every licence already sold (the game can't check them any more), so --live
// refuses to replace a key that's already there unless --force is given too.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const live = process.argv.includes('--live');
const force = process.argv.includes('--force');

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
const publicRaw = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');

/** Set `name=value` in an env file, keeping its other lines. */
function setVar(file, name, value) {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  const at = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (at >= 0) lines[at] = `${name}=${value}`;
  else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, `${name}=${value}`);
  writeFileSync(file, lines.join('\n').replace(/\n*$/, '\n'));
}

if (!live) {
  // (JSON in single quotes: .dev.vars reads like a .env file)
  setVar('.dev.vars', 'LICENSE_PRIVATE_KEY', `'${privateJwk}'`);
  setVar('.env.webtest.local', 'VITE_LICENSE_PUBLIC_KEY', publicRaw);
  console.log('Test key pair written to .dev.vars and .env.webtest.local (both git-ignored).');
  process.exit(0);
}

const current = existsSync('.env.web') ? /^VITE_LICENSE_PUBLIC_KEY=(.+)$/m.exec(readFileSync('.env.web', 'utf8'))?.[1]?.trim() : '';
if (current && !force) {
  console.error('.env.web already has a live public key. A new pair voids every licence sold with the old one.');
  console.error('Run again with --live --force only if that is what you want.');
  process.exit(1);
}
const put = spawnSync('npx', ['wrangler', 'secret', 'put', 'LICENSE_PRIVATE_KEY'], { input: privateJwk, stdio: ['pipe', 'inherit', 'inherit'] });
if (put.status !== 0) {
  console.error('wrangler secret put failed: nothing was changed. Run `npx wrangler login` first?');
  process.exit(1);
}
setVar('.env.web', 'VITE_LICENSE_PUBLIC_KEY', publicRaw);
console.log('Private key stored as the Worker secret LICENSE_PRIVATE_KEY. Public key written to .env.web: commit it, then npm run deploy:web.');
