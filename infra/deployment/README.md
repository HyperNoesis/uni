# Deployment

Environments: local (Docker Compose) -> preview -> staging -> production. Every deploy is reproducible from Git.

- **Render:** `render.yaml` at the repo root deploys web, api and realtime from one push. Worker and admin are added once they have a datastore.
- **Containers:** `infra/docker/Dockerfile` has one target per process (`web`, `api`, `realtime`, `worker`, `admin`).
- **Migrations:** run as a separate release step with `bash infra/db/migrate.sh`. Migrations are append-only files; never edit an applied one and never drop data in a migration without a reviewed plan.
- **Health:** every process serves `/healthz` and `/readyz`. Realtime and worker return 503 from `/readyz` while draining.
- **Rollback:** redeploy the previous Git commit. Because migrations only add, the previous build keeps working against the newer schema.
- **Backups:** `infra/db/backup.sh` creates a dump; `infra/db/restore.sh` restores into a scratch database and verifies it. A backup counts only after a restore drill passes.
- **Secrets:** set in the host's dashboard, never in Git. `.env.example` lists every variable.
