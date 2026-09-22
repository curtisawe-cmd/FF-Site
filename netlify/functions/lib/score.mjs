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
/* ============================================================
   WHAT COUNTS AS SCORING.

   A buzz used to mean "this starter has gained six points since I last looked", which fired on
   an afternoon of quiet catches and said nothing about what had actually happened. It is now a
   scoring PLAY: a touchdown, or a kicker's made field goal. Nothing else buzzes - not yardage,
   not receptions, not an extra point, not a two-point conversion (the touchdown that set it up
   has already been announced).

   A passing touchdown counts. It is not the quarterback carrying it in, but it is the moment
   his owner wants the phone to go off, and leaving it out would mean a quarterback owner is
   told almost nothing all afternoon.

   The mark per player is this tally, not a points total, so the comparison is "how many more
   has he scored" rather than "how much has he gained". A tally that goes DOWN is a stat
   correction: it is recorded and nothing is sent.
   ============================================================ */
function scorePlays(st){
  const g = k => +((st||{})[k]) || 0;
  return { pass:g('pass_td'), rush:g('rush_td'), rec:g('rec_td'),
           ret:g('kr_td')+g('pr_td')+g('st_td'), def:g('def_td'),
           fg:g('fgm_0_19')+g('fgm_20_29')+g('fgm_30_39')+g('fgm_40_49'), fg50:g('fgm_50p') };
}
const PLAY_KINDS = ['rush','rec','pass','ret','def','fg50','fg'];
/* only what is NEW since the last look, or null when nothing is */
function playDelta(now, was){
  const d = {}; let any = 0;
  PLAY_KINDS.forEach(k=>{ const v = (now[k]||0) - ((was && was[k])||0); if(v > 0){ d[k] = v; any += v; } });
  return any ? d : null;
}
/* the words for the phone: "rushing TD", "2 receiving TDs", "field goal from 50+" */
function playWords(d){
  const bits = [];
  const add = (k, one, many) => { const v = (d||{})[k]||0; if(v>0) bits.push(v===1 ? one : v+' '+many); };
  add('rush','rushing TD','rushing TDs');
  add('rec','receiving TD','receiving TDs');
  add('pass','passing TD','passing TDs');
  add('ret','return TD','return TDs');
  add('def','defensive TD','defensive TDs');
  add('fg50','field goal from 50+','field goals from 50+');
  add('fg','field goal','field goals');
  return bits.join(' and ');
}
export function alertText(hits, total) {
  const one = hits.length === 1;
  const list = hits.map(h => h.name + ' ' + h.what).join(', ');
  return {
    title: one ? hits[0].name + ': ' + hits[0].what : hits.length + ' of yours just scored',
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
  const out = [];
  (snapshot.teams || []).forEach(team => {
    const hits = [];
    let total = 0;
    (team.players || []).forEach(pl => {
      const st = stats[pl.id];
      total += Math.round((+scoreWeek(st, pl.pos, snapshot.scoring) || 0) * 10) / 10;
      const now = scorePlays(st);
      const was = (marks && marks[pl.id] && typeof marks[pl.id] === 'object') ? marks[pl.id] : null;
      next[pl.id] = now;
      /* nothing to compare against: a first run, a player who has just arrived, or a mark left
         by the old points-based watcher. Record where he is and say nothing. */
      if (first || !was) return;
      const d = playDelta(now, was);
      if (d) hits.push({ name: pl.name, what: playWords(d) });
    });
    total = Math.round(total * 10) / 10;
    if (hits.length && team.uid) out.push({ uid: team.uid, hits, total });
  });
  return { first, next, sends: out };
}

/* ============================================================
   THE LINEUP RECORDER - a week is written down whether or not anybody opens the app.

   liveScores, and with it the record of who started, is written by an open app. On a Sunday when
   nobody opens one, nothing is written, and that week then reads as today's roster for ever.

   The relay cannot write to the database - it deliberately holds no credential and is not going
   to be given one - but it is awake every two minutes and every snapshot it receives already
   carries each team's whole lineup, slots included. So it keeps its own copy in the blob store
   and hands it back on request; the next app to open fills the gap in the database from it.

   A STALE SNAPSHOT IS THE RIGHT ANSWER. If nobody opened the app all weekend then the last one
   posted before kickoff is the lineup that played, because lineups lock at each player's
   kickoff. That is exactly what should be recorded.

   WHEN IT CLOSES. The app rolls to the next week at 4 AM Eastern on the Tuesday, which is also
   when lineups unlock. So the first snapshot that names a LATER week closes the one before it,
   and a closed record is never written again. That is what stops Wednesday's rearranging from
   reaching back into last week, and it needs no clock of its own and no extra fetch.
   ============================================================ */
export async function runLineupRecord(store) {
  if (!store) return { skipped: 'no blob store' };
  let snap;
  try { snap = await store.get('snapshot', { type: 'json' }); } catch { return { skipped: 'store read failed' }; }
  if (!snap) return { skipped: 'no snapshot yet - open the league app once' };
  const season = +snap.season || 0, week = +snap.week || 0;
  if (!season || !week) return { skipped: 'no live week' };

  /* the week before this one is finished business now: close it where it stands */
  let closed = null;
  if (week > 1) {
    const prevKey = `lu_${season}_${week - 1}`;
    try {
      const prev = await store.get(prevKey, { type: 'json' });
      if (prev && !prev.closed) { await store.setJSON(prevKey, { ...prev, closed: true, closedAt: Date.now() }); closed = week - 1; }
    } catch { /* a close that does not land is retried on the next run */ }
  }

  const key = `lu_${season}_${week}`;
  let cur = null;
  try { cur = await store.get(key, { type: 'json' }); } catch {}
  if (cur && cur.closed) return { week, skipped: 'already closed', closed };

  const teams = {};
  (snap.teams || []).forEach(t => {
    const ti = +t.ti;
    if (!Number.isInteger(ti)) return;
    const map = {};
    (t.roster || []).forEach(p => { if (p && p.id && p.slot) map[String(p.id)] = String(p.slot); });
    if (Object.keys(map).length) teams[String(ti)] = map;
  });
  if (!Object.keys(teams).length) return { week, skipped: 'snapshot carries no lineups', closed };
  try { await store.setJSON(key, { season, week, at: Date.now(), from: +snap.at || 0, teams, closed: false }); }
  catch { return { week, skipped: 'store write failed', closed }; }
  return { week, teams: Object.keys(teams).length, closed };
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
  /* a stalled socket here would otherwise hold the invocation until Netlify killed it, and
     every watcher after this one would be skipped for that run */
  const send = auth => fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(6000)
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
  /* the blob store 5xxs now and then; these were the only two calls in the file outside a try,
     and the throw escaped the whole scheduled run */
  let marks = {};
  try { marks = (await store.get(key, { type: 'json' })) || {}; } catch { return { skipped: 'marks read failed' }; }
  const pass = watchPass(snap, stats, marks);
  try { await store.setJSON(key, pass.next); } catch { return { skipped: 'marks write failed' }; }
  if (pass.first) return { baseline: true, players: Object.keys(pass.next).length - 1 };

  let sent = 0;
  for (const s of pass.sends) {
    const msg = alertText(s.hits, s.total);
    try { if (await pushOne(s.uid, msg.title, msg.body, snap.url)) sent++; } catch {}
  }
  return { sent, teams: pass.sends.length };
}

/* ============================================================
   LINEUP ALERTS - "your guy isn't playing and kickoff is in two hours."

   Same snapshot, same relay, same one-manager-at-a-time push. What it adds is a look at each
   team's starters a little before their games: a starter who is out, on IR, suspended, on bye,
   or simply has no line in Sleeper's projection file for the week is going to score zero, and
   so is an empty slot. The manager hears about it while there is still time to do something.

   WHEN. An issue is due in the window before its player's own kickoff (lead hours, from the
   settings). A bye or an empty slot has no kickoff of its own, so it rides the next kickoff of
   the week that has not happened yet - Thursday night if the watcher is running then, Sunday
   morning otherwise. Once told, a manager is not told the same thing again that week.

   WHAT COUNTS AS OUT. The injury tag the app already shows (Out, IR, PUP, suspended...), a
   Doubtful tag, or no stat line in Sleeper's weekly projection file. Every player is in that
   file; the ones who will not play carry only draft-position fields and no stats, which is how
   the app's own projections already read them.
   ============================================================ */
const OUT_TAGS = ['Out', 'IR', 'PUP', 'Sus', 'Suspended', 'NA', 'DNR', 'COV'];
const ESPN_TEAM_FIX = { WSH: 'WAS' };

/* the ids Sleeper has a real line for this week - the rest are not playing or not projected */
export function projectedIds(weekProj) {
  const ids = new Set();
  Object.keys(weekProj || {}).forEach(id => {
    const l = weekProj[id]; if (!l) return;
    const real = (+l.gp > 0) || Object.keys(l).some(k => !k.startsWith('adp_') && !k.startsWith('pos_adp') && k !== 'gp');
    if (real) ids.add(String(id));
  });
  return ids;
}

/* Pure. What each manager should be told right now, and the marks to store so nobody hears
   the same thing twice. `kick` is {TEAM: kickoffMs}; `lined` the Set from projectedIds. */
export function lineupPass(snapshot, lined, kick, marks, now, leadMs) {
  const week = +snapshot.lineupWeek || +snapshot.week || 0;
  const next = JSON.parse(JSON.stringify(marks || {}));
  const kicks = Object.values(kick || {}).filter(Number.isFinite);
  const byesKnown = kicks.length >= 20;
  const nextKick = kicks.filter(t => t > now).sort((a, b) => a - b)[0] || null;
  const due = t => Number.isFinite(t) && t > now && t - now <= leadMs;
  const sends = [];
  (snapshot.teams || []).forEach(team => {
    if (!team.uid) return;
    const seen = next[team.uid] = next[team.uid] || {};
    const issues = [];
    (team.players || []).forEach(pl => {
      const id = String(pl.id);
      const tm = String(pl.nfl || '').toUpperCase();
      const onBye = (week && +pl.bye === week) || (byesKnown && tm && !Number.isFinite(kick[tm]));
      let why = null;
      if (onBye) why = 'bye';
      else if (OUT_TAGS.includes(pl.inj)) why = pl.inj === 'IR' ? 'IR' : pl.inj === 'Out' ? 'out' : String(pl.inj).toLowerCase();
      else if (pl.inj === 'Doubtful') why = 'doubtful';
      else if (lined && lined.size && !lined.has(id)) why = 'not projected to play';
      if (!why) return;
      /* his own kickoff; a bye or a team with no game rides the next kickoff of the week */
      const at = onBye || !Number.isFinite(kick[tm]) ? nextKick : kick[tm];
      if (!due(at)) return;
      if (seen[id]) return;
      issues.push({ key: id, text: `${pl.name || 'A starter'} (${pl.pos || '?'}) ${why}`, at });
    });
    const open = +team.open || 0;
    if (open > 0 && due(nextKick)) {
      const key = 'open:' + open;
      if (!seen[key]) issues.push({ key, text: `${open} empty slot${open > 1 ? 's' : ''}`, at: nextKick });
    }
    if (!issues.length) return;
    issues.forEach(i => { seen[i.key] = 1; });
    const soonest = Math.min(...issues.map(i => i.at));
    sends.push({ uid: team.uid, team: team.name || '', issues, msUntil: soonest - now });
  });
  return { next, sends };
}

/* the words. Short enough for a lock screen, blunt enough for this league. */
export function lineupText(issues, msUntil) {
  const players = issues.filter(i => !String(i.key).startsWith('open:'));
  const open = issues.find(i => String(i.key).startsWith('open:'));
  const n = players.length;
  const title = n && open ? `${n + 1} lineup problems`
              : n ? `${n} starter${n > 1 ? 's' : ''} won't play`
              : 'Empty spot in your lineup';
  const mins = Math.max(1, Math.round(msUntil / 60000));
  const when = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60 ? (mins % 60) + 'm' : ''}`.trim() : `${mins}m`;
  let list = issues.map(i => i.text).join(' · ');
  if (list.length > 120) list = list.slice(0, 117).replace(/\s+\S*$/, '') + '…';
  return { title, body: `${list}. Kickoff in ${when} — fix it or eat the zero.` };
}

/* ============================================================
   SWING ALERTS - "you're losing this now."

   The same live odds the app draws, worked out here from the snapshot: every starter is what
   he has scored (Sleeper's stat line through the league's rules) plus what his projection says
   is still to come, in proportion to how much of his game is left (ESPN's period and clock);
   the two expected finals go through the pre-game logistic with the spread shrinking as the
   points still in play run out. A short history per matchup is kept in the blob store, and when
   a matchup's odds move SWING_PTS in SWING_WINDOW_MS while a game is on, both managers hear -
   the one losing it and the one taking it - at most once every SWING_COOLDOWN_MS per matchup.
   Nothing fires before kickoff or after the last whistle: the score alerts own the ending.
   ============================================================ */
const SWING_PTS = 25, SWING_WINDOW_MS = 20 * 60000, SWING_COOLDOWN_MS = 30 * 60000;

export function gameRemain(period, clock) {
  const p = +period || 0;
  if (p <= 0) return 1;
  if (p > 4) return 0.05;
  const m = /^(\d+):(\d\d)/.exec(String(clock || '')); const secs = m ? (+m[1]) * 60 + (+m[2]) : 0;
  return Math.max(0, Math.min(1, ((4 - p) * 900 + secs) / 3600));
}

/* the week's games with their state: {TEAM: {kick, state:'pre'|'in'|'post', remain}} - live, never cached */
async function weekBoard(season, week) {
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`);
  if (!r.ok) throw new Error('espn ' + r.status);
  const j = await r.json();
  const games = {};
  (j.events || []).forEach(ev => {
    const t = Date.parse(ev.date); if (!Number.isFinite(t)) return;
    const comp = (ev.competitions || [])[0] || {};
    const st = ev.status || comp.status || {};
    let state = String(((st.type || {}).state) || '').toLowerCase();
    if (state !== 'pre' && state !== 'in' && state !== 'post') state = Date.now() < t ? 'pre' : 'in';
    const remain = state === 'post' ? 0 : state === 'pre' ? 1 : gameRemain(+st.period || 0, String(st.displayClock || ''));
    (comp.competitors || []).forEach(c => {
      const ab = String((c.team || {}).abbreviation || '').toUpperCase();
      if (ab) games[ESPN_TEAM_FIX[ab] || ab] = { kick: t, state, remain };
    });
  });
  return games;
}

