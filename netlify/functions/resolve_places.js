// netlify/functions/resolve_places.js
// Fast resolver: tries Photon (fast) for all queries first, then falls back to Nominatim (strong) only if needed.
// Optional region bias: 'il' biases Israel.
//
// NOTE: Nominatim has usage policies and rate limiting; we keep fallbacks minimal and sequential.

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

function parseLatLng(str) {
  const s = String(str || "").trim();
  const m = s.match(/^\s*(-?\d+(\.\d+)?)\s*[, ]\s*(-?\d+(\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[3]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function photonOne(q, region) {
  const ll = parseLatLng(q);
  if (ll) return { input: q, display: q, lat: ll.lat, lng: ll.lng, provider: "latlng" };

  // Photon supports lat/lon bias; use Israel center if region=il
  const bias = region === "il" ? "&lat=31.5&lon=34.8" : "";
  const url = `https://photon.komoot.io/api/?limit=1${bias}&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, { headers: { "Accept": "application/json" }});
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch(e) { data = null; }
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);

  const f = data && data.features && data.features[0];
  if (!f || !f.geometry || !Array.isArray(f.geometry.coordinates)) return null;

  const lng = parseFloat(f.geometry.coordinates[0]);
  const lat = parseFloat(f.geometry.coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const props = f.properties || {};
  const name = props.name || props.street || props.city || props.state || q;
  const labelParts = [name];
  if (props.city && props.city !== name) labelParts.push(props.city);
  if (props.country) labelParts.push(props.country);
  const display = labelParts.filter(Boolean).join(", ");

  return { input: q, display, lat, lng, provider: "photon" };
}

async function nominatimOne(q, region, userAgent) {
  const ll = parseLatLng(q);
  if (ll) return { input: q, display: q, lat: ll.lat, lng: ll.lng, provider: "latlng" };

  const countrycodes = region === "il" ? "&countrycodes=il" : "";
  // Israel bounding box (rough): left,bottom,right,top
  const viewbox = region === "il" ? "&viewbox=34.2,29.4,35.95,33.4&bounded=1" : "";
  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?format=json&limit=1&accept-language=he${countrycodes}${viewbox}&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": userAgent }
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch(e) { data = null; }

  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  if (!Array.isArray(data) || !data.length) return null;

  const r = data[0];
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { input: q, display: r.display_name || q, lat, lng, provider: "nominatim" };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try{
    const body = event.body ? JSON.parse(event.body) : {};
    const queries = Array.isArray(body.queries) ? body.queries : [];
    const region = String(body.region || "any");
    if (!queries.length) return jsonResponse(400, { error: "Missing queries[]" });
    if (queries.length > 20) return jsonResponse(400, { error: "Max 20 queries" });

    const userAgent = process.env.APP_USER_AGENT || "RoutePlannerNetlifyFree/1.0 (contact: you@example.com)";

    // 1) Photon in parallel (fast)
    const photonResults = await Promise.allSettled(
      queries.map(q => photonOne(String(q||"").trim(), region))
    );

    const resolved = new Array(queries.length).fill(null);
    const needNominatim = [];

    for (let i=0;i<queries.length;i++){
      const q = String(queries[i]||"").trim();
      const pr = photonResults[i];
      if (pr.status === "fulfilled" && pr.value){
        resolved[i] = pr.value;
      } else {
        needNominatim.push({ i, q });
      }
    }

    // 2) Nominatim fallback sequential (polite) but limit to keep fast
    const maxFallback = 8; // keep execution time reasonable
    for (let k=0; k<needNominatim.length && k<maxFallback; k++){
      const item = needNominatim[k];
      if (k > 0) await sleep(1100);
      const nr = await nominatimOne(item.q, region, userAgent);
      if (nr) resolved[item.i] = nr;
    }

    for (let i=0;i<resolved.length;i++){
      if (!resolved[i]) {
        return jsonResponse(400, {
          error: `לא הצלחתי לזהות את היעד: "${queries[i]}". נסה להוסיף עיר/אזור (למשל: תל אביב) או שם מדויק יותר.`
        });
      }
    }

    return jsonResponse(200, { resolved });
  }catch(err){
    return jsonResponse(500, { error: err && err.message ? err.message : String(err) });
  }
};
