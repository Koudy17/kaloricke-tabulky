// Vrátí veřejné Strava Client ID (z Vercel env). Secret NIKDY neposílá.
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ clientId: process.env.STRAVA_CLIENT_ID || null });
};
