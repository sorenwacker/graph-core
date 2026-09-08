.PHONY: dev install clean clean-release stop build dist install-mac install-mac-from-release install-mac-signed reset-db docs docs-build lint format check test e2e

# Documentation toolchain: Zensical, run through uvx so there is no virtualenv
# to create or keep in sync. This is a Node project with no pyproject.toml, so
# the docs tool is not declared as a Python dependency.
ZENSICAL := uvx zensical

# Start Electron app in dev mode
dev:
	npm run electron:dev

# Install dependencies
install:
	npm install

# Build for production
build:
	npm run electron:build

# Create DMG installer
dist:
	npm run dist

# Build DMG and install to /Applications (Mac only)
install-mac: clean-release dist install-mac-from-release

# Mount whichever DMG is in release/ and copy the app into /Applications.
# Shared by install-mac and install-mac-signed so the install half is not
# written twice and cannot drift between them.
install-mac-from-release:
	@echo "Installing Graph Core to /Applications..."
	@DMG_FILE=$$(ls release/*.dmg 2>/dev/null | head -1); \
	if [ -z "$$DMG_FILE" ]; then \
		echo "Error: No DMG file found in release/"; \
		exit 1; \
	fi; \
	echo "Mounting $$DMG_FILE..."; \
	MOUNT_OUTPUT=$$(hdiutil attach "$$DMG_FILE" -nobrowse 2>&1); \
	VOLUME=$$(echo "$$MOUNT_OUTPUT" | grep -o '/Volumes/[^"]*' | head -1); \
	if [ -z "$$VOLUME" ]; then \
		echo "Error: Failed to mount DMG"; \
		echo "$$MOUNT_OUTPUT"; \
		exit 1; \
	fi; \
	echo "Mounted at $$VOLUME"; \
	APP_PATH=$$(ls -d "$$VOLUME"/*.app 2>/dev/null | head -1); \
	if [ -z "$$APP_PATH" ]; then \
		echo "Error: No .app found in $$VOLUME"; \
		hdiutil detach "$$VOLUME" -quiet 2>/dev/null || true; \
		exit 1; \
	fi; \
	echo "Found $$APP_PATH"; \
	rm -rf "/Applications/Graph Core.app"; \
	cp -R "$$APP_PATH" /Applications/; \
	hdiutil detach "$$VOLUME" -quiet; \
	echo "Installed to /Applications/Graph Core.app"

# Build DMG signed with a stable local identity, then install it.
#
# Ad-hoc signed builds get a designated requirement that is a hash of the
# binary, so it changes on every build and a keychain "Always Allow" is
# invalidated each time. Signing with a certificate anchors the requirement to
# that certificate instead, and the grant survives rebuilds. The identity is a
# command-line override so the committed config stays unsigned for CI.
# See docs/contributing/development.md.
install-mac-signed:
	@if [ -z "$$SIGN_IDENTITY" ]; then \
		echo "Error: SIGN_IDENTITY is not set."; \
		echo "  SIGN_IDENTITY=\"Your Name\" make install-mac-signed"; \
		echo "Available identities:"; \
		security find-identity -v -p codesigning; \
		exit 1; \
	fi; \
	if ! security find-identity -v -p codesigning | grep -q "$$SIGN_IDENTITY"; then \
		echo "Error: no code-signing identity matching \"$$SIGN_IDENTITY\"."; \
		security find-identity -v -p codesigning; \
		exit 1; \
	fi
	$(MAKE) clean-release
	npm run bundle:preload
	npm run build
	npx electron-builder --mac -c.mac.identity="$$SIGN_IDENTITY"
	$(MAKE) install-mac-from-release
	@codesign -d -r- "/Applications/Graph Core.app" 2>&1 | tail -1

# Clean release artifacts
clean-release:
	rm -rf release/*

# Stop dev servers
stop:
	-pkill -f "electron" 2>/dev/null || true
	-pkill -f "vite" 2>/dev/null || true
	@echo "Servers stopped"

# Clean build artifacts
clean:
	rm -rf node_modules/.vite
	rm -rf dist
	rm -rf dist-electron

# Reset database
reset-db:
	@echo "This will delete the database. Press Ctrl+C to cancel."
	@sleep 3
	rm -f "$(HOME)/Library/Application Support/graph-core/graph.db"
	@echo "Database deleted"

# Serve documentation preview
docs:
	$(ZENSICAL) serve

# Build the docs, failing on broken links and nav problems
docs-build:
	$(ZENSICAL) build --strict

# End-to-end smoke pack against the built app (isolated profile, own data untouched)
e2e:
	npm run build
	npm run bundle:preload
	npm run test:e2e

# Lint code with auto-fix
lint:
	npm run lint:fix

# Format code
format:
	npm run format

# Run all checks (lint, format, type-check, test)
check:
	npm run lint
	npm run format:check
	npm run type-check
	npm run test:run

# Run tests
test:
	npm run test:run

# Run tests with coverage
coverage:
	npm run test:coverage
