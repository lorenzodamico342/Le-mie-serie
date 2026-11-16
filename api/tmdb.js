// Funzione serverless su Vercel: fa da ponte verso TMDB senza esporre la chiave.
// La chiave va in Vercel > Settings > Environment Variables con il nome TMDB_TOKEN
// (il "API Read Access Token" di TMDB, quello lungo).
//
// Chiamate ammesse dall'app:
//   /api/tmdb?op=search&q=stranger things
//   /api/tmdb?op=details&id=66732

const BASE = 'https://api.themoviedb.org/3';

module.exports = async (req, res) => {
  const token = process.env.TMDB_TOKEN;
  if (!token) return res.status(500).json({ error: 'TMDB_TOKEN mancante nelle variabili di Vercel' });

  const { op, q, id } = req.query || {};
  const headers = { Authorization: `Bearer ${token}`, accept: 'application/json' };
  const get = async (path) => {
    const r = await fetch(`${BASE}${path}`, { headers });
    if (!r.ok) throw new Error(`TMDB ${r.status}`);
    return r.json();
  };

  try {
    if (op === 'search') {
      const query = String(q || '').trim().slice(0, 100);
      if (!query) return res.status(400).json({ error: 'query vuota' });
      const data = await get(`/search/tv?language=it-IT&include_adult=false&query=${encodeURIComponent(query)}`);
      const results = (data.results || []).slice(0, 8).map((s) => ({
        id: s.id,
        title: s.name,
        original: s.original_name,
        year: (s.first_air_date || '').slice(0, 4),
        poster: s.poster_path,
      }));
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).json({ results });
    }

    if (op === 'details') {
      const tvId = parseInt(id, 10);
      if (!tvId) return res.status(400).json({ error: 'id non valido' });
      const [d, prov] = await Promise.all([
        get(`/tv/${tvId}?language=it-IT`),
        get(`/tv/${tvId}/watch/providers`).catch(() => ({})),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      // Solo stagioni regolari (niente "Speciali") già iniziate.
      const seasons = (d.seasons || [])
        .filter((s) => s.season_number > 0 && s.episode_count > 0 && (!s.air_date || s.air_date <= today))
        .sort((a, b) => a.season_number - b.season_number)
        .map((s) => s.episode_count);
      const it = prov?.results?.IT || {};
      const platform = (it.flatrate || it.free || it.ads || [])[0]?.provider_name || '';
      res.setHeader('Cache-Control', 's-maxage=86400');
      return res.status(200).json({
        id: d.id,
        title: d.name,
        original: d.original_name,
        year: (d.first_air_date || '').slice(0, 4),
        genre: (d.genres || []).slice(0, 2).map((g) => g.name).join(', '),
        plot: (d.overview || '').slice(0, 400),
        poster: d.poster_path,
        ongoing: !['Ended', 'Canceled'].includes(d.status),
        platform,
        seasons,
      });
    }

    return res.status(400).json({ error: 'op non valida' });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
};
