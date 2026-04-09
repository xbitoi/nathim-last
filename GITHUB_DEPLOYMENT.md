# GitHub Deployment Status

## Repository

**URL**: https://github.com/xbitoi/nour-agent  
**Branch**: `main`  
**Remote name**: `github`

## GitHub Pages

**Live URL**: https://xbitoi.github.io/nour-agent/  
**Status**: Live — HTTP 200  
**Build type**: `legacy` (serves directly from branch/folder)  
**Source branch**: `main`  
**Source folder**: `/docs`  

GitHub Pages serves the `docs/` folder on the `main` branch directly — no build step required.

## Verified Configuration (2026-04-04)

```json
{
  "build_type": "legacy",
  "source": {
    "branch": "main",
    "path": "/docs"
  },
  "status": "built",
  "html_url": "https://xbitoi.github.io/nour-agent/"
}
```

```
Live URL: https://xbitoi.github.io/nour-agent/ → HTTP 200 OK
```

## Setup Script

To reproduce this deployment from scratch:

```bash
GITHUB_PAT=<your-token> ./scripts/setup-github-pages.sh
```

Required token scopes: `repo`, `pages`

The script will:
1. Configure `github` remote with the provided token
2. Push `main` branch (force)
3. Clean the token from the remote URL immediately after push
4. Enable GitHub Pages via POST `/repos/xbitoi/nour-agent/pages` with `source.branch=main, source.path=/docs`
5. If Pages already exists (409), update via PUT with the same source config
6. Verify the configuration and live URL

## Files Served

The `docs/` folder contains:
- `index.html` — Arabic/English landing page for the project
- `.nojekyll` — disables Jekyll processing
