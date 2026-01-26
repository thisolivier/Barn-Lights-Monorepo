#!/bin/bash

set -e

echo "🚀 LED Lights Monorepo Setup"
echo "============================="
echo ""

# Check Node.js version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Error: Node.js >= 20 required (found v$NODE_VERSION)"
  echo "   Please upgrade Node.js: https://nodejs.org/"
  exit 1
fi
echo "✅ Node.js v$(node -v) detected"
echo ""

# Install dependencies
echo "📥 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Build React UI
echo "🔨 Building React UI..."
npm run build:ui -w packages/renderer
echo "✅ React UI built"
echo ""

# Create logs directory if it doesn't exist
echo "📁 Setting up logs directory..."
mkdir -p logs
echo "✅ Logs directory ready"
echo ""

# Success message
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start all services:  npm start"
echo "  2. View logs:           npm run logs"
echo "  3. Check status:        npm run status"
echo "  4. Run tests:           npm test"
echo ""
echo "WebUI will be available at: http://localhost:8080"
echo ""
