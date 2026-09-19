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

**Main tabs**: Home, Draft Room, Matchups, Teams, Players, Chat, Stats, Settings - the same list in the
top bar (`nav.tabs`) and the phone drawer (`.drawer-tabs`). Teams hosts My Team, All Teams, Trades and
Transactions as sub-tabs; Players hosts the player list, Waivers, Pickups, Injuries and News;
Matchups hosts the board, Game Center, NFL Scores, Schedule and Playoffs (`setMuTab`). The `trades`
view highlights the Teams tab (`showView` navV); `goSub(k)` routes every sub-tab.

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
| `netlify/functions/lib/score.mjs` | yes | Weekly scoring + the alert rule, shared by both functions. A PORT of `scoreWeekStats`; a harness runs 4000 random stat lines through both and fails on any drift. Also a port of the Game Center's injury-news reader (`injNewsClass` / `injNewsOf`), checked by importing the module in the preview browser (`.claude/serve.js` serves `.mjs`) and running both copies over the live feed. |
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

Ten triggers only, and nothing else should be added without asking: **new chat message**
(everyone but the authors, batched 4s), **trade offer** (the recipient only), **trade
accepted** (everyone), **score alerts** (a manager's own starter scores, from the scheduled
watcher), **lineup alerts** (a manager's own starter is out / on bye / not projected, or a
slot is empty, `lineupLead` hours before kickoff - added 2026-09-06, see Lineup alerts below)
**swing alerts** (a matchup's live odds move 25 points in 20 minutes while a game is on,
both managers, from the scheduled watcher - added 2026-09-07, see Swing alerts below), the
**bench crime push** (Monday 9am to the week's worst offender, ten points or more, from the
scheduled watcher - added 2026-09-07, see Bench watch below) and **injury alerts** (a manager's
own starter ruled out, hurt, back in the game, or a surprise inactive, the moment ESPN reports
it, from the scheduled watcher - added 2026-09-16, see Injury alerts below), **trade went
through** and **trade vetoed** (everyone, added 2026-09-19).

The last two close a hole: the league heard that a deal had been agreed and then never heard how
it ended - not that it landed two days later, not who moved, and not that six managers had voted
it down. Both ride the same transition watcher in `noticeNewOffers` as the acceptance, with a
`Set` per status so an ending is announced once and a first load never replays a season of closed
trades. `finalizeOffer` stamps `executedBy` / `closedBy` so exactly one device speaks (falling
back to a commissioner for offers closed before the stamps existed), `pushOnce` is the second
guard for a person with two devices, and the veto count is written onto the offer as `vetoes` at
the moment it is killed, so a manager withdrawing a vote afterwards cannot rewrite the message.
The executed body names what each side sent, read from `tradePartsText`, which still resolves
after the players have changed hands because a pick keeps its name.

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

### Injury alerts

`runInjuryWatch` in `netlify/functions/lib/score.mjs`, on the same two-minute cron and on demand
with `POST {injuryNow:true}` (Settings > "Check injuries now"). It is the push twin of the Game
Center's live injury news (see that section): `injNewsClass` and `injNewsOf` are a **port** of
`injNewsClass` / `injNewsFor` in index.html, and the two must stay in step so the pill on the
board and the push on the phone read the same line the same way. The snapshot carries `injury`
(the setting) and already carried each starter's `name`, which is what ESPN's feed is matched on
(`normName`, also ported).

- **When:** it fetches ESPN's scoreboard (`weekBoard`, live) every run - one small fetch - and
  pulls the injury file (nine megabytes parsed, 350 KB on the wire, six-second timeout) only
  when some game on the scoreboard is in progress, inside two hours before a kickoff, or within
  five hours after one; each starter's own window is applied afterwards in `injNewsOf`. Any
  other minute of the week it returns before fetching the file. The week is `snap.week`, or
  before the opener (when `currentNflWeek()` is still 0) `snap.lineupWeek`, the same fallback
  the lineup watch uses, so Thursday night's inactives are caught.
- **Who:** the manager starting him, once per line. Marks in `inj_{season}_{week}` are keyed
  `uid:playerId` and hold the stamp of the last line sent, so the same line never goes twice
  and a later one ("has returned") does. A line is marked once OneSignal takes it, so a failed
  send is tried again next run; a line older than 45 minutes when first seen is marked unsent
  (the watcher was down or just deployed). "Active" only goes to a manager whose starter carried
  a designation (`pl.inj`) into the day.
- **What it says** (`injuryText`): "Jahmyr Gibbs is hurt (knee)" / "is out (hamstring)" / "is
  back in the game" / "is inactive" / "is active", then ESPN's line with the reporter's byline
  stripped and a full stop made sure of, then one blunt clause by the clock: before kickoff
  (out or inactive) "Swap him or eat the zero.", after it (out) "That's a zero from here.",
  "Watch this one." for hurt, "Breathe." for back. The body is cut at a word to fit OneSignal's
  180 characters with the clause intact.
- Setting `S.injuryAlerts` (default on). The Cloudflare copy does not have it.

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
| `site.api.espn.com/.../football/nfl/injuries` | injury report | `ESPN_TTL_MS` 20m; `INJ_LIVE_MS` 3m from Game Center while a game is on |
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

