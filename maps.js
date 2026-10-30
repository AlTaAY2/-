// api/maps.js — دالة سيرفر واحدة على Vercel تخدم: البحث، المسارات، إعدادات الخريطة
// غيّر مزوّد البحث أو المسارات من هنا فقط (Google / Mapbox / OpenRouteService ...)
// وحط المفاتيح في Vercel: Project → Settings → Environment Variables (لا تكتبها في الكود)

const UA = 'MapsApp/1.0 (غيّر هذا إلى رابط مشروعك على GitHub)'; // سياسة Nominatim تتطلب User-Agent واضح
const NUM = /^-?\d+(\.\d+)?$/;

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

module.exports = async (req, res) => {
  const { type, q, viewbox, mode, from, to } = req.query;

  try {
    // 1) إعدادات للواجهة (مثلاً رابط البلاطات مع المفتاح من متغير بيئة)
    if (type === 'config') {
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.status(200).json({ tiles: process.env.TILES_URL || null });
    }

    // 2) البحث عن الأماكن
    if (type === 'search') {
      if (!q || q.length > 200) return bad(res, 'bad query');
      let u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=ar&q=' + encodeURIComponent(q);
      if (viewbox) {
        const v = viewbox.split(',');
        if (v.length !== 4 || !v.every(n => NUM.test(n))) return bad(res, 'bad viewbox');
        u += '&bounded=1&viewbox=' + v.join(',');
      }
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!r.ok) return bad(res, 'upstream', 502);
      const data = await r.json();
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(data.map(x => ({
        name: x.name || x.display_name.split(',')[0],
        addr: x.display_name,
        lat: +x.lat,
        lon: +x.lon
      })));
    }

    // 3) المسار
    if (type === 'route') {
      if (!['car', 'bike', 'foot'].includes(mode)) return bad(res, 'bad mode');
      const a = (from || '').split(','), b = (to || '').split(',');
      if (a.length !== 2 || b.length !== 2 || ![...a, ...b].every(n => NUM.test(n))) return bad(res, 'bad coords');
      const u = `https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!r.ok) return bad(res, 'upstream', 502);
      const j = await r.json();
      if (!j.routes || !j.routes[0]) return bad(res, 'no route', 404);
      const x = j.routes[0];
      res.setHeader('Cache-Control', 'public, s-maxage=600');
      return res.status(200).json({
        distance: x.distance,
        duration: x.duration,
        coords: x.geometry.coordinates.map(c => [c[1], c[0]])
      });
    }

    return bad(res, 'unknown type');
  } catch (e) {
    return bad(res, 'server error', 500);
  }
};
