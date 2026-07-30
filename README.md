# FF-Site

**Bitch Boy League** - a single-file fantasy football app for a 14-year league.

Live: https://curtisawe-cmd.github.io/FF-Site/

Vanilla HTML/CSS/JS in one file, no build step. Live draft room with pick clock and
auto-pick, matchups and standings, Game Center, trades, chat, injury report, stats,
recaps, and 2012-2025 league history. League state syncs live through Firebase; player
data and scoring come from the public Sleeper and ESPN APIs.

Open `index.html` in a browser to run it. Push to `main` to deploy.

## Layout

```
index.html                       # the entire app
netlify.toml                     # Netlify config (Pages is what actually serves it)
CLAUDE.md                        # architecture notes
.claude-plugin/marketplace.json  # unrelated: Claude Code plugin marketplace (below)
```

Backups and source art live outside this repo in `Desktop\Website Stuff\Fantasy FB\`.

## Also a Claude Code plugin marketplace

This repo doubles as a [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin
marketplace. It has nothing to do with the fantasy football app; the two just share a
repo.

```
/plugin marketplace add curtisawe-cmd/FF-Site
/plugin install taste-skill@ff-site
```

| Plugin | Description | Source |
| --- | --- | --- |
| `taste-skill` | Frontend design taste skills (brutalist, minimalist, soft, redesign, stitch, and more) by [leonxlnx](https://github.com/Leonxlnx/taste-skill). | git (`https://github.com/Leonxlnx/taste-skill.git`) |