/* Pure. The live odds for every matchup in the snapshot, from a side's starters. */
export function liveOddsFor(snapshot, stats, games) {
  const byTi = {};
  (snapshot.teams || []).forEach(t => { byTi[t.ti] = t; });
  const side = t => {
    let scored = 0, exp = 0, rem = 0, proj = 0, left = 0, playing = 0;
    (t.players || []).forEach(pl => {
      const st = stats[pl.id];
      const pts = Math.round((+scoreWeek(st, pl.pos, snapshot.scoring) || 0) * 10) / 10;
      const pr = +pl.proj || 0;
      const g = games[String(pl.nfl || '').toUpperCase()];
      const state = g ? g.state : (st ? 'post' : 'none');
      const remain = state === 'pre' ? 1 : state === 'in' ? g.remain : 0;
      scored += pts; proj += pr; exp += pts + pr * remain; rem += pr * remain;
      if (state === 'pre') left++; else if (state === 'in') playing++;
    });
    const r1 = n => Math.round(n * 10) / 10;
    return { scored: r1(scored), exp: r1(exp), rem: r1(rem), proj: r1(proj), left, playing };
  };
  return (snapshot.games || []).map((g, m) => {
    const A = byTi[g[0]], B = byTi[g[1]];
    if (!A || !B) return null;
    const a = side(A), b = side(B);
    const over = (a.left + a.playing + b.left + b.playing) === 0;
    const pre = (a.playing === 0 && b.playing === 0 && a.scored === 0 && b.scored === 0);
    let pA;
    if (over) pA = a.scored > b.scored ? 100 : b.scored > a.scored ? 0 : 50;
    else {
      const scale = Math.max(4, 24 * Math.sqrt((a.rem + b.rem) / Math.max(1, a.proj + b.proj)));
      pA = Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-(a.exp - b.exp) / scale)))));
    }
    return { m, A, B, a, b, pA, over, pre };
  }).filter(Boolean);
}

