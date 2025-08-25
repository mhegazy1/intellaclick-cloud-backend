#!/bin/bash

# Startup script for cloud backend
echo "Starting IntellaClick Cloud Backend..."

# Debug environment variables
echo "=== Environment Check ==="
echo "NODE_ENV: $NODE_ENV"
echo "PORT: $PORT"
echo "MONGODB_URI: ${MONGODB_URI:0:30}..." # Show first 30 chars for security
echo "JWT_SECRET configured: $([ -n "$JWT_SECRET" ] && echo 'Yes' || echo 'No')"
echo "======================="

# If MONGODB_URI is not set, check for common Coolify variable names
if [ -z "$MONGODB_URI" ]; then
    echo "MONGODB_URI not found, checking alternatives..."
    
    # Check for common variations
    if [ -n "$MONGO_URI" ]; then
        export MONGODB_URI="$MONGO_URI"
        echo "Using MONGO_URI as MONGODB_URI"
    elif [ -n "$DATABASE_URL" ]; then
        export MONGODB_URI="$DATABASE_URL"
        echo "Using DATABASE_URL as MONGODB_URI"
    elif [ -n "$DB_CONNECTION_STRING" ]; then
        export MONGODB_URI="$DB_CONNECTION_STRING"
        echo "Using DB_CONNECTION_STRING as MONGODB_URI"
    fi
fi

# Start the server
node server.js