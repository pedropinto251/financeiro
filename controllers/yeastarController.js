const fs = require('fs');
const path = require('path');
const { createCallReport } = require('../models/yeastarCallReportModel');

function getRequestIp(req) {
  const forwarded = (req.headers['x-forwarded-for'] || '').toString();
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || '';
}

function normalizePayload(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return { payload: req.body, source: 'body' };
  }
  if (req.query && Object.keys(req.query).length > 0) {
    return { payload: req.query, source: 'query' };
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return { payload: req.body, source: 'body_text' };
  }
  return { payload: null, source: 'empty' };
}

function writeFallbackFile(report) {
  const dateTag = new Date().toISOString().slice(0, 10);
  const dir = path.join(__dirname, '..', 'private_uploads', 'yeastar', 'call-reports', dateTag);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, JSON.stringify(report, null, 2));
  return fullPath;
}

async function handleYeastarCallReport(req, res) {
  const { payload, source } = normalizePayload(req);
  const headers = req.headers || {};
  const sourceIp = getRequestIp(req);
  const receivedAt = new Date();

  const report = {
    payload,
    payload_source: source,
    headers,
    source_ip: sourceIp,
    received_at: receivedAt.toISOString(),
  };

  try {
    await createCallReport({
      sourceIp,
      payload,
      headers,
      receivedAt,
    });
    return res.json({ ok: true, stored: 'db' });
  } catch (err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'ER_NO_SUCH_TABLE') {
      writeFallbackFile(report);
      return res.json({ ok: true, stored: 'file' });
    }
    return res.status(500).json({ ok: false, error: 'server' });
  }
}

module.exports = {
  handleYeastarCallReport,
};
