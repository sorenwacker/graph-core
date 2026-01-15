.PHONY: dev backend frontend install clean stop test build

# Start both backend and frontend
dev:
	@echo "Starting backend and frontend..."
	@$(MAKE) -j2 backend frontend

# Start backend (FastAPI)
backend:
	.venv/bin/uvicorn graph_core.api:app --reload --port 9742

# Start frontend (Vite)
frontend:
	cd frontend && npm run dev -- --port 9741

# Install all dependencies
install:
	uv sync
	cd frontend && npm install

# Run tests
test:
	.venv/bin/pytest tests/

# Build frontend for production
build:
	cd frontend && npm run build

# Stop all dev servers
stop:
	-pkill -f "uvicorn graph_core.api:app" 2>/dev/null || true
	-pkill -f "vite" 2>/dev/null || true
	@echo "Servers stopped"

# Clean build artifacts
clean:
	rm -rf frontend/node_modules/.vite
	rm -rf frontend/dist
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

# Reset database (careful!)
reset-db:
	@echo "This will delete the database. Press Ctrl+C to cancel."
	@sleep 3
	rm -f graph.db
	@echo "Database deleted"