/* Pure. Hands back what to send and the new marks. A matchup's history is the last hour of
   readings; the comparison is against the reading nearest to SWING_WINDOW_MS ago, so a slow
   drift never fires and a sudden one does. */
export function swingPass(odds, marks, now) {
  const next = {};
  const sends = [];
  odds.forEach(o => {
    const prev = (marks && marks[o.m]) || { hist: [], lastAt: 0 };
    const hist = (prev.hist || []).filter(h => now - h.t <= 60 * 60000);
    hist.push({ t: now, p: o.pA });
    const entry = { hist: hist.slice(-40), lastAt: +prev.lastAt || 0 };
    next[o.m] = entry;
    if (o.over || o.pre) return;
    const then = hist.filter(h => now - h.t >= SWING_WINDOW_MS).slice(-1)[0];
    if (!then) return;
    const swing = o.pA - then.p;
    if (Math.abs(swing) < SWING_PTS) return;
    if (now - entry.lastAt < SWING_COOLDOWN_MS) return;
    entry.lastAt = now;
    /* each message reads from its own side: my score first, my odds, my pace */
    const mins = Math.round(SWING_WINDOW_MS / 60000);
    const up = swing > 0 ? o.A : o.B, down = swing > 0 ? o.B : o.A;
    const upS = swing > 0 ? o.a : o.b, downS = swing > 0 ? o.b : o.a;
    const pUpNow = swing > 0 ? o.pA : 100 - o.pA, pUpThen = swing > 0 ? then.p : 100 - then.p;
    const tally = (me, them) => `${me.scored.toFixed(1)}-${them.scored.toFixed(1)} now, on pace ${me.exp.toFixed(1)}-${them.exp.toFixed(1)}`;
    if (down.uid) sends.push({ uid: down.uid, title: "You're losing this now",
      body: `${up.name} just took it from you: your odds went ${100 - pUpThen}% to ${100 - pUpNow}% in the last ${mins} minutes. ${tally(downS, upS)}.` });
    if (up.uid) sends.push({ uid: up.uid, title: "You're winning this now",
      body: `Flipped it on ${down.name}: ${pUpThen}% to ${pUpNow}% in the last ${mins} minutes. ${tally(upS, downS)}. Don't relax.` });
  });
  return { next, sends };
}

