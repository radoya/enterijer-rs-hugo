# enterijer.rs Hugo Site

Multilingual Hugo site za enterijerski sadržaj.

## Stack
- Hugo static site generator
- Custom dark theme `enterijer-theme`
- Cloudflare Pages (deploy target)
- Markdown content — upravlja se iz Obsidian vaulta (`enterijer-rs-vault`)

## Jezici
| Jezik | Kod | Status | Domen |
|-------|-----|--------|-------|
| Srpski | `sr` | **Aktivan** | enterijer.rs |
| Engleski | `en` | Draft | interior.enterijer.rs |
| Nemački | `de` | Draft | innen.enterijer.rs |
| Italijanski | `it` | Draft | interno.enterijer.rs |
| Španski | `es` | Draft | interior-es.enterijer.rs |
| Francuski | `fr` | Draft | interieur-fr.enterijer.rs |
| Ruski | `ru` | Draft | interior-ru.enterijer.rs |
| Kineski | `zh` | Draft | interior-zh.enterijer.rs |
| Arapski | `ar` | Draft | interior-ar.enterijer.rs |
| Hrvatski | `hr` | Draft | interior-hr.enterijer.rs |
| Bosanski | `bs` | Draft | interior-bs.enterijer.rs |

## Lokalni razvoj
```bash
hugo server -D --bind 0.0.0.0 --port 1313
```

## Build
```bash
hugo --gc --minify
```

## Deploy
Cloudflare Pages auto-deployuje na push `main`.

## Content Pipeline
1. Piše/generiše se u Obsidian vaultu
2. Sync u `content/<lang>/`
3. Commit + push → Cloudflare build → Live