## Replying in the chat

Every message's meta line carries a `reply` link (dotted on touch, where nothing hovers). Tapping it
sets `window.chatReply = {id, uid, n, m}` and shows the strip above the box (`#chatReplyBar`,
`renderChatReplyBar`): who you are answering and the line you are answering. The x or Escape
clears it; sending clears it too. `sendChat` copies it onto the message as `re`, online and in the
signed-out localStorage mode alike.

The reply carries a **snapshot**, not just an id: `m` is `chatExcerpt()` of the original - its
words if it has any (140 characters), else "Photo", "Image" (a bare picture URL) or "📋 receipts".
The chat is pruned at `CHAT_KEEP`, so by the time anyone reads a reply the original may be gone;
the quote at the top of the bubble (`chatQuoteHTML`, `.chat-quote`) is drawn from the snapshot and
never from a lookup. The author's name is re-resolved by uid so a rename carries through. Tapping
the quote runs `chatJumpTo(id)`: every bubble has `data-mid`, the original scrolls into view and
flashes (`.chat-flash`); if it has been pruned the toast says so.

The push is addressed: when a single fresh message is a reply and the person it answers is among
the targets, they get "`<who>` replied to you" and everyone else gets the usual "New chat from".
The `$msgId` rule only checks `uid` on a new message, so `re` needs no rule change.

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
Home, `renderHomeSweat` from `renderHome` and the one-minute pulse). It used to sit on My Team too;
the commissioner asked for it to be Home only. Hidden outside `currentNflWeek()` or once `weekIsOver`. No new data sources - the
week stats, `NFL_KICKS.games`, `NFL_OPP` and `liveWinModel` all already exist and carry their
own TTLs, so the minute beat is free between games.

## Playoff odds

`playoffOdds()` is a Monte Carlo of the rest of the regular season plus the bracket
(`PO_SIMS` = 4000, weekly spread `PO_SD` = 21). Settled games (score on the board and
`weekIsOver` or official) go in as fixed; every other game is two Gaussian draws around each
side's projection for that week - the current week from the lineups as set, with the full spread,
because a week counts for nothing until it is over (`resultScore` rule; the live win bar on the
board is where the live picture lives) - and the weeks after from `optimalLineupOf` over
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

`NFL_KICKS.games[team]` also carries `opp` and `home`, and `loadKickoffs` loads **week 1 all preseason**
(`currentNflWeek() || projWeekNow()`) so the My Team rows can say when everybody plays; nothing locks
off it until `currentNflWeek()` itself is 1 (`playerKickoff` checks the week). `gameLineHTML(nfl)`
prints "Sun 1:00 PM vs KC" / "LIVE Q2 5:12" / "Final" after the position line of each My Team row,
and a slate that changed redraws the Teams view once per fetch.

`loadKickoffs` now keeps `NFL_KICKS.games[TEAM] = {kick, state:'pre'|'in'|'post', remain, label, ball,
oppBall, rz}` (the last three: who has the ball, by ESPN's team id against each side, and the red zone)
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

## NFL scores (Matchups > NFL Scores)

The week's NFL slate as a scoreboard, the fifth sub-tab under Matchups (`#nflView`, `setMuTab('nfl')`,
`renderNflScores`). It reads nothing new: `loadKickoffs` now also builds `NFL_KICKS.list`, one entry
per ESPN event via `nflGameEntry` - `{id, kick, state, period, clock, detail, off, tv, odds, ou, venue,
neutral, home:{id, code, name, score, rec, win}, away:{...}, poss, down, rz, last}`. `detail` is the
clock the way the app writes it ("Q2 5:12", "Halftime", "End Q3", "Final/OT"); `off` marks a
postponed, cancelled or delayed game, which shows ESPN's own word and never counts as live; `poss` is
ESPN's *team id* (`situation.possession`), which is why each side keeps `id` (and the competitor's `cid`) beside `code`.
`loadKickoffs` redraws the tab when the list changed (a `JSON` compare, like the Teams redraw beside
it), so a fetch that found nothing new touches no DOM.

Cards are grouped by local day and sorted by kickoff: away on top, home below, records beside the
names, Sleeper's team logos (the defence badges' source, so nothing new is cached). Before kickoff a
card shows the time, TV and the line ("CIN -3.5 · O/U 50.5"); live it shows the clock with the
blinking dot, a turf dot beside the team with the ball (charge red in the red zone), down and
distance, and the last play on one line; final dims the loser (a tie dims nobody). A neutral-site
game names its venue. Each card names the starters of the device's team (`myTeamIdx`,
`starterPicks`) and of this week's opponent (the `S.season.schedule[wk]` pair) who are in that game,
"P. Mahomes" style (`nflShortName`; a defence is "KC D/ST") - the reason to watch a scoreboard here
rather than on ESPN.

Refresh: while the tab is closed the pulse's `loadKickoffs()` is all there is. Open, `nflStart()`
runs `nflTick` every 45 s (`NFL_LIVE_MS`), which forces a fetch only while `nflSlateLive()` - a game
is `in`, or a `pre` game is within two minutes of kickoff or up to four hours past it (ESPN can say
"pre" for a minute after the whistle); otherwise `loadKickoffs` keeps its TTL and the tick costs
nothing. `nflStop()` runs on any other sub-tab, a tick that finds the tab closed stops itself,
`document.hidden` skips, and coming back to the app ticks at once. The Refresh button
(`nflRefresh(btn)`) forces one fetch and always redraws, so the button comes back even when nothing
moved.

