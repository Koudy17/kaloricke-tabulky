// Obnoví access token přes refresh token a stáhne spálené kalorie z aktivit.
// Vrací { refresh_token (může se změnit), byDay: { 'YYYY-MM-DD': kcal } }.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const refresh = String((req.query && req.query.refresh) || '');
  const after = parseInt((req.query && req.query.after) || '0', 10) || 0;
  if (!refresh) { res.status(400).json({ error: 'chybí refresh' }); return; }
  const id = process.env.STRAVA_CLIENT_ID, secret = process.env.STRAVA_CLIENT_SECRET;
  if (!id || !secret) { res.status(500).json({ error: 'server není nastaven' }); return; }
  try {
    // 1) refresh → access token
    const tr = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: 'refresh_token', refresh_token: refresh }),
    });
    const t = await tr.json();
    if (!t.access_token) { res.status(401).json({ error: 'obnova tokenu selhala' }); return; }
    const auth = { Authorization: 'Bearer ' + t.access_token };

    // 2) seznam aktivit od data `after`
    const lr = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`, { headers: auth });
    const list = await lr.json();
    if (!Array.isArray(list)) { res.status(502).json({ error: 'nešel načíst seznam aktivit' }); return; }

    // 3) kalorie jsou jen v detailu aktivity → dotáhneme (max 30, ať nešaháme limity)
    const byDay = {};
    for (const a of list.slice(0, 30)) {
      const day = String(a.start_date_local || a.start_date || '').slice(0, 10);
      if (!day) continue;
      let cal = 0;
      try {
        const dr = await fetch(`https://www.strava.com/api/v3/activities/${a.id}`, { headers: auth });
        const det = await dr.json();
        cal = Number(det.calories) || 0;
      } catch { /* přeskoč aktivitu, kterou nelze načíst */ }
      byDay[day] = (byDay[day] || 0) + Math.round(cal);
    }

    res.status(200).json({ refresh_token: t.refresh_token || refresh, byDay });
  } catch (e) {
    res.status(502).json({ error: 'chyba synchronizace' });
  }
};
