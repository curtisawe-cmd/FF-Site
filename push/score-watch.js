/* ============================================================
   Bitch Boy League — the score watcher that runs with every phone shut.

   The relay in cloudflare-worker.js only forwards a notification somebody's browser asked it
   to send, so scoring alerts stopped the moment the last app was closed — which is most of
   Sunday. This half does the watching itself, on a schedule, with nobody's app open.

   HOW IT KNOWS ANYTHING
   It never talks to Firebase and holds no database credential. The app posts it a small
   SNAPSHOT — the week, the scoring rules, and each team's starters and manager id — whenever
   anyone opens the app, and the worker keeps the latest one in KV. That is enough to score a
   week on its own. If nobody opens the app for days the snapshot simply stays as it was, which
   is fine: lineups lock at kickoff anyway.

   WHAT IT SENDS
   The same thing the in-app watcher sent, aimed the same way: only starters count, only the
   manager whose roster the player is on is told, and several scorers in one pass arrive as one
   notification rather than several buzzes.

   FIRST RUN IS A BASELINE. A fresh watermark records where everybody is and tells nobody,
   exactly like the in-app version. Otherwise deploying this mid-game would fire a notification
   for every point already on the board.

   ============================================================ */

/* DEPLOY (on top of the relay you already have)
   1. Paste this file into the SAME worker, replacing it - this file contains the relay too,
      so one file is the whole thing.
   2. Workers & Pages -> your worker -> Settings -> Bindings -> add a KV namespace binding
      named  BBL  (create the namespace first under Storage & Databases -> KV).
   3. Settings -> Triggers -> Cron Triggers -> Add. The schedule is five fields, and every
      two minutes is written star-slash-2 then four plain stars. Spelt out rather than
      printed, because that slash-star sequence would close this very comment.
      It costs nothing on a day with no football: with no live week in the snapshot the run
      returns before fetching anything at all.
   4. In the league: Settings -> Push notifications -> turn on "Send from the relay".

   The secrets are the two the relay already uses. No new ones. */


const SEGMENTS = ['Total Subscriptions', 'Active Subscriptions', 'Subscribed Users', 'All'];

/* The league's own domain goes in a Cloudflare plaintext variable named SITE_ORIGIN, so
   moving to a real address is one variable rather than a code edit and a redeploy. Format it
   with the scheme and no trailing slash, e.g. https://bitchboyleague.com */
const BUILT_IN_ORIGINS = [
  'https://bitchboyleague.com',
  'https://www.bitchboyleague.com',
  'https://curtisawe-cmd.github.io',
  'http://127.0.0.1:8791',
  'http://localhost:8791',
  'http://localhost:8123'
];

