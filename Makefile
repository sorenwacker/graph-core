.PHONY: dev install clean clean-release stop build dist install-mac reset-db docs docs-build lint format check test

# Documentation toolchain: uv resolves these into a cached ephemeral env, so
# there is no virtualenv to create or keep in sync.
MKDOCS := uv run --with mkdocs --with mkdocs-material --with pymdown-extensions mkdocs

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
install-mac: clean-release dist
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
	$(MKDOCS) serve

# Build the docs, failing on broken links and nav problems
docs-build:
	$(MKDOCS) build --strict

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
