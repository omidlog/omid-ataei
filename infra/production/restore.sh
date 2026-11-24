#!/usr/bin/env bash
# Restore a Brand OS Studio data backup into an EMPTY directory, after verifying it.
#
#   restore.sh <archive.tar.gz> <target-dir>
#
# Used for the restore drill (restore into a scratch directory and inspect it with an isolated,
# network-less container) and for a real restore (stop Studio, move the old data directory aside,
# restore into a fresh one, fix ownership, start Studio). It never overwrites: a non-empty target is
# refused. The checksum file is verified when present; absolute paths, `..`, links and device files in
# the archive are refused; registry.json must parse.
set -euo pipefail
umask 077

ARCHIVE="${1:-}"
TARGET="${2:-}"
if [[ -z "$ARCHIVE" || -z "$TARGET" ]]; then
  sed -n '2,11p' "$0"
  exit 2
fi
[[ -f "$ARCHIVE" ]] || { echo "archive not found: $ARCHIVE" >&2; exit 1; }
if [[ -e "$TARGET" ]] && [[ -n "$(ls -A "$TARGET" 2>/dev/null)" ]]; then
  echo "refusing to restore into a non-empty directory: $TARGET" >&2
  exit 1
fi

if [[ -f "$ARCHIVE.sha256" ]]; then
  ( cd "$(dirname "$ARCHIVE")" && sha256sum -c --quiet "$(basename "$ARCHIVE").sha256" ) || { echo "checksum mismatch: $ARCHIVE" >&2; exit 1; }
  echo "checksum ok"
else
  echo "warning: no $ARCHIVE.sha256 file; integrity not verified" >&2
fi

# Inspect every entry before extracting anything.
while IFS= read -r line; do
  type="${line:0:1}"
  case "$type" in
    -|d) ;;
    *) echo "refusing archive: entry of type '$type' (links and devices are not allowed)" >&2; exit 1 ;;
  esac
done < <(tar -tvzf "$ARCHIVE")
while IFS= read -r name; do
  case "$name" in
    /*|../*|*/../*|*/..|..) echo "refusing archive: unsafe path '$name'" >&2; exit 1 ;;
  esac
done < <(tar -tzf "$ARCHIVE")

mkdir -p "$TARGET"
chmod 0700 "$TARGET"
tar -xzf "$ARCHIVE" -C "$TARGET" --no-same-owner --no-same-permissions
if [[ -f "$TARGET/registry.json" ]]; then
  if command -v node >/dev/null 2>&1; then
    COUNT="$(node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (!Array.isArray(r.brands)) process.exit(3); console.log(r.brands.length)' "$TARGET/registry.json")" || { echo "registry.json is not a valid Studio registry" >&2; exit 1; }
    echo "registry ok: $COUNT brand(s)"
  elif command -v python3 >/dev/null 2>&1; then
    COUNT="$(python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); assert isinstance(r.get("brands"), list); print(len(r["brands"]))' "$TARGET/registry.json")" || { echo "registry.json is not a valid Studio registry" >&2; exit 1; }
    echo "registry ok: $COUNT brand(s)"
  else
    echo "note: neither node nor python3 found; registry.json not parsed" >&2
  fi
else
  echo "note: the backup has no registry.json (no brands were registered)"
fi
echo "restored into $TARGET"
