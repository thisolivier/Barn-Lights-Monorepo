.PHONY: start stop restart logs status test setup health-check clean

# Service management
start:
	npm start

stop:
	npm stop

restart:
	npm restart

logs:
	npm run logs

status:
	npm run status

# Testing
test:
	npm test

test-renderer:
	npm run test:renderer

test-sender:
	npm run test:sender

test-firmware:
	npm run test:firmware

# Setup and maintenance
setup:
	npm run setup

health-check:
	bash scripts/health-check.sh

# Clean build artifacts and logs
clean:
	rm -rf logs/*.log
	rm -rf packages/renderer/dist
	rm -rf packages/sender/dist
	rm -rf packages/device-firmware/firmware/build

# Help
help:
	@echo "LED Lights Monorepo - Available Commands"
	@echo "========================================"
	@echo ""
	@echo "Service Management:"
	@echo "  make start          - Start all services with PM2"
	@echo "  make stop           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make logs           - View aggregated logs"
	@echo "  make status         - Check service status"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-renderer  - Run renderer tests"
	@echo "  make test-sender    - Run sender tests"
	@echo "  make test-firmware  - Run firmware tests"
	@echo ""
	@echo "Setup & Maintenance:"
	@echo "  make setup          - First-time setup"
	@echo "  make health-check   - System health check"
	@echo "  make clean          - Clean build artifacts"
	@echo ""
