// Vercel serverless funkce – spolehlivá proxy na vyhledávání OpenFoodFacts.
// Volá Search-a-licious ze serveru (žádné CORS omezení) a přidá CORS hlavičku,
// aby to appka mohla volat z prohlížeče. Endpoint: /api/search?q=<dotaz>
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const q = String((req.query && req.query.q) || '').trim();
  if (!q) { res.status(400).json({ hits: [], error: 'chybí q' }); return; }

  const url = 'https://search.openfoodfacts.org/search?' + new URLSearchParams({
    q,
    page_size: '25',
    fields: 'code,product_name,product_name_cs,generic_name,brands,nutriments,countries_tags',
  });

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'KalorickeTabulky/1.0 (koktejl.toms@seznam.cz)' },
    });
    if (!r.ok) { res.status(502).json({ hits: [], error: 'OFF HTTP ' + r.status }); return; }
    const data = await r.json();
    // Výsledky se moc nemění → necháme je hodinu v CDN cache Vercelu (rychlé + šetrné k OFF).
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ hits: data.hits || [], count: data.count || 0 });
  } catch (e) {
    res.status(502).json({ hits: [], error: 'search selhal' });
  }
};