The little football: `ballSVG()` is an inline SVG (the same brown ball on every phone and theme,
not an emoji), and `ballTagHTML(p)` puts it inside the Game Center clock tag (`gameTag`) for an
offence player whose team has the ball or a defence whose opponent has it (`games[code].ball` /
`.oppBall`), with a red halo in the red zone; between plays ESPN names nobody and the ball is off
for a moment. The NFL Scores cards show the same ball beside the side in possession. Because a
football three minutes stale is wrong half the time, the 45-second tick runs while Game Center is
open too (`liveBallOpen`), and a fetch that changed the list redraws whichever of the two is showing.

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

Surfaces: the Recaps tab (`draftRecapTabHTML` above the week-by-week card; the weekly list
filters `kind!=='draft'`) and Home (`renderHomeRecap` branch with the grade strip
`draftGradeStripHTML`). **Nothing draws in the Draft room** - the commissioner wants that page to
be the board and the player list only; `refreshDraftUI` still calls `maybeWriteDraftRecap` so
the shared copy is written the moment the board fills. Mock boards are not graded. Copy / Post to chat reuse `rcCopyText` / `rcPostKey`; `drRewrite`,
`drToggle` (`window.drOpen`), `drRedraw`. Chat posting follows the weekly opt-in
(`maybeAnnounceRecap` posts whichever recap is latest, draft included).

## Trending on the wire

Sleeper publishes add/drop counts across every league on its platform:
`https://api.sleeper.app/v1/players/nfl/trending/{add|drop}?lookback_hours=24&limit=N`, an array of
`{count, player_id}` whose ids are this app's own player ids (defences included, keyed by team code).
`loadTrending()` caches both lists in `TREND` and localStorage `ffl_trend_v1` for 30 minutes, retries a
quiet or unreachable feed no more than every 5 minutes, and discards a restored copy over 24 hours old
(a stale count must never read as "today"). A `/drop` failure cannot void the adds.

`trendChipHTML(pid, addOnly)` is the chip beside a name - turf with an up arrow for adds, charge with a
down arrow when the drops are heavier - on the waiver wire, the Pickups rows, the Players table and the
free-agent list. `trendingCardHTML()` is the "Trending" card at the top of the Waivers tab (also shown when waivers
are off, since it lists free agents): the most-added players this league can have, minus anyone rostered
and anyone already in the dropped-players card above it, eight at a time. Inside the card the chip is
forced to the add count (`addOnly`) or a row would contradict the heading that put it there. `trendWarm()`
fetches and repaints once per set of numbers (`_trendPainted`), so a repaint cannot call it into a loop.

## Week stats (Players > Week stats)


A free agent's row carries the same pill the wire and the Trending card use - **Claim** while
`onWaivers(id)` (dropped, or game-locked until Wednesday), **Add** once he is clear - wired to
`addFromPlayers(id, event)`, which routes the two and stops the click reaching the row, so the
scoring popup does not open on top of a claim. A rostered player's row names the owner instead.
`.wk-pick` is the pill sized for the sub-line under the name, taller on a phone.
`renderWeekStats()` (sub-tab key `week`, container `#wkView`, `setPlTab`): every player with a line in
`fetchWeekStats(season, wk)` - the same Sleeper file the matchups are scored from - with `scoreWeekStats`
points beside it. All state lives in the `WK` object (week, pos, q, fa, all, sort, oppTried), never on
window: an element id would shadow it there, and the shell's ids are deliberately distinct (`wkStatQIn`,
`wkStatFAIn`, `wkStatPosBar`, `wkStatWeekSel`). Week select (`wkStatWeeks()`: 1..currentNflWeek, all 14
after the season, week 1 in preseason), search, "free agents only", position chips. ALL and FLEX show
`statLine` in words; a single position shows `statCols(pos)` columns plus `WK_DEF_COLS` for defences;
changing position resets the sort. Sortable headers (`wkStatSort`), top 150 with Show all. Only players
who did something are rows (`played`); names come from PLAYERS, then POOL, then the roster pick itself.
The shell is built once (search caret survives), a token drops stale async results, the sideways scroll
is restored after a redraw. `fetchWeekStats` dedupes in-flight downloads (`WEEK_STATS_INFLIGHT`);
opponents from `loadOpponents`, one attempt per five minutes. The pulse calls `wkStatTick()`, which
redraws only when the live week's file is due for a refresh.

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

### Settling a contest

`maybeProcessWaivers` **walks down** each player's sorted claims until one can actually be filled, and
settles the ones it passes over as `failed` with the reason. A claim that cannot be awarded - priced
out under FAAB, or a roster that filled up on a claim the same manager ranked higher - used to stand
at the front, fail, and send the player to nobody while everyone behind it was told it had lost. It
also returns early until `poolReady`: a claim is awarded out of the player feed, and settling before
it has loaded failed every claim and cleared the player to nobody.

