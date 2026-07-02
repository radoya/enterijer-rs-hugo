# enterijer.rs Hugo Site

Multilingual (multihost) Hugo sajt za enterijerski sadržaj — jedan Cloudflare Worker servira sve jezičke domene.

## Stack
- Hugo static site generator (**multihost** mode — svaki jezik ima svoj `baseURL`/domen)
- Custom dark theme `enterijer-theme`
- **Cloudflare Workers + Static Assets** (deploy target) — `worker/index.js` + `wrangler.toml`
- Kontakt forma → Worker `/api/contact` → lead fajl u Obsidian vault GitHub repo
- Markdown content — upravlja se iz Obsidian vaulta (`enterijer-rs-vault`)

## Jezici
| Jezik | Kod | Status | Domen |
|-------|-----|--------|-------|
| Srpski | `sr` | **Aktivan** | enterijer.rs |
| Engleski | `en` | **Aktivan** (content draft) | interior.enterijer.rs |
| Nemački | `de` | Disabled | innen.enterijer.rs |
| Italijanski | `it` | Disabled | interno.enterijer.rs |
| Španski | `es` | Disabled | interior-es.enterijer.rs |
| Francuski | `fr` | Disabled | interieur-fr.enterijer.rs |
| Ruski | `ru` | Disabled | interior-ru.enterijer.rs |
| Kineski | `zh` | Disabled | interior-zh.enterijer.rs |
| Arapski | `ar` | Disabled | interior-ar.enterijer.rs |
| Hrvatski | `hr` | Disabled | interior-hr.enterijer.rs |
| Bosanski | `bs` | Disabled | interior-bs.enterijer.rs |

## Lokalni razvoj
```bash
npm run dev            # hugo server -D (multihost: sr na :1313, en na :1314)
npm run build          # hugo --gc --minify → public/sr/ + public/en/
npx wrangler dev       # Worker + statika lokalno (prvo npm run build)
```

## Deploy (Cloudflare Workers Builds)
Workers → Create → connect git repo → Build settings:
- **Build command:** `hugo --gc --minify && npx wrangler deploy`
- Push na `main` → automatski build + deploy.

Ručno: `npm run build && npm run deploy`.

### Kako radi
Hugo multihost builduje svaki jezik u `public/<lang>/`. Worker (`worker/index.js`)
mapira hostname → jezik (`LANG_BY_HOST`) i rewrituje path na `/<lang>/...` pre nego
što ga preda Static Assets bindingu. `www.enterijer.rs` → 301 na `enterijer.rs`.

## Dodavanje novog jezika/domena
1. Kupi domen (ili koristi subdomen) → dodaj zonu u Cloudflare.
2. `hugo.toml`: ukloni `disabled = true` iz `[languages.xx]` bloka i odkomentariši/postavi `baseURL`.
3. `worker/index.js`: dodaj liniju u `LANG_BY_HOST` (`'domen.tld': 'xx'`).
4. Workers dashboard → enterijer-web → Settings → Domains & Routes → **Add custom domain** za novi domen.
5. Push → build → live.

## Kontakt forma (env)
Worker `/api/contact` upisuje lead u `07 - CRM/LEADOVI/` u vault repo preko GitHub contents API.

```bash
npx wrangler secret put GITHUB_TOKEN   # fine-grained PAT, contents:write na vault repo
```
- `VAULT_REPO` — var u `wrangler.toml` (`owner/repo` vault repozitorijuma)
- Opciono (Telegram notifikacija):
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```
Honeypot polje `website` tiho odbacuje botove (303 → `/hvala/`).

## Content Pipeline
1. Piše/generiše se u Obsidian vaultu
2. Sync u `content/<lang>/`
3. Commit + push → Workers Build → Live
