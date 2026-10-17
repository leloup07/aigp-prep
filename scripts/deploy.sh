#!/bin/sh
# Builds the app and force-pushes dist/ to the gh-pages branch of the "origin" remote.
# The site is PUBLIC: anyone with the URL can read the study material.
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
npm run build
TMP=$(mktemp -d)
cp -R dist/. "$TMP"
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git add -A
git commit -q -m "Publicación $(date '+%Y-%m-%d %H:%M')"
git push -q -f "$REMOTE" gh-pages
rm -rf "$TMP"
echo "✔ Publicado en la rama gh-pages de $REMOTE"
