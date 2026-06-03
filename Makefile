.PHONY: dev install clean stop build dist install-mac reset-db docs lint format check test

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
install-mac: dist
	@echo "Installing Graph Core to /Applications..."
	@hdiutil attach release/*.dmg -nobrowse -quiet
	@cp -R "/Volumes/Graph Core/Graph Core.app" /Applications/
	@hdiutil detach "/Volumes/Graph Core" -quiet
	@echo "Installed to /Applications/Graph Core.app"

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
	@if [ ! -d .venv ]; then python3 -m venv .venv && .venv/bin/pip install mkdocs mkdocs-material pymdown-extensions; fi
	.venv/bin/mkdocs serve

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
