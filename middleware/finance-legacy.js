// Keep old URLs available for reference but prevent two independent ledgers.
module.exports = function financeLegacy(req, res, next) {
  // Hiding the V2 feature must not silently reopen an already closed ledger.
  if (process.env.FINANCE_V2_LIVE === 'true' && !['GET', 'HEAD'].includes(req.method)) {
    return res.status(409).json({ error: 'El histórico está cerrado. Registra este movimiento en Finanzas V2 → Añadir.' });
  }
  next();
};
