#!/usr/bin/env bash
# Back up Brand OS Studio operational state (registry = slug -> repository mapping, provisioning
# records, sync cache). Safe to run while Studio is running: Studio writes its files atomically.
#
#   backup.sh [--data DIR] [--dest DIR] [--keep N]
#     --data  Studio data directory   (default /opt/brand-os-studio/data)
#     --dest  backup directory         (default /opt/brand-os-studio/backups)
#     --keep  archives to keep         (default 14)
#
# Writes studio-data-<UTC timestamp>.tar.gz plus a .sha256 file, both mode 0600. Transient work
# directories are skipped. Secrets are NOT included: .env and secrets/owner.env are kept separately by
# the owner (password manager); owner.env can be recreated with `studio bootstrap-owner` and GitHub
# credentials re-issued. Brand content itself lives in the brand repositories on GitHub.
set -euo pipefail
umask 077

DATA="/opt/brand-os-studio/data"
DEST="/opt/brand-os-studio/backups"
KEEP=14
while [[ $# -gt 0 ]]; do
  case "$1" in
    --data) DATA="${2:?}"; shift 2 ;;
    --dest) DEST="${2:?}"; shift 2 ;;
    --keep) KEEP="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || { echo "--keep must be a positive integer" >&2; exit 2; }
[[ -d "$DATA" ]] || { echo "data directory not found: $DATA" >&2; exit 1; }
[[ -f "$DATA/registry.json" ]] || echo "note: $DATA/registry.json does not exist yet (no brands registered)" >&2

mkdir -p "$DEST"
chmod 0700 "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$DEST/studio-data-$STAMP.tar.gz"
TMP="$ARCHIVE.partial"
tar -C "$DATA" --exclude='./work' --exclude='./work-*' --exclude='*.tmp' -czf "$TMP" .
mv "$TMP" "$ARCHIVE"
( cd "$DEST" && sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256" )
chmod 0600 "$ARCHIVE" "$ARCHIVE.sha256"
echo "backup written: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# Retention: keep the newest $KEEP archives.
mapfile -t OLD < <(ls -1t "$DEST"/studio-data-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))")
for file in "${OLD[@]}"; do
  rm -f -- "$file" "$file.sha256"
  echo "pruned: $file"
done
