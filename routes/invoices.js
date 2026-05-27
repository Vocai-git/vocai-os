const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { logActivity } = require('./activity');

router.get('/', auth, async (req, res) => {
  const { estado, cliente_id } = req.query;
  let query = supabase.from('invoices').select('*, clients(nombre)').order('fecha', { ascending: false });
  if (estado) query = query.eq('estado', estado);
  if (cliente_id) query = query.eq('cliente_id', cliente_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', auth, async (req, res) => {
  const { data, error } = await supabase.from('invoices').select('*, clients(*)').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Factura no encontrada' });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const body = req.body;
  // IVA / IRPF llegan del front (0 si la factura no los lleva).
  // Si vienen vacíos, se asume 0 (factura bruta).
  const base = parseFloat(body.importe) || 0;
  body.iva  = body.iva  != null ? parseFloat(body.iva)  : 0;
  body.irpf = body.irpf != null ? parseFloat(body.irpf) : 0;
  body.total = body.total != null ? parseFloat(body.total) : parseFloat((base + body.iva - body.irpf).toFixed(2));
  body.numero = await getNextInvoiceNumber();

  const { data, error } = await supabase.from('invoices').insert([body]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'crear', 'facturas', `Factura creada: ${data.numero}`);
  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const body = req.body;
  if (body.importe != null) {
    const base = parseFloat(body.importe) || 0;
    body.iva  = body.iva  != null ? parseFloat(body.iva)  : 0;
    body.irpf = body.irpf != null ? parseFloat(body.irpf) : 0;
    body.total = body.total != null ? parseFloat(body.total) : parseFloat((base + body.iva - body.irpf).toFixed(2));
  }
  const { data, error } = await supabase.from('invoices').update(body).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await logActivity(req.user.email, 'editar', 'facturas', `Factura actualizada: ${data.numero}`);
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

async function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true });
  const num = String((count || 0) + 1).padStart(3, '0');
  return `VOCAI-${year}-${num}`;
}

module.exports = router;
