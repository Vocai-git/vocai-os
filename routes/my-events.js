const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

async function syncToGoogleCalendar(userId, event) {
  try {
    const { google } = require('googleapis');

    const { data: tokens } = await supabase
      .from('google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!tokens || !tokens.refresh_token) {
      console.log('[GCal:MyAgenda] No hay tokens para user:', userId);
      return null;
    }

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

    const hora = event.hora ? event.hora.slice(0, 8) : '09:00:00';
    const startDateTime = `${event.fecha}T${hora}`;
    const [h, m, s] = hora.split(':').map(Number);
    const endHora = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}`;
    const endDateTime = `${event.fecha}T${endHora}`;

    console.log('[GCal:MyAgenda] Creando evento:', event.titulo, startDateTime);

    const gcEvent = await calendar.events.insert({
      calendarId: 'primary',
      resource: {
        summary: event.titulo,
        description: event.descripcion || '',
        start: { dateTime: startDateTime, timeZone: 'Europe/Madrid' },
        end: { dateTime: endDateTime, timeZone: 'Europe/Madrid' }
      }
    });

    console.log('[GCal:MyAgenda] OK, id:', gcEvent.data.id);

    const newCreds = oauth2.credentials;
    if (newCreds.access_token !== tokens.access_token) {
      await supabase.from('google_tokens')
        .update({ access_token: newCreds.access_token })
        .eq('user_id', userId);
    }

    return gcEvent.data.id;
  } catch (err) {
    console.error('[GCal:MyAgenda] ERROR:', err.message);
    return null;
  }
}

router.get('/', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('my_events')
    .select('*')
    .eq('user_id', req.user.id)
    .order('fecha')
    .order('hora');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', auth, async (req, res) => {
  const body = { ...req.body, user_id: req.user.id };
  const { data, error } = await supabase.from('my_events').insert([body]).select().single();
  if (error) return res.status(400).json({ error: error.message });

  // Sincronizar con Google Calendar del usuario
  await syncToGoogleCalendar(req.user.id, data);

  res.status(201).json(data);
});

router.put('/:id', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('my_events')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', auth, async (req, res) => {
  const { data, error } = await supabase
    .from('my_events')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select();
  if (error) return res.status(400).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

module.exports = router;
