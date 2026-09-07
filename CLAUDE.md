# Bitch Boy League - Fantasy Football Site

A single-file fantasy football app for Curtis's 14-year league. Vanilla HTML/CSS/JS,
no build step, no bundler. The entire app is `index.html` (~7,100 lines, ~456 KB). Open it
in a browser to preview; that is the whole dev loop. It is also an installable PWA and
sends push notifications, which adds a handful of small files around it (see Layout).

Repo: https://github.com/curtisawe-cmd/FF-Site (remote `origin`, branch `main`)
Live: https://bitchboyleague.com (Netlify, auto-deploys from `main`, served from `/` root)
Also still live at https://curtisawe-cmd.github.io/FF-Site/ - GitHub Pages was not switched
off, so old bookmarks keep working. Both are on the Firebase authorized-domain list, which
is what sign-in checks; a domain missing from it fails only at sign-in, never on a read.

## This folder is the only working copy

`Desktop\FF Site\index.html` is the file that deploys. Push to `main` and Netlify
publishes it, the same way the Bud's site works.

There is an archive folder at `Desktop\Website Stuff\Fantasy FB\` holding dated
`league.backup.*.html` snapshots and source art. **Never edit those and never copy one
back over `index.html` without diffing first.** The app used to live there as
`league.html` and the two copies silently drifted; that was resolved on 2026-07-30 by
making this repo authoritative. See `README.txt` in that folder.

## Layout

| Path | Tracked | What it is |
| --- | --- | --- |
| `index.html` | yes | The entire app. Markup, CSS, and JS all inline. |
| `sw.js` | yes | Offline service worker, scope `/` on the real domain. Network-first for the page. |
| `manifest.json` | yes | PWA manifest. Standalone, portrait, navy theme, three shortcuts. |
| `icon-192/512`, `icon-maskable-512`, `apple-touch-icon` | yes | Install icons. |
| `push/*.js` | yes | The Cloudflare version of the relay and watcher. NOT what is deployed - `netlify/functions/` is. Kept as the alternative if the site ever leaves Netlify. |
| `push/onesignal/OneSignalSDK*.js` | yes | OneSignal's service worker, in its own folder so it cannot evict `sw.js`. |
| `netlify.toml` | yes | Netlify config: publish `.`, no build, SPA fallback, functions dir, no-cache headers on the page and `sw.js`. This is what serves the site. |
| `netlify/functions/push.mjs` | yes | Push endpoint at `/.netlify/functions/push`. Sends, takes the score snapshot, runs the watcher on demand. Holds no key itself - the OneSignal key is a Netlify env var. |
| `netlify/functions/score-watch.mjs` | yes | Scheduled watcher. Cron lives in the file, so it deploys with the repo. Fires score alerts with every app in the league shut. |
| `netlify/functions/lib/score.mjs` | yes | Weekly scoring + the alert rule, shared by both functions. A PORT of `scoreWeekStats`; a harness runs 4000 random stat lines through both and fails on any drift. |
| `package.json` | yes | Exists only so Netlify installs `@netlify/blobs` for the functions. The site itself still has no build step. |
| `README.md` | yes | Repo readme. |
| `.claude-plugin/marketplace.json` | yes | Unrelated. This repo doubles as a Claude Code plugin marketplace. |
| `.claude/` | no | Gitignored. |
| `designer-portfolio/` | no | A separate project that happens to live in this folder. Gitignored. It was swept in once by a `git add -A`; stage files by name. |

## Architecture

One file, three layers, in this order:

1. **Markup** - 12 `section.view` blocks, one per page, toggled by `showView(name)`.
   Views with nav tabs (`data-view="..."`): `home matchups teams players draft trades chat
   stats settings`. Views with **no nav tab**, reached only from in-page buttons
   (`onclick="showView('recaps')"`): `history polls recaps`. Easy to miss when auditing nav.
2. **State + logic** - a single `S` object is the league state. `DEFAULTS` (line ~1338)
   seeds it. Settings are staged: edits set `window.settingsDirty` and only sync on Apply.
3. **Firebase module** - the last `<script type="module">` at the bottom. Everything
   above talks to it through the `window.FB` facade, never through raw SDK imports.

`window.currentView` (set in `showView`) gates re-renders so background views don't
repaint.

## Firebase

Project `bitch-boy-league`, Realtime Database + Auth (email/password and Google popup),
SDK 10.12.5 loaded from gstatic CDN. The config block is public by design - Firebase web
API keys are client-side identifiers, not secrets. Access is controlled by database rules.

`window.FB` wraps everything: `dbGet dbSet dbUpdate dbRemove dbOn dbOnLast`, plus
`signup login google logout` and `now` (server timestamp). **Use these helpers.** Don't
import from the SDK anywhere else.

Data lives under `league/main/` (`LEAGUE_ID = 'main'`, line ~2049):

```
league/main/settings     league/main/teamData/{ti}    league/main/draft
league/main/liveScores   league/main/teamMoves        league/main/tradeOffers
league/main/tradeVetoes  league/main/polls            league/main/pollVotes
admins/{uid}   managers/{uid}   claims/{...}
```

`settings` is stored as a **JSON string**, not a nested object, because arbitrary setting
keys (e.g. `"Fractional / negative points"`) contain characters the Realtime Database
rejects in key names. Don't "fix" this by nesting it.

`applyingRemote` guards against write-echo loops when a remote change arrives. Check it
before pushing.

## Roles

- `COMMISH_EMAIL = 'curtisawe@gmail.com'` - commissioner, has admin.
- `ADMIN_HASH` / `TAB_FLASH_HASH` are **integer hashes of passcodes**, not the passcodes.
  Change one by setting it to `hashStr('yournewpass')`, not by typing a string.
- Only admins write shared settings and the real draft. Everyone signed in gets a live
  read mirror. Per-team writes are additive moves (`teamMoves`), not overwrites.
- Managers can **see** Settings but not edit it. `lockSettingsForViewers()` disables the
  inputs and must run **last** in the settings render, because the sections above rebuild
  themselves. It only re-enables what it locked, so a deliberately disabled control stays
  disabled. Draft, trade and trash-talk alarm fields are hidden from managers entirely.
- `viewingAsManager()` / `toggleViewAs()` let a real commissioner preview the manager view.
  While it is on, `isAdmin()` is false - worth remembering when a permission bug only
  reproduces on one device.

**The commissioner can manage any roster.** My Team carries a bar for admins (`commishBarHTML`)
with a team select; `commishManage(ti)` sets `window.commishAs` (memory only - it resets on
reload on purpose, so nobody stays pointed at someone else's team by accident) and the page
renders that team with the same lineup selects, add-with-drop and free-agent list a manager
gets, outlined in red. `commishAsTeam()` is the switch; `addTargetTeam()` (Players, Pickups,
waiver claims) follows it, so every Add and Claim goes to the managed team. Writes are
unchanged: `canEditTeam` already said yes to an admin, moves are logged under the admin's uid
with `admin:true`, and `lockGuard` still asks before pushing through a locked move.

**Role is per device.** `isAdmin()` reads `ffl_role` from that browser's localStorage and is
not synced, so the same account can be commissioner on a laptop and a viewer on a phone.
That asymmetry explains most "it works for me" reports.

A manager's team comes from `myTeamIndex()`. It prefers `window.myClaim` (a one-shot
`dbGet`) and falls back to the streamed `managersMap`. The fallback is load-bearing: the
one-shot read can resolve *after* a view has drawn, and a null team index silently strips a
manager's own controls - it hid the Accept/Counter buttons on trades aimed at them. Anything
gated on team identity must re-render when the claim arrives.

## Push notifications

Seven triggers only, and nothing else should be added without asking: **new chat message**
(everyone but the authors, batched 4s), **trade offer** (the recipient only), **trade
accepted** (everyone), **score alerts** (a manager's own starter scores, from the scheduled
watcher), **lineup alerts** (a manager's own starter is out / on bye / not projected, or a
slot is empty, `lineupLead` hours before kickoff - added 2026-09-06, see Lineup alerts below)
**swing alerts** (a matchup's live odds move 25 points in 20 minutes while a game is on,
both managers, from the scheduled watcher - added 2026-09-07, see Swing alerts below) and the
**bench crime push** (Monday 9am to the week's worst offender, ten points or more, from the
scheduled watcher - added 2026-09-07, see Bench watch below).

The chain has five links and every one of them broke at least once on 2026-08-01. In order:

```
index.html  ->  Cloudflare Worker  ->  OneSignal  ->  device
   sendPush()     holds REST key      segment/alias    service worker
```

- `ONESIGNAL_APP_ID` is public and committed on purpose. **The REST key is not** - it lives
  only as a Cloudflare secret. Never put it in this repo, in a browser, or in chat.
- OneSignal's API refuses browser requests outright (CORS). The relay is not optional
  plumbing; it is the only way a send can happen at all.
- The relay URL is a league setting (Settings > Push notifications), stored in Firebase.
- `POST {"diag":true}` to the Worker reports key length, whether the secret has stray
  whitespace, and whether the App ID is well-formed - without ever revealing the key. Use
  it before theorizing.
- The "everyone" segment is `SEGMENTS` in the Worker, most current name first. Newer
  OneSignal accounts have **`Total Subscriptions`, not `Subscribed Users`**. Aiming at a
  segment that does not exist returns HTTP **200** with
  `{"errors":["All included players are not subscribed"]}`, which is indistinguishable from
  having no subscribers. Retry on the error body, never on the status.
- OneSignal's own worker imports `OneSignalSDK.sw.js`. The v15 name `OneSignalSDKWorker.js`
  404s, and because the local file still serves 200 the only symptom is
  `NetworkError: Load failed`.
- `serviceWorkerPath` is resolved against the **origin**, not the page - on a project site
  it must include `/FF-Site/`. Both it and the dashboard's Site URL must agree.
- **Browser permission is not a subscription.** `Notifications.permission` can be granted
  on a device OneSignal has never registered. Gate UI on
  `User.PushSubscription.optedIn && .id`, and note the `id` lands *after* `init()` resolves,
  so repaint on the `change` event or the button lies.
- Deliberate opt-out is remembered per device in `localStorage.bblPushOff`, because it is
  otherwise identical to the broken state the load-time self-heal exists to repair.

**Only the commissioner's device sends** (`if(!relay || !isAdmin()) return`) - otherwise 12
open apps would fire 12 copies. The cost is that notifications go out only while Curtis has
the app open. Moving the trigger server-side is the known fix and is not done yet.

Changing `push/cloudflare-worker.js` does nothing until it is **pasted into the Cloudflare
dashboard and deployed by hand**. Pushing to git does not deploy it.

### Lineup alerts

`runLineupWatch` in `netlify/functions/lib/score.mjs`, run by `score-watch.mjs` on the same
two-minute cron as the score watcher and on demand with `POST {lineupNow:true}` (Settings >
"Check lineups now"). It works from the **same snapshot** the score watcher reads, which now
carries each starter's `nfl`, `inj` and `bye`, each team's `open` (empty starting slots), and
`lineup` / `lineupWeek` / `lead` from the settings. `lineupWeek` is `projWeekNow()` - week 1
all preseason - so the Thursday opener gets its warning even though `currentNflWeek()` is
still 0 until kickoff.

- **When:** an issue is due inside `lead` hours before its player's own kickoff (ESPN
  scoreboard, cached 6h in the blob `ko_{season}_{week}`). A bye or an empty slot rides the
  next kickoff of the week that has not happened. Marks in `la_{season}_{week}` mean one
  manager hears about one problem once a week.
- **What counts:** an `inj` tag in `OUT_TAGS` (Out, IR, PUP, Sus...), Doubtful, on bye, or
  no stat line in Sleeper's weekly projection file (`projectedIds`, cached 20m in
  `wl_{season}_{week}`). Sleeper unreachable = injury tags and byes still work.
- **Snapshots now come from any signed-in device**, not just a commissioner's
  (`checkScoreAlerts`). The check is only as fresh as the last snapshot, and a manager fixing
  his lineup on his own phone is exactly the device that should tell the relay.
- The in-app twin is `lineupIssues(ti)` / `lineupWarningHTML(ti)` on the team page, which
  gained the same `out` category (injury tag or no weekly line) beside empty and bye.
- The Cloudflare copy in `push/score-watch.js` does **not** have this; only the Netlify one.

### Swing alerts

`runSwingWatch` in `netlify/functions/lib/score.mjs`, on the same two-minute cron and on demand
with `POST {swingNow:true}` (Settings > "Check swings now"). It returns before fetching Sleeper
unless ESPN's scoreboard (`weekBoard`, live, never cached) shows a game in progress. The
snapshot now carries `games` (this week's matchups by team index), `swing` (the setting) and
each starter's `proj` (this week's line; 0 when the posting device had no file, and
`checkScoreAlerts` kicks `loadWeekProj` so the next post has it). `liveOddsFor(snapshot,
stats, games)` is a port of the app's `liveWinModel` - keep the two in step. `swingPass` keeps
an hour of readings per matchup in `sw_{season}_{week}` and fires when the reading nearest
20 minutes ago differs by 25+ points: "You're losing this now" to the side losing it, "You're
winning this now" to the other, at most once per matchup per 30 minutes, never before kickoff
(`pre`) or after the last whistle (`over`). Setting `S.swingAlerts` (default on); the
Cloudflare copy does not have it.

## PWA and mobile

Mobile is the layout that matters - the league uses this on phones. Installed via Add to
Home Screen; on iOS that step is **mandatory**, since Safari tabs cannot receive push at
all, and it needs iOS 16.4+.

`sw.js` is network-first for the page. Cache-first would serve a stale app after every
push. Network-first alone was not enough either: GitHub Pages sends `max-age`, so the
worker's own `fetch` was answered from the browser HTTP cache and still served the old app.
Pages are fetched with `cache:'reload'` to force revalidation. Live data hosts (Firebase,
Sleeper, ESPN) are never cached.

On phones (<=640px) the header is two rows - brand + kickoff chip, then tabs - and
`placeHeaderBits()` **moves** `#authBtn` and the `.subbar` switches ribbon into `#navDrawer`
behind the burger (moved back above 640px). Moved, not copied: the JS finds those controls by
id. If Sign in or a toggle "is missing" on a phone, it is in the drawer. Sub-tab strips
(`.subnav .musub .statssub .chatsub .spage-tabs`) render as one scrolling underline row there.
`html,body{overscroll-behavior-y:none}` is what keeps the pinned header and title blocks from
riding the rubber-band when the page is pulled down; it needs iOS 16+.

Safe-area insets are hoisted into `--sa-t/r/b/l` on `:root` and composed into padding with
`calc()`. A mobile media query that sets `padding` outright will wipe them and the header
disappears under the notch - that happened once.

Settings > Push notifications has **Force update**, which unregisters service workers,
clears caches and reloads. It is the reliable way to get a phone onto a new build; a plain
refresh often is not. `BUILD_STAMP` is shown right below it so the running build is
visible - "I pushed but don't see it" has bitten more than once.

## External data

All read-only, all unauthenticated, all cached with a TTL. No API keys.

| Source | Used for | Cache |
| --- | --- | --- |
| `api.sleeper.app/v1/players/nfl` | player pool | `POOL_REFRESH_MS` 4h |
| `api.sleeper.app/v1/stats/nfl/regular/{yr}` | season + weekly stats | `STATS_TTL_MS` 3m (in-progress week only) |
| `api.sleeper.app/v1/projections/nfl/regular/2026` | season projections (draft value, player card bar) | - |
| `api.sleeper.app/v1/projections/nfl/regular/2026/{wk}` | weekly projections (everything that says "proj") | `PROJ_TTL_MS` 20m (this week and later; played weeks final) |
| `site.api.espn.com/.../football/nfl/injuries` | injury report | `ESPN_TTL_MS` 20m |
| `sleepercdn.com/content/nfl/players/thumb/{id}.jpg` | player faces | browser |
| `sleepercdn.com/images/team_logos/nfl/{tm}.png` | DEF logos | browser |

**Projections are weekly.** `projWeekPoints(pid, pos, wk)` scores Sleeper's file for week `wk`
(default `projWeekNow()`: week 1 all preseason, this week in season) through the league's own
rules (`scoreSeasonStats` with `games = 1`). Every player is in every week's file; one who is
out, on IR or on bye has no stat line, so he projects **null** - a dash, counted as 0 in a
team total - never a fabricated number. A Questionable player carries a reduced line. Files
live in `PROJ_WEEKS` keyed by week (`loadWeekProj`), refetched on the one-minute pulse once
`PROJ_TTL_MS` (20m) is up, and the page redraws only if the numbers moved (`maybeRefreshWeekProj`).
Game Center's "refresh now" forces it. Matchups and Game Center project the **selected** week
and hold the number back (`projWeekReady`) until that week's file is in, so a week-7 matchup
already has week 7's byes out of it and never flashes a season average first. Only with no
weekly file at all (offseason, fetch failed) does `projWeekPoints` fall back to the season file
divided by games played.

The season file (`STAT_CACHE.proj`) is still what the draft-value order (`seasonProjPts`) and
the player card's '26 bar read - those are season questions. A **defence** is scored through
`scoreWeekStats` (`scoreSeasonDef`) so the points-allowed tiers apply - `slimSeason` used to
drop every DEF for lacking offensive fields, and they all projected 0.
`projectedTotal(ti)` reads **`ensureLineup(ti)`**, the same seeded lineup every roster page
draws, never the raw `S.lineups` map: a player with no entry counted as benched, and a lineup
pushed mid-draft with one starter made a team project 17 while its page showed a full lineup.
`ensureLineup` now pushes anything it seeds (`queueLineupPush`) when the device may edit the
team, so the stored map stops being partial.

Auto-scoring polls every `AUTOSCORE_EVERY_MS` (3m, on a 1m pulse) and is crowd-computed: whichever
member has the app open keeps the board current. Don't assume a server is doing it.

`playerFace(p, size)` is deliberately **shape-agnostic** - it reads `p.id||p.playerId`
and `p.team||p.nfl`, because roster picks and pool players use different field names.
Passing a pick to a version that only read `p.id` produced `.../thumb/undefined.jpg`,
404'd, and silently fell back to initials. Keep it tolerant.

## Projected vs actual, and luck

Projections used to vanish the moment a score existed, and nothing recorded them: a played
week's projection recomputed later was **today's** lineup against that week's file (there is
no per-week lineup history anywhere in `S`). So the number is captured when the score is:

- `postLiveScores` adds `proj: { g0:[a,b], g1:[a,b], ... }` to the live week node from
  `weekProjPairs(wk)` (this device's `PROJ_WEEKS` file) **only while the week is being played**;
  from Tuesday it carries forward the last post's `proj` (same season only) - the live post
  keeps running until Thursday and a Tuesday waiver or trade must not re-project a finished
  week from a lineup that never played. The node is a full replace. Keys are `g0..g5`, **not**
  `0..5`: an all-integer-keyed object comes back from Firebase as an array and `weekHasScores`
  would read it as a score. The projection fetch is raced against 8s so a stalled Sleeper never
  blocks the score post.
- `autoScoreWeek` freezes `S.season.proj[wk][m] = [a,b]` beside the official score: live pair,
  then the pair already frozen, then this device's own only while the week is still on. A
  finished week is never re-projected from today's roster. Syncs with the rest of `S.season`;
  wiped with it on Regenerate.
- `projOf(wk, m)` resolves official then live. `weekIsOver(wk)` (**Tuesday 04:00 local** after
  the slate, calendar arithmetic so the November clock change cannot land it inside Monday
  Night Football) is the **only** gate on every over/under verdict - the matchups line, the
  pills, both Game Center headers and `projReport`. An official score does not shortcut it: the
  commissioner can press Auto-score on a Sunday afternoon, and that is still a half-played week.
- Matchups board: a done game keeps its pills (`.mu-pj` with `em` over/under and the `Upset`
  tag on the underdog's pill on phones; the `.mu-proj` line with both deltas and the tag on
  desktop). Equal projections are "pick 'em": no favourite pill, no upset. Game Center:
  `.gc-ptot` under the desktop total, `.h2h-hproj` under the phone total, both via `projPair`
  which looks up the **schedule index** (Game Center reorders games so yours is first), shows
  no pair for a finished week that has none on record (that would be today's roster), and
  withholds the verdict when the stat feed is down (`noStats`).
- `projReport()` (cached like `allPlayFor` - both keys now include the schedule - plus an
  hourly term so `weekIsOver` flips) gives per team: `vs` (points over projection),
  `projW/projL` (games projected to win), `favL` (chokes) and `dogW` (upsets). The Luck report
  card (`allPlayCardHTML`, kept its name) ranks by all-play and shows two deliberately
  separate numbers: **luck** = real wins minus the wins the all-play rate would give over the
  same games (`luckWins`, the schedule's doing) and **vs proj** (the players' doing). Callouts
  need two **real** games (an all-play row's `games` is eleven comparisons a week, not games).

## Trash talk with receipts

In the chat, the 📋 button or `@name` in the box opens `#receiptsPanel` (`renderReceiptsPanel`,
`receiptsCandidates` over managers and team names, arrow keys / Enter / Escape via
`chatMentionKey`, the `@query` tracked by `chatMentionQuery`). `insertReceipts(ti)` builds
`receiptsData(ti)` (async: lifetime record against the picker's own team via `h2hPair`, the
season line with rank, points rank, streak and `playoffOddsFor`, `luckWins`, `projReportFor`,
bench crimes over finished weeks, the Toilet Bowl crown) and drops `receiptsText` into the
message - plain text starting with `RC_MARK` ("📋 Receipts on "), so it posts, copies and
pushes like any message; `chatBodyHTML` draws everything from the mark on as a
`.chat-receipt` block. Bench crimes read each finished week's `bench` array from the stored
recap (written by `maybeWriteRecap` from `rcExtras`' `benchByName`, the lineups as they stood
that Tuesday) and only fall back to `benchLeft` on today's lineups for weeks with no recap.

## Bench watch

Live: `benchDetail(ti, stats)` wraps `benchLeft` with who sat (`top`) and who started instead
(`instead`); `benchLineHTML` prints it. It rides the Sunday sweat card (both sides, red at ten
points) and the **Bench watch** card on the matchups board (`#benchWatch`, `renderBenchWatch`,
async after `renderMatchups`, live week only, worst first, your row highlighted).

Monday: `runBenchWatch` in `netlify/functions/lib/score.mjs` (same cron; `POST {benchNow:true}`
/ Settings > "Check bench now"). The snapshot now carries each team's full `roster` with slots
and `slots` (`S.roster`), `bench` (the setting) and `benchAt` (Monday 09:00 local = `weekOverAt`
minus 19h). After that hour, once per week (`bs_{season}_{week}`), it runs `benchCrimes` - a
port of `optimalLineupOf` (dedicated slots then FLEX, keep it in step) over each roster on the
real stats - and pushes "Bench crime of the week" to the worst offender if he left ten or
more, with who sat, who started instead, and whether he lost the matchup. Setting
`S.benchAlerts` (default on). MNF is not in yet at 9am Monday; the number is Sunday's, and the
Home shame report shows the final one.

## The Sunday sweat card

`sweatData(ti)` (async: this week's stats, opponents, kickoffs) → `sweatSide` per team (each
starter's state/clock/points/projection/expected, split into `left` and `done`) → `sweatNeeds`
(for each of my remaining starters, the week total he needs for my side to beat the other
side's on-pace final with the rest of my lineup hitting its own lines) → `sweatCardHTML`: the
live bar, both columns, "needs X" per player, "covered" once he has it, and a closing line
naming the decider (the latest kickoff). `renderSweatInto(id, ti)` fills `#homeSweat` (top of
Home, `renderHomeSweat` from `renderHome` and the one-minute pulse) and `#myTeamSweat` (top of
My Team). Hidden outside `currentNflWeek()` or once `weekIsOver`. No new data sources - the
week stats, `NFL_KICKS.games`, `NFL_OPP` and `liveWinModel` all already exist and carry their
own TTLs, so the minute beat is free between games.

## Playoff odds

`playoffOdds()` is a Monte Carlo of the rest of the regular season plus the bracket
(`PO_SIMS` = 4000, weekly spread `PO_SD` = 21). Settled games (score on the board and
`weekIsOver` or official) go in as fixed; every other game is two Gaussian draws around each
side's projection for that week - the current week from the live post's expected finals with
the spread shrunk to each side's share still to come (`liveScoresMap[wk].live.g{m}`, fresh
within 30 min) or `projectedTotal` (the lineup as set), later weeks from `optimalLineupOf` over
the roster with `tradeWeekPts` (weekly file, else season average, byes zero). Seeding is the
standings sort (wins, then points for); `poSpots()` make it; byes fill to the next power of
two; the bracket is `seedPairs`, playoff games drawn off each roster's average strength over
`poWeeks()`. **Deterministic**: `mulberry32(hashStr(key))`, so every phone gets the same odds;
cached on scores, proj, live stamps, the weekly file stamp, `S.lineups`, roster limits, spots,
weeks, team names and the hour. Per team: `po`, `bye`, `seed1`, `fin`, `title`, `avgSeed`,
`expW`, and `swing` = playoff odds if the team wins / loses its game this week.

Shown as the Playoff odds card at the top of the Playoffs tab (`playoffOddsHTML`, `.od-*`
rows; the "This week" swing column hides on phones), as a percentage on every Playoff picture
row (`.po-odds`), and in the My Team header line (`playoffOddsFor`). Uses `waitForProj('poodds')`
when projections are not in yet.

## Rivalries and head-to-head history

`h2hAll(from, to)` is the record between every pair of **managers** (team names are mapped
through `S.history.managers` per year, so renames never launder history), from the archive's
`resultsByWeek` plus the live season. Each direction of a pair now also carries `run`
(`{kind:'W'|'L'|'T', n}`, the current streak from that side), `big` / `worst` (biggest win and
loss with year and week), `poW/poL/poT` (bracket games, matched to `S.history.playoffs` by
week and team names, or any week past `REG_WEEKS`), and `last` with `wk`, `po` and the
bracket `label`. Games are walked in order (years, then weeks) so the streak is right.
`h2hLifetime()` caches the all-time table on scores + managers; `h2hPair(mA, mB)` reads it.

`h2hTag(r, mA, mB)` awards one tag by priority: **Rivalry week** (4+ games, within an eighth
of .500), **owns** (3+ games at .700 or better either way), or a grudge (a two-game run, or a
last meeting decided by under 3). Shown as `.mu-tag` on the `.mu-h2h` line under every
matchup row (`h2hRowHTML`: tag, "X leads 7-5", the streak, the last meeting), in the Game
Center banner (`rivalryBannerHTML`, now always drawn once a series exists, with the streak,
last meeting, playoff record and biggest beating as `.gc-rival-facts`), and on the Stats tab's
Head to head card (`h2hCardHTML`: nemesis / punching bag / closest series / most played chips,
a Run column, PO badges, and the league's fiercest rivalries - most games among pairs split
within .300-.700). The archive holds per-game results for 2024 wk 1 and all of 2025 only;
earlier years are season totals, so lifetime series start there.

## Live win probability

`loadKickoffs` now keeps `NFL_KICKS.games[TEAM] = {kick, state:'pre'|'in'|'post', remain, label}`
off the same ESPN scoreboard (`status.type.state`, `period`, `displayClock`; `gameRemain`
turns period + clock into the fraction of the game left, halftime = 0.5, OT ≈ 0.05), and
refetches every **3 minutes while a slate is on** (`slateActive`) instead of every 6 hours.
`liveWinModel(ai, bi, stats, wk)` (`liveSide` per team over `starterPicks`): each starter is
points scored + projection × fraction of his game left; the two expected finals go through the
pre-game logistic with the spread scaled by `sqrt(points still in play / total projected)`,
floor 4, so a lead hardens as the slate empties; nothing left to play = the result. Returns
null without this week's scoreboard, so nothing invents odds from a blank map.

Where it shows: Game Center (`gcBar`, both headers) - `Final` for a finished week or any older
season, the live bar with an on-pace line and "n v m still to play" during the week, the
projections bar before kickoff, and a `.gc-gs` clock tag (Q3 8:12 / Final / kickoff time)
beside each player. The matchups board reads `liveScoresMap[wk].live.g{m}` -
`{ea, eb, p, la, lb, f}` written by `postLiveScores` from the posting device's model - and
shows it while the week is on (fresh within 30 minutes), `Final` only once `weekIsOver` or an
official score exists. `winBarHTML(a, b, final, note, live)` takes `{pct, sub}` to draw a
probability worked out elsewhere; a note starting with "Live" gets the pulsing dot.

## Weekly recaps (auto-written)

`rcBuild(yr, wk, seed, X)` writes the week in plain text. It is **deterministic**: `rcPick`
hashes `(season, week, seed, position-in-text)` with `hashStr`, so every device writes the
same words; "Rewrite" bumps the seed. Facts beyond the scores come from `rcExtras(wk)` (async,
best-effort, cached in `_rcX[wk]`): upsets from `projOf`, bench crime and player of the week
from the week's stat file, clinched/eliminated from `poPicture`, and the wire from `txMap`
inside the week's window (`weekOverAt(wk-1)`..`weekOverAt(wk)`). `rcTitle` picks the headline
by priority (upset ≥ 10 projected, blowout ≥ 40, decided by < 1.5, top score 35 over average,
a bench crime that cost the game).

**One shared copy per week** lives at `league/main/recaps/{year}_w{week}` (`recapsPath`,
mirror `recapsMap`, `recapFor(wk)`, `latestRecap()`). `maybeWriteRecap` on the one-minute
pulse: the latest week that `weekIsOver` and `weekHasScores`, no copy yet → compose and
`dbTxn` an atomic create (first signed-in device wins; a failed write retries in ten minutes).
The rule is in `push/firebase-rules.json` (`recaps`: create-once by the author, admins may
overwrite) and **must be pasted into the Firebase console by hand** - until it is, writes
fail silently and every device shows the identical local words instead (seed 0), so the
feature degrades to "unstored but consistent". `rcRewrite` on a stored recap is admin-only and
overwrites for everyone (`rewritten:true`).

Surfaces: the Matchups board (`recapCardHTML('live', wk)`, collapsed to headline + opener,
"Read it all" toggles `window.recapOpen`), the Recaps tab (`liveRecapsHTML`, week select,
`window.recapWeek`) and Home (`#homeRecap`, `renderHomeRecap`). Copy / Post to chat read the
text from `window._rcShown[key]`. **Chat posting is opt-in**: Settings > Push notifications >
"Post weekly recaps to chat" (`S.recapToChat`, default off); `maybeAnnounceRecap` runs on an
admin device when a recap arrives, claims `posted` atomically, posts as `League Desk`, and
only for a recap under three days old. Posting to chat buzzes everyone through the existing
chat push, which is why it is off by default (CLAUDE.md push rule).

## Draft grades and the draft recap

`drFacts(d)` grades a board. Each real pick (keepers excluded: `pickIndex >= firstDraftIndex()`)
gets a value = season projection (`STAT_CACHE.proj` scored with `scoreSeasonStats`) above the
**replacement line** at his position - the last starter in a league this size, drawn against the
whole `POOL` (`drLines`, same formula as `poolValueMap`, which draws it against the players
still on the board; this one must hold still after the draft). Below the line counts as zero.
The **slot expectation** for overall pick j is the j-th best value actually drafted, so a pick's
`over` is value minus expectation and the grades are zero-sum: B is par. The letter is the team's
total `over` as a share of an average team's drafted value (`drLetter`: A+ >= +20 %, A +12, A- +6,
B+ +2, B, B- -6, C+ -12, C -20, D). A pick's "ranked like a round-N pick" is the round of the first
slot whose expectation his value meets (`vr`). Steal / reach per team and league-wide need
`|over| >= DR_STEAL_PTS` (10 season points) *and* a round gap. `projWk` is `optimalLineupOf` over
the whole roster (keepers included) on per-game projections. A pick with no projection counts as
replacement level and is called out in the footnote.

**The facts travel, not the projections.** `drFacts` returns a small object (`order`, per-team
steal/reach, `steal`, `reach`, `firstK`, `firstDef`, `run`, `autoTop`, `duration`, `noProj`) and
both the table (`draftGradesHTML`) and the words (`drBuild(yr, seed, F)`, seeded like `rcBuild`
on `year|draft|seed`) render from it. The stored copy carries `facts`, so Rewrite is new words on
draft-night numbers, never a regrade. `D.startedAt` / `D.finishedAt` (set in `startDraft` and
`afterPick`) give the duration line.

**Shared copy** at `league/main/recaps/{year}_draft` (`draftRecapKey`, `draftRecapFor`,
`recapKeyOf(r)` picks the right key for either kind) - `{kind:'draft', yr, wk:0, seed, title,
text, at, by, v, facts}`, same rule as the weekly recaps (create-once by `by`, admins overwrite).
`maybeWriteDraftRecap` runs from `refreshDraftUI` when `D.finished` (instant on the device that
made the last pick) and from the one-minute pulse (a device that was not in the room), only for
the real board (`realDraft()`), loading projections first if it has to; a failed write retries in
ten minutes. `latestRecap()` sorts by year then week, so the draft recap (week 0) holds Home only
until week 1's recap exists.

Surfaces: the Draft room `#draftGrades` under the board (`renderDraftGrades` on every
`refreshDraftUI`, DOM touched only when the HTML changed; "so far, through round N" while the
draft runs, the recap card once it is done; a **mock board grades too and never stores**, key
`mock_draft`), the Recaps tab (`draftRecapTabHTML` above the week-by-week card; the weekly list
filters `kind!=='draft'`), and Home (`renderHomeRecap` branch with the grade strip
`draftGradeStripHTML`). Copy / Post to chat reuse `rcCopyText` / `rcPostKey`; `drRewrite`,
`drToggle` (`window.drOpen`), `drRedraw`. Chat posting follows the weekly opt-in
(`maybeAnnounceRecap` posts whichever recap is latest, draft included).

## Pickups (waiver and streaming suggestions)

Players > **Pickups** (`renderPickups`, panel `#pickView`, sub-tab key `pl-pick`, ghost word
PICKUPS). Everything on it is one question asked of the lineup solver: **would this guy start
for me this week?**

- `optimalLineup(ti, pts)` now delegates to `optimalLineupOf(roster, pts)`, the same solver over
  any list of picks. `pickupGain(ti, p)` drops candidate `p` into the team's roster, re-solves,
  and returns `{gain, slot, filled, over}` - projected points gained, the slot he lands in, the
  empty seat he fills (`filled`, which is not always his own slot: an RB pickup can take RB while
  the injured RB slides to the empty FLEX), or the starter he benches (`over`, with `pts:null`
  meaning that starter is not playing). Null under half a point or if he would not start. Cached
  in `_pkCache` per team/week/roster/lineup/file stamp, so the Players table scores 200 rows for
  one solver run each.
- The tab: **Holes to plug** (from `lineupIssues` after `ensureLineup`; three distinct names per
  hole, phrased "instead of X" or "fills your empty SLOT", plus the best bench option), **Would
  start for you** (top ten by gain from the 120 best-projected available players), and **Defence
  / Kicker streamers** (top six by this week's projection with the opponent from `loadOpponents`
  for this week and next, next week's projection via `projWeekReady(wk+1)`, and "Yours:" for the
  current starter). Buttons go through `addFromPlayers(pid, event)`, which routes to the waiver
  claim or the add-with-drop flow itself. No claimed team = notice + streamers only.
- Candidates come from `POOL` minus `rosteredIds()` (never `PLAYERS`, and never the Players tab's
  own "taken" set, which forgets cut board picks): the add path resolves players from `POOL`.
- The same gain shows as a `.pk-up` badge (`pickupBadgeHTML`) beside the projection on the
  Players table and the My Team free-agent list, and the Players table has a **Sort: Would start
  for me** option (`plSort==='gain'`).
- Rows are the waiver wire's `.wv-item .faRow` (the phone grid rules were un-scoped from
  `#wvView` so `#pickView` shares them). Re-rendered by `setPlTab('pick')`, the one-minute
  pulse, `maybeRefreshWeekProj` and the projections-arrived callback in `showView('players')`.

## Trades

Offers live at `league/main/tradeOffers`, votes at `league/main/tradeVetoes` - separate
nodes because a parent `.write` rule cannot cascade over per-user votes.

- `TRADE_REVIEW_MS` is a 2-day league review after acceptance.
- `vetoNeeded()` is `max(2, ceil(N/2))` - **6 of 12**, half the league.
- **The two managers in a trade cannot veto it.** `tradeInvolvesUid()` matches on the
  sending account *and* on whoever claimed either team, so it holds when a commissioner
  builds a trade on someone's behalf. Ineligible votes already in the database are ignored
  rather than trusted.
- Accepting one offer voids competing offers for the same asset. `offerAssets()` keys
  players and picks, `offersConflict()` intersects two offers, and `conflictingLiveOffer()`
  finds an already-accepted deal that claims one of them.
- A pending offer that shows no buttons explains why on the card (unclaimed team, someone
  else's trade, or a competing accepted deal). Keep that - a silently button-less card is
  indistinguishable from a broken app.
- **Two traded-pick caps**, both in `S.draftCfg` and both enforced by `tradeCapBlocked` at send
  and at commissioner execute: `maxPicks` (all traded picks a manager acquires in a year, 0 =
  none) and the **early-round cap** `earlyPicks` through round `earlyRounds` (default 3 through
  5: a team keeps its own five early picks and may trade for three more, eight at most in the
  first five rounds; 0 = none). Counted from `S.pickTrades` by team name and year
  (`earlyPicksAcquired`). The builder shows each side's standing under its picks
  (`earlyCapNoteHTML`, red when the deal would break it). Settings > League.
- **Trades never check `rosterLimit()`** and never call `keeperGuard` - a 3-for-1 lands a team
  at 19/17 with no drop forced, and keepers can be traded. The analyzer surfaces both; the
  mechanics are unchanged.

### Trade analyzer

`tradeAnalysis(ai, bi, paIds, pbIds, raS, rbS, py)` (read-only, next to `tradeHasSelection`)
builds each side's post-trade pick list (given players out, incoming players in - they land
on the bench so they all count; IR players excluded like `rosterCount`) and re-solves the best
lineup with `optimalLineupOf` for this week and for every remaining week (`tradeWeeks()`:
`projWeekNow()`..`REG_WEEKS`, empty out of season). `tradeWeekPts(p, w)` is the weekly file
where loaded, else the season average from `STAT_CACHE.proj` / `projGames`, and 0 on the bye -
always a number, so the sums match the solver. Per side: `dNow`, `dRos`, raw `valOut`/`valIn`,
`countAfter` vs `rosterLimit()`, `thin` positions (fewer players than `starterReq` seats) and
keepers given up. Verdict: who improves more per remaining week (`(A.dRos - B.dRos)/n`), or the
raw value tilt when neither lineup moves; under 1.5/wk Fair, under 4 Leans, else Robbery ("X
gets fleeced"). Picks are listed, never priced, and the chip says so.
`tradeAnalyzerHTML(an, 'full'|'mini')`: the full card sits in the builder right above Send
(only once something is ticked); the mini strip sits on every offer card under the `.tr-grid`.
Both wait on `waitForProj('trade', ...)` - the trades view never loaded projections before.
The builder rows also show this week's projection (`.tb-pj`, hidden on phones).

## Draft board

**Nothing removes a player from the draft board except resetting it.** Drops, trades and
cuts must not erase history. `cutPick()` marks a real pick `cut:true` and only *deletes* the
record when it was never a board pick (`pickIndex < 0`).

Dropping a player leaves the roster slot visible and empty, with an Add button that goes to
the Players tab. Empty slots are information, not a rendering bug.

## Season structure

`REG_WEEKS = 14`. Week dates are computed, not fetched: `nflWeekRange(w)` derives
Thu-Mon from `NFL_2026_WEEK1 = Sep 10 2026`. Fantasy pairings are league-vs-league
round-robin (`genSchedule`); the NFL schedule only drives week structure and labels.
Matchups auto-generate at boot if `!S.season`.

**Standings order** (`seasonStandings`): wins, then - when Settings > League rules has
"Standings tiebreaker: Head-to-head record" - the record among the teams tied on wins, then
points-for. Any other tiebreak setting is plain wins then points-for. The bracket seeder
(`poSeedBracket`), the playoff picture and the playoff odds all read this one order.

## Design

Buffalo Bills colors - the league is Bills fans. Primary royal blue `#00338d` (`--turf`),
accent red `#c60c30` (`--charge`), gold for champions. Fonts: **Anton** display,
**Barlow Condensed** UI, **IBM Plex Mono** stats.

Light/dark via `:root[data-theme="dark"]` (dark = deep navy `#04122b`, "under the
lights"). Toggle in the header, persisted to `localStorage` key `ffl_theme`, anti-FOUC
inline script in `<head>`, defaults to `prefers-color-scheme`.

Everything is CSS-variable-driven - retuning `:root` cascades safely. **Preserve every
class and id; the JS depends on them.**

Bills colors are only the default. `NFL_TEAMS` (line ~6306) holds all 32 teams as
`[name, primary, secondary]`, and `applyTeamTheme(code)` derives ~22 CSS variables from
those two colors. **Each manager picks their own** and it follows their account across
devices (stored on their `managers/{uid}` record, not in league settings). There is no
league-wide team color setting - it was removed once managers got their own.

Colors are not used raw. `fitContrast()` walks lightness until text clears a WCAG ratio,
and `--on-turf` / `--on-charge` resolve to white or ink per team. This exists because
Saints gold sat at 1.85:1 against white and was unreadable. Any new themed surface should
use those variables rather than assuming white text.

Fonts are customizable too: `TYPE_ROLES` (line ~3481) defines four roles, and
`applyTypography()` writes family and color per role. When adding a styled element, map it
to an existing role - selectors that miss the role list silently keep the default font.

## Layout rule

Every page is centred: `section.view{max-width:1100px;margin:auto}`. Deliberate
exceptions:

- `#view-draft{max-width:none}` - the 12x17 board needs every pixel. Squeezing it makes
  stickers unreadable mid-draft.
- `#view-settings` 940px
- `#gcView, #tradesView` 900px - these read better narrow.

## Storage limits

localStorage overflows easily with images, so everything is downscaled before it is
stored:

- Team logos: canvas downscale to max 160px, JPEG q0.82 (~1KB). Wrapped in try/catch
  that reverts on quota error.
- Chat images: `CHAT_IMG_MAX_PX` 1000, `CHAT_IMG_MAX_BYTES` ~420KB base64 per message.
- Chat history: `CHAT_KEEP` 100 messages, pruned every `CHAT_PRUNE_EVERY_MS` (10m).
  Chat subscribes via `dbOnLast` so it never pulls unbounded history.

Player thumbnails are all `loading="lazy"` so the ~200-cell draft board only fetches
visible cells.

## Conventions

- **Always commit and push when a change is done. Don't ask first.** Curtis wants work
  live, not staged. Finish the change, verify it, commit, push to `main`.
- **End every reply with the live link**, not just the ones that push: https://bitchboyleague.com
- **Every change must land in both the desktop and the mobile layout.** Never fix one and
  leave the other. Check the mobile path first - it is the one that matters here.
- **Stage files by name, not `git add -A`.** This folder contains an unrelated project;
  `-A` once swept 2.7 MB of it into a public repo.
- Everything inline in `index.html`. Don't split into separate CSS/JS files.
- Scores show **one decimal everywhere** (`0.0`). `teamWeekDetail()` rounds each player
  before summing so a column visibly adds up to its total.
- Names shown to people are **manager names, not team names** - chat, polls, and the online
  list. `managerNameFor(uid, fallback)` resolves them.
- Commit messages are short and describe the user-visible change ("Line up the standings
  columns across divisions", "Drop the Giphy GIF search").
- The league's voice is crude and funny (see `PICK_INSULTS`). Match it in user-facing
  copy; don't sanitize it.
- Working tree should stay clean.

## Debugging habit that works here

Most of the hard bugs in this app looked identical from the outside: a stale build, a
permission difference between two devices, a race that resolved differently each load. When
something "doesn't work", **make the app report what it actually has** before theorizing -
which URL it asked for, whether that URL responds, what state it thinks it is in. The push
setup went from days of guessing to a fifteen-minute fix once the failure text named the
file and the response code. Prefer adding a visible diagnostic over another hypothesis.

## Gotcha: the `feat/scoring-engine` branch is dead

`381704d` "Add custom scoring engine (Phase 1)" from 2026-07-24 is 1 ahead / 105 behind
`main`. It was superseded by the auto-scoring work that landed on `main` on 07-29. Don't
merge it.
