// Local FTP(S) deploy to cPanel — mirrors the GitHub Action, but runs locally.
// Credentials come ONLY from env vars (never hardcoded / committed):
//   FTP_SERVER  FTP_USERNAME  FTP_PASSWORD  FTP_SERVER_DIR
// Usage (git-bash):
//   FTP_SERVER=... FTP_USERNAME=... FTP_PASSWORD=... FTP_SERVER_DIR=... node scripts/deploy-ftp.js
const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');

const ROOT = path.join(__dirname, '..');
const { FTP_SERVER, FTP_USERNAME, FTP_PASSWORD } = process.env;
const REMOTE_BASE = (process.env.FTP_SERVER_DIR || '').replace(/\/+$/, '');

if (!FTP_SERVER || !FTP_USERNAME || !FTP_PASSWORD || !REMOTE_BASE) {
  console.error('Faltam env vars: FTP_SERVER, FTP_USERNAME, FTP_PASSWORD, FTP_SERVER_DIR');
  process.exit(1);
}

// Things we never upload (runtime doesn't need them / secrets / heavy dirs).
const SKIP_SEG = new Set(['node_modules', '.git']);
const SKIP_TOP = new Set(['.github', '.env', '.DS_Store', 'mobile', 'frontend', '.ftp-deploy-sync-state.json']);

// Collect files grouped by their (posix) relative directory.
function collect(dir, rel = '') {
  const groups = {};
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_SEG.has(name)) continue;
    if (rel === '' && SKIP_TOP.has(name)) continue;
    const abs = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      Object.assign(groups, collect(abs, relPath));
    } else {
      (groups[rel] = groups[rel] || []).push({ abs, name });
    }
  }
  return groups;
}

(async () => {
  const groups = collect(ROOT);
  const dirs = Object.keys(groups).sort();
  const totalFiles = dirs.reduce((n, d) => n + groups[d].length, 0);
  console.log(`A enviar ${totalFiles} ficheiros em ${dirs.length} pastas para ${FTP_SERVER}:${REMOTE_BASE}`);

  const client = new ftp.Client(30000);
  client.ftp.verbose = false;
  let sent = 0;
  try {
    // cPanel: explicit FTPS over 21 (self-signed cert tolerated).
    await client.access({
      host: FTP_SERVER, user: FTP_USERNAME, password: FTP_PASSWORD,
      port: 21, secure: true, secureOptions: { rejectUnauthorized: false },
    });
    const home = await client.pwd();
    for (const rel of dirs) {
      const remoteDir = rel ? `${REMOTE_BASE}/${rel}` : REMOTE_BASE;
      await client.cd(home);
      await client.ensureDir(remoteDir); // also cd's into it
      for (const f of groups[rel]) {
        await client.uploadFrom(f.abs, f.name);
        sent++;
        if (sent % 20 === 0 || sent === totalFiles) console.log(`  ${sent}/${totalFiles}`);
      }
    }
    console.log(`✓ Deploy concluído (${sent} ficheiros).`);
  } catch (err) {
    console.error('✗ Deploy falhou:', err.message);
    process.exitCode = 1;
  } finally {
    client.close();
  }
})();
