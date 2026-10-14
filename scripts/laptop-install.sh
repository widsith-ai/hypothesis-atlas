#!/bin/bash
set -euo pipefail

echo "[1/4] Installing npm dependencies..."
npm install

if [ ! -f .env ]; then
  echo "[2/4] Creating .env from local defaults..."
  NEXTAUTH_SECRET="$(openssl rand -base64 32)"
  cat > .env <<EOF
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/hypothesis_atlas?schema=public"
REDIS_URL="redis://localhost:6379"
GROQ_API_KEY="your_groq_api_key_here"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://localhost:3000"
EOF
  echo "Created .env. Please replace GROQ_API_KEY with your real key."
else
  echo "[2/4] .env already exists. Skipping creation."
fi

echo "[3/4] Starting Postgres + Redis with Docker..."
docker-compose up -d

echo "[4/4] Pushing Prisma schema..."
npm run db:push

echo ""
echo "Laptop install complete."
echo "Next steps:"
echo "  Terminal A: make dev"
echo "  Terminal B: make worker"
echo "  Open: http://localhost:3000"