function allowedOrigins(env) {
  const extra = String((env && env.SITE_ORIGIN) || '').trim().replace(/\/+$/, '');
  return extra ? [extra, ...BUILT_IN_ORIGINS] : BUILT_IN_ORIGINS;
}
function cors(origin, env) {
  const list = allowedOrigins(env);
  const ok = list.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : list[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

/* ------------------------------------------------------------------
   Scoring. A straight port of scoreWeekStats from the app, with the rules passed in instead of
   read off S. It has to stay a port: if the two ever disagree, the number in a notification
   would not match the number on the screen it links to.
   ------------------------------------------------------------------ */
function scoreWeek(st, pos, R) {
  if (!st) return null;
  const g = k => +(st[k] || 0), v = k => +((R || {})[k] || 0);
  let p = 0;
  if (pos === 'DEF') {
    p += g('sack') * v('DST sack') + g('int') * v('DST interception')
       + g('fum_rec') * v('DST fumble recovered') + g('ff') * v('DST fumble forced')
       + g('safe') * v('DST safety') + g('def_td') * v('DST TD')
       + g('def_st_td') * v('DST kick/punt return TD') + g('def_2pt') * v('DST 2-pt return');
    const pa = g('pts_allow');
    if (pa <= 0) p += v('Points allowed 0');
    else if (pa <= 6) p += v('Points allowed 1-6');
    else if (pa <= 13) p += v('Points allowed 7-13');
    else if (pa <= 20) p += v('Points allowed 14-20');
    else if (pa <= 27) p += v('Points allowed 21-27');
    else if (pa <= 34) p += v('Points allowed 28-34');
    else p += v('Points allowed 35+');
    const ya = g('yds_allow');
    if (st.yds_allow != null) {
      if (ya < 100) p += v('Under 100 total yds allowed');
      else if (ya < 200) p += v('100-199 yds allowed');
      else if (ya >= 500) p += v('500+ yds allowed');
    }
    return Math.round(p * 100) / 100;
  }
  p += g('pass_yd') * v('Passing yards (per yd)') + g('pass_td') * v('Passing TD')
     + g('pass_int') * v('Interception thrown') + g('pass_sack') * v('Sacked');
  p += g('rush_att') * v('Rushing attempt') + g('rush_yd') * v('Rushing yards (per yd)')
     + g('rush_td') * v('Rushing TD');
  p += g('rec') * v('Reception') + g('rec_yd') * v('Receiving yards (per yd)') + g('rec_td') * v('Receiving TD');
  p += (g('kr_td') + g('pr_td') + g('st_td')) * v('Kick/punt return TD')
     + g('fum_rec_td') * v('Fumble recovered for TD') + g('fum_lost') * v('Fumble lost');
  p += (g('pass_2pt') + g('rush_2pt') + g('rec_2pt')) * v('2-pt conversion');
  p += g('xpm') * v('PAT made') + g('xpmiss') * v('PAT missed');
  p += g('fgm_0_19') * v('FG 0-19') + g('fgm_20_29') * v('FG 20-29') + g('fgm_30_39') * v('FG 30-39')
     + g('fgm_40_49') * v('FG 40-49') + g('fgm_50p') * v('FG 50+');
  p += g('fgmiss_0_19') * v('FG missed 0-19') + g('fgmiss_20_29') * v('FG missed 20-29');
  p += g('rush_fd') * v('Rushing first down') + g('rec_fd') * v('Receiving first down')
     + g('pass_cmp') * v('Completion') + (g('pass_att') - g('pass_cmp')) * v('Incompletion')
     + g('pass_int_td') * v('Pick-six thrown');
  if (pos === 'TE') p += g('rec') * v('TE premium (per reception)');
  const py = g('pass_yd'), ry = g('rush_yd'), cy = g('rec_yd');
  if (py >= 400) p += v('400+ pass yds bonus'); else if (py >= 300) p += v('300-399 pass yds bonus');
  if (ry >= 200) p += v('200+ rush yds bonus'); else if (ry >= 100) p += v('100-199 rush yds bonus');
  if (cy >= 200) p += v('200+ rec yds bonus');
  if (g('pass_td_lng') >= 50) p += v('50+ yd pass TD bonus');
  if (g('rush_td_lng') >= 50) p += v('50+ yd rush TD bonus');
  if (g('rec_td_lng') >= 50) p += v('50+ yd rec TD bonus');
  if (Math.max(g('pass_td_lng'), g('rush_td_lng'), g('rec_td_lng')) >= 40) p += v('40+ yd TD bonus');
  return Math.round(p * 100) / 100;
}

/* the same wording the in-app watcher used, so a notification reads the same whichever half
   of the system sent it */
function alertText(hits, total) {
  const one = hits.length === 1;
  const list = hits.map(h => h.name + ' +' + h.gain.toFixed(1)).join(', ');
  return {
    title: one ? hits[0].name + ' +' + hits[0].gain.toFixed(1) : hits.length + ' of yours just scored',
    body: one ? "You're on " + total.toFixed(1) : list + " — you're on " + total.toFixed(1)
  };
}

/* Pure, and deliberately the same shape as scoreAlertPass in the app: hands back what to send
   and the new marks, so the rule can be reasoned about without a network. */
function watchPass(snapshot, stats, marks) {
  const first = !marks || !marks.__seen;
  const next = { __seen: 1 };
  const min = Number(snapshot.min) > 0 ? Number(snapshot.min) : 6;
  const out = [];
  (snapshot.teams || []).forEach(team => {
    const hits = [];
    let total = 0;
    (team.players || []).forEach(pl => {
      const raw = scoreWeek(stats[pl.id], pl.pos, snapshot.scoring);
      const pts = Math.round((+raw || 0) * 10) / 10;
      total += pts;
      const was = (marks && marks[pl.id] !== undefined) ? +marks[pl.id] : 0;
      const gain = Math.round((pts - was) * 10) / 10;
      if (!first && gain >= min) {
        hits.push({ name: pl.name, gain, pts });
        next[pl.id] = pts;                 /* cleared the bar, so the mark moves */
      } else {
        next[pl.id] = first ? pts : was;   /* otherwise it stays put and small gains accrue */
      }
    });
    total = Math.round(total * 10) / 10;
    if (hits.length && team.uid) out.push({ uid: team.uid, hits, total });
  });
  return { first, next, sends: out };
}

async function pushOne(env, uid, title, message, url) {
  const APP_ID = String(env.ONESIGNAL_APP_ID || '').trim();
  const API_KEY = String(env.ONESIGNAL_API_KEY || '').trim();
  if (!APP_ID || !API_KEY) return false;
  const payload = {
    app_id: APP_ID,
    headings: { en: String(title).slice(0, 60) },
    contents: { en: String(message).slice(0, 180) },
    include_aliases: { external_id: [uid] },
    target_channel: 'push'
  };
  if (url) payload.url = String(url).slice(0, 300);
  const send = auth => fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(payload)
  });
  let r = await send('Key ' + API_KEY);
  if (r.status === 401 || r.status === 403) r = await send('Basic ' + API_KEY);
  return r.ok;
}

