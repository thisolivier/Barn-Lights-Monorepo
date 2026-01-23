#!/bin/bash

echo "🏥 LED Lights System Health Check"
echo "=================================="
echo ""

ISSUES=0

# Check PM2 processes
echo "📊 Checking PM2 processes..."
if pm2 status | grep -q "online"; then
  ONLINE=$(pm2 status | grep "online" | wc -l)
  echo "✅ $ONLINE process(es) online"
else
  echo "❌ No PM2 processes running"
  echo "   Run: npm start"
  ISSUES=$((ISSUES + 1))
fi
echo ""

# Check WebUI
echo "🌐 Checking WebUI (http://localhost:8080)..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 | grep -q "200"; then
  echo "✅ WebUI responding"
else
  echo "⚠️  WebUI not responding"
  echo "   Check if renderer is running: npm run status"
  ISSUES=$((ISSUES + 1))
fi
echo ""

# Check UDP connectivity to controllers
echo "🔌 Checking controller connectivity..."
echo "   Testing 10.10.0.2:5555..."
if nc -uz -w 1 10.10.0.2 5555 2>/dev/null; then
  echo "   ✅ Left controller reachable"
else
  echo "   ⚠️  Left controller (10.10.0.2:5555) not reachable"
  ISSUES=$((ISSUES + 1))
fi

echo "   Testing 10.10.0.3:5555..."
if nc -uz -w 1 10.10.0.3 5555 2>/dev/null; then
  echo "   ✅ Right controller reachable"
else
  echo "   ⚠️  Right controller (10.10.0.3:5555) not reachable"
  ISSUES=$((ISSUES + 1))
fi
echo ""

# Summary
echo "=================================="
if [ $ISSUES -eq 0 ]; then
  echo "✨ System healthy!"
  exit 0
else
  echo "⚠️  Found $ISSUES issue(s)"
  echo ""
  echo "Troubleshooting:"
  echo "  - Check PM2 status: npm run status"
  echo "  - View logs: npm run logs"
  echo "  - Restart services: npm restart"
  exit 1
fi
