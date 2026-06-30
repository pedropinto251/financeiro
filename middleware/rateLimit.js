// Rate limiter em memória (sem dependências). Suficiente para um único processo
// Node no cPanel; protege o login de brute-force.
const buckets = new Map();

// Limpeza periódica para não crescer indefinidamente.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 10 * 60 * 1000).unref?.();

function rateLimit({ windowMs = 15 * 60 * 1000, max = 12, prefix = '' } = {}) {
  return (req, res, next) => {
    const k = prefix + (req.ip || req.headers['x-forwarded-for'] || 'unknown');
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; buckets.set(k, b); }
    b.count += 1;
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.reset - now) / 1000));
      return res.status(429).json({ error: 'rate_limited' });
    }
    return next();
  };
}

module.exports = { rateLimit };
