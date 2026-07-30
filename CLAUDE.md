# Bitch Boy League - Fantasy Football Site

A single-file fantasy football app for Curtis's 14-year league. Vanilla HTML/CSS/JS,
no build step, no bundler. The entire app is `index.html` (~5,700 lines). Open it in a
browser to preview; that is the whole dev loop.

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
| `netlify.toml` | yes | Netlify config (publish `.`, no build, SPA fallback). Pages is what actually serves the site. |
| `README.md` | yes | Repo readme. |
| `.claude-plugin/marketplace.json` | yes | Unrelated. This repo doubles as a Claude Code plugin marketplace. |
| `.claude/` | no | Gitignored. |
| `designer-portfolio/` | no | Untracked scratch, not part of the site. |

## Architecture

One file, three layers, in this order:

1. **Markup** - 12 `section.view` blocks, one per page, toggled by `showView(name)`.
   Views: `home matchups teams players draft trades chat stats settings` have nav tabs
   (`data-view="..."`); `history polls recaps` have **no nav tab** and are reached only
   from in-page buttons (`onclick="showView('recaps')"`). Easy to miss when auditing nav.
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

- Everything inline in `index.html`. Don't split into separate CSS/JS files.
- Commit messages are short and describe the user-visible change ("Line up the standings
  columns across divisions", "Drop the Giphy GIF search").
- The league's voice is crude and funny (see `PICK_INSULTS`). Match it in user-facing
  copy; don't sanitize it.
- Working tree should stay clean. `designer-portfolio/` is untracked on purpose.

## Gotcha: the `feat/scoring-engine` branch is dead

`381704d` "Add custom scoring engine (Phase 1)" from 2026-07-24 is 1 ahead / 105 behind
`main`. It was superseded by the auto-scoring work that landed on `main` on 07-29. Don't
merge it.
