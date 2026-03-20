const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

// Helper: crear evento en Google Calendar
async function createGoogleCalendarEvent(supabaseClient, userId, event) {
  try {
    const { google } = require('googleapis');

    console.log('[GCal] Buscando tokens para user_id:', userId);
    const { data: tokens, error: tokErr } = await supabaseClient
      .from('google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (tokErr) {
      console.log('[GCal] Error buscando tokens:', tokErr.message);
      return null;
    }
    if (!tokens || !tokens.refresh_token) {
      console.log('[GCal] No hay tokens o refresh_token para user:', userId);
      return null;
    }

    console.log('[GCal] Tokens encontrados para:', tokens.email);

    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    // Formatear hora: Supabase devuelve HH:MM:SS, necesitamos HH:MM:SS
    const hora = event.hora ? event.hora.slice(0, 8) : '09:00:00';
    const startDateTime = `${event.fecha}T${hora}`;

    // Calcular fin: 1 hora después, mismo formato
    const [h, m, s] = hora.split(':').map(Number);
    const endHora = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}`;
    const endDateTime = `${event.fecha}T${endHora}`;

    console.log('[GCal] Creando evento:', event.titulo, 'start:', startDateTime, 'end:', endDateTime);

    const gcEvent = await calendar.events.insert({
      calendarId: 'primary',
      resource: {
        summary: event.titulo,
        description: event.descripcion || '',
        start: { dateTime: startDateTime, timeZone: 'Europe/Madrid' },
        end: { dateTime: endDateTime, timeZone: 'Europe/Madrid' }
      }
    });

    console.log('[GCal] Evento creado OK, id:', gcEvent.data.id);

    // Actualizar access_token si se refrescó
    const newCreds = oauth2.credentials;
    if (newCreds.access_token !== tokens.access_token) {
      console.log('[GCal] Access token refrescado, guardando nuevo token');
      await supabaseClient.from('google_tokens')
        .update({ access_token: newCreds.access_token })
        .eq('user_id', userId);
    }

    return gcEvent.data.id;
  } catch (err) {
    console.error('[GCal] ERROR:', err.message);
    if (err.response) console.error('[GCal] Response:', JSON.stringify(err.response.data));
    return null;
  }
}

// Helper: buscar user_id por responsable (agus/santi)
// Busca primero en auth.users por email, luego verifica que tenga google_tokens
async function getUserIdByResponsable(supabaseClient, responsable) {
  try {
    // Intentar por email de Supabase Auth
    const emailMap = { agus: 'agus@vocai.es', santi: 'santi@vocai.es' };
    const email = emailMap[responsable];

    if (email) {
      // Buscar usuario por email en auth.users (service role puede hacerlo)
      const { data: { users } } = await supabaseClient.auth.admin.listUsers();
      const authUser = users.find(u => u.email === email);
      if (authUser) {
        console.log('[GCal] Usuario encontrado por auth email:', email, '→', authUser.id);
        return authUser.id;
      }
    }

    // Fallback: buscar en google_tokens por email parcial
    const { data: allTokens } = await supabaseClient.from('google_tokens').select('user_id, email');
    if (allTokens) {
      const match = allTokens.find(t => t.email && t.email.toLowerCase().includes(responsable));
      if (match) {
        console.log('[GCal] Usuario encontrado por google_tokens email:', match.email, '→', match.user_id);
        return match.user_id;
      }
    }

    console.log('[GCal] No se encontró user_id para responsable:', responsable);
    return null;
  } catch (err) {
    console.error('[GCal] Error buscando responsable:', err.message);
    return null;
  }
}

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('business_events')
    .select('*')
    .order('fecha')
    .order('hora');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const body = { ...req.body, created_by: req.user.id };
  const { data, error } = await supabase.from('business_events').insert([body]).select().single();
  if (error) return res.status(400).json({ error: error.message });

  // Crear en Google Calendar según asignado_a
  const asignado = data.asignado_a || 'ambos';
  console.log('[GCal] Nuevo evento:', data.titulo, '| asignado_a:', asignado);

  if (asignado === 'ambos') {
    // Para "ambos": intentar con el usuario actual primero, luego buscar el otro
    const gcId1 = await createGoogleCalendarEvent(supabase, req.user.id, data);

    // Buscar el otro usuario
    const { data: allTokens } = await supabase.from('google_tokens').select('user_id').neq('user_id', req.user.id);
    if (allTokens && allTokens.length > 0) {
      await createGoogleCalendarEvent(supabase, allTokens[0].user_id, data);
    }

    if (gcId1) {
      await supabase.from('business_events').update({ google_event_id: gcId1 }).eq('id', data.id);
    }
  } else {
    // Para agus/santi específico
    let targetUserId = await getUserIdByResponsable(supabase, asignado);

    // Si no lo encontramos por nombre pero el usuario actual es el asignado, usar su id
    if (!targetUserId) {
      console.log('[GCal] Fallback: usando user_id del creador:', req.user.id);
      targetUserId = req.user.id;
    }

    const gcId = await createGoogleCalendarEvent(supabase, targetUserId, data);
    if (gcId) {
      await supabase.from('business_events').update({ google_event_id: gcId }).eq('id', data.id);
    }
  }

  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('business_events')
    .update(req.body)
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('business_events')
    .delete()
    .eq('id', req.params.id)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;
