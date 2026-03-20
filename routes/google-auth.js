const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { supabase } = require('../config/supabase');

function getOAuth2Client() {
  const { google } = require('googleapis');
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// GET /api/google/status — check if user has Google connected
router.get('/status', auth, async (req, res) => {
  const { data } = await supabase
    .from('google_tokens')
    .select('email')
    .eq('user_id', req.user.id)
    .single();
  res.json({ connected: !!data?.email, email: data?.email || null });
});

// GET /api/google/connect — redirect to Google OAuth
router.get('/connect', auth, async (req, res) => {
  const oauth2 = getOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/userinfo.email'],
    state: req.user.id
  });
  res.json({ url });
});

// GET /auth/google/callback — handle Google OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send('Faltan parámetros');

  try {
    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    // Get user email
    const { google } = require('googleapis');
    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const { data: profile } = await oauth2Api.userinfo.get();

    // Upsert tokens
    const { error } = await supabase
      .from('google_tokens')
      .upsert({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        email: profile.email
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('Error saving Google tokens:', error.message);
      return res.redirect('/app#settings?google=error');
    }

    res.redirect('/app#settings?google=ok');
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect('/app#settings?google=error');
  }
});

// DELETE /api/google/disconnect — remove Google connection
router.delete('/disconnect', auth, async (req, res) => {
  await supabase.from('google_tokens').delete().eq('user_id', req.user.id);
  res.json({ ok: true });
});

module.exports = router;
