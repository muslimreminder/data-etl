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
| Surah introductions | [QUL surah info](https://qul.tarteel.ai/resources/surah-info) `surah-info-<lang>.json` files, downloaded by hand | en, ur, ml, id, it |
| Tafsirs | [QUL tafsir](https://qul.tarteel.ai/resources/tafsir) JSON files, downloaded by hand | ar ×2, en ×2, fr, ru ×3, sq |
| Quran recitations | [QUL recitation](https://qul.tarteel.ai/resources/recitation) ayah-by-ayah files, downloaded by hand; the audio itself from the CDNs those files point to | ar ×7 |

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

### Sync QUL (automatic)

The **Sync QUL** workflow (every Monday, or by hand) does what the sections below describe by hand,
for every resource of the QUL catalogs ([`src/sources/qul/resources.ts`](src/sources/qul/resources.ts)):

1. signs in to QUL with the `QUL_TOKEN` organization secret, downloads each resource page's file
   (the same download as by hand), unzips it, checks its name and content;
2. uploads to `muslimreminder-sources` only the files whose bytes changed (MD5 against the R2 ETag),
   so an unchanged source never gets a new `retrievedAt`;
3. runs the ETL for the changed kinds of content, then starts **Mirror recitation audio** for the
   changed recitations;
4. compares the QUL listings with `qul/known-resources.json` (sources bucket) and posts the resources
   QUL added on the Muslim Reminder Telegram group (QUL topic; failures are posted there too). Adding one stays a choice: append it to its catalog (QUL id = the
   number in its page URL), merge, and the next sync downloads and publishes it.

The app then refreshes its embedded catalogs through its own **Embed content** workflow (a PR).

`QUL_TOKEN` is the value of the `_quran_com-community_session` cookie of https://qul.tarteel.ai,
copied from the browser once signed in (DevTools → Application → Cookies). When it expires, the run
fails with "the QUL session cookie has expired" (and says so on Telegram): sign in again and replace the
secret. Telegram uses the `TELEGRAM_BOT_TOKEN` secret (the bot of the ticket notifications); the chat and
topic are set in the workflow. Locally:

```sh
QUL_TOKEN=… R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… npm run sync-qul -- --dry-run
```

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

Surah introductions (`content = quran-surah-infos`, catalog in
[`src/sources/qul/surah-infos.ts`](src/sources/qul/surah-infos.ts)) are uploaded the same way. Their
HTML becomes plain-text blocks (`heading`, `paragraph`, `list`); a surah whose text is shorter than
200 characters (a bare cross-reference such as "Vedi Appendice 1.") is published as `null`. The Tamil
file is left out: it repeats the introduction of Al-Imran for every surah.

Tafsirs (`content = quran-tafsirs`, catalog in [`src/sources/qul/tafsirs.ts`](src/sources/qul/tafsirs.ts),
several per language) are uploaded the same way. QUL explains verses in groups: each group becomes a
passage `{ from, to, blocks }` of its surah, with blocks `heading`, `paragraph`, `list` and `quote` (the
verse translation some tafsirs quote first). A verse whose text is empty has no passage. Per-source fixes:
the editors' notes `[[…]]` of the Arabic Ibn Kathir are dropped, the Quran words of the Russian Ibn Kathir
are spaced again, the line-end hyphens of the Russian Saadi are joined, and backticks become `ʿ` (or `’`
in Albanian). The Turkish "Tafsir Ibne Kathir" (QUL 306) is left out: it only holds the verse translation.

### Quran recitations

Recitations (`content = quran-recitations`, catalog in
[`src/sources/qul/recitations.ts`](src/sources/qul/recitations.ts)) are uploaded like the rest, from the
**ayah-by-ayah** downloads of QUL (`ayah-recitation-<reciter>….json`). Each verse becomes
`{ duration, words }`, every word `[word, start, end]` in milliseconds from the start of its verse, so
the apps can follow the recitation word by word. The words are numbered as in the word-by-word
translations; the sources leave a few segments out of order or repeat a word, which the ETL puts back
in order. A verse the source does not time is published with no words and is simply played whole.

#### Audio files

The apps never play the source CDNs: the audio is mirrored to the content bucket, one file per verse at
`v1/quran/audio/<id>/<sss><vvv>.mp3` (see `quranVerseAudioPath` in the schema), at the sources' own bitrate
(128 kbps, roughly 700 MB per recitation and 5 GB for the seven). The manifest does **not**
list them — 6,236 files per recitation, 43,652 in all — so the apps compute the path; `quran/recitations/<id>`
is what says which verses exist. The files never change, so they are cached for a year like the hashed ones.

```sh
npm run mirror-audio -- --qul ~/Downloads --out ./out        # local, to see what it writes
npm run mirror-audio -- --target r2                          # every recitation, ~700 MB each
npm run mirror-audio -- --target r2 --recitations al-husary
npm run mirror-audio -- --target r2 --dry-run                # download and count, upload nothing
```

### Quran mushafs

A mushaf the apps download instead of the one they ship (`content = quran-mushafs`, catalog in
[`src/sources/qul/mushafs.ts`](src/sources/qul/mushafs.ts)), for now the KFGQPC V4 tajweed one. It takes three
QUL resources: the word-by-word glyph script (`quran-script/47`, `qpc-v4.json`) and the layout
(`mushaf-layout/19`, `qpc-v4-tajweed-15-lines.db`, a SQLite database), both downloaded by "Sync QUL" to
`qul/mushafs/<id>/`, and the page fonts (`font/240`), which QUL serves publicly: the ETL downloads the 604
TTFs itself on every run (167 MB).

- `quran/mushafs/<id>` holds the lines of every page (`surah-name`, `basmala`, or words
  `[surah, ayah, word, glyphs]`, word 0 being the verse-end marker) and the font of each page.
- The fonts are binary assets at `v1/quran/mushafs/<id>/fonts/<ppp>.<sha8>.ttf`. The layout file lists them,
  with their hash; the manifest does not. They are uploaded before the layout file.
- The fonts are COLR v0 color fonts. Their black layers are switched to the text color (palette index
  `0xFFFF`), so an app can still color a word to highlight it; the tajweed colors are kept.
- The ETL fails when a page font cannot draw a word of its page.

QUL's V4 print (1441H) breaks its lines differently from the V1 print the app ships, and about 70 pages end
on different verses: a mushaf brings its own pagination.

In production: GitHub Actions → **Mirror recitation audio** (manual). A run takes hours and is
resumable: it lists what the bucket already holds and downloads only the rest, so an interrupted run is
finished by starting it again. Only a recitation whose source changed ever needs mirroring again.

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
v1/quran/surah-infos.<hash>.json                     immutable
v1/quran/surah-infos/<id>.<hash>.json                immutable
v1/quran/tafsirs.<hash>.json                         immutable
v1/quran/tafsirs/<id>.<hash>.json                    immutable
v1/quran/recitations.<hash>.json                     immutable
v1/quran/recitations/<id>.<hash>.json                immutable
v1/quran/audio/<id>/<sss><vvv>.mp3                   immutable, not in the manifest
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
npm run etl -- --content quran-recitations --qul ~/Downloads     # timings only; audio: npm run mirror-audio
npm run etl -- --content quran-mushafs --qul ~/qul        # script.json + layout.sqlite, fonts from QUL
npm run etl -- --help
```

In production: GitHub Actions → **Publish content** (manual, `content`, optional `collections` and
`dry_run`, plus a monthly schedule for hadiths). Secrets (organization): `SUNNAH_API_KEY`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

## Play KPIs

The **Play KPIs** workflow (every day at 7:00 UTC, or by hand) posts the Google Play figures of the app on
the Muslim Reminder Telegram group, each with its change since the day before:

- **active users**: distinct users of the day from the Android vitals (Play Developer Reporting API, only
  users who share usage & diagnostics with Google, so below the real count), in total and on the versions
  from `MIN_VERSION_CODE` (122 = v1.1.1), with the crash rate of those versions;
- **new installs** (*Daily User Installs*) and uninstalls, from the monthly installs reports Play Console
  writes to its Cloud Storage bucket (`pubsite_prod_<developer id>`).

The vitals lag by ~1-2 days and the installs reports by ~2-3 days: each figure says its day. A source that
fails is reported in the message (⚠️) and fails the run; the other is still posted. The repo is public: the
job logs no figure.

Access: the `play-kpis@muslim-reminder-kpis.iam.gserviceaccount.com` service account (Google Cloud project
`muslim-reminder-kpis`, Play Developer Reporting API enabled), invited in Play Console → Users and
permissions with **View app information and download bulk reports (read only)**. Its JSON key is the
`GOOGLE_PLAY_SA_JSON` repository secret. Locally:

```sh
GOOGLE_PLAY_SA_JSON="$(cat ~/.config/muslimreminder/play-kpis-sa.json)" PLAY_REPORTS_BUCKET=pubsite_prod_4676255388611429065 \
  npm run play-kpis -- --dry-run   # prints the message instead of posting it
```

## Development

```sh
npm run check   # typecheck + tests
```

Node ≥ 24 runs the TypeScript sources directly (type stripping): no build step.
