#!/bin/bash
set -e

DEPLOY_DIR="${DEPLOY_DIR:-$HOME/food-app}"
DEPLOYMENT_FAILED=false
SERVICES_STOPPED=false

rollback() {
  if [ "$DEPLOYMENT_FAILED" = true ] && [ "$SERVICES_STOPPED" = true ]; then
    echo ""
    echo "🔄 ROLLBACK: Attempting to restore services..."
    cd "$DEPLOY_DIR" || exit 1
    docker compose up -d --remove-orphans || true
    echo "⚠️  Services restored to previous state. Please check logs and fix issues."
  fi
}

trap rollback ERR

echo "🚀 Starting deployment..."

if [ ! -d "$DEPLOY_DIR" ]; then
  echo "📥 Cloning repository..."
  mkdir -p $(dirname $DEPLOY_DIR)
  if [ -n "$GITHUB_TOKEN" ]; then
    REPO_URL_WITH_TOKEN=$(echo "$REPO_URL" | sed "s|https://|https://${GITHUB_TOKEN}@|")
    git clone "$REPO_URL_WITH_TOKEN" "$DEPLOY_DIR" || git clone "$REPO_URL" "$DEPLOY_DIR"
  else
    git clone "$REPO_URL" "$DEPLOY_DIR"
  fi
else
  echo "🔄 Updating repository..."
  cd "$DEPLOY_DIR"
  if docker compose ps postgres 2>/dev/null | grep -q "Up"; then
    echo "💾 Creating database backup..."
    mkdir -p "$DEPLOY_DIR/backups"
    BACKUP_FILE="$DEPLOY_DIR/backups/backup_$(date +%Y%m%d_%H%M%S).sql"
    docker compose exec -T postgres pg_dump -U postgres hassa > "$BACKUP_FILE" 2>/dev/null || true
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
      echo "✅ Backup created: $(basename $BACKUP_FILE)"
    else
      echo "⚠️  Backup creation failed or file is empty"
    fi
  fi
  git fetch origin
  git reset --hard origin/main
fi

cd "$DEPLOY_DIR"

echo "🔧 Updating docker-compose.yml with image names..."
sed -i "s|ghcr.io/\${GITHUB_REPOSITORY_OWNER:-your-username}|ghcr.io/$GITHUB_OWNER|g" docker-compose.yml || \
sed -i "s|ghcr.io/your-username|ghcr.io/$GITHUB_OWNER|g" docker-compose.yml

echo "📝 Creating/updating .env file..."
if [ ! -f .env ]; then
  cat > .env << EOF
POSTGRES_DB=hassa
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_PORT=5432
REDIS_PORT=6379
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=24h
NODE_ENV=production
LOG_LEVEL=info
AUTH_SERVICE_PORT=3001
RESTAURANT_SERVICE_PORT=3002
ORDER_SERVICE_PORT=3003
DELIVERY_SERVICE_PORT=3004
PAYMENT_SERVICE_PORT=3005
NOTIFICATION_SERVICE_PORT=3006
ADMIN_ANALYTICS_SERVICE_PORT=3007
NGINX_PORT=80
GITHUB_REPOSITORY_OWNER=${GITHUB_OWNER}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
SMTP_SECURE=${SMTP_SECURE:-false}
SMTP_FROM=${SMTP_FROM:-}
EOF
else
  if ! grep -q "^SMTP_HOST=" .env 2>/dev/null; then
    echo "SMTP_HOST=${SMTP_HOST:-}" >> .env
  else
    sed -i "s|^SMTP_HOST=.*|SMTP_HOST=${SMTP_HOST:-}|" .env
  fi

  if ! grep -q "^SMTP_PORT=" .env 2>/dev/null; then
    echo "SMTP_PORT=${SMTP_PORT:-587}" >> .env
  else
    sed -i "s|^SMTP_PORT=.*|SMTP_PORT=${SMTP_PORT:-587}|" .env
  fi

  if ! grep -q "^SMTP_USER=" .env 2>/dev/null; then
    echo "SMTP_USER=${SMTP_USER:-}" >> .env
  else
    sed -i "s|^SMTP_USER=.*|SMTP_USER=${SMTP_USER:-}|" .env
  fi

  if ! grep -q "^SMTP_PASSWORD=" .env 2>/dev/null; then
    echo "SMTP_PASSWORD=${SMTP_PASSWORD:-}" >> .env
  else
    sed -i "s|^SMTP_PASSWORD=.*|SMTP_PASSWORD=${SMTP_PASSWORD:-}|" .env
  fi

  if ! grep -q "^SMTP_SECURE=" .env 2>/dev/null; then
    echo "SMTP_SECURE=${SMTP_SECURE:-false}" >> .env
  else
    sed -i "s|^SMTP_SECURE=.*|SMTP_SECURE=${SMTP_SECURE:-false}|" .env
  fi

  if ! grep -q "^SMTP_FROM=" .env 2>/dev/null; then
    echo "SMTP_FROM=${SMTP_FROM:-}" >> .env
  else
    sed -i "s|^SMTP_FROM=.*|SMTP_FROM=${SMTP_FROM:-}|" .env
  fi
