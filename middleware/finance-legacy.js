// Keep old URLs available for reference but prevent two independent ledgers.
module.exports = function financeLegacy(req, res, next) {
  if (process.env.FINANCE_V2 === 'true' && !['GET', 'HEAD'].includes(req.method)) {
    return res.status(409).json({ error: 'El histórico está cerrado. Registra este movimiento en Finanzas → Añadir.' });
  }
  next();
};
