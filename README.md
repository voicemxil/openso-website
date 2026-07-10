# OpenSO website

The static site for OpenSO (plain HTML/CSS/JS, no build step): landing page, news/blog, account
registration + management, and downloads. Hosted free on **GitHub Pages** at **openso.org**; the account
forms talk to the game server's **FSO.Server.Api.Core** (`userapi`) at **api.openso.org**.

This is a **dedicated repo with the site at the root**. Pages deploys straight from the `main` branch
(**Settings → Pages → Source: Deploy from a branch**, branch `main` / root) — there is no Actions
workflow and no build step. `.nojekyll` at the repo root tells Pages to serve every file as-is instead
of running it through Jekyll (which would otherwise ignore `_`-prefixed paths and reprocess the HTML).

## Layout

```
Browser ─▶ GitHub Pages (openso.org, this repo)
                 │  register / password / reset forms POST (HTTPS, form-encoded)
                 ▼
        api.openso.org  ──▶  FSO.Server.Api.Core (your box, HTTPS via Caddy)
```

| File | Purpose |
|------|---------|
| `index.html` | Landing page |
| `news.html` / `post.html` | News list + single-post viewer |
| `news/feed.json` | Post index (also consumed by the launcher) |
| `news/posts/<slug>.md` | Post bodies (Markdown) |
| `register.html` / `confirm.html` | Signup (email-verification flow) + email-link landing |
| `login.html` / `reset.html` | Account management + reset-link landing |
| `download.html` | Platform downloads (GitHub Releases) |
| `assets/openso.js` | `OPENSO_API_BASE` + `opensoPost()` + friendly errors |
| `assets/news.js` | News feed loader + a small Markdown renderer |
| `assets/styles.css` | Brand styles |
| `CNAME` | Custom domain (`openso.org`) |

## News / blog (and the launcher hook)

Add a post:

1. Write `news/posts/<slug>.md` (Markdown — headings, lists, links, images, code, quotes).
2. Add an entry to the top of `news/feed.json`:
   ```json
   { "slug": "<slug>", "title": "…", "date": "2026-07-01", "author": "OpenSO Team",
     "summary": "One-line teaser.", "tags": ["update"], "image": "/assets/splash.png" }
   ```

The site renders the feed at `news.html` and posts at `post.html?p=<slug>`.

**The launcher reads the same feed** — `GET https://openso.org/news/feed.json` for recent headlines, and
opens `https://openso.org/post.html?p=<slug>` for the full article. Image/`url` paths in the feed are
site-root-relative (`/assets/…`); a non-browser consumer prepends `https://openso.org`. Keep the JSON
shape stable so the launcher integration doesn't break.

## Going live

1. **API base** — `assets/openso.js` `OPENSO_API_BASE` is already `https://api.openso.org`. Change only
   if your API host differs.
2. **Registration mode** — `register.html` defaults to email verification (`USE_EMAIL_VERIFICATION = true`),
   which needs SMTP on the server (see `docker/DEPLOY.md` in the game repo). Set to `false` for direct,
   no-email registration.
3. **CORS** — already handled: the server's default CORS policy allows any origin on the public
   `userapi/registration` + `userapi/password` endpoints, so no server change is needed.
4. **Deploy** — push to `main`; GitHub Pages serves the branch directly, no build/Actions step involved.
   In repo **Settings → Pages**: Source = **Deploy from a branch**, Branch = `main` / `(root)`,
   Custom domain = `openso.org`, **Enforce HTTPS**.

DNS for the apex (Cloudflare) → GitHub Pages IPs `185.199.108–111.153` (A records), `www` CNAME →
`voicemxil.github.io`. The `api`/`game` records (→ your box, DNS-only) and the full server bring-up are in
the game repo's **`docker/DEPLOY.md`**.

## Local preview

```bash
python3 -m http.server 8080   # from the repo root, then open http://localhost:8080
```

Account forms won't succeed locally unless `OPENSO_API_BASE` points at a reachable API. The news pages
work fully offline.
