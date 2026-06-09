#!/bin/bash

# Kill any existing processes on port 3001 and 5173 to avoid conflicts
fuser -k 3001/tcp 2>/dev/null
fuser -k 5173/tcp 2>/dev/null

echo "Starting Backend on Port 3001..."
cd backend
export $(grep -v '^#' ../.env.dev | xargs)
npm run dev > backend_dev.log 2>&1 &
cd ..

echo "Starting Frontend on Port 5173..."
cd frontend
npm run dev -- --host > frontend_dev.log 2>&1 &
cd ..

echo "Dev servers started! Link: http://localhost:5173"