/* The scheduled run. Cheap and silent on a day with no football: no live week in the snapshot
   means it returns before it fetches anything at all. */
async function runScoreWatch(env) {
  if (!env.BBL) return { skipped: 'no KV binding named BBL' };
  let snap;
  try { snap = await env.BBL.get('snapshot', 'json'); } catch { return { skipped: 'kv read failed' }; }
  if (!snap) return { skipped: 'no snapshot yet - open the league app once' };
  if (!snap.on) return { skipped: 'relay sending is switched off in the league settings' };
  if (!snap.week || !snap.season) return { skipped: 'no live week' };
  /* a snapshot nobody has refreshed in a fortnight is not worth acting on */
  if (snap.at && Date.now() - snap.at > 14 * 864e5) return { skipped: 'snapshot too old' };

  let stats;
  try {
    const r = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${snap.season}/${snap.week}`);
    if (!r.ok) return { skipped: 'sleeper ' + r.status };
    stats = await r.json();
  } catch (e) { return { skipped: 'sleeper unreachable' }; }
  if (!stats || !Object.keys(stats).length) return { skipped: 'no stats yet' };

  const key = `wm_${snap.season}_${snap.week}`;
  const marks = (await env.BBL.get(key, 'json')) || {};
  const pass = watchPass(snap, stats, marks);
  await env.BBL.put(key, JSON.stringify(pass.next), { expirationTtl: 60 * 60 * 24 * 21 });
  if (pass.first) return { baseline: true, players: Object.keys(pass.next).length - 1 };

  let sent = 0;
  for (const s of pass.sends) {
    const msg = alertText(s.hits, s.total);
    try { if (await pushOne(env, s.uid, msg.title, msg.body, snap.url)) sent++; } catch (e) {}
  }
  return { sent, teams: pass.sends.length };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScoreWatch(env));
  },

  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('POST only', { status: 405, headers });
    if (!allowedOrigins(env).includes(origin))
      return new Response(JSON.stringify({ error: 'origin not allowed' }), { status: 403, headers });

    const APP_ID = String(env.ONESIGNAL_APP_ID || '').trim();
    const API_KEY = String(env.ONESIGNAL_API_KEY || '').trim();

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers }); }

    const J = (obj, status) => new Response(JSON.stringify(obj), {
      status: status || 200, headers: { ...headers, 'Content-Type': 'application/json' }
    });

    /* the app keeping the worker's picture of the league current */
    if (body && body.snapshot) {
      if (!env.BBL) return J({ error: 'no KV binding named BBL', hint: 'Settings > Bindings > KV namespace, name it BBL' }, 500);
      const s = body.snapshot;
      s.at = Date.now();
      try {
        await env.BBL.put('snapshot', JSON.stringify(s));
        return J({ ok: true, stored: true, teams: (s.teams || []).length, week: s.week || null, on: !!s.on });
      } catch (e) { return J({ error: 'kv write failed', detail: String(e) }, 500); }
    }

    /* let the league prove the whole chain works out of season, without waiting for a Sunday */
    if (body && body.watchNow === true) {
      const res = await runScoreWatch(env);
      return J({ ran: true, ...res });
    }

    if (!API_KEY || !APP_ID) {
      return J({
        error: 'worker secrets not set',
        ONESIGNAL_APP_ID: APP_ID ? 'set' : 'MISSING',
        ONESIGNAL_API_KEY: API_KEY ? 'set' : 'MISSING',
        hint: 'Settings > Variables and Secrets. Names are case-sensitive, then Deploy.'
      }, 500);
    }

    if (body && body.diag === true) {
      const raw = String(env.ONESIGNAL_API_KEY || '');
      let snapInfo = { snapshot: 'none' };
      if (env.BBL) {
        try {
          const s = await env.BBL.get('snapshot', 'json');
          snapInfo = s ? {
            snapshot: 'stored', ageMinutes: Math.round((Date.now() - (s.at || 0)) / 60000),
            week: s.week || null, season: s.season || null,
            teams: (s.teams || []).length,
            teamsWithAManager: (s.teams || []).filter(t => t.uid).length,
            relaySending: !!s.on, buzzAt: s.min
          } : { snapshot: 'none yet' };
        } catch (e) { snapInfo = { snapshot: 'kv read failed' }; }
      } else snapInfo = { snapshot: 'NO KV BINDING - add one named BBL' };
      return J({
        appId: APP_ID,
        appIdLooksValid: /^[0-9a-f-]{36}$/i.test(APP_ID),
        keyLength: API_KEY.length,
        keyHadSurroundingWhitespace: raw !== raw.trim(),
        keyStyle: API_KEY.startsWith('os_v2_') ? 'new (os_v2_)' : 'legacy',
        kv: !!env.BBL,
        ...snapInfo,
        note: 'A legacy REST API key is ~48 chars. An Organization/User key will 401 on sends.'
      });
    }

    const title = String(body.title || 'Bitch Boy League').slice(0, 60);
    const message = String(body.body || '').slice(0, 180);
    const uids = Array.isArray(body.uids) ? body.uids.filter(u => typeof u === 'string').slice(0, 50) : null;
    const url = String(body.url || '').slice(0, 300);
    if (!message) return J({ error: 'empty body' }, 400);

    const payload = { app_id: APP_ID, headings: { en: title }, contents: { en: message } };
    if (url) payload.url = url;
    if (uids && uids.length) { payload.include_aliases = { external_id: uids }; payload.target_channel = 'push'; }
    else payload.included_segments = [SEGMENTS[0]];

    const send = auth => fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(payload)
    });
    const sendBoth = async () => {
      let r = await send('Key ' + API_KEY);
      if (r.status === 401 || r.status === 403) r = await send('Basic ' + API_KEY);
      return { r, text: await r.text() };
    };

    try {
      let { r, text } = await sendBoth();
      if (payload.included_segments) {
        for (let i = 1; i < SEGMENTS.length && /not subscribed|segment/i.test(text); i++) {
          payload.included_segments = [SEGMENTS[i]];
          ({ r, text } = await sendBoth());
        }
      }
      return new Response(text, { status: r.status, headers: { ...headers, 'Content-Type': 'application/json' } });
    } catch (e) {
      return J({ error: 'upstream failed', detail: String(e) }, 502);
    }
  }
};
