#!/bin/bash
# Release script with prerelease validation
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

VERSION=$(echo "$TAG" | sed 's|^v||' | sed 's|-.*||')

# Check if this is a full release (no prerelease suffix)
if echo "$TAG" | grep -qE "^v[0-9]+\.[0-9]+\.[0-9]+$"; then
  echo "Creating full release: $TAG"

  # Check for existing prereleases
  PRERELEASES=$(gh release list --limit 100 2>/dev/null | grep -E "${VERSION}-(alpha|beta|rc)" || true)

  if [ -z "$PRERELEASES" ]; then
    echo ""
    echo "ERROR: No prerelease found for version $VERSION"
    echo ""
    echo "Full releases require an existing prerelease."
    echo "Create a prerelease first:"
    echo ""
    echo "  ./scripts/release.sh v${VERSION}-beta.1"
    echo ""
    exit 1
  else
    echo "Found prereleases for $VERSION:"
    echo "$PRERELEASES"
    echo ""
  fi

  # Create full release
  gh release create "$TAG" --generate-notes
  echo ""
  echo "Full release $TAG created successfully"
else
  echo "Creating prerelease: $TAG"

  # Create prerelease
  gh release create "$TAG" --prerelease --generate-notes
  echo ""
  echo "Prerelease $TAG created successfully"
fi
