#!/bin/bash
# Diagnostic script to check Docker images and GitHub Container Registry access
# Run this on your server to troubleshoot image visibility issues

set -e

echo "🔍 Docker Image Diagnostic Script"
echo "=================================="
echo ""

# Check Docker installation
echo "1️⃣ Checking Docker installation..."
if command -v docker &> /dev/null; then
    echo "✅ Docker is installed: $(docker --version)"
else
    echo "❌ Docker is not installed"
    exit 1
fi

# Check Docker Compose
echo ""
echo "2️⃣ Checking Docker Compose..."
if command -v docker compose &> /dev/null; then
    echo "✅ Docker Compose is installed: $(docker compose version)"
elif command -v docker-compose &> /dev/null; then
    echo "✅ Docker Compose is installed: $(docker-compose --version)"
else
    echo "❌ Docker Compose is not installed"
    exit 1
fi

# Check if user can run Docker without sudo
echo ""
echo "3️⃣ Checking Docker permissions..."
if docker ps &> /dev/null; then
    echo "✅ Docker can be run without sudo"
else
    echo "❌ Docker requires sudo or user is not in docker group"
    echo "💡 Run: sudo usermod -aG docker \$USER && newgrp docker"
fi

# Check GitHub Container Registry login
echo ""
echo "4️⃣ Checking GitHub Container Registry authentication..."
if docker login ghcr.io --username-stdin --password-stdin &> /dev/null <<< "$(echo -e '\n')"; then
    echo "⚠️ Already logged in (or login prompt appeared)"
else
    echo "❌ Not logged into GitHub Container Registry"
    echo "💡 You need to login with:"
    echo "   echo 'YOUR_GITHUB_TOKEN' | docker login ghcr.io -u YOUR_USERNAME --password-stdin"
fi

# List all Docker images
echo ""
echo "5️⃣ Listing all Docker images..."
echo "--------------------------------"
docker images
echo ""

# Check for ghcr.io images specifically
echo "6️⃣ Checking for GitHub Container Registry images..."
echo "---------------------------------------------------"
GHCR_IMAGES=$(docker images | grep ghcr.io || true)
if [ -z "$GHCR_IMAGES" ]; then
    echo "⚠️ No images from ghcr.io found locally"
    echo "💡 Images need to be pulled from GitHub Container Registry"
else
    echo "✅ Found ghcr.io images:"
    echo "$GHCR_IMAGES"
fi

# Check if we're in the food-app directory
echo ""
echo "7️⃣ Checking deployment directory..."
if [ -f "docker-compose.yml" ]; then
    echo "✅ Found docker-compose.yml in current directory: $(pwd)"
    
    # Check docker-compose.yml for image references
    echo ""
    echo "8️⃣ Checking image references in docker-compose.yml..."
    echo "------------------------------------------------------"
    grep -E "image:.*ghcr.io" docker-compose.yml || echo "⚠️ No ghcr.io image references found"
    
    # Check .env file
    echo ""
    echo "9️⃣ Checking .env file..."
    if [ -f ".env" ]; then
        echo "✅ .env file exists"
        if grep -q "GITHUB_REPOSITORY_OWNER" .env; then
            echo "✅ GITHUB_REPOSITORY_OWNER is set: $(grep GITHUB_REPOSITORY_OWNER .env)"
        else
            echo "⚠️ GITHUB_REPOSITORY_OWNER not found in .env"
        fi
    else
        echo "⚠️ .env file does not exist"
    fi
    
    # Try to pull images (dry run)
    echo ""
    echo "🔟 Testing docker compose pull (dry run)..."
    echo "--------------------------------------------"
    if docker compose config &> /dev/null; then
        echo "✅ docker-compose.yml is valid"
        echo ""
        echo "📋 Images that would be pulled:"
        docker compose config | grep -E "^\s+image:" | sed 's/^[[:space:]]*//' || echo "⚠️ No images found in config"
    else
        echo "❌ docker-compose.yml has errors"
        docker compose config
    fi
else
    echo "⚠️ docker-compose.yml not found in current directory"
    echo "💡 Navigate to the deployment directory (usually ~/food-app or /opt/food-app)"
fi

# Check running containers
echo ""
echo "1️⃣1️⃣ Checking running containers..."
echo "-------------------------------------"
RUNNING=$(docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}")
if [ -n "$RUNNING" ]; then
    echo "$RUNNING"
else
    echo "⚠️ No containers are currently running"
fi

# Summary and recommendations
echo ""
echo "=================================="
echo "📋 Summary and Recommendations"
echo "=================================="
echo ""
echo "If you don't see Docker images on your server:"
echo ""
echo "1. ✅ Verify images were built and pushed to GitHub Container Registry:"
echo "   - Go to: https://github.com/YOUR_USERNAME/food-app/pkgs/container"
echo "   - Check if images exist: food-app-auth-service, food-app-restaurant-service, etc."
echo ""
echo "2. ✅ Ensure GH_PAT secret is configured in GitHub Actions:"
echo "   - Go to: Repository → Settings → Secrets and variables → Actions"
echo "   - Add GH_PAT with 'read:packages' permission"
echo "   - Generate token at: https://github.com/settings/tokens"
echo ""
echo "3. ✅ Manually test pulling an image:"
echo "   echo 'YOUR_GITHUB_TOKEN' | docker login ghcr.io -u YOUR_USERNAME --password-stdin"
echo "   docker pull ghcr.io/YOUR_USERNAME/food-app-auth-service:latest"
echo ""
echo "4. ✅ Check deployment logs in GitHub Actions:"
echo "   - Look for 'Deploy to Staging' or 'Deploy to Production' job"
echo "   - Check for authentication errors"
echo ""
echo "5. ✅ Verify image names match in docker-compose.yml:"
echo "   - Images should be: ghcr.io/YOUR_USERNAME/food-app-*-service:latest"
echo "   - Check that GITHUB_REPOSITORY_OWNER is set correctly in .env"
echo ""
