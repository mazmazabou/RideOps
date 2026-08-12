#!/usr/bin/env bash
# Commit local files to GitHub main via API (bypasses broken local git).
# Usage: scripts/gh-commit.sh "message" file1 [file2 ...]
set -euo pipefail
REPO="mazmazabou/RideOps"
MSG="$1"; shift

PARENT=$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
BASE_TREE=$(gh api "repos/$REPO/git/commits/$PARENT" --jq .tree.sha)

TREE_ITEMS="["
SEP=""
for f in "$@"; do
  BLOB=$(gh api "repos/$REPO/git/blobs" -X POST \
    -f content="$(base64 -i "$f")" -f encoding="base64" --jq .sha)
  TREE_ITEMS+="$SEP{\"path\":\"$f\",\"mode\":\"100644\",\"type\":\"blob\",\"sha\":\"$BLOB\"}"
  SEP=","
done
TREE_ITEMS+="]"

TREE=$(gh api "repos/$REPO/git/trees" -X POST \
  --input <(printf '{"base_tree":"%s","tree":%s}' "$BASE_TREE" "$TREE_ITEMS") --jq .sha)
COMMIT=$(gh api "repos/$REPO/git/commits" -X POST \
  --input <(printf '{"message":%s,"tree":"%s","parents":["%s"]}' \
    "$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
    "$TREE" "$PARENT") --jq .sha)
gh api "repos/$REPO/git/refs/heads/main" -X PATCH -f sha="$COMMIT" --jq .object.sha >/dev/null
echo "Committed: $COMMIT"
