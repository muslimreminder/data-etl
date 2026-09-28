# data-etl

Fetches Muslim Reminder content from external sources, formats it with
[`@muslimreminder/schema`](https://github.com/muslimreminder/schema) and publishes it to
Cloudflare R2, served by `https://cdn.muslim-reminder.com/v1/`.

Apps never call the sources: they read the CDN (`manifest.json`, then the hashed files).

## Sources

| Content | Source | Languages |
| --- | --- | --- |
| Hadiths | [sunnah.com API](https://sunnah.stoplight.io/docs/api), enriched by the sunnah.com data snapshot | ar, en |
| Quran translations | [QUL](https://qul.tarteel.ai/resources/translation) files downloaded by hand | fr, en, tr, de, es, ru |
| Quran word-by-word translations | QUL `*-wbw-translation.json` files, downloaded by hand | fr, en, tr |

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

### QUL translations

QUL has no API and its downloads need an account. The published translations are hand-picked
in [`src/sources/qul/catalog.ts`](src/sources/qul/catalog.ts) (QUL id, and which download to take:
`translation-with-footnote-tags.json` when it exists, else `simple.json`). When QUL announces an
update, download the files in a browser, then:

```sh
npm run upload-qul -- --dry-run ~/Downloads   # recognizes and checks the files, uploads nothing
npm run upload-qul -- ~/Downloads             # → r2://muslimreminder-sources/qul/translations/<id>.json (wrangler)
npm run upload-qul -- es-montada=~/Downloads/montada-…-2.json   # when QUL names two files the same
```

and run **Publish content** with `content = quran-translations` (`quran-word-translations` for the
word-by-word files, catalog in [`src/sources/qul/words.ts`](src/sources/qul/words.ts)). Word by word,
each word keeps its position in the verse, `null` when the source leaves it to the word before. Verses are published as plain
text; footnotes are taken out of the text and kept with the offset of their marker.
`retrievedAt` is the upload date of the source file, so an unchanged source publishes nothing.
A translation whose source is missing keeps its published version.

## Output

```
v1/manifest.json                                     max-age=300
v1/hadith/collections.<hash>.json                    immutable
v1/hadith/<collection>/books.<hash>.json             immutable
v1/hadith/<collection>/books/<book>.<hash>.json      immutable
v1/quran/translations.<hash>.json                    immutable
v1/quran/translations/<id>.<hash>.json               immutable
v1/quran/word-translations.<hash>.json               immutable
v1/quran/word-translations/<id>.<hash>.json          immutable
```

Changed files are uploaded first, the manifest last. Unchanged content uploads nothing.
Old hashed files are left in the bucket (a few MB): clients only follow the manifest.

## Run

```sh
npm ci
SUNNAH_API_KEY=... npm run etl -- --collections hisn              # → ./out (local)
SUNNAH_API_KEY=... npm run etl -- --collections bukhari --dump ~/Downloads/HadithTable.sql.gz
npm run etl -- --target r2 --collections bukhari --dry-run        # compare with R2, upload nothing
npm run etl -- --content quran-translations --qul ~/qul   # folder of <id>.json → ./out
npm run etl -- --help
```

In production: GitHub Actions → **Publish content** (manual, `content`, optional `collections` and
`dry_run`, plus a monthly schedule for hadiths). Secrets (organization): `SUNNAH_API_KEY`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

## Development

```sh
npm run check   # typecheck + tests
```

Node ≥ 24 runs the TypeScript sources directly (type stripping): no build step.
