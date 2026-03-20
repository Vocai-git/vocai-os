const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

// Helper: crear evento en Google Calendar
async function createGoogleCalendarEvent(supabaseClient, userId, event) {
  try {
    const { google } = require('googleapis');
    const { data: tokens } = await supabaseClient
      .from('google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!tokens || !tokens.refresh_token) return null;

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

    const startDateTime = event.hora
      ? `${event.fecha}T${event.hora}:00`
      : `${event.fecha}T09:00:00`;
    const endDate = new Date(startDateTime);
    endDate.setHours(endDate.getHours() + 1);

    const gcEvent = await calendar.events.insert({
      calendarId: 'primary',
      resource: {
        summary: event.titulo,
        description: event.descripcion || '',
        start: { dateTime: startDateTime, timeZone: 'Europe/Madrid' },
        end: { dateTime: endDate.toISOString(), timeZone: 'Europe/Madrid' }
      }
    });

    // Actualizar access_token si se refrescó
    const newCreds = oauth2.credentials;
    if (newCreds.access_token !== tokens.access_token) {
      await supabaseClient.from('google_tokens')
        .update({ access_token: newCreds.access_token })
        .eq('user_id', userId);
    }

    return gcEvent.data.id;
  } catch (err) {
    console.error('Google Calendar error:', err.message);
    return null;
  }
}

// Helper: buscar user_id por responsable (agus/santi)
async function getUserIdByResponsable(supabaseClient, responsable) {
  const emailMap = {
    agus: 'agus@vocai.es',
    santi: 'santi@vocai.es'
  };
  const email = emailMap[responsable];
  if (!email) return null;

  const { data } = await supabaseClient
    .from('google_tokens')
    .select('user_id')
    .eq('email', email)
    .single();
  return data?.user_id || null;
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
  if (asignado === 'ambos') {
    const agusId = await getUserIdByResponsable(supabase, 'agus');
    const santiId = await getUserIdByResponsable(supabase, 'santi');
    if (agusId) await createGoogleCalendarEvent(supabase, agusId, data);
    if (santiId) await createGoogleCalendarEvent(supabase, santiId, data);
  } else {
    const userId = await getUserIdByResponsable(supabase, asignado);
    if (userId) {
      const gcId = await createGoogleCalendarEvent(supabase, userId, data);
      if (gcId) {
        await supabase.from('business_events').update({ google_event_id: gcId }).eq('id', data.id);
      }
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
