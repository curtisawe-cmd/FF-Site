/* ============================================================
   Bitch Boy League — the scoring rules, shared by both functions.

   Kept in its own file with no Netlify imports at all, so it is a pure function of its
   arguments and can be run against the app's own scorer in a test. That matters more here than
   anywhere else in the project: this is a PORT of scoreWeekStats out of index.html, and a port
   that drifts sends a notification with a number that does not match the screen it links to.
   The harness runs thousands of random stat lines through both and fails on any disagreement.
   ============================================================ */

export function scoreWeek(st, pos, R) {
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

/* word for word what the in-app watcher says, so an alert reads the same whichever half sent it */
export function alertText(hits, total) {
  const one = hits.length === 1;
  const list = hits.map(h => h.name + ' +' + h.gain.toFixed(1)).join(', ');
  return {
    title: one ? hits[0].name + ' +' + hits[0].gain.toFixed(1) : hits.length + ' of yours just scored',
    body: one ? "You're on " + total.toFixed(1) : list + " — you're on " + total.toFixed(1)
  };
}

/* Who has scored since the last look. Pure: hands back what to send and the new marks.

   FIRST RUN IS A BASELINE. A fresh watermark records where everybody is and tells nobody, or
   the first run after a deploy would fire a notification for every point already on the board.

   THE MARK ONLY MOVES WHEN IT BUZZES, so a catch here and a catch there add up to one
   notification instead of being separately too small and lost. */
export function watchPass(snapshot, stats, marks) {
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
        next[pl.id] = pts;
      } else {
        next[pl.id] = first ? pts : was;
      }
    });
    total = Math.round(total * 10) / 10;
    if (hits.length && team.uid) out.push({ uid: team.uid, hits, total });
  });
  return { first, next, sends: out };
}

/* ---- OneSignal ---- */
export async function pushOne(uid, title, message, url) {
  const APP_ID = String(process.env.ONESIGNAL_APP_ID || '').trim();
  const API_KEY = String(process.env.ONESIGNAL_API_KEY || '').trim();
  if (!APP_ID || !API_KEY) return false;
  const payload = {
    app_id: APP_ID,
    headings: { en: String(title).slice(0, 60) },
    contents: { en: String(message).slice(0, 180) },
    include_aliases: { external_id: [uid] },
    target_channel: 'push'
  };
  if (url) payload.url = String(url).slice(0, 300);
  /* OneSignal issues two key formats and accepts only one scheme per format */
  const send = auth => fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(payload)
  });
  let r = await send('Key ' + API_KEY);
  if (r.status === 401 || r.status === 403) r = await send('Basic ' + API_KEY);
  return r.ok;
}

/* The scheduled run. Cheap and silent on a day with no football: with no live week in the
   snapshot it returns before fetching anything at all. */
export async function runScoreWatch(store) {
  if (!store) return { skipped: 'no blob store' };
  let snap;
  try { snap = await store.get('snapshot', { type: 'json' }); } catch { return { skipped: 'store read failed' }; }
  if (!snap) return { skipped: 'no snapshot yet - open the league app once' };
  if (!snap.on) return { skipped: 'relay sending is switched off in the league settings' };
  if (!snap.week || !snap.season) return { skipped: 'no live week' };
  if (snap.at && Date.now() - snap.at > 14 * 864e5) return { skipped: 'snapshot too old' };

  let stats;
  try {
    const r = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${snap.season}/${snap.week}`);
    if (!r.ok) return { skipped: 'sleeper ' + r.status };
    stats = await r.json();
  } catch { return { skipped: 'sleeper unreachable' }; }
  if (!stats || !Object.keys(stats).length) return { skipped: 'no stats yet' };

  const key = `wm_${snap.season}_${snap.week}`;
  const marks = (await store.get(key, { type: 'json' })) || {};
  const pass = watchPass(snap, stats, marks);
  await store.setJSON(key, pass.next);
  if (pass.first) return { baseline: true, players: Object.keys(pass.next).length - 1 };

  let sent = 0;
  for (const s of pass.sends) {
    const msg = alertText(s.hits, s.total);
    try { if (await pushOne(s.uid, msg.title, msg.body, snap.url)) sent++; } catch {}
  }
  return { sent, teams: pass.sends.length };
}
