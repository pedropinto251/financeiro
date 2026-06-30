const crypto = require('crypto');
const model = require('../models/financePushModel');

// web-push é carregado lazy: se ainda não estiver instalado no servidor
// (npm install por correr), a app continua a funcionar e o push fica "indisponível".
let webpush = null;
let available = null; // null=desconhecido, true/false depois de tentar
function getWebpush() {
  if (available === false) return null;
  if (webpush) return webpush;
  try { webpush = require('web-push'); available = true; return webpush; }
  catch (e) { available = false; return null; }
}

const SUBJECT = process.env.PUSH_SUBJECT || 'mailto:pedro.pinto@pocaconsulting.pt';

let vapidCache = null;
async function getVapid() {
  if (vapidCache) return vapidCache;
  const wp = getWebpush();
  if (!wp) return null;
  let pub = await model.getConfig('vapid_public');
  let priv = await model.getConfig('vapid_private');
  if (!pub || !priv) {
    const keys = wp.generateVAPIDKeys();
    pub = keys.publicKey; priv = keys.privateKey;
    await model.setConfig('vapid_public', pub);
    await model.setConfig('vapid_private', priv);
  }
  vapidCache = { publicKey: pub, privateKey: priv };
  return vapidCache;
}

async function getPublicKey() {
  const v = await getVapid();
  return v ? v.publicKey : null;
}

// Token para o endpoint de cron. Prefere env (determinístico), senão DB.
async function getCronToken() {
  if (process.env.CRON_TOKEN) return process.env.CRON_TOKEN;
  let t = await model.getConfig('cron_token');
  if (!t) { t = crypto.randomBytes(24).toString('hex'); await model.setConfig('cron_token', t); }
  return t;
}

function isAvailable() { return getWebpush() !== null; }

// Envia para uma lista de subscrições; remove as mortas (404/410).
async function sendToSubs(subs, payload) {
  const wp = getWebpush();
  const v = await getVapid();
  if (!wp || !v) return { sent: 0, available: false };
  wp.setVapidDetails(SUBJECT, v.publicKey, v.privateKey);
  let sent = 0;
  const body = JSON.stringify(payload);
  for (const s of subs) {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      sent += 1;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await model.deleteByEndpoint(s.endpoint);
    }
  }
  return { sent, available: true };
}

module.exports = { getPublicKey, getCronToken, isAvailable, sendToSubs };
