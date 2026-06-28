# New API Image Retention And Rotation

This is a Codex-facing operations note for the isolated New API stack.

The user expects Codex to perform New API commits, deploys, verification, and cleanup. Do not hand this off as a manual task unless the user explicitly asks to run it themselves.

## Purpose

New API hotfixes are deployed frequently and create many Docker images named like:

```text
shenxiang-new-api-codex:<deploy-tag>
```

These images are useful for short-term rollback, but old unreferenced images can quickly fill the host disk. The correct fix is service-level image rotation for New API images, not global Docker cleanup.

## Safety Boundary

Only rotate images that match all of these conditions:

1. Repository is exactly `shenxiang-new-api-codex`.
2. Image is not referenced by any Docker container, including stopped containers.
3. Image is outside the retention window.
4. Local and public health checks pass before deletion.

Never delete or prune:

- Docker volumes.
- Docker networks.
- Running or stopped containers.
- MySQL or Redis data.
- `/opt/shenxiang-new-api/data`, `/opt/shenxiang-new-api/mysql`, `/opt/shenxiang-new-api/redis`.
- `/opt/1panel`, OpenResty/Nginx config, certificates, MinIO, uploads, or main-site files.

Do not use these commands for this task:

```bash
docker system prune
docker volume prune
docker network rm
docker rm -f
find ... -delete
```

## Recommended Retention Policy

Default policy:

- Always keep images referenced by any container.
- Keep the newest 5 `shenxiang-new-api-codex:*` image IDs.
- Keep images created within the last 48 hours.
- Delete only older unreferenced `shenxiang-new-api-codex:*` images.
- If root disk usage is below 75%, dry-run and log only.
- If root disk usage is 75% or higher, rotation may delete candidates.
- If root disk usage is 85% or higher, also consider the root project `docs/SERVER-CLEANUP-SOP.md` for BuildKit and journal cleanup.

This policy intentionally keeps a small rollback window while preventing old deploy artifacts from accumulating indefinitely.

## Manual Execution Pattern For Codex

Use this pattern when the user asks for New API disk cleanup or when repeated New API deploys have left many old images.

First run read-only checks:

```bash
df -h /
docker system df
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
docker image ls shenxiang-new-api-codex --no-trunc --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}'
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://shenxiang.school/api/health
```

Build a protected image list from all containers:

```bash
docker ps -a -q | xargs docker inspect --format '{{.Image}}' | sort -u
```

Then list all New API image rows:

```bash
docker image ls shenxiang-new-api-codex --no-trunc \
  --format '{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}'
```

Before deleting anything, write a manifest under:

```text
/var/log/shenxiang-cleanup/
```

The manifest must include:

```text
image_id
repository
tag
created_at
size
reason
```

Deletion must be by exact image ID, not by broad prune:

```bash
docker rmi <image-id>
```

If an image is referenced by any container, Docker will reject deletion unless forced. Do not force it.

## Future Script Shape

If this is automated, create a root-owned script on the server:

```text
/usr/local/sbin/shenxiang-new-api-image-rotate.sh
```

Recommended environment variables:

```bash
DRY_RUN=1
ROOT_PATH=/
MIN_USAGE_PERCENT=75
KEEP_LAST=5
KEEP_HOURS=48
IMAGE_REPOSITORY=shenxiang-new-api-codex
LOG_DIR=/var/log/shenxiang-cleanup
APP_HEALTH_URL=http://127.0.0.1:3000/api/health
PUBLIC_HEALTH_URL=https://shenxiang.school/api/health
NEW_API_CONTAINER=shenxiang-new-api
```

Script behavior:

1. Acquire a lock in `/var/lock`.
2. Snapshot `df -h /`, `docker system df`, and current container health.
3. Run local and public health checks.
4. Build the protected image ID set from `docker ps -a`.
5. Build New API candidates from `docker image ls shenxiang-new-api-codex`.
6. Exclude protected image IDs, newest `KEEP_LAST` image IDs, and images newer than `KEEP_HOURS`.
7. Write manifest.
8. In `DRY_RUN=1`, print candidates and exit without deletion.
9. In `DRY_RUN=0`, delete candidates by exact image ID using `docker rmi`.
10. Recheck `df -h /`, `docker system df`, `docker ps`, and health endpoints.

Do not install a timer until dry-run output has been inspected at least once.

## Timer Policy

If automation is enabled later:

- Run daily, not continuously.
- Use dry-run first.
- Only enable deletion mode after one successful inspected dry-run.
- Keep logs and manifests in `/var/log/shenxiang-cleanup/`.
- Keep the existing global `shenxiang-container-runtime-cleanup.timer` separate. This New API rotation is narrower and should not replace the root project cleanup SOP.

## Verification After Rotation

Minimum verification:

```bash
df -h /
docker system df
docker ps --filter name=shenxiang-new-api --format '{{.Names}} {{.Status}} {{.Image}}'
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://shenxiang.school/api/health
```

If New API itself is in scope, also check:

```bash
curl -fsS http://127.0.0.1:3120/api/status
```

Expected result:

- Root disk usage drops or remains stable.
- `shenxiang-new-api` remains healthy.
- Main site health remains `ok`.
- No containers, volumes, networks, databases, or persistent data are deleted.

## When To Stop

Stop after the disk is comfortably below the alert threshold. Do not continue into `/opt` history, `/tmp`, or data directories just because candidates exist. Deeper cleanup requires explicit evidence that paths are not mounted, not open, not referenced, and not needed for rollback.
