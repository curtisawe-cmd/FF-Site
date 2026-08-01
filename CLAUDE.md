# Bitch Boy League - Fantasy Football Site

A single-file fantasy football app for Curtis's 14-year league. Vanilla HTML/CSS/JS,
no build step, no bundler. The entire app is `index.html` (~7,100 lines, ~456 KB). Open it
in a browser to preview; that is the whole dev loop. It is also an installable PWA and
sends push notifications, which adds a handful of small files around it (see Layout).

Repo: https://github.com/curtisawe-cmd/FF-Site (remote `origin`, branch `main`)
Live: https://curtisawe-cmd.github.io/FF-Site/ (GitHub Pages, `main` branch, `/` root)

## This folder is the only working copy

`Desktop\FF Site\index.html` is the file that deploys. Push to `main` and Pages
publishes it.

There is an archive folder at `Desktop\Website Stuff\Fantasy FB\` holding dated
`league.backup.*.html` snapshots and source art. **Never edit those and never copy one
back over `index.html` without diffing first.** The app used to live there as
`league.html` and the two copies silently drifted; that was resolved on 2026-07-30 by
making this repo authoritative. See `README.txt` in that folder.

## Layout

| Path | Tracked | What it is |
| --- | --- | --- |
| `index.html` | yes | The entire app. Markup, CSS, and JS all inline. |
| `sw.js` | yes | Offline service worker, scope `/FF-Site/`. Network-first for the page. |
| `manifest.json` | yes | PWA manifest. Standalone, portrait, navy theme, three shortcuts. |
| `icon-192/512`, `icon-maskable-512`, `apple-touch-icon` | yes | Install icons. |
| `push/cloudflare-worker.js` | yes | The push relay. Holds the OneSignal REST key. Deployed by hand to Cloudflare, not by CI. |
| `push/onesignal/OneSignalSDK*.js` | yes | OneSignal's service worker, in its own folder so it cannot evict `sw.js`. |
| `netlify.toml` | yes | Netlify config (publish `.`, no build, SPA fallback). Pages is what actually serves the site. |
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

**Role is per device.** `isAdmin()` reads `ffl_role` from that browser's localStorage and is
not synced, so the same account can be commissioner on a laptop and a viewer on a phone.
That asymmetry explains most "it works for me" reports.

A manager's team comes from `myTeamIndex()`. It prefers `window.myClaim` (a one-shot
`dbGet`) and falls back to the streamed `managersMap`. The fallback is load-bearing: the
one-shot read can resolve *after* a view has drawn, and a null team index silently strips a
manager's own controls - it hid the Accept/Counter buttons on trades aimed at them. Anything
gated on team identity must re-render when the claim arrives.

## Push notifications

Three triggers only, and nothing else should be added without asking: **new chat message**
(everyone but the authors, batched 4s), **trade offer** (the recipient only), **trade
accepted** (everyone).

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

## PWA and mobile

Mobile is the layout that matters - the league uses this on phones. Installed via Add to
Home Screen; on iOS that step is **mandatory**, since Safari tabs cannot receive push at
all, and it needs iOS 16.4+.

`sw.js` is network-first for the page. Cache-first would serve a stale app after every
push. Network-first alone was not enough either: GitHub Pages sends `max-age`, so the
worker's own `fetch` was answered from the browser HTTP cache and still served the old app.
Pages are fetched with `cache:'reload'` to force revalidation. Live data hosts (Firebase,
Sleeper, ESPN) are never cached.

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
| `api.sleeper.app/v1/stats/nfl/regular/{yr}` | season + weekly stats | `STATS_TTL_MS` 5m (in-progress week only) |
| `api.sleeper.app/v1/projections/nfl/regular/2026` | projections | - |
| `site.api.espn.com/.../football/nfl/injuries` | injury report | `ESPN_TTL_MS` 20m |
| `sleepercdn.com/content/nfl/players/thumb/{id}.jpg` | player faces | browser |
| `sleepercdn.com/images/team_logos/nfl/{tm}.png` | DEF logos | browser |

Auto-scoring polls every `AUTOSCORE_EVERY_MS` (5m) and is crowd-computed: whichever
member has the app open keeps the board current. Don't assume a server is doing it.

`playerFace(p, size)` is deliberately **shape-agnostic** - it reads `p.id||p.playerId`
and `p.team||p.nfl`, because roster picks and pool players use different field names.
Passing a pick to a version that only read `p.id` produced `.../thumb/undefined.jpg`,
404'd, and silently fell back to initials. Keep it tolerant.

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
- **End the reply with the live link** once the push lands: https://curtisawe-cmd.github.io/FF-Site/
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
