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
import { runScoreWatch } from './lib/score.mjs';

export default async () => {
  let store = null;
  try { store = getStore('bbl'); } catch { /* reported by runScoreWatch */ }
  const result = await runScoreWatch(store);
  /* Netlify keeps these in the function log, which is where to look when a Sunday goes quiet */
  console.log('[BBL score-watch]', JSON.stringify(result));
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};

export const config = { schedule: '*/2 * * * *' };