`awardClaim` works out the room **before** it cuts anything, and counts an IR man as not taking a
spot. Cutting first and checking after meant a named drop could be executed and the claim still fail:
a real player off the roster, no drop logged, nothing to undo, and the cut pushed league-wide by the
next save. It looks the player up with `findPlayerMeta` (pool, players file, then the pick itself),
because the wire deliberately carries game-locked free agents who are not in the pool feed.

**FAAB budgets are read fresh** each time round the walk (`faabLeft(ti)`) and nothing is subtracted on
top. `logMove` mirrors a win into the transaction log synchronously, so `faabSpent` already counts what
was spent earlier in the same pass; the old running total charged every bid twice, and a manager with
$100 who won a $60 claim was told he had -$20 for his next one.

## Waiver priority resets every Tuesday

The league rule reads "1 day, resets to inverse standings", and the app now does what ESPN, Yahoo
and Sleeper all mean by it: when a week is in the books (4 AM Tuesday, `weekOverAt`) the order goes
back to **worst record first**, a tie going to the **lower points-for** (`seedWaiverOrder` is
`seasonStandings()` read backwards, and the standings break ties by head-to-head then points), and
a **won claim drops you to the back only until the next reset**. "Continuous rolling waivers" never
resets; under FAAB the highest bid wins and the order only breaks a tie, but that tiebreak order
resets the same way (ESPN's behaviour). Nothing resets once
`currentNflWeek()` is 0, i.e. the playoffs.

Which leagues reset: `waiverResets()` is "waivers on, not FAAB, and the rule does not say rolling
or continuous". The rule is a label the commissioner can retype (this league's reads "Shittiest
record picks first"), so it tests for the two things that mean *not this* rather than for a fixed
phrase a rewrite would silently switch off.

How it is stored: `S.waiverResetWk` is the week the saved `S.waiverOrder` belongs to, and
`S.waiverResetOk` marks that the reset was made with results in hand. `waiverOrderStale()` is: a new
week has started, **the previous week's results are in** (`weekHasResults(wk-1)`), and the saved
list is either older than this week or unmarked. `waiverOrder()` returns the fresh seed while stale,
so every device shows the reset the moment the week rolls over without waiting for a write. The
results clause is load-bearing: a device opening at 4:01 on Tuesday may not have the live scores
yet, and a reset run then would seed from twelve 0-0 teams and lock that in for the week. The
commissioner's device - the only one that settles claims (`maybeProcessWaivers` is admin-only) -
writes the reset down first (`maybeResetWaiverOrder`, at the top of processing), so claims are
settled against, and `moveToBackOfWaiverOrder` moves people within, this week's list. The manual
reseed button stamps and marks too. The priority card says which state it is in: "Reset for week
N" or "resets once week N-1's results are in".

Sources checked: ESPN (weekly reset to inverse standings, ties to fewest points, a successful
claim moves you to the bottom), Yahoo (reset after each game week by reverse standings, stops in
the playoffs), Sleeper (reverse-standings mode resets weekly; FAAB ties break by rolling priority).

## Waivers: the game lock

`waiverWire()` is the one list every waiver question reads (`onWaivers`, `wireEntry`, the Add/Claim
buttons, `addPlayer`/`addWithDrop` guards, `claimWaiver` and settlement). Besides dropped players it now
holds **every free agent whose NFL game this week has kicked off** (`gameLockFor(p)`: `NFL_KICKS`
must be this week's slate, kickoff behind us, and now before `weekClearAt(wk)` = `weekOverAt(wk)` + 24h,
i.e. Wednesday 4am local). Such an entry has `from:null, lock:true`; a dropped player whose game has
started keeps the later `until`. Claims on locked players settle at that clear time through the
existing `maybeProcessWaivers`, and **the wire is what says when**, not the `clearsAt` stamped on the
claim when it was filed: a free agent whose game kicks off between two claims would otherwise settle
at the earlier claim's Monday time, alone, and go to whoever filed first instead of whoever is first
in line. `maybeProcessWaivers` takes `max(clearsAt, wireEntry(pid).until)`; the stamp is only what the
card shows. The "Game started" card lists them ten at a time (`WV_LOCK_SHOW`) with a Show all button and the
position chips; the On waivers card above it lists dropped players only. Fails open like the lineup lock: no scoreboard,
no lock; and `currentNflWeek()` is 0 in the playoffs, so nothing locks in weeks 15-17.

**Dropping a locked player**: `dropLockGuard(ti, pid, what)` lets a player whose lineup slot is BN or
IR be dropped even after his game has kicked off (he is scoring for nobody); a locked starter still
goes through `lockGuard` (refused, commissioner asked). `dropPlayer`, `swapPlayer` and the My Team
Drop button all read it; the slot select stays locked for everyone.

## Trades

Offers live at `league/main/tradeOffers`, votes at `league/main/tradeVetoes` - separate
nodes because a parent `.write` rule cannot cascade over per-user votes.

- `TRADE_REVIEW_MS` is a 2-day league review after acceptance.
- `vetoNeeded()` is `max(2, ceil(N/2))` - **6 of 12**, half the league.
- **The two managers in a trade cannot veto it.** `tradeInvolvesUid()` matches on the
  sending account *and* on whoever claimed either team, so it holds when a commissioner
  builds a trade on someone's behalf. Ineligible votes already in the database are ignored
  rather than trusted.
- **An offer is re-checked against the rosters before it moves anything**, at accept and again at
  finalize (`offerStale(o)` - does each side still hold every player named, and still own every pick).
  A two-day review window is long enough for a player to be dropped, cut by a waiver settlement, or
  traded on, and applying what was left handed one side something for nothing. A deal that no longer
  stands is written `status:'void'` with a `closedReason` and leaves the board. `tradeCapBlocked` at
  review end does the same, instead of leaving the offer `accepted` for every admin device to retry
  every minute for ever while both teams stayed frozen behind it.
- **A veto is a team's vote, not an account's** (`uidHasTeam`): registration is open, so counting every
  signed-in uid let one manager veto a deal from a second and a third address.
- `applyTradeParts` ends with `pushTeamData` for **both** teams. Without it the teamData listener put
  the old lineup back and `ensureLineup` seeded the arriving player into whatever starting slot was
  open - on a Sunday, a game already under way.
- **The trade block tells the league it moved.** A sign lives in the team's own node as
  `block` (the player ids) beside `blockAt` (when each went up); `toggleBlock` stamps on the way
  up and clears on the way down. `blockNewCount()` counts signs hung since your `seen/block`
  mark, skipping your own team, and rides the Trades badge the way unvoted polls ride the Chat
  badge (`updateTradeBadge` = offers that need you + new signs). Opening the Trades tab is
  seeing them: `setTrTab` reads the old mark into `window._blockSeenAt`, moves the mark, then
  redraws the board so this visit still tags what was new (`.tbk-new`) while the badge clears.
  It is a badge only, deliberately - no push. A sign put up before `blockAt` existed has no
  stamp, reads as 0, and never counts, so nothing fired retroactively when this shipped.
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

**A week remembers who played it.** Every live post carries `starters: {ti: {playerId: slot}}`
(`lineupSnapshot`), and `teamWeekDetail(ti, stats, played)` takes that map back
(`playedStarters(wk, ti)`). A result is a set of lineups, not a pair of numbers: without the
record, a trade, a waiver claim or a lineup move afterwards re-read a finished week off today's
roster, and a starter traded away on the Tuesday took his points with him. Everything that scores
a finished week now passes the record - `postLiveScores` (which also carries the recorded
starters forward rather than re-recording, so a post made after the roll can correct the numbers
without touching who played), `autoScoreWeek`, the Game Center headers and the recap's extras.
A week from before this existed has no record and falls back to the current lineup, as before.

**The week that just ended keeps being scored for six hours.** `maybeAutoScore` posts the live
week and, until `weekOverAt(prev) + 6h`, the one before it. Nothing re-posted a week once the
clock moved on, so whatever the last open app happened to see - a Monday-night third quarter
included - stood as the result for ever. Safe only because of the starters record above.

**Three paths used to move a locked player mid-slate**, and his points came off the board with
him: Best lineup rewrote every slot (`optimizeLineup` now runs `playerLocked` over the plan and
stops at `lockGuard`), a waiver claim cut the man it named (`maybeProcessWaivers` leaves such a
claim pending - the lock lifts when the week does), and a trade moved him (`finalizeOffer` waits
and retries on the pulse; `executeTrade`, already an override, asks).

**A live score is not a result.** `resultScore(wk,m)` is an official score, or a live one only once
`weekIsOver(wk)` (Tuesday 4am); `weekHasResults(w)` likewise. `seasonStandings`, `allPlayRows`, `h2hAll`
(live season), the shame report, the Toilet Bowl and the team schedule read those, so nobody is 1-0
mid-week. `mScore` stays the live view for the board, ticker and Game Center; `playoffOdds` settles
on the same rule inline.

**An official score outranks the live one everywhere, which makes Auto-score a loaded gun
mid-week.** `officialScore(wk,m)` on its own makes the matchups board print Final (the bar reads
`weekIsOver(wk) || !!officialScore(wk,m)`), and `mScore` prefers it, so the whole league's board
freezes on a half-played scoreboard while the live feed underneath keeps updating. The
commissioner pressed Auto-score on a live week 2 on 2026-09-19 and every game read Final. Two
guards now: `autoScoreWeek` confirms first when the week is not over and is the one being played,
and `clearWeekScores(wk)` is the way back - it deletes that week's `S.season.scores`, the
`S.season.proj` pair frozen beside it and the `S.season.autoScored` stamp, which together is
exactly what Auto-score wrote. Its button sits next to Auto-score and appears only while that week
has official scores. Before it existed the only undo was emptying twenty-four boxes by hand.

**Standings order** (`seasonStandings`): wins, then - when Settings > League rules has
"Standings tiebreaker: Head-to-head record" - the record among the teams tied on wins, then
points-for. Any other tiebreak setting is plain wins then points-for. The bracket seeder
(`poSeedBracket`), the playoff picture and the playoff odds all read this one order.

## The phone is the primary layout

Most of the league opens this on a phone, so the phone is not a fallback. Two widths are checked:
**375px** (what most people have) and **320px** (the narrowest thing anyone will open it on). `html`
and `body` are both `overflow-x:hidden`, which means anything wider than the viewport is **not
scrolled to, it is cut off** - so an overflow here is lost content, not a scrollbar.

Rules that came out of auditing every view at both widths:

- **Never floor a grid track in pixels.** `repeat(auto-fill, minmax(270px,1fr))` promises a column
  width the viewport cannot always keep; at 320px the track is wider than the card holding it and
  the surplus is clipped. Write `minmax(min(270px,100%),1fr)` - the same intent on a wide screen,
  and it collapses on a narrow one. Every auto-fill grid in the sheet uses this form.
- **`1fr` is not `minmax(0,1fr)`.** A plain `1fr` track floors at min-content, so one unbreakable
  line sets the whole grid's width. The file says this twice in comments and it caught the schedule
  anyway.
- **An ellipsis needs a width to bite on.** In an `auto` table layout the cell sizes to its content,
  so `text-overflow:ellipsis` on the span inside does nothing. All Teams needed
  `table-layout:fixed` before the name would clip.
- **Tap targets.** WCAG 2.5.8 asks for 24x24 CSS px; 44x44 is the comfortable size. Where a big
  target does not fit, grow the hit area without growing the visual: the Game Center pager is a
  24x30 button drawing a 7px dot in a `::before`. A full 44px there would not fit ten matchups at
  320px, which is what a 20-team league produces.
- **A phone cannot hover.** Anything whose meaning lives only in a `title=` is invisible to most of
  the league, and `:hover` is not an affordance. `@media (hover:none)` gives `.pstat` a dotted
  underline so a tappable name looks like one.
- **A short sideways strip needs the house three**: `touch-action:pan-x`, `overscroll-behavior-x:contain`,
  `overflow-y:hidden`. Without them a sideways drag becomes a page scroll or a browser back-swipe.
  `markScrollStrips()` also fades the edge of a sub-tab strip that has tabs past it - adding a fifth
  Matchups tab pushed Playoffs off-screen with nothing to say it was there.
- **But never `touch-action:pan-x` on anything tall.** The Game Center swipe deck (`.gc-scroll`) is
  the whole matchup card; with pan-x on it a finger starting anywhere on the card could only move
  sideways, and on a phone that is the entire screen - Game Center could not be scrolled at all.
  It shipped that way for a night. The deck keeps `overscroll-behavior-x:contain` (no back-swipe
  off the first matchup) and leaves `touch-action` alone; the browser tells a sideways drag from a
  vertical one by itself. The same goes for the week-stats table wrapper.
- **Real text has a floor.** 9px is a label size, not a reading size: the stat line, the projection
  and the field caption are content and sit at 10.5px (10px below 360px).

## The field line (Game Center)

Every live STARTER row carries a field: his own goal line at one end, the post his team is attacking
at the other, and a team-logo marker where the ball actually is. `fieldSpot(nfl, pos)` then
`fieldBarHTML(nfl, flip, pos)`; the CSS is `.fld*` plus `.h2h-fld` for the phone. The bench and the
reserve sit it out - half of every Game Center page is bench, and a bench player's field position is
not a thing anybody is watching.

The arithmetic. ESPN's `situation.yardLine` is the absolute spot **0-100 measured from the HOME
goal line** - verified against the live feed ("GB 46" with Minnesota at home arrives as 54, "ARI 3"
with the Chargers at home as 97). So a team's own progress up the field is that number when it is
home and its mirror when it is away: `pos = g.home ? g.yl : 100 - g.yl`, where 0 is its own goal
line and 100 the end zone it attacks. One field, oriented per player - the same game shows a
Chargers man at 97 and a Cardinal at 3.

Three questions that come apart, and each drives something different:

- **Orientation** is his NFL team's, always: `pos`.
- **`ours`** - does HIS team have the ball - sets the direction of travel: which end the red band
  sits at, how many yards the tooltip counts, and whether the caption names the offence. His team's
  ball reads "2nd & 7 at LV 38"; the other team's reads "LV ball · 2nd & 7", because a down with
  nobody's name on it reads as his own.
- **`mine`** - is his FANTASY unit on the field - only colours the fill, and follows the same rule
  the football glyph uses (`ballTagHTML`): an offence player when his team has the ball, a **defence
  when the other team does**. So a D/ST row lights up while it is being driven at, and the marker is
  the opponent's logo coming toward its own end zone.

The shell is drawn for the whole of a live game, including the seconds ESPN posts no spot at all.
Drawing a drive then would be a lie, and removing the bar would be worse: Game Center replaces its
markup wholesale every forty-five seconds, and a row that grows and shrinks walks the page under
whoever is reading it. So the track stays and the ball comes off.

What the feed actually does in those gaps, measured over 776 live `situation` objects and the full
play-by-play of four games (553/553 exact rebuilds of `possessionText` from `yardLine`, 261/261 on
the play-by-play, 540/540 on `isRedZone`):

- **After a score**, `possession` and the down text are all absent, `down` is **-1**, and `yardLine`
  is the scoring end zone itself (100 when the home team scored, 0 when the away team did).
- **At halftime**, `state` stays `"in"` and the `situation` object survives *stripped*: no
  possession, no down text, and a `yardLine` of 65 left over from an "End of Half" pseudo-play. It
  is not a ball spot.
- **During the adverts after a score**, the same shape holds for *minutes*: measured live, a field
  goal put ARI@LAC into `down:-1`, `lastPlay.type.text:"Official Timeout"` for seven consecutive
  ten-second polls, half of that game's samples.

So "Between plays" is a poor word for most of the time this state is on screen, and ESPN names the
reason twice over - `status.type.name` for the long breaks, `lastPlay.type.text` for why the ball is
not down. `loadKickoffs` turns them into `pause`: **Halftime**, **End of Q3**, **Timeout**,
**Kickoff**, **After the score**, **Punt away**, and only falls back to "Between plays" when it
recognises nothing.
- **Between quarters**, by contrast, the real spot and down survive, so the bar keeps drawing.
- **Pre and Final** carry no `situation` object at all - nothing to mistake for data.

So `yl` needs a down on the board (`ddT && +sit.down>=1`) and a `yardLine` that is a number by type
(`typeof sit.yardLine === 'number'` - `+null` and `+''` are both 0, which is a real yard line). It
is **not** gated on possession, because ESPN can post the spot a beat before it names the offence;
then the fill draws with no marker. The red-zone band, though, *is* gated on possession:
`isRedZone` outlives the frame that named an offence, and without one there is no end to pin it to.

Both call sites are behind `slateWeek`, so an archive week never borrows today's slate. The bar moves
on the 45-second tick the football already rides (`liveBallOpen`). The marker is positioned in
pixels, not percent (`left:calc(6.5px + (100% - 13px) * var(--p) / 100)`), so a ball on the goal line
still sits inside the track on a phone. A tick at midfield (`.fld-t::after`) keeps 40 and 60 from
being the same picture.

`possessionText` is territory, not the offence: "MIA 22" can be Las Vegas's ball in Miami's half.
The rule ESPN follows is `yardLine<50 ? home+' '+yardLine : yardLine>50 ? away+' '+(100-yardLine)
: '50'`, and `situation.possession` is a **string** holding `team.id`.

`--gold` is otherwise reserved for trophies and champions; the goal post is the one exception,
because a goal post is yellow in life and reads as one instantly at nine pixels.

## Live injury news (Game Center)

ESPN's injury feed - the same one the Players tab reads - carries the in-game news the moment
RotoWire posts it: "ruled out for the rest of Sunday's game", "questionable to return", "has
returned to Sunday's game", and ninety minutes before kickoff the inactives. Each line is stamped
to the minute. The `status` field is **no use** for any of it: a man carted off in the second
quarter is listed "Questionable", which is next week's designation. The signal is a line stamped
on his game day, read for what it says.

`injNewsClass(text, pre)` sorts a line into `out`, `back`, `q` (hurt, being looked at), and before
kickoff only `inactive` or `ok`; anything else - and every post-game recap, "rushed 21 times for 83
yards" - is null. Checked against a live 800-line feed: every game-day line it catches is what it
claims to be. The relay carries a port of it (`injNewsClass` / `injNewsOf` in `score.mjs`) for the
push alerts - see Injury alerts under Push notifications - and the two must stay in step. `injNewsFor(p)` applies it to a rostered player: the line has to fall between two
hours before his kickoff (`gameOf(p.nfl).kick`) and five hours after, "pre" means before the
kickoff, and the body part comes from the feed's `details.type` (now kept on the map as `where`)
or the "(calf)" the line opens with. It returns `{cls, pre, at, tag, note}`; the tag is the word
on the pill - "Out · knee", "Hurt · hamstring", "Back in the game", "Inactive", "Active".

Where it shows. Both Game Center layouts print the pill (`.gc-inj`, `injNewsTagHTML`) under the
player's game clock: inline in the desktop column, and on the phone in a grid row of its own
(`.h2h-inj`) spanning the name and the score - the 75px meta column turned "Out · hamstring" into
"Out · ha...". The designation badge Sleeper carries (Q, D, OUT: `injById`) sits by the name in
both layouts too, and the game's own word outranks it: a man ruled out in the second quarter is
not also "Q". The scoring popup prints the same line in full with when it landed (`.gs-inj`),
and off the slate falls back to the designation with ESPN's note on it.

How it refreshes. `renderGameCenter` calls `gcInjRefresh()` when the week on screen is the slate
and `slateActive()`; that asks `fetchEspnInjuries(false, INJ_LIVE_MS)` - three minutes - and a
fresh file redraws the board once (the redraw finds it fresh and stops). Game Center already
redraws on the minute pulse, so the pills are never more than about three minutes behind the
feed. The file is 350 KB on the wire and nine megabytes parsed, which is why the beat is three
minutes and not one, why nothing polls unless the board is open on a live slate, and why the
fetch is deduplicated (`ESPN_INJ.p`) - the Players tab keeps its twenty-minute copy. The Refresh
button pulls it too. `gcInjToasts()` says a fresh line about one of your own starters once, as a
toast, and only a line under twenty minutes old - not the page's first look at an old one.

## One game's scoring (the popup behind a Game Center name)

A name in Game Center opens `openGameScore(pid, wk, season)` - that game and only that game -
instead of the career modal (`#gsModal`, `renderGameScore`; both layouts pass the week and season
being viewed, so an old week opens its own file rather than today's). A row on the Week stats page
opens the same popup on the week that page is showing (`WK.week`); a name on the Waivers tab - the
wire rows and the Trending card - and on My Team's roster opens it through `openGameScoreNow(pid)`,
on the week being played (which stays the week just finished until Thursday, the question a claim
or a lineup asks). All Teams and the main Players list still open the season/career page. The
season and career are one link away in the popup's footer (`openPlayer`).

The eyebrow is a week picker (`.gs-wksel`, `gsSetWeek`): week 1, week 2 and so on for the same
player without leaving the popup. The weeks on offer are the ones that have been played - the same
list the Week stats page uses (`wkStatWeeks`), or all of `REG_WEEKS` for a past season - plus
whatever week the popup was opened on, so a future week from Game Center stays selectable.
`gsEnsureWeek()` fetches the chosen week's stat file and fixture if they are not already in hand;
it is the same tail `openGameScore` runs.

`weekScoreBreakdown(st, pos)` is `scoreWeekStats` kept as rows instead of a running total, in the
same order and with the same rules: the per-game bonuses are rows (with the yardage that earned
them) and so is the defence's points-allowed tier. It deliberately does **not** guard on
`pts_allow`, because the scorer does not either - a defence in a scoreless first quarter has no
`pts_allow` key at all (Sleeper writes the tier flag `pts_allow_0` instead) and is scored as a
shutout until somebody scores on it. `renderGameScore` adds the rows up and compares them against
`scoreWeekStats`; a difference of 0.005 or more becomes an "Other" row, so a rule that ever drifts
out of the list shows up instead of a table that quietly disagrees with the number above it.
Checked against the live week-1 file: 396 rostered players and 12,234 stat-line/position
combinations, every one tying out exactly.

Points show a second decimal only where a per-yard rule makes it real (`gsPts`: 11.48 adds up in the
column, 11.5 does not); a negative line is red; the header carries the player's game clock and the
football when his side has the ball. No stat line reads off the clock - "yet to play" before
kickoff, "nothing on the board yet" during, "did not play" after. The popup redraws with Game
Center (the hook sits before the layout branch), so a live number climbs while it is open. On a
phone the category wraps so the points column stays on screen instead of behind a sideways swipe.

## When the week ends

Two clocks, both in the device's local time, both off `NFL_2026_WEEK1` (Thursday Sep 10):

| When | What | Where |
| --- | --- | --- |
| **Tuesday 4:00 AM** | The week is over and **the next one starts**. Results count (`weekIsOver` → `resultScore`, standings, recaps). `currentNflWeek()` rolls over: the new slate loads (`loadKickoffs`), Matchups and Game Center open on it (`muWeekDefault`), lineups unlock (`playerKickoff` reads the new slate, all of it still to kick off), and the live score post stops for the finished week (`maybeAutoScore` → `weekIsOver`), so its totals are frozen with the lineups that played. | `weekOverAt(wk)` = week start + 5 days, 04:00; `currentNflWeek` = 1 + whole weeks since `weekOverAt(1) − 7d` |
| **Wednesday 4:00 AM** | Game-locked free agents clear the wire and become plain adds. That is one day *into* the next week, so `gameLockFor` keeps last week's kickoffs in `NFL_KICKS_PREV` (`loadPrevKicks`, fetched once while the window is open) and holds anyone whose team played. | `weekClearAt(wk)` = `weekOverAt` + 24h |

Thursday is nothing special any more: it is the first kickoff of the week that started on Tuesday.
The one thing that still keys on it is **which week has been played**: `weekGamesBegun(wk)` /
`lastBegunWeek()` (Thursday of that week) drive the Week stats page's list (`wkStatWeeks`) and the
week the wire and My Team open the scoring popup on (`openGameScoreNow`) - on a Tuesday those want
last week, the one with numbers in it, not the one that has not kicked off.

Before this, the week rolled over on Thursday and lineups stayed locked until then, which on a
Tuesday read as "why is everyone still locked, it's week 2". `autoScoreWeek` (the commissioner's
official score) still recomputes from the current lineup when it is run - run it before Tuesday's
moves if the official number matters, or trust the frozen live post, which is what everything
reads anyway.

## Game Center score style

Settings > Look & Alarms > **Game Center scores** (`S.gcScore = {family,size,color,lead,proj}`,
`setGcScore`/`resetGcScore`/`renderGcScore`, admin-only, staged behind the Apply bar like every
league setting). `applyGcScoreStyle()` sets five CSS variables on `:root` - `--gc-font`, `--gc-size`
(`GC_SIZES`: compact 13px, normal 16px, large 20px, huge 24px; normal is the design), `--gc-color`,
`--gc-lead`, `--gc-proj` - and the score rules (`.gc-pts`, `.gc-tot`, `.gc-proj`, `.h2h-pts`, `.h2h-htot`,
`.h2h-proj`) read them with the design's values as fallbacks; totals are 1.3x the player line, the
projection line .8x (.62x on a phone), the phone score tracks are `minmax(42px,auto)` so they grow.
A font outside the four typography roles is fetched by `#gcScoreFont`. Runs at boot, in
`reRenderLive` (remote settings) and on every change. The mono typography role no longer lists
`.gc-pts`/`.gc-tot`, so its colour cannot override the score card.

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
