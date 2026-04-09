#!/usr/bin/env bash
# setup-github-pages.sh
# Configure GitHub remote, push main, and enable GitHub Pages (source: docs/ on main)
# Usage: GITHUB_PAT=<token> ./scripts/setup-github-pages.sh

set -euo pipefail

REPO_OWNER="xbitoi"
REPO_NAME="nour-agent"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
PAGES_URL="https://${REPO_OWNER}.github.io/${REPO_NAME}/"
PAGES_SOURCE='{"source":{"branch":"main","path":"/docs"}}'

if [ -z "${GITHUB_PAT:-}" ]; then
  echo "ERROR: GITHUB_PAT environment variable is required"
  echo "Usage: GITHUB_PAT=<token> ./scripts/setup-github-pages.sh"
  exit 1
fi

API_HEADERS=(
  -H "Authorization: token ${GITHUB_PAT}"
  -H "Accept: application/vnd.github+json"
  -H "X-GitHub-Api-Version: 2022-11-28"
)

echo "=== 1. Configure git remote ==="
if git remote get-url github &>/dev/null; then
  git remote set-url github "https://${REPO_OWNER}:${GITHUB_PAT}@github.com/${REPO_OWNER}/${REPO_NAME}.git"
  echo "Remote 'github' URL updated."
else
  git remote add github "https://${REPO_OWNER}:${GITHUB_PAT}@github.com/${REPO_OWNER}/${REPO_NAME}.git"
  echo "Remote 'github' added."
fi

echo ""
echo "=== 2. Push main branch ==="
git push github main --force
echo "Branch 'main' pushed successfully."

echo ""
echo "=== 3. Clean token from remote URL ==="
git remote set-url github "${REPO_URL}"
echo "Remote URL cleaned (no token stored)."

echo ""
echo "=== 4. Enable GitHub Pages (source: docs/ on main) ==="
HTTP_STATUS=$(curl -s -o /tmp/pages-response.json -w "%{http_code}" \
  -X POST \
  "${API_HEADERS[@]}" \
  "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pages" \
  -d "${PAGES_SOURCE}")

if [ "$HTTP_STATUS" = "409" ]; then
  echo "Pages already enabled. Updating source to main:/docs..."
  PUT_STATUS=$(curl -s -o /tmp/pages-put-response.json -w "%{http_code}" \
    -X PUT \
    "${API_HEADERS[@]}" \
    "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pages" \
    -d "${PAGES_SOURCE}")
  if [ "$PUT_STATUS" != "204" ] && [ "$PUT_STATUS" != "200" ]; then
    echo "ERROR: Failed to update Pages source (HTTP ${PUT_STATUS})"
    cat /tmp/pages-put-response.json
    exit 1
  fi
  echo "Pages source updated to branch=main, path=/docs (HTTP ${PUT_STATUS})."
elif [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "200" ]; then
  echo "Pages enabled (HTTP ${HTTP_STATUS})."
else
  echo "WARNING: Unexpected HTTP status ${HTTP_STATUS}"
  cat /tmp/pages-response.json
fi

echo ""
echo "=== 5. Verify Pages configuration ==="
sleep 5
curl -s "${API_HEADERS[@]}" \
  "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pages" | \
  node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{
    const r=JSON.parse(Buffer.concat(d).toString());
    console.log('build_type:', r.build_type);
    console.log('source:', JSON.stringify(r.source));
    console.log('status:', r.status);
    console.log('url:', r.html_url);
  });"

echo ""
echo "=== 6. Verify live URL ==="
sleep 10
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${PAGES_URL}")
echo "HTTP Status for ${PAGES_URL}: ${HTTP}"

if [ "$HTTP" = "200" ]; then
  echo ""
  echo "SUCCESS: GitHub Pages is live at ${PAGES_URL}"
  echo "build_type: legacy | source: branch=main, path=/docs"
else
  echo ""
  echo "INFO: Pages may still be building (can take 1-2 min). Check: ${PAGES_URL}"
fi