export async function runSwingWatch(store) {
  if (!store) return { skipped: 'no blob store' };
  let snap;
  try { snap = await store.get('snapshot', { type: 'json' }); } catch { return { skipped: 'store read failed' }; }
  if (!snap) return { skipped: 'no snapshot yet - open the league app once' };
  if (!snap.swing) return { skipped: 'swing alerts are switched off in the league settings' };
  if (!snap.week || !snap.season) return { skipped: 'no live week' };
  if (!(snap.games || []).length) return { skipped: 'no matchups in the snapshot' };
  if (snap.at && Date.now() - snap.at > 14 * 864e5) return { skipped: 'snapshot too old' };
  let games;
  try { games = await weekBoard(snap.season, snap.week); } catch (e) { return { skipped: String(e.message || e) }; }
  if (!Object.values(games).some(g => g.state === 'in')) return { skipped: 'no game in progress', week: snap.week };
  let stats;
  try {
    const r = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${snap.season}/${snap.week}`);
    if (!r.ok) return { skipped: 'sleeper ' + r.status };
    stats = await r.json();
  } catch { return { skipped: 'sleeper unreachable' }; }
  if (!stats || !Object.keys(stats).length) return { skipped: 'no stats yet' };
  const odds = liveOddsFor(snap, stats, games);
  const key = `sw_${snap.season}_${snap.week}`;
  let marks = {};
  try { marks = (await store.get(key, { type: 'json' })) || {}; } catch {}
  const pass = swingPass(odds, marks, Date.now());
  try { await store.setJSON(key, pass.next); } catch {}
  let sent = 0;
  for (const s of pass.sends) {
    try { if (await pushOne(s.uid, s.title, s.body, snap.url)) sent++; } catch {}
  }
  return { sent, week: snap.week, matchups: odds.map(o => ({ a: o.A.name, b: o.B.name, pA: o.pA, over: o.over })) };
}

/* ============================================================
   BENCH WATCH - the Monday morning shame.

   Once Sunday is in the books, the best lineup each roster could have fielded on the real
   numbers minus what it actually started is the week's bench crime, and the worst offender
   in the league hears about it - once, on the Monday morning the snapshot names, and only if
   it cost ten points or more. Same solver as the app (dedicated slots first, then FLEX) over
   the roster the snapshot carries, slots and all. The app shows the same number on the Home
   shame report and the Sunday sweat card; this is the one that finds you in the morning.
   ============================================================ */
const SLOT_ELIG = { QB:['QB'], RB:['RB','FLEX'], WR:['WR','FLEX'], TE:['TE','FLEX'], K:['K'], DEF:['DEF'] };
export function optimalLineupOf(roster, ptsOf, slots) {
  const cap = k => +((slots || {})[k]) || 0;
  const pool = roster.map(p => ({ p, pts: +ptsOf(p) || 0 })).sort((a, b) => b.pts - a.pts);
  const taken = new Set(); let total = 0;
  ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(slot => {
    for (let n = 0; n < cap(slot); n++) {
      const pick = pool.find(x => !taken.has(x.p.id) && (SLOT_ELIG[x.p.pos] || []).includes(slot));
      if (!pick) break; taken.add(pick.p.id); total += pick.pts;
    }
  });
  for (let n = 0; n < cap('FLEX'); n++) {
    const pick = pool.find(x => !taken.has(x.p.id) && (SLOT_ELIG[x.p.pos] || []).includes('FLEX'));
    if (!pick) break; taken.add(pick.p.id); total += pick.pts;
  }
  return { started: [...taken], total: Math.round(total * 10) / 10 };
}
/* Pure. Every team's bench crime for the week from the snapshot's rosters, worst first. */
export function benchCrimes(snapshot, stats) {
  const r1 = n => Math.round(n * 10) / 10;
  const out = [];
  (snapshot.teams || []).forEach(t => {
    const roster = (t.roster || []).filter(p => p && p.slot !== 'IR');
    if (!roster.length) return;
    const pts = p => r1(+scoreWeek(stats[p.id], p.pos, snapshot.scoring) || 0);
    const starters = roster.filter(p => p.slot && p.slot !== 'BN');
    if (!starters.length) return;
    const actual = r1(starters.reduce((s, p) => s + pts(p), 0));
    const best = optimalLineupOf(roster, pts, snapshot.slots);
    const on = new Set(starters.map(p => p.id));
    const missed = best.started.filter(id => !on.has(id)).map(id => roster.find(p => p.id === id)).filter(Boolean)
      .map(p => ({ name: p.name, pts: pts(p) })).sort((a, b) => b.pts - a.pts);
    const instead = starters.filter(p => !best.started.includes(p.id)).map(p => ({ name: p.name, pts: pts(p) })).sort((a, b) => a.pts - b.pts)[0] || null;
    out.push({ ti: t.ti, uid: t.uid || '', name: t.name || '', actual, best: best.total, left: Math.max(0, r1(best.total - actual)), missed, instead });
  });
  return out.sort((a, b) => b.left - a.left);
}
export function benchText(c, result) {
  const who = c.missed[0] ? `${c.missed[0].name} (${c.missed[0].pts.toFixed(1)}) sat` : 'the points sat';
  const inst = c.instead ? ` while ${c.instead.name} (${c.instead.pts.toFixed(1)}) started` : '';
  const tail = result === 'lost' ? ' You lost. Do the math.' : result === 'won' ? ' You won anyway. Lucky.' : '';
  return { title: 'Bench crime of the week', body: `You left ${c.left.toFixed(1)} on the bench: ${who}${inst}.${tail}` };
}
export async function runBenchWatch(store) {
  if (!store) return { skipped: 'no blob store' };
  let snap;
  try { snap = await store.get('snapshot', { type: 'json' }); } catch { return { skipped: 'store read failed' }; }
  if (!snap) return { skipped: 'no snapshot yet - open the league app once' };
  if (!snap.bench) return { skipped: 'bench alerts are switched off in the league settings' };
  if (!snap.week || !snap.season) return { skipped: 'no live week' };
  if (!snap.benchAt || Date.now() < +snap.benchAt) return { skipped: 'not Monday morning yet', week: snap.week };
  if (snap.at && Date.now() - snap.at > 14 * 864e5) return { skipped: 'snapshot too old' };
  const key = `bs_${snap.season}_${snap.week}`;
  let mark = null;
  try { mark = await store.get(key, { type: 'json' }); } catch {}
  if (mark && mark.sentAt) return { skipped: 'already sent', week: snap.week, to: mark.name };
  let stats;
  try {
    const r = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${snap.season}/${snap.week}`);
    if (!r.ok) return { skipped: 'sleeper ' + r.status };
    stats = await r.json();
  } catch { return { skipped: 'sleeper unreachable' }; }
  if (!stats || !Object.keys(stats).length) return { skipped: 'no stats yet' };
  const crimes = benchCrimes(snap, stats);
  const worst = crimes[0];
  if (!worst || worst.left < 10) {
    try { await store.setJSON(key, { sentAt: Date.now(), name: '', none: true }); } catch {}
    return { sent: 0, week: snap.week, note: 'nobody left ten points on the bench', worst: worst ? { name: worst.name, left: worst.left } : null };
  }
  /* did it cost the game? the matchup's other side, on the same real numbers */
  let result = '';
  const g = (snap.games || []).find(x => x[0] === worst.ti || x[1] === worst.ti);
  if (g) {
    const oppTi = g[0] === worst.ti ? g[1] : g[0];
    const opp = crimes.find(c => c.ti === oppTi);
    if (opp) result = worst.actual > opp.actual ? 'won' : worst.actual < opp.actual ? 'lost' : '';
  }
  const msg = benchText(worst, result);
  let sent = 0;
  if (worst.uid) { try { if (await pushOne(worst.uid, msg.title, msg.body, snap.url)) sent++; } catch {} }
  try { await store.setJSON(key, { sentAt: Date.now(), name: worst.name, left: worst.left, sent }); } catch {}
  return { sent, week: snap.week, worst: { name: worst.name, left: worst.left, missed: worst.missed.slice(0, 2), instead: worst.instead, result } };
}