fi

echo "🔐 Logging into GitHub Container Registry..."
if ! echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-github-actions}" --password-stdin; then
  echo "❌ Failed to login to GitHub Container Registry. Aborting deployment."
  exit 1
fi

SERVICES_RUNNING=false
if docker compose ps 2>/dev/null | grep -q "Up"; then
  SERVICES_RUNNING=true
  echo "✅ Services are currently running"
fi

echo "📥 Pulling latest Docker images..."
if ! docker compose pull; then
  echo "❌ Failed to pull Docker images. Aborting deployment to keep services running."
  exit 1
fi
echo "✅ Successfully pulled all images"

if [ "$SERVICES_RUNNING" = true ]; then
  echo "🛑 Stopping existing services..."
  docker compose down --timeout 30 --remove-orphans || true
  SERVICES_STOPPED=true
  docker container prune -f || true
  docker network prune -f || true
fi

echo "🚀 Starting services..."
if ! docker compose up -d --remove-orphans; then
  echo "❌ Failed to start services"
  DEPLOYMENT_FAILED=true
  exit 1
fi

echo "⏳ Waiting for database to be ready..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
  if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ Database is ready"
    break
  fi
  attempt=$((attempt + 1))
  echo "⏳ Waiting for database... (attempt $attempt/$max_attempts)"
  sleep 2
done

if [ $attempt -eq $max_attempts ]; then
  echo "❌ Database failed to become ready after $max_attempts attempts"
  docker compose logs postgres
  DEPLOYMENT_FAILED=true
  exit 1
fi

echo "📦 Installing dependencies..."
if ! npm install; then
  echo "❌ Failed to install dependencies"
  DEPLOYMENT_FAILED=true
  exit 1
fi

echo "🗄️ Running database migrations..."
if ! npm run migrate; then
  echo "❌ Failed to run migrations"
  DEPLOYMENT_FAILED=true
  exit 1
fi

echo "✅ Verifying deployment..."
docker compose ps

echo "🏥 Checking service health..."
failed_services=0
for service in auth-service:3001 restaurant-service:3002 order-service:3003 delivery-service:3004 payment-service:3005 notification-service:3006 admin-analytics-service:3007; do
  name=$(echo $service | cut -d: -f1)
  port=$(echo $service | cut -d: -f2)
  health_ok=false
  for i in {1..3}; do
    if curl -f -s http://localhost:$port/health > /dev/null 2>&1; then
      echo "✅ $name is healthy"
      health_ok=true
      break
    fi
    sleep 2
  done

  if [ "$health_ok" = false ]; then
    echo "⚠️  $name health check failed after 3 attempts"
    failed_services=$((failed_services + 1))
  fi
done

if [ $failed_services -gt 3 ]; then
  echo "❌ Too many services failed health checks ($failed_services)"
  DEPLOYMENT_FAILED=true
  exit 1
fi

trap - ERR

echo "🎉 Deployment completed successfully!"
