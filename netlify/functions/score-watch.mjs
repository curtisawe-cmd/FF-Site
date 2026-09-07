/* ============================================================
   Bitch Boy League — the scheduled score watcher.

   Netlify runs this on the cron below with nobody's app open, which is the whole point: the
   in-app watcher could only fire while somebody was looking, and that is not most of a Sunday.

   It works from the snapshot the app posts to push.mjs — the week, the scoring rules, and each
   team's starters with the manager to tell. No database credential goes anywhere near it: it is
   told what it needs rather than handed the keys to go and read it.

   The schedule lives here in code, not in a dashboard, so it deploys with the repo. Every two
   minutes costs nothing on a day with no football: with no live week in the snapshot the run
   returns before fetching anything at all.
   ============================================================ */

import { getStore } from '@netlify/blobs';
import { runScoreWatch, runLineupWatch, runSwingWatch, runBenchWatch } from './lib/score.mjs';

export default async () => {
  let store = null;
  try { store = getStore('bbl'); } catch { /* reported by runScoreWatch */ }
  const result = await runScoreWatch(store);
  /* the lineup check rides the same beat: it is free outside a kickoff window, and the window
     is when it matters */
  let lineup;
  try { lineup = await runLineupWatch(store); } catch (e) { lineup = { error: String(e && e.message || e) }; }
  /* and the swing watch, which returns before fetching anything unless a game is in progress */
  let swing;
  try { swing = await runSwingWatch(store); } catch (e) { swing = { error: String(e && e.message || e) }; }
  /* and the Monday morning bench crime, which is one read of the store until its hour comes */
  let bench;
  try { bench = await runBenchWatch(store); } catch (e) { bench = { error: String(e && e.message || e) }; }
  /* Netlify keeps these in the function log, which is where to look when a Sunday goes quiet */
  console.log('[BBL score-watch]', JSON.stringify({ ...result, lineup, swing, bench }));
  return new Response(JSON.stringify({ ...result, lineup, swing, bench }), { headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '*/2 * * * *' };
