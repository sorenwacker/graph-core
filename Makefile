.PHONY: dev install clean stop build reset-db

# Start Electron app in dev mode
dev:
	npm run electron:dev

# Install dependencies
install:
	npm install

# Build for production
build:
	npm run electron:build

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
