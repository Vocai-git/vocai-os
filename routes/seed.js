const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

// POST /api/seed — insertar datos de ejemplo
router.post('/', auth, async (req, res) => {
  try {
    // Limpiar datos de ejemplo previos para evitar duplicados
    const cleanTables = ['tasks', 'projects', 'invoices', 'expenses', 'studio_bookings', 'contacts', 'notes', 'episodes', 'goals', 'clients'];
    for (const table of cleanTables) {
      const { error } = await supabase.from(table).delete().eq('es_ejemplo', true);
      if (error && !error.message.includes('does not exist')) throw error;
    }

    const today = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];
    const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };
    const subDays = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };
    const mesActual = fmt(today).slice(0, 7);

    // ── CLIENTS ───────────────────────────────────────────────
    const { data: clients, error: cErr } = await supabase.from('clients').insert([
      {
        nombre: 'El Rincón Digital',
        email: 'hola@elrincondigital.es',
        telefono: '+34 612 345 678',
        empresa: 'El Rincón Digital SL',
        tipo_servicio: 'estudio',
        pack: 'graba',
        estado: 'activo',
        mrr: 349,
        responsable: 'agus',
        ultimo_contacto: subDays(3),
        cumpleanos: '1990-06-15',
        notas: 'Podcast semanal. Muy puntual con los pagos.',
        es_ejemplo: true
      },
      {
        nombre: 'García Inmobiliaria',
        email: 'contacto@garciainmobiliaria.es',
        telefono: '+34 965 123 456',
        empresa: 'García Inmobiliaria SA',
        tipo_servicio: 'marketing',
        pack: 'crea',
        estado: 'activo',
        mrr: 850,
        responsable: 'santi',
        ultimo_contacto: subDays(7),
        notas: 'Gestión redes sociales y campañas. Renovación en junio.',
        es_ejemplo: true
      },
      {
        nombre: 'TechStartup SL',
        email: 'carlos@techstartup.io',
        telefono: '+34 611 987 654',
        empresa: 'TechStartup SL',
        tipo_servicio: 'ia',
        pack: 'domina',
        estado: 'activo',
        mrr: 1400,
        responsable: 'agus',
        ultimo_contacto: subDays(1),
        notas: 'Proyecto de automatización de ventas con IA. Alto potencial.',
        es_ejemplo: true
      },
      {
        nombre: 'Restaurante Mar Azul',
        email: 'info@marazul.es',
        telefono: '+34 965 456 789',
        empresa: 'Mar Azul Hostelería SL',
        tipo_servicio: 'estudio',
        estado: 'prospecto',
        responsable: 'santi',
        ultimo_contacto: subDays(5),
        notas: 'Interesados en reels y contenido para Instagram.',
        es_ejemplo: true
      },
      {
        nombre: 'Clínica Wellness Alicante',
        email: 'admin@wellnessalicante.es',
        telefono: '+34 965 789 012',
        empresa: 'Clínica Wellness Alicante SL',
        tipo_servicio: 'full',
        pack: 'domina',
        estado: 'activo',
        mrr: 2250,
        responsable: 'agus',
        ultimo_contacto: subDays(2),
        cumpleanos: '1985-03-22',
        notas: 'Cliente premium. Servicio completo: estudio + marketing + IA.',
        es_ejemplo: true
      }
    ]).select();

    if (cErr) throw new Error('Error clientes: ' + cErr.message);

    const getClient = (nombre) => clients.find(c => c.nombre === nombre)?.id;

    // ── PROJECTS ──────────────────────────────────────────────
    const { data: projects, error: pErr } = await supabase.from('projects').insert([
      {
        nombre: 'Web corporativa TechStartup',
        cliente_id: getClient('TechStartup SL'),
        estado: 'desarrollo',
        progreso: 65,
        responsable: 'agus',
        descripcion: 'Desarrollo de web corporativa con panel admin e integración de agentes IA.',
        fecha_entrega: addDays(14),
        es_ejemplo: true
      },
      {
        nombre: 'Podcast García Inmobiliaria',
        cliente_id: getClient('García Inmobiliaria'),
        estado: 'produccion',
        progreso: 80,
        responsable: 'santi',
        descripcion: 'Producción mensual de podcast sobre el mercado inmobiliario en Alicante.',
        fecha_entrega: addDays(7),
        es_ejemplo: true
      },
      {
        nombre: 'Automatización de leads Clínica Wellness',
        cliente_id: getClient('Clínica Wellness Alicante'),
        estado: 'briefing',
        progreso: 10,
        responsable: 'agus',
        descripcion: 'Agente IA para captura y cualificación automática de leads desde Instagram.',
        fecha_entrega: addDays(30),
        es_ejemplo: true
      },
      {
        nombre: 'Reels y contenido Mar Azul',
        cliente_id: getClient('Restaurante Mar Azul'),
        estado: 'diseño',
        progreso: 30,
        responsable: 'santi',
        descripcion: 'Pack de 8 reels mensuales + historias para Instagram.',
        fecha_entrega: addDays(21),
        es_ejemplo: true
      }
    ]).select();

    if (pErr) throw new Error('Error proyectos: ' + pErr.message);

    const getProject = (nombre) => projects.find(p => p.nombre === nombre)?.id;

    // ── TASKS ─────────────────────────────────────────────────
    await supabase.from('tasks').insert([
      {
        titulo: 'Editar episodio #13 El Rincón Digital',
        proyecto_id: getProject('Podcast García Inmobiliaria'),
        responsable: 'agus',
        prioridad: 'urgente',
        estado: 'pendiente',
        fecha_limite: addDays(2),
        descripcion: 'Edición completa: cortes, música, intro y outro.',
        es_ejemplo: true
      },
      {
        titulo: 'Enviar propuesta a Restaurante Mar Azul',
        responsable: 'santi',
        prioridad: 'alta',
        estado: 'pendiente',
        fecha_limite: addDays(3),
        es_ejemplo: true
      },
      {
        titulo: 'Revisar mockup web TechStartup',
        proyecto_id: getProject('Web corporativa TechStartup'),
        responsable: 'agus',
        prioridad: 'normal',
        estado: 'en_curso',
        fecha_limite: addDays(5),
        es_ejemplo: true
      },
      {
        titulo: 'Configurar n8n para leads Clínica Wellness',
        proyecto_id: getProject('Automatización de leads Clínica Wellness'),
        responsable: 'agus',
        prioridad: 'alta',
        estado: 'pendiente',
        fecha_limite: addDays(10),
        es_ejemplo: true
      },
      {
        titulo: 'Crear calendario de contenido mayo - García Inmobiliaria',
        responsable: 'santi',
        prioridad: 'normal',
        estado: 'pendiente',
        fecha_limite: addDays(8),
        es_ejemplo: true
      },
      {
        titulo: 'Reunión de onboarding Clínica Wellness',
        responsable: 'santi',
        prioridad: 'urgente',
        estado: 'completada',
        fecha_limite: subDays(2),
        es_ejemplo: true
      }
    ]);

    // ── INVOICES ──────────────────────────────────────────────
    await supabase.from('invoices').insert([
      {
        numero: 'VOCAI-2026-001',
        cliente_id: getClient('Clínica Wellness Alicante'),
        concepto: 'Servicio completo mensual — Marzo 2026',
        importe: 2250,
        iva: 472.50,
        irpf: 337.50,
        total: 2385,
        estado: 'cobrada',
        fecha: subDays(20),
        es_ejemplo: true
      },
      {
        numero: 'VOCAI-2026-002',
        cliente_id: getClient('García Inmobiliaria'),
        concepto: 'Marketing digital mensual — Marzo 2026',
        importe: 850,
        iva: 178.50,
        irpf: 127.50,
        total: 901,
        estado: 'cobrada',
        fecha: subDays(18),
        es_ejemplo: true
      },
      {
        numero: 'VOCAI-2026-003',
        cliente_id: getClient('TechStartup SL'),
        concepto: 'Desarrollo web corporativa — Fase 1',
        importe: 1400,
        iva: 294,
        irpf: 210,
        total: 1484,
        estado: 'enviada',
        fecha: subDays(5),
        fecha_vencimiento: addDays(25),
        es_ejemplo: true
      },
      {
        numero: 'VOCAI-2026-004',
        cliente_id: getClient('El Rincón Digital'),
        concepto: 'Pack Graba mensual — Marzo 2026',
        importe: 349,
        iva: 73.29,
        irpf: 52.35,
        total: 369.94,
        estado: 'enviada',
        fecha: subDays(3),
        fecha_vencimiento: addDays(27),
        es_ejemplo: true
      }
    ]);

    // ── EXPENSES ──────────────────────────────────────────────
    await supabase.from('expenses').insert([
      { nombre: 'Supabase Pro', categoria: 'software', importe: 25, fecha: subDays(10), recurrente: true, es_ejemplo: true },
      { nombre: 'Adobe Creative Suite', categoria: 'software', importe: 60, fecha: subDays(10), recurrente: true, es_ejemplo: true },
      { nombre: 'Railway', categoria: 'software', importe: 10, fecha: subDays(10), recurrente: true, es_ejemplo: true },
      { nombre: 'Material de oficina', categoria: 'oficina', importe: 45, fecha: subDays(15), recurrente: false, es_ejemplo: true },
      { nombre: 'Campaña Instagram Ads', categoria: 'marketing', importe: 150, fecha: subDays(8), recurrente: false, notas: 'Test campaña awareness VOCAI', es_ejemplo: true }
    ]);

    // ── STUDIO BOOKINGS ───────────────────────────────────────
    await supabase.from('studio_bookings').insert([
      {
        cliente_id: getClient('El Rincón Digital'),
        pack: 'graba',
        sala: 'principal',
        fecha: addDays(2),
        hora: '10:00',
        precio: 349,
        estado: 'confirmada',
        notas: 'Grabación episodios 14 y 15',
        es_ejemplo: true
      },
      {
        cliente_id: getClient('Restaurante Mar Azul'),
        pack: 'basico',
        sala: 'principal',
        fecha: addDays(6),
        hora: '16:00',
        duracion_horas: 2,
        precio: 180,
        estado: 'pendiente',
        notas: 'Shooting reels menú primavera',
        es_ejemplo: true
      },
      {
        cliente_id: getClient('Clínica Wellness Alicante'),
        pack: 'crea',
        sala: 'principal',
        fecha: addDays(10),
        hora: '09:00',
        precio: 850,
        estado: 'confirmada',
        es_ejemplo: true
      }
    ]);

    // ── CONTACTS ──────────────────────────────────────────────
    await supabase.from('contacts').insert([
      { nombre: 'María González', email: 'maria@garciainmobiliaria.es', telefono: '+34 612 111 222', empresa: 'García Inmobiliaria', tipo: 'cliente', cumpleanos: '1988-09-14', notas: 'Directora de marketing. Muy detallista.', es_ejemplo: true },
      { nombre: 'Carlos López', email: 'carlos@techstartup.io', telefono: '+34 611 333 444', empresa: 'TechStartup SL', tipo: 'cliente', cumpleanos: '1992-11-30', notas: 'CEO. Apasionado de la IA.', es_ejemplo: true },
      { nombre: 'Adobe Systems', email: 'soporte@adobe.com', empresa: 'Adobe', tipo: 'proveedor', notas: 'Licencias Creative Suite', es_ejemplo: true },
      { nombre: 'Luis Fernández', email: 'luis@luisfernandez.design', telefono: '+34 610 555 666', tipo: 'colaborador', notas: 'Diseñador freelance. Colabora en proyectos de branding.', es_ejemplo: true }
    ]);

    // ── NOTES ─────────────────────────────────────────────────
    await supabase.from('notes').insert([
      {
        titulo: 'Ideas contenido mayo',
        contenido: '• Reel: "3 errores al contratar marketing digital"\n• Podcast: entrevista sector inmobiliario Alicante\n• Carrusel: proceso de producción de podcast\n• Story: día en VOCAI (behind the scenes)',
        autor: 'agus',
        color: '#1e2d3d',
        es_ejemplo: true
      },
      {
        titulo: 'Pendientes administrativos',
        contenido: '- Renovar dominio vocai.es en Namecheap (vence en agosto)\n- Configurar Google Workspace emails\n- Revisar contrato Supabase Pro',
        autor: 'santi',
        color: '#1e2d2a',
        es_ejemplo: true
      },
      {
        titulo: 'Precios 2026 actualizados',
        contenido: 'Básico: €90/hora\nPlus: €190/sesión\nGraba: €349/mes\nCrea: €850/mes\nDomina: €1.400/mes\n\n↑ Subida del 8% respecto a 2025',
        autor: 'agus',
        color: '#2d2419',
        es_ejemplo: true
      }
    ]);

    // ── EPISODES ─────────────────────────────────────────────
    await supabase.from('episodes').insert([
      { titulo: 'IA en tu negocio: por dónde empezar', numero: 12, cliente_id: getClient('El Rincón Digital'), estado: 'publicado', fecha_grabacion: subDays(20), fecha_publicacion: subDays(13), duracion: '42:18', es_ejemplo: true },
      { titulo: 'Redes sociales que sí convierten', numero: 13, cliente_id: getClient('El Rincón Digital'), estado: 'editando', fecha_grabacion: subDays(5), es_ejemplo: true },
      { titulo: 'Automatización: la ventaja competitiva de 2026', numero: 14, cliente_id: getClient('El Rincón Digital'), estado: 'pendiente', fecha_grabacion: addDays(2), es_ejemplo: true },
      { titulo: 'Cómo vender sin vender en Instagram', numero: 15, cliente_id: getClient('El Rincón Digital'), estado: 'pendiente', es_ejemplo: true }
    ]);

    // ── GOALS ─────────────────────────────────────────────────
    const { data: existingGoal } = await supabase.from('goals').select('id').eq('mes', mesActual).maybeSingle();
    if (!existingGoal) {
      await supabase.from('goals').insert([
        { mes: mesActual, objetivo: 5000, descripcion: 'Cerrar 1 cliente nuevo + mantener recurrentes', es_ejemplo: true }
      ]);
    }

    res.json({ ok: true, mensaje: 'Datos de ejemplo cargados correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/seed — eliminar datos de ejemplo
router.delete('/', auth, async (req, res) => {
  try {
    const tables = [
      'tasks', 'projects',
      'invoices', 'expenses', 'studio_bookings',
      'contacts', 'notes', 'episodes', 'goals', 'clients'
    ];

    const errors = [];
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq('es_ejemplo', true);
      if (error) {
        // Ignorar error si la columna es_ejemplo no existe en esa tabla
        if (error.message.includes('does not exist')) continue;
        errors.push(`${table}: ${error.message}`);
      }
    }

    // Limpiar project_comments sin depender de es_ejemplo
    // (se borran los comments huérfanos cuyos proyectos ya no existen)
    await supabase.from('project_comments').delete().is('project_id', null).catch(() => {});

    if (errors.length > 0) {
      return res.status(500).json({ error: errors.join(' | ') });
    }

    res.json({ ok: true, mensaje: 'Datos de ejemplo eliminados' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