/* ESPN's scoreboard for the week: {TEAM: kickoffMs}. Cached six hours - the fixture list is
   a fact about the week, and a game moving is a rare enough thing to wait six hours for. */
async function weekKickoffs(store, season, week) {
  const key = `ko_${season}_${week}`;
  try {
    const hit = await store.get(key, { type: 'json' });
    if (hit && hit.at && Date.now() - hit.at < 6 * 3600e3 && hit.map) return hit.map;
  } catch {}
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`);
  if (!r.ok) throw new Error('espn ' + r.status);
  const j = await r.json();
  const map = {};
  (j.events || []).forEach(ev => {
    const t = Date.parse(ev.date); if (!Number.isFinite(t)) return;
    (((ev.competitions || [])[0] || {}).competitors || []).forEach(c => {
      const ab = String((c.team || {}).abbreviation || '').toUpperCase();
      if (ab) map[ESPN_TEAM_FIX[ab] || ab] = t;
    });
  });
  if (Object.keys(map).length) { try { await store.setJSON(key, { at: Date.now(), map }); } catch {} }
  return map;
}

/* the ids with a line in Sleeper's file for the week, cached twenty minutes like the app's own */
async function weekLined(store, season, week) {
  const key = `wl_${season}_${week}`;
  try {
    const hit = await store.get(key, { type: 'json' });
    if (hit && hit.at && Date.now() - hit.at < 20 * 60e3 && Array.isArray(hit.ids)) return new Set(hit.ids);
  } catch {}
  const r = await fetch(`https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`);
  if (!r.ok) throw new Error('sleeper ' + r.status);
  const ids = projectedIds(await r.json());
  if (ids.size) { try { await store.setJSON(key, { at: Date.now(), ids: [...ids] }); } catch {} }
  return ids;
}

/* The scheduled run. Costs nothing outside a kickoff window: it reads the fixture list (cached)
   and returns before touching Sleeper unless some game is inside the lead time. */
export async function runLineupWatch(store) {
  if (!store) return { skipped: 'no blob store' };
  let snap;
  try { snap = await store.get('snapshot', { type: 'json' }); } catch { return { skipped: 'store read failed' }; }
  if (!snap) return { skipped: 'no snapshot yet - open the league app once' };
  if (!snap.lineup) return { skipped: 'lineup alerts are switched off in the league settings' };
  const week = +snap.lineupWeek || +snap.week || 0;
  if (!week || !snap.season) return { skipped: 'no week to check' };
  if (snap.at && Date.now() - snap.at > 14 * 864e5) return { skipped: 'snapshot too old' };

  const leadMs = (Number(snap.lead) > 0 ? Number(snap.lead) : 2) * 3600e3;
  const now = Date.now();
  let kick;
  try { kick = await weekKickoffs(store, snap.season, week); } catch (e) { return { skipped: String(e.message || e) }; }
  const kicks = Object.values(kick).filter(Number.isFinite);
  if (!kicks.length) return { skipped: 'no kickoff times for week ' + week };
  if (!kicks.some(t => t > now && t - now <= leadMs)) return { skipped: 'no kickoff inside the lead time', week };

  let lined = null;
  try { lined = await weekLined(store, snap.season, week); } catch { lined = null; }   /* injury tags and byes still work without it */

  const key = `la_${snap.season}_${week}`;
  let marks = {};
  try { marks = (await store.get(key, { type: 'json' })) || {}; } catch {}
  const pass = lineupPass(snap, lined, kick, marks, now, leadMs);
  if (!pass.sends.length) return { sent: 0, week, checked: (snap.teams || []).length };

  let sent = 0;
  for (const s of pass.sends) {
    const msg = lineupText(s.issues, s.msUntil);
    try { if (await pushOne(s.uid, msg.title, msg.body, snap.url)) sent++; } catch {}
  }
  try { await store.setJSON(key, pass.next); } catch {}
  return { sent, week, teams: pass.sends.length, told: pass.sends.map(s => ({ team: s.team, issues: s.issues.map(i => i.text) })) };
}

/* ============================================================
   INJURY ALERTS - "your guy just went to the tent."

   ESPN's injury feed carries the in-game lines the moment RotoWire posts them: ruled out for
   the rest of the game, questionable to return, back in the game, and ninety minutes before
   kickoff the inactives. Each line is stamped to the minute. The status field says nothing
   about any of it - a man carted off in the second quarter is listed Questionable, which is
   next week's designation - so the line is read for what it says. injNewsClass and injNewsOf
   are a PORT of injNewsClass / injNewsFor in index.html: keep the two in step, so the pill on
   the Game Center board and the push on the phone agree about the same line.

   WHEN. Only while it can matter: any game on the scoreboard in progress, inside two hours
   before a kickoff (the inactives), or within five hours after one; each starter's own window
   is applied afterwards in injNewsOf. The board (ESPN's scoreboard) is one small fetch every
   run; the injury file - nine megabytes parsed - is only pulled when a game is near, with a
   timeout so a slow ESPN cannot hold the whole run. The week is the snapshot's live week, or
   before the opener the week the lineups are set for, so Thursday night's inactives are caught.

   WHO. The manager starting him, once per line. Marks in inj_{season}_{week} are keyed by
   manager and player and hold the stamp of the last line sent, so the same line never goes
   twice and a later line ("has returned") does. A line is marked when OneSignal takes it, so a
   send that fails is tried again next run - until the line is older than INJ_STALE_MS, when it
   is marked unsent: the watcher was down or just deployed, and by now the manager has heard.
   "Active" is only news for a man who carried a designation into the day.
   ============================================================ */
const INJ_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
const INJ_LEAD_MS = 2 * 3600e3, INJ_TAIL_MS = 5 * 3600e3, INJ_STALE_MS = 45 * 60000;

/* the app's normName, so "Tyrone Tracy Jr." on the feed meets "Tyrone Tracy" in the snapshot */
export function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/[.'’\-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/* Pure. What a line says: out, back, q (hurt, being looked at), and before kickoff only
   inactive or ok. Anything else - every post-game recap - is null. */
export function injNewsClass(txt, pre) {
  const t = String(txt || ''); if (!t) return null;
  if (/ruled out for the (rest|remainder)|will not return|won't return|is out for the (rest|remainder)|not return to (sunday|monday|thursday|saturday|friday|the) |downgraded to out|did not return|didn't finish|did not finish|unable to (finish|return)/i.test(t)) return 'out';
  if (/has returned to|returned to (sunday|monday|thursday|saturday|friday|the) |cleared to return|back in the game|re-?entered (sunday|monday|thursday|saturday|friday|the) /i.test(t) && !/practice/i.test(t)) return 'back';
  if (/questionable to return|doubtful to return|being evaluated|is being looked at|(went|headed|walked|taken) to the (locker room|medical tent|blue tent|sideline tent|injury tent)|left (sunday|monday|thursday|saturday|friday|the) .*game|exited (sunday|monday|thursday|saturday|friday|the) .*game|carted|concussion protocol|limped off|in the (blue |medical |injury )?tent/i.test(t)) return 'q';
  if (pre) {
    if (/is inactive|inactive for|will not play|won't play|ruled out for (sunday|monday|thursday|saturday|friday)'s|(is|has been ruled) out for (sunday|monday|thursday|saturday|friday)'s/i.test(t)) return 'inactive';
    if (/is active for|will play (sunday|monday|thursday|saturday|friday|in|against|vs)|expected to play|good to go|will start|is expected to start|cleared to play/i.test(t)) return 'ok';
  }
  return null;
}

/* the feed, reduced to what the pass reads, keyed by normalised name */
export function injuryMap(feed) {
  const map = {};
  ((feed || {}).injuries || []).forEach(t => (t.injuries || []).forEach(i => {
    const nm = i && i.athlete && i.athlete.displayName; if (!nm) return;
    const k = normName(nm); if (!k) return;
    map[k] = { status: i.status || '', short: i.shortComment || '', long: i.longComment || '', date: i.date || '',
               where: (i.details && i.details.type) || '' };
  }));
  return map;
}

/* Pure. What the feed says about one starter's game, or null. `e` is his feed entry, `g` his
   team's board entry {kick, state}. */
export function injNewsOf(pl, e, g) {
  if (!pl || pl.pos === 'DEF' || !g || !Number.isFinite(g.kick)) return null;
  if (!e || !e.date) return null;
  const at = Date.parse(e.date); if (!Number.isFinite(at)) return null;
  if (at < g.kick - INJ_LEAD_MS || at > g.kick + INJ_TAIL_MS) return null;
  const pre = at < g.kick;
  const note = e.short || e.long || '';
  const cls = injNewsClass(note, pre); if (!cls) return null;
  /* the body part: the feed's field, else the "(calf)" the line itself opens with */
  let where = String(e.where || '');
  if (!where || /not specified|undisclosed/i.test(where)) { const m = note.match(/^\S+(?: \S+)? \(([a-z ,/-]{3,24})\)/i); where = m ? m[1] : ''; }
  return { cls, pre, at, where: where.toLowerCase(), note };
}

/* the words: a title that fits a lock screen (OneSignal keeps 60 characters), the line itself
   without the reporter's byline, and what it means for the lineup - which depends on the clock:
   before kickoff he can still be swapped, after it the zero is locked in. The body is kept under
   the 180 characters OneSignal keeps, cut at a word, so the clause always survives. */
export function injuryText(pl, n) {
  const name = pl.name || 'Your starter';
  const w = n.where ? ` (${n.where})` : '';
  let line = String(n.note || '').trim()
    .replace(/,\s+[A-Z][^,]{2,50}\s+(?:of|for)\s+[^,]{3,80}\s+reports?\.?\s*$/, '.')   /* ", Adam Schefter of ESPN reports." */
    .replace(/,\s+per\s+[^,]{3,80}\.?\s*$/i, '.');                                        /* ", per the NFL's transaction log." */
  if (line && !/[.!?…]$/.test(line)) line += '.';
  const title = { out: `${name} is out${w}`, q: `${name} is hurt${w}`, back: `${name} is back in the game`,
                  inactive: `${name} is inactive`, ok: `${name} is active` }[n.cls];
  const tail = (n.cls === 'out' || n.cls === 'inactive') ? (n.pre ? ' Swap him or eat the zero.' : " That's a zero from here.")
             : n.cls === 'q' ? ' Watch this one.' : n.cls === 'back' ? ' Breathe.' : '';
  const room = 180 - tail.length;
  if (line.length > room) line = line.slice(0, room - 1).replace(/\s+\S*$/, '') + '…';
  return { title: String(title || name).slice(0, 60), body: (line + tail).trim() };
}

/* Pure. Who hears what, and the marks to keep. A stale line is marked here; a line that goes
   out is marked by the runner once OneSignal takes it, so a send that fails is tried again on
   the next run until the line goes stale. */
export function injuryPass(snapshot, map, games, marks, now) {
  const next = JSON.parse(JSON.stringify(marks || {}));
  const sends = [];
  (snapshot.teams || []).forEach(team => {
    if (!team.uid) return;
    (team.players || []).forEach(pl => {
      const g = (games || {})[String(pl.nfl || '').toUpperCase()];
      const n = injNewsOf(pl, (map || {})[normName(pl.name)], g);
      if (!n) return;
      if (n.cls === 'ok' && !pl.inj) return;               /* "active" is only news after a designation */
      const key = `${team.uid}:${pl.id}`;
      if ((+next[key] || 0) >= n.at) return;             /* this line, or a later one, already sent */
      if (now - n.at > INJ_STALE_MS) { next[key] = n.at; return; }   /* old news when first seen: marked, not sent */
      const msg = injuryText(pl, n);
      sends.push({ uid: team.uid, team: team.name || '', player: pl.name || '', cls: n.cls, key, at: n.at, title: msg.title, body: msg.body });
    });
  });
  return { next, sends };
}

export async function runInjuryWatch(store) {
  if (!store) return { skipped: 'no blob store' };
  let snap;
  try { snap = await store.get('snapshot', { type: 'json' }); } catch { return { skipped: 'store read failed' }; }
  if (!snap) return { skipped: 'no snapshot yet - open the league app once' };
  if (!snap.injury) return { skipped: 'injury alerts are switched off in the league settings' };
  /* the live week - or, before the opener kicks off (currentNflWeek() is 0 until it does), the
     week the lineups are set for, so Thursday night's inactives are not missed */
  const week = +snap.week || +snap.lineupWeek || 0;
  if (!week || !snap.season) return { skipped: 'no week to check' };
  if (snap.at && Date.now() - snap.at > 14 * 864e5) return { skipped: 'snapshot too old' };
  let games;
  try { games = await weekBoard(snap.season, week); } catch (e) { return { skipped: String(e.message || e) }; }
  const now = Date.now();
  const near = Object.values(games).some(g => g.state === 'in' || (now >= g.kick - INJ_LEAD_MS && now <= g.kick + INJ_TAIL_MS));
  if (!near) return { skipped: 'no game near', week };
  let map;
  try {
    const r = await fetch(INJ_URL, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { skipped: 'espn injuries ' + r.status };
    map = injuryMap(await r.json());
  } catch (e) { return { skipped: 'espn injuries unreachable: ' + String(e && e.name || e) }; }
  if (!Object.keys(map).length) return { skipped: 'empty injury file' };
  const key = `inj_${snap.season}_${week}`;
  let marks = {};
  try { marks = (await store.get(key, { type: 'json' })) || {}; } catch {}
  const pass = injuryPass(snap, map, games, marks, now);
  let sent = 0;
  for (const s of pass.sends) {
    let ok = false;
    try { ok = await pushOne(s.uid, s.title, s.body, snap.url); } catch {}
    if (ok) { sent++; pass.next[s.key] = Math.max(+pass.next[s.key] || 0, s.at); }   /* taken: this line is done */
  }
  try { await store.setJSON(key, pass.next); } catch {}
  return { sent, week, lines: Object.keys(map).length, told: pass.sends.map(s => ({ team: s.team, player: s.player, title: s.title })) };
}
