/*
 * Bitch Boy League — custom scoring engine
 * Converts a Sleeper weekly stat object into fantasy points using the league's
 * own scoring values (the S.scoring object from the app / league.json).
 *
 * Used by BOTH:
 *   - the browser app (live/projected points), and
 *   - the weekly GitHub Action (official scoring).
 *
 * Sleeper weekly stats:  https://api.sleeper.app/v1/stats/nfl/regular/{season}/{week}
 *   -> map of sleeperPlayerId -> statObject
 *
 * Field-name confidence:
 *   [confirmed] verified against real 2024 week-1 data
 *   [standard]  Sleeper's documented schema, to re-verify against a real K/DST line
 *   [approx]    Sleeper only exposes the LONGEST play, not a count — see notes
 */

const num = (s, k) => { const v = s && s[k]; return typeof v === 'number' ? v : 0; };

/* league scoring key  ->  how many "units" of that rule the stat line earned */
const UNITS = {
  // ---- passing [confirmed] ----
  "Passing yards (per yd)": s => num(s, 'pass_yd'),
  "Passing TD":            s => num(s, 'pass_td'),
  "Interception thrown":   s => num(s, 'pass_int'),
  "Sacked":                s => num(s, 'pass_sack'),
  "400+ pass yds bonus":   s => num(s, 'pass_yd') >= 400 ? 1 : 0,
  "50+ yd pass TD bonus":  s => num(s, 'pass_td_50p') || (num(s, 'pass_td_lng') >= 50 ? 1 : 0), // [approx]

  // ---- rushing [confirmed] ----
  "Rushing attempt":       s => num(s, 'rush_att'),
  "Rushing yards (per yd)":s => num(s, 'rush_yd'),
  "Rushing TD":            s => num(s, 'rush_td'),
  "50+ yd rush TD bonus":  s => num(s, 'rush_td_50p') || (num(s, 'rush_td_lng') >= 50 ? 1 : 0), // [approx]
  "100-199 rush yds bonus":s => (num(s, 'rush_yd') >= 100 && num(s, 'rush_yd') < 200) ? 1 : 0,
  "200+ rush yds bonus":   s => num(s, 'rush_yd') >= 200 ? 1 : 0,

  // ---- receiving [confirmed] ----
  "Reception":             s => num(s, 'rec'),
  "Receiving yards (per yd)":s => num(s, 'rec_yd'),
  "Receiving TD":          s => num(s, 'rec_td'),
  "50+ yd rec TD bonus":   s => num(s, 'rec_td_50p') || (num(s, 'rec_td_lng') >= 50 ? 1 : 0), // [approx]
  "200+ rec yds bonus":    s => num(s, 'rec_yd') >= 200 ? 1 : 0,

  // ---- misc offense ----
  "Kick/punt return TD":   s => num(s, 'kr_td') + num(s, 'pr_td'),        // [standard]
  "Fumble recovered for TD":s => num(s, 'fum_rec_td'),                    // [standard]
  "Fumble lost":           s => num(s, 'fum_lost'),                        // [confirmed]
  "2-pt conversion":       s => num(s, 'pass_2pt') + num(s, 'rush_2pt') + num(s, 'rec_2pt'), // [standard]

  // ---- kicking [standard — re-verify vs a real K line] ----
  "PAT made":              s => num(s, 'xpm'),
  "PAT missed":            s => num(s, 'xpmiss'),
  "FG 0-19":               s => num(s, 'fgm_0_19'),
  "FG 20-29":              s => num(s, 'fgm_20_29'),
  "FG 30-39":              s => num(s, 'fgm_30_39'),
  "FG 40-49":              s => num(s, 'fgm_40_49'),
  "FG 50+":                s => num(s, 'fgm_50p'),
  "FG missed 0-19":        s => num(s, 'fgmiss_0_19'),
  "FG missed 20-29":       s => num(s, 'fgmiss_20_29'),

  // ---- team defense / special teams [standard — re-verify vs a real DST line] ----
  "DST sack":              s => num(s, 'sack'),
  "DST interception":      s => num(s, 'int'),
  "DST fumble recovered":  s => num(s, 'fum_rec'),
  "DST fumble forced":     s => num(s, 'ff'),
  "DST safety":            s => num(s, 'safe'),
  "DST TD":                s => num(s, 'def_td'),
  "DST kick/punt return TD":s => num(s, 'st_td') || (num(s, 'kr_td') + num(s, 'pr_td')),
  "DST 2-pt return":       s => num(s, 'def_2pt'),
  "Points allowed 0":      s => (num(s, 'pts_allow') === 0 && hasDef(s)) ? 1 : 0,
  "Points allowed 1-6":    s => bucket(s, 1, 6),
  "Points allowed 7-13":   s => bucket(s, 7, 13),
  "Points allowed 14-20":  s => bucket(s, 14, 20),
  "Points allowed 21-27":  s => bucket(s, 21, 27),
  "Points allowed 28-34":  s => bucket(s, 28, 34),
  "Points allowed 35+":    s => (hasDef(s) && num(s, 'pts_allow') >= 35) ? 1 : 0,
  "Under 100 total yds allowed": s => (hasDef(s) && num(s, 'yds_allow') < 100) ? 1 : 0,
  "100-199 yds allowed":   s => (hasDef(s) && num(s, 'yds_allow') >= 100 && num(s, 'yds_allow') < 200) ? 1 : 0,
  "500+ yds allowed":      s => (hasDef(s) && num(s, 'yds_allow') >= 500) ? 1 : 0,

  // ---- optional / off-by-default rules (0-valued unless the league turns them on) ----
  "TE premium (per reception)": s => num(s, 'rec'),   // only applied to TEs by caller if desired
  "Rushing first down":    s => num(s, 'rush_fd'),
  "Receiving first down":  s => num(s, 'rec_fd'),
  "Completion":            s => num(s, 'pass_cmp'),
  "Incompletion":          s => num(s, 'pass_att') - num(s, 'pass_cmp'),
  "300-399 pass yds bonus":s => (num(s, 'pass_yd') >= 300 && num(s, 'pass_yd') < 400) ? 1 : 0,
  "40+ yd TD bonus":       s => 0, // [approx] needs play-level; left 0
  "Pick-six thrown":       s => num(s, 'pass_int_td'),
};

