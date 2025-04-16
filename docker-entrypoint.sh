#!/bin/bash
set -e

# Setup environment for Node.js app
echo "Creating .env files from Heroku environment variables..."

# Create main .env file for Node.js
cat > /app/.env << EOL
# Node.js application environment
PORT=${PORT:-3000}
NODE_ENV=${NODE_ENV:-development}
API_KEY=${API_KEY:-}
# Add other Node.js environment variables here
$(env | grep -E '^((?!PYTHON_|TELEGRAM_).)*$' | grep -v PATH | grep -v PWD | grep -v HOME | grep -v NODE | grep -v NPM)
EOL

# Create .env file for Python Telegram bot
mkdir -p /app/telegram-bot
cat > /app/telegram-bot/.env << EOL
# Python Telegram bot environment
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
$(env | grep -E '^(PYTHON_|TELEGRAM_)' | sed 's/^PYTHON_//g')
EOL

# Heroku assigns a random PORT, make sure it's exported for the Node app
export PORT=${PORT:-3000}
echo "Using PORT: $PORT"

# Start Node.js server in the background
echo "Starting Node.js server..."
node dist/index.js &
NODE_PID=$!

# Start Python Telegram bot in the background
echo "Starting Python Telegram bot..."
cd /app/telegram-bot
python bot.py &
PYTHON_PID=$!

# Function to gracefully shut down processes
function cleanup() {
    echo "Stopping services..."
    kill -TERM $NODE_PID 2>/dev/null || true
    kill -TERM $PYTHON_PID 2>/dev/null || true
    exit 0
}

# Register the cleanup function for SIGTERM and SIGINT
trap cleanup SIGTERM SIGINT

# Keep the container running
echo "All services started successfully!"
echo "Node.js PID: $NODE_PID"
echo "Python Bot PID: $PYTHON_PID"
echo "Press Ctrl+C to stop all services"

# Wait for either process to exit
wait $NODE_PID $PYTHON_PID
EXIT_CODE=$?

# If one process exits, stop the other
cleanup

exit $EXIT_CODE 