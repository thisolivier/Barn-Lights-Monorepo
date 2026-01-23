#!/bin/bash

set -e

echo "🧪 Running All Tests"
echo "===================="
echo ""

FAILED=0

# Renderer tests
echo "📦 Testing renderer..."
if npm run test:renderer; then
  echo "✅ Renderer tests passed"
else
  echo "❌ Renderer tests failed"
  FAILED=$((FAILED + 1))
fi
echo ""

# Sender tests
echo "📦 Testing sender..."
if npm run test:sender; then
  echo "✅ Sender tests passed"
else
  echo "❌ Sender tests failed"
  FAILED=$((FAILED + 1))
fi
echo ""

# Firmware tests (optional - only if tools exist)
if [ -f "packages/device-firmware/tools/run_all_tests.sh" ]; then
  echo "📦 Testing firmware..."
  if npm run test:firmware; then
    echo "✅ Firmware tests passed"
  else
    echo "❌ Firmware tests failed"
    FAILED=$((FAILED + 1))
  fi
  echo ""
fi

# Summary
echo "===================="
if [ $FAILED -eq 0 ]; then
  echo "✨ All tests passed!"
  exit 0
else
  echo "❌ $FAILED test suite(s) failed"
  exit 1
fi
