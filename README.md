# data-etl

Fetches Muslim Reminder content from external sources, formats it with
[`@muslimreminder/schema`](https://github.com/muslimreminder/schema) and publishes it to
Cloudflare R2, served by `https://cdn.muslim-reminder.com/v1/`.

Apps never call the sources: they read the CDN (`manifest.json`, then the hashed files).

## Sources

| Content | Source | Languages |
| --- | --- | --- |
| Hadiths | [sunnah.com API](https://sunnah.stoplight.io/docs/api), enriched by the sunnah.com data snapshot | ar, en |

### sunnah.com data snapshot (hybrid)

The API is the base (collections, books, chapters, every hadith). The snapshot
(`HadithTable.sql.gz`, a MySQL dump) enriches it, joined on the Arabic URN:

- **sanad/matan** segments from its `[prematn]`/`[matn]` markup (≈ 90 % of the six major
  collections), kept only when they spell exactly the published Arabic text;
- hadiths the API fails to serve (e.g. Bukhari 6940).

The snapshot lives in the private R2 bucket `muslimreminder-sources` (`sunnah/HadithTable.sql.gz`).
Without it, the ETL still publishes, without segments. To refresh it, download
https://sunnah.com/HadithTable.sql.gz **in a browser** (it is behind a Cloudflare challenge), then:

```sh
npm run upload-dump -- ~/Downloads/HadithTable.sql.gz   # uses wrangler (Cloudflare login)
```

sunnah.com plan: **5 requests/second, 5,000 requests/day**. The client stays at 4 req/s,
slows down on `429` and stops at 4,500 requests. A full run takes roughly half of the daily quota.
Collections or books without hadiths in the API (e.g. `nawawi40`) are not published.

## Output

```
v1/manifest.json                                     max-age=300
v1/hadith/collections.<hash>.json                    immutable
v1/hadith/<collection>/books.<hash>.json             immutable
v1/hadith/<collection>/books/<book>.<hash>.json      immutable
```

Changed files are uploaded first, the manifest last. Unchanged content uploads nothing.
Old hashed files are left in the bucket (a few MB): clients only follow the manifest.

## Run

```sh
npm ci
SUNNAH_API_KEY=... npm run etl -- --collections hisn              # → ./out (local)
SUNNAH_API_KEY=... npm run etl -- --collections bukhari --dump ~/Downloads/HadithTable.sql.gz
npm run etl -- --target r2 --collections bukhari --dry-run        # compare with R2, upload nothing
npm run etl -- --help
```

In production: GitHub Actions → **Publish content** (manual, optional `collections` and `dry_run`,
plus a monthly schedule). Secrets (organization): `SUNNAH_API_KEY`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

## Development

```sh
npm run check   # typecheck + tests
```

Node ≥ 24 runs the TypeScript sources directly (type stripping): no build step.
