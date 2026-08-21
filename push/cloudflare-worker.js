/* ============================================================
   Bitch Boy League — push relay (Cloudflare Worker)

   SUPERSEDED BY push/score-watch.js, which contains everything this file does plus the
   scheduled score watcher. Deploy that one instead unless you specifically want the relay
   without alerts that fire while every app in the league is shut. This file is kept as the
   smaller, simpler thing to fall back to.

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

/* The "everyone" segment, most current name first. Newer OneSignal accounts ship
   "Total Subscriptions" as the default and have no "Subscribed Users" at all — asking for a
   segment that does not exist looks exactly like having no subscribers, so the send is retried
   down this list rather than trusting any single name. */
const SEGMENTS = ['Total Subscriptions', 'Active Subscriptions', 'Subscribed Users', 'All'];

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

    /* Trim: pasting a secret often drags in a trailing newline or space, which makes the
       Authorization header invalid and looks exactly like a wrong key. */
    const APP_ID = String(env.ONESIGNAL_APP_ID || '').trim();
    const API_KEY = String(env.ONESIGNAL_API_KEY || '').trim();

    if (!API_KEY || !APP_ID) {
      return new Response(JSON.stringify({
        error: 'worker secrets not set',
        ONESIGNAL_APP_ID: APP_ID ? 'set' : 'MISSING',
        ONESIGNAL_API_KEY: API_KEY ? 'set' : 'MISSING',
        hint: 'Settings > Variables and Secrets. Names are case-sensitive, then Deploy.'
      }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers }); }

    /* {"diag":true} reports what the worker is holding, without sending and without ever
       revealing the key itself — enough to tell a missing secret from a mangled or
       wrong-type one, which all fail identically from the outside. */
    if (body && body.diag === true) {
      const raw = String(env.ONESIGNAL_API_KEY || '');
      return new Response(JSON.stringify({
        appId: APP_ID,
        appIdLooksValid: /^[0-9a-f-]{36}$/i.test(APP_ID),
        keyLength: API_KEY.length,
        keyHadSurroundingWhitespace: raw !== raw.trim(),
        keyStyle: API_KEY.startsWith('os_v2_') ? 'new (os_v2_)' : 'legacy',
        note: 'A legacy REST API key is ~48 chars. An Organization/User key will 401 on sends.'
      }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const title = String(body.title || 'Bitch Boy League').slice(0, 60);
    const message = String(body.body || '').slice(0, 180);
    const uids = Array.isArray(body.uids) ? body.uids.filter(u => typeof u === 'string').slice(0, 50) : null;
    const url = String(body.url || '').slice(0, 300);
    if (!message) return new Response(JSON.stringify({ error: 'empty body' }), { status: 400, headers });

    const payload = {
      app_id: APP_ID,
      headings: { en: title },
      contents: { en: message }
    };
    if (url) payload.url = url;
    if (uids && uids.length) { payload.include_aliases = { external_id: uids }; payload.target_channel = 'push'; }
    else payload.included_segments = [SEGMENTS[0]];

    /* OneSignal issues two key formats; newer ones authenticate as "Key", older as "Basic" */
    const send = auth => fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(payload)
    });

    /* Try "Key" first and fall back to "Basic": OneSignal issues two key formats and only
       accepts one scheme per format. */
    const sendBoth = async () => {
      let r = await send('Key ' + API_KEY);
      if (r.status === 401 || r.status === 403) r = await send('Basic ' + API_KEY);
      return { r, text: await r.text() };
    };

    try {
      let { r, text } = await sendBoth();

      /* Walk the segment aliases. Aiming at a segment that does not exist does NOT fail loudly:
         OneSignal answers 200 with {"errors":["All included players are not subscribed"]},
         which is indistinguishable from having no subscribers. So retry on the error body, not
         on the status, and do not look for the word "segment" — it never appears. */
      if (payload.included_segments) {
        for (let i = 1; i < SEGMENTS.length && /not subscribed|segment/i.test(text); i++) {
          payload.included_segments = [SEGMENTS[i]];
          ({ r, text } = await sendBoth());
        }
      }
      return new Response(text, { status: r.status, headers: { ...headers, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'upstream failed', detail: String(e) }), { status: 502, headers });
    }
  }
};
