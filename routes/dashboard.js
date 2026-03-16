const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

router.get('/', auth, async (req, res) => {
  try {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const [clients, projects, invoices, tasks, bookings] = await Promise.all([
      supabase.from('clients').select('id, mrr, estado'),
      supabase.from('projects').select('id, estado'),
      supabase.from('invoices').select('id, importe, estado, fecha').gte('fecha', firstDay).lte('fecha', lastDay),
      supabase.from('tasks').select('id, titulo, responsable, prioridad, estado, fecha_limite').eq('estado', 'pendiente').order('fecha_limite'),
      supabase.from('studio_bookings').select('id, cliente_id, pack, fecha, hora, estado, clients(nombre)').eq('fecha', now.toISOString().split('T')[0])
    ]);

    const activeClients = (clients.data || []).filter(c => c.estado === 'activo');
    const mrr = activeClients.reduce((sum, c) => sum + (c.mrr || 0), 0);
    const pendingInvoices = (invoices.data || []).filter(i => i.estado === 'enviada' || i.estado === 'vencida');
    const pendingAmount = pendingInvoices.reduce((sum, i) => sum + (i.importe || 0), 0);
    const monthlyRevenue = (invoices.data || []).filter(i => i.estado === 'cobrada').reduce((sum, i) => sum + (i.importe || 0), 0);
    const activeProjects = (projects.data || []).filter(p => p.estado !== 'completado').length;

    res.json({
      kpis: {
        mrr,
        activeClients: activeClients.length,
        pendingInvoices: pendingInvoices.length,
        pendingAmount,
        monthlyRevenue,
        activeProjects
      },
      tasks: tasks.data || [],
      todayBookings: bookings.data || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
