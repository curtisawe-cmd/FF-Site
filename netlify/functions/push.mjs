/* ============================================================
   Bitch Boy League — push endpoint.   POST /.netlify/functions/push

   Does three jobs for the league app:
     {title, body, uids}  send a notification now (draft picks, trades, alarms)
     {snapshot: {...}}    store the picture of the league the scheduled watcher works from
     {watchNow: true}     run the watcher this second and report what it found
     {diag: true}         say what is configured, without ever revealing the key

   Why this exists at all: OneSignal refuses to be sent from a browser, and the REST key must
   never sit in a public repo or in anyone's phone. This is the only place the key lives, and it
   only ever forwards a title, a body and a list of recipients — it cannot be talked into
   sending an arbitrary payload.

   It runs on the same domain as the site, which is the quiet advantage of hosting both here:
   there is no cross-origin request to allow, and no second service to keep an account with.

   NEEDS (Site configuration -> Environment variables):
     ONESIGNAL_APP_ID    from OneSignal -> Settings -> Keys & IDs
     ONESIGNAL_API_KEY   the REST API key from that same page
   ============================================================ */

import { getStore } from '@netlify/blobs';
import { runScoreWatch } from './lib/score.mjs';

const SEGMENTS = ['Total Subscriptions', 'Active Subscriptions', 'Subscribed Users', 'All'];

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });

function store() {
  try { return getStore('bbl'); } catch { return null; }
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return new Response('POST only', { status: 405 });

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad json' }, 400); }

  const APP_ID = String(process.env.ONESIGNAL_APP_ID || '').trim();
  const API_KEY = String(process.env.ONESIGNAL_API_KEY || '').trim();

  /* the app keeping the watcher's picture of the league current */
  if (body && body.snapshot) {
    const s = store();
    if (!s) return json({ error: 'blob store unavailable' }, 500);
    const snap = body.snapshot;
    snap.at = Date.now();
    try {
      await s.setJSON('snapshot', snap);
      return json({ ok: true, stored: true, teams: (snap.teams || []).length, week: snap.week || null, on: !!snap.on });
    } catch (e) { return json({ error: 'store write failed', detail: String(e) }, 500); }
  }

  /* prove the whole chain out of season instead of discovering it broken on a Sunday */
  if (body && body.watchNow === true) {
    const res = await runScoreWatch(store());
    return json({ ran: true, ...res });
  }

  if (!API_KEY || !APP_ID) {
    return json({
      error: 'environment variables not set',
      ONESIGNAL_APP_ID: APP_ID ? 'set' : 'MISSING',
      ONESIGNAL_API_KEY: API_KEY ? 'set' : 'MISSING',
      hint: 'Netlify -> Site configuration -> Environment variables. Names are case-sensitive, then redeploy.'
    }, 500);
  }

  if (body && body.diag === true) {
    const raw = String(process.env.ONESIGNAL_API_KEY || '');
    let snapInfo = { snapshot: 'none' };
    const s = store();
    if (s) {
      try {
        const snap = await s.get('snapshot', { type: 'json' });
        snapInfo = snap ? {
          snapshot: 'stored',
          ageMinutes: Math.round((Date.now() - (snap.at || 0)) / 60000),
          week: snap.week || null, season: snap.season || null,
          teams: (snap.teams || []).length,
          teamsWithAManager: (snap.teams || []).filter(t => t.uid).length,
          relaySending: !!snap.on, buzzAt: snap.min
        } : { snapshot: 'none yet' };
      } catch { snapInfo = { snapshot: 'store read failed' }; }
    } else snapInfo = { snapshot: 'BLOB STORE UNAVAILABLE' };
    return json({
      appId: APP_ID,
      appIdLooksValid: /^[0-9a-f-]{36}$/i.test(APP_ID),
      keyLength: API_KEY.length,
      keyHadSurroundingWhitespace: raw !== raw.trim(),
      keyStyle: API_KEY.startsWith('os_v2_') ? 'new (os_v2_)' : 'legacy',
      ...snapInfo,
      note: 'A legacy REST API key is ~48 chars. An Organization/User key will 401 on sends.'
    });
  }

  const title = String(body.title || 'Bitch Boy League').slice(0, 60);
  const message = String(body.body || '').slice(0, 180);
  const uids = Array.isArray(body.uids) ? body.uids.filter(u => typeof u === 'string').slice(0, 50) : null;
  const url = String(body.url || '').slice(0, 300);
  if (!message) return json({ error: 'empty body' }, 400);

  const payload = { app_id: APP_ID, headings: { en: title }, contents: { en: message } };
  if (url) payload.url = url;
  if (uids && uids.length) { payload.include_aliases = { external_id: uids }; payload.target_channel = 'push'; }
  else payload.included_segments = [SEGMENTS[0]];

  const send = auth => fetch('https://api.onesignal.com/notifications', {
    method: 'POST', headers: { ...JSON_HEADERS, Authorization: auth }, body: JSON.stringify(payload)
  });
  const sendBoth = async () => {
    let r = await send('Key ' + API_KEY);
    if (r.status === 401 || r.status === 403) r = await send('Basic ' + API_KEY);
    return { r, text: await r.text() };
  };

  try {
    let { r, text } = await sendBoth();
    /* Aiming at a segment that does not exist does NOT fail loudly: OneSignal answers 200 with
       {"errors":["All included players are not subscribed"]}, which is indistinguishable from
       having no subscribers. So walk the aliases on the error body, not on the status. */
    if (payload.included_segments) {
      for (let i = 1; i < SEGMENTS.length && /not subscribed|segment/i.test(text); i++) {
        payload.included_segments = [SEGMENTS[i]];
        ({ r, text } = await sendBoth());
      }
    }
    return new Response(text, { status: r.status, headers: JSON_HEADERS });
  } catch (e) {
    return json({ error: 'upstream failed', detail: String(e) }, 502);
  }
};
