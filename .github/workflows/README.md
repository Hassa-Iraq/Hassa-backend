# CI/CD Pipeline Documentation

## Workflows

### CI Pipeline (`.github/workflows/ci.yml`)

Runs on push/PR to `main` branch only.

**Jobs:**
- **Type Check**: Validates TypeScript types
- **Lint**: Runs ESLint
- **Security Audit**: Scans for vulnerabilities (non-blocking)
- **Test**: Runs Jest tests with PostgreSQL and Redis
- **Build Docker Images**: Builds all service images
- **Validate Migrations**: Checks migration files
- **Health Check**: Verifies all service health endpoints

**Features:**
- Ubuntu 22.04 runners
- Parallel job execution
- Docker layer caching
- Automatic cleanup on failure

### CD Pipeline (`.github/workflows/cd.yml`)

Runs on:
- Push to `main` → Deploys to server
- Version tags (`v*.*.*`) → Deploys and creates GitHub release
- Manual workflow dispatch

**Jobs:**
- **Build and Push**: Builds and pushes Docker images to GHCR
- **Deploy**: Deploys to server via SSH

**Features:**
- Semantic versioning support
- Multi-tag Docker images
- SSH-based deployment
- Automatic GitHub releases
- Automatic database backups

## Setup

### GitHub Secrets

Required secrets:
- `SSH_HOST` - Server IP/hostname
- `SSH_USER` - SSH username
- `SSH_PRIVATE_KEY` - Private SSH key
- `POSTGRES_PASSWORD` - Database password
- `JWT_SECRET` - JWT secret key
- `GH_PAT` - GitHub token (optional, for private images)

### Server Requirements

- Ubuntu 22.04
- Docker installed
- Docker Compose installed
- Node.js 20 installed
- User in `docker` group
- Deployment directory: `$HOME/food-app`

## Usage

### Automatic Deployment
- Push to `main` → Triggers deployment
- Create version tag → Triggers deployment + release

### Manual Deployment
1. Go to Actions tab
2. Select "CD Pipeline"
3. Click "Run workflow"

### Creating a Release

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

## Troubleshooting

### Pipeline Failures
- Check Actions tab for error logs
- Verify all secrets are set correctly
- Test SSH connection manually

### Deployment Issues
- Check service logs: `cd $HOME/food-app && docker compose logs`
- Verify Docker is running: `docker ps`
- Check environment variables in `.env`

### Health Check Failures
- Services may need time to start
- Check individual service logs
- Verify database connectivity

## Best Practices

- Test locally with `npm run ci` before pushing
- Use feature branches and PRs
- Review CI results before merging
- Use semantic versioning for releases
- Monitor deployments and logs

---

**Last Updated**: 2024
