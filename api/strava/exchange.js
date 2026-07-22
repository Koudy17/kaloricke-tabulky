// Výměna autorizačního kódu za tokeny (potřebuje client_secret → jen na serveru).
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const code = String((req.query && req.query.code) || '');
  if (!code) { res.status(400).json({ error: 'chybí code' }); return; }
  const id = process.env.STRAVA_CLIENT_ID, secret = process.env.STRAVA_CLIENT_SECRET;
  if (!id || !secret) { res.status(500).json({ error: 'server není nastaven' }); return; }
  try {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, client_secret: secret, code, grant_type: 'authorization_code' }),
    });
    const d = await r.json();
    if (!d.refresh_token) { res.status(400).json({ error: 'výměna selhala' }); return; }
    const a = d.athlete || {};
    res.status(200).json({
      refresh_token: d.refresh_token,
      athlete: `${a.firstname || ''} ${a.lastname || ''}`.trim(),
    });
  } catch (e) {
    res.status(502).json({ error: 'chyba při výměně' });
  }
};
