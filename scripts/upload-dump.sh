#!/usr/bin/env bash
# Uploads a sunnah.com data snapshot to the private R2 bucket read by the ETL.
# Download it first in a browser (the link is behind a Cloudflare challenge):
#   https://sunnah.com/HadithTable.sql.gz
# Usage: npm run upload-dump -- ~/Downloads/HadithTable.sql[.gz]
set -euo pipefail

BUCKET=muslimreminder-sources
KEY=sunnah/HadithTable.sql.gz
SOURCE=${1:?Usage: npm run upload-dump -- <HadithTable.sql or HadithTable.sql.gz>}

[[ -f "$SOURCE" ]] || { echo "File not found: $SOURCE" >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if [[ "$SOURCE" == *.gz ]]; then
    gzip -t "$SOURCE"
    cp "$SOURCE" "$TMP/dump.sql.gz"
else
    gzip -9 -c "$SOURCE" > "$TMP/dump.sql.gz"
fi

# Sanity check: it must be the HadithTable dump.
# (no pipefail here: `head` closing the pipe early is expected)
(set +o pipefail; gzip -dc "$TMP/dump.sql.gz" | head -c 5000000 | grep -q 'CREATE TABLE `HadithTable`') \
    || { echo "This does not look like the sunnah.com HadithTable dump" >&2; exit 1; }

echo "Uploading $(du -h "$TMP/dump.sql.gz" | cut -f1) to r2://$BUCKET/$KEY"
npx -y wrangler@4 r2 object put "$BUCKET/$KEY" --remote --file "$TMP/dump.sql.gz" --content-type application/gzip
echo "Done. The next 'Publish content' run will use it."
