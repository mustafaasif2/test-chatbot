#!/bin/bash

echo "🧹 Cleaning up ports and processes..."

# Kill processes on specific ports
echo "Freeing ports 3000 and 3001..."
lsof -ti:3000,3001 | xargs kill -9 2>/dev/null || echo "Ports 3000 and 3001 were already free"

# Kill any remaining chatbot-related processes
echo "Stopping chatbot processes..."
pkill -f "mcp-essentials" 2>/dev/null || echo "No MCP processes found"
pkill -f "react-scripts" 2>/dev/null || echo "No React processes found"
pkill -f "nodemon.*index.js" 2>/dev/null || echo "No nodemon processes found"

echo "✅ Cleanup complete!"
echo "All ports should now be free"

# Verify ports are free
if lsof -ti:3000,3001 >/dev/null 2>&1; then
    echo "⚠️  Warning: Some processes may still be using ports 3000/3001"
    lsof -ti:3000,3001
else
    echo "✅ Confirmed: Ports 3000 and 3001 are free"
fi 