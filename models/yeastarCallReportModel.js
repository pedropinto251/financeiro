const pool = require('../config/db');

async function createCallReport({ sourceIp, payload, headers, receivedAt }) {
  const payloadJson = payload === null || payload === undefined ? null : JSON.stringify(payload);
  const headersJson = headers ? JSON.stringify(headers) : null;
  const dateValue = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);

  await pool.execute(
    `INSERT INTO yeastar_call_reports
      (source_ip, payload_json, headers_json, received_at)
     VALUES (?, ?, ?, ?)`,
    [sourceIp || null, payloadJson, headersJson, dateValue]
  );
}

module.exports = {
  createCallReport,
};
