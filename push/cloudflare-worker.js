/* ============================================================
   Bitch Boy League — push relay (Cloudflare Worker)

   Why this exists: OneSignal's send API refuses browser requests, and the REST key must not
   sit in a public repo or in anyone's browser. This is the only place the key lives.

   DEPLOY
   1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker. Name it "bbl-push".
   2. Replace the starter code with this file, Deploy.
   3. Settings -> Variables and Secrets, add two SECRETS (not plaintext variables):
        ONESIGNAL_APP_ID   03751159-4b6b-4128-ab9c-3934e82fcbfe
        ONESIGNAL_API_KEY  <your REST API key from OneSignal -> Keys & IDs>
   4. Copy the worker URL (https://bbl-push.<subdomain>.workers.dev) into the league's
      Settings -> Push notifications -> Relay URL.

   The worker only ever forwards a title, body and optional recipient list. It cannot be used
   to send arbitrary payloads, and it never returns the key.
   ============================================================ */

const ALLOWED_ORIGINS = [
  'https://curtisawe-cmd.github.io',
  'http://127.0.0.1:8791',            /* local testing */
  'http://localhost:8791'
];

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST')    return new Response('POST only', { status: 405, headers });
    if (!ALLOWED_ORIGINS.includes(origin))
      return new Response(JSON.stringify({ error: 'origin not allowed' }), { status: 403, headers });

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers }); }

    const title = String(body.title || 'Bitch Boy League').slice(0, 60);
    const message = String(body.body || '').slice(0, 180);
    const uids = Array.isArray(body.uids) ? body.uids.filter(u => typeof u === 'string').slice(0, 50) : null;
    const url = String(body.url || '').slice(0, 300);
    if (!message) return new Response(JSON.stringify({ error: 'empty body' }), { status: 400, headers });

    const payload = {
      app_id: env.ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: message }
    };
    if (url) payload.url = url;
    if (uids && uids.length) { payload.include_aliases = { external_id: uids }; payload.target_channel = 'push'; }
    else payload.included_segments = ['Subscribed Users'];

    /* OneSignal issues two key formats; newer ones authenticate as "Key", older as "Basic" */
    const send = auth => fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(payload)
    });

    try {
      let r = await send('Key ' + env.ONESIGNAL_API_KEY);
      if (r.status === 401 || r.status === 403) r = await send('Basic ' + env.ONESIGNAL_API_KEY);
      let text = await r.text();

      /* segment name differs by account age */
      if (!r.ok && payload.included_segments && /segment/i.test(text)) {
        payload.included_segments = ['Total Subscriptions'];
        r = await send('Key ' + env.ONESIGNAL_API_KEY);
        if (r.status === 401 || r.status === 403) r = await send('Basic ' + env.ONESIGNAL_API_KEY);
        text = await r.text();
      }
      return new Response(text, { status: r.status, headers: { ...headers, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'upstream failed', detail: String(e) }), { status: 502, headers });
    }
  }
};
