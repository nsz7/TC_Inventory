#!/bin/bash
# Push this project to GitHub
# Usage: bash scripts/push-to-github.sh YOUR_GITHUB_TOKEN

TOKEN=${1:-$GITHUB_PERSONAL_ACCESS_TOKEN}
USERNAME="nsz7"
REPO="tc-inventory"

if [ -z "$TOKEN" ]; then
  echo "ERROR: No token provided. Run: bash scripts/push-to-github.sh ghp_yourtoken"
  exit 1
fi

echo "Creating GitHub repo..."
curl -s -o /dev/null -w "Repo create status: %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"name\":\"$REPO\",\"description\":\"Tissue Culture Inventory Management App\",\"private\":true}" \
  https://api.github.com/user/repos

echo "Configuring git..."
git config user.name "$USERNAME"
git config user.email "$USERNAME@users.noreply.github.com"
git remote remove origin 2>/dev/null || true
git remote add origin "https://$USERNAME:$TOKEN@github.com/$USERNAME/$REPO.git"

echo "Pushing to GitHub..."
git push -u origin main

echo ""
echo "Done! View your repo at: https://github.com/$USERNAME/$REPO"
