#!/bin/bash
# Release script with comprehensive validation
# Usage: ./scripts/release.sh v1.0.0

set -e

TAG="$1"

if [ -z "$TAG" ]; then
  echo "Usage: ./scripts/release.sh <tag>"
  echo "Example: ./scripts/release.sh v1.7.0-beta.1"
  exit 1
fi

# Validate tag format
if ! echo "$TAG" | grep -qE "^v[0-9]+\.[0-9]+\.[0-9]+"; then
  echo "ERROR: Invalid tag format: $TAG"
  echo "Expected format: v1.0.0 or v1.0.0-beta.1"
  exit 1
fi

TAG_VERSION=$(echo "$TAG" | sed 's|^v||')
BASE_VERSION=$(echo "$TAG_VERSION" | sed 's|-.*||')

# Check we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "ERROR: Must be on main branch to release"
  echo "Current branch: $CURRENT_BRANCH"
  exit 1
fi

# Check working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Working directory is not clean"
  echo "Commit or stash changes before releasing"
  git status --short
  exit 1
fi

# Verify package.json version matches
PKG_VERSION=$(node -p "require('./package.json').version")
if [ "$BASE_VERSION" != "$PKG_VERSION" ]; then
  echo "ERROR: Version mismatch"
  echo "  Tag version: $BASE_VERSION"
  echo "  package.json: $PKG_VERSION"
  echo ""
  echo "Update package.json version to $BASE_VERSION first"
  exit 1
fi

# Run tests
echo "Running tests..."
npm run test:run || {
  echo ""
  echo "ERROR: Tests failed. Fix tests before releasing."
  exit 1
}

# Check formatting
echo "Checking formatting..."
npm run format:check || {
  echo ""
  echo "ERROR: Formatting issues found. Run 'npm run format' first."
  exit 1
}

# Check if this is a full release (no prerelease suffix)
if echo "$TAG" | grep -qE "^v[0-9]+\.[0-9]+\.[0-9]+$"; then
  echo ""
  echo "Creating full release: $TAG"

  # Check for existing prereleases
  PRERELEASES=$(gh release list --limit 100 2>/dev/null | grep -E "${BASE_VERSION}-(alpha|beta|rc)" || true)

  if [ -z "$PRERELEASES" ]; then
    echo ""
    echo "ERROR: No prerelease found for version $BASE_VERSION"
    echo ""
    echo "Full releases require an existing prerelease."
    echo "Create a prerelease first:"
    echo ""
    echo "  ./scripts/release.sh v${BASE_VERSION}-beta.1"
    echo ""
    exit 1
  else
    echo "Found prereleases for $BASE_VERSION:"
    echo "$PRERELEASES"
    echo ""
  fi

  # Create full release
  gh release create "$TAG" --generate-notes
  echo ""
  echo "Full release $TAG created successfully"
else
  echo ""
  echo "Creating prerelease: $TAG"

  # Create prerelease
  gh release create "$TAG" --prerelease --generate-notes
  echo ""
  echo "Prerelease $TAG created successfully"
fi