/* Only a TEAM DEFENSE stat line carries `pts_allow`. Offensive players also have a
 * `sack` field (their own defensive-stat slot, usually 0), so we must key off
 * `pts_allow` specifically — otherwise every skill player would collect the
 * points-allowed bonuses. (Bug caught in real 2024 data during Phase-1 verification.) */
function hasDef(s){ return !!s && ('pts_allow' in s); }
function bucket(s, lo, hi){ if(!hasDef(s)) return 0; const p = num(s,'pts_allow'); return (p >= lo && p <= hi) ? 1 : 0; }

/* score one player's stat line against the league rules -> { total, breakdown } */
function scorePlayer(stat, rules){
  let total = 0; const breakdown = {};
  for(const key in rules){
    const val = rules[key];
    if(!val) continue;                 // rule worth 0 -> skip
    const unitFn = UNITS[key];
    if(!unitFn) continue;              // unmapped rule -> skip (logged by caller if desired)
    const units = unitFn(stat) || 0;
    if(!units) continue;
    const pts = units * val;
    total += pts;
    breakdown[key] = { units, pts: round2(pts) };
  }
  return { total: round2(total), breakdown };
}

/* sum a team's STARTERS for a week.
 * starters: [{ playerId, sleeperId, pos }], statsBySleeperId: map, rules: league scoring */
function scoreTeamWeek(starters, statsBySleeperId, rules){
  let total = 0; const lines = [];
  for(const p of starters){
    const stat = p.sleeperId ? statsBySleeperId[p.sleeperId] : null;
    const r = stat ? scorePlayer(stat, rules) : { total: 0, breakdown: {} };
    total += r.total;
    lines.push({ ...p, points: r.total, matched: !!stat });
  }
  return { total: round2(total), lines };
}

function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }

/* dual export: ES module (Action) + browser global */
const FFLScoring = { UNITS, scorePlayer, scoreTeamWeek };
if (typeof module !== 'undefined' && module.exports) module.exports = FFLScoring;
if (typeof globalThis !== 'undefined') globalThis.FFLScoring = FFLScoring;
export { UNITS, scorePlayer, scoreTeamWeek };
export default FFLScoring;
