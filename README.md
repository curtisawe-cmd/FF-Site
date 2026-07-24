# ff-site

A [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin marketplace.

## Add this marketplace

```
/plugin marketplace add curtisawe/FF-Site
```

(or point it at a local path / this repo's git URL)

## Plugins

| Plugin | Description | Source |
| --- | --- | --- |
| `hello-world` | Example plugin with a single `/hello` command. Replace with your own. | local (`./plugins/hello-world`) |
| `taste-skill` | Frontend design taste skills (brutalist, minimalist, soft, redesign, stitch, and more) by [leonxlnx](https://github.com/Leonxlnx/taste-skill). | git (`https://github.com/Leonxlnx/taste-skill.git`) |

## Install a plugin

```
/plugin install taste-skill@ff-site
```

## Layout

```
.claude-plugin/marketplace.json   # marketplace manifest
plugins/hello-world/              # local example plugin
```
