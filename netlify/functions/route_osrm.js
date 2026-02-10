// netlify/functions/route_osrm.js
function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(obj)
  };
}
function isPoint(p){
  return p && typeof p.lat === "number" && typeof p.lng === "number" &&
    Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
    p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
}
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  try{
    const body = event.body ? JSON.parse(event.body) : {};
    const points = Array.isArray(body.points) ? body.points : [];
    if (points.length < 2) return jsonResponse(400, { error: "Need at least 2 points" });
    if (points.length > 25) return jsonResponse(400, { error: "Max 25 points" });
    if (!points.every(isPoint)) return jsonResponse(400, { error: "Invalid points" });

    const coordStr = points.map(p => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

    const res = await fetch(url, { headers: { "Accept": "application/json" }});
    const text = await res.text();
    let data = null;
    try{ data = JSON.parse(text); }catch(e){ data = null; }
    if(!res.ok) return jsonResponse(500, { error: `OSRM route HTTP ${res.status}` });
    if(!data || !data.routes || !data.routes.length) return jsonResponse(500, { error: "OSRM route missing routes" });

    const r = data.routes[0];
    return jsonResponse(200, { distance_m: r.distance || 0, duration_s: r.duration || 0, geometry: r.geometry || null });
  }catch(err){
    return jsonResponse(500, { error: err && err.message ? err.message : String(err) });
  }
};
