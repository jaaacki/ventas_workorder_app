#!/bin/sh
set -eu

dc() {
  docker compose -f compose.stg.yml "$@"
}

mkdir -p data/legacy data/inventory

dc up -d --no-recreate postgres
dc up -d --force-recreate --no-deps be-migrate

migrate_state=""
for _ in $(seq 1 60); do
  migrate_state="$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' workorder-stg-migrate 2>/dev/null || true)"
  case "$migrate_state" in
    "exited 0") break ;;
    "exited "*) docker logs workorder-stg-migrate; exit 1 ;;
  esac
  sleep 1
done

if [ "$migrate_state" != "exited 0" ]; then
  docker logs workorder-stg-migrate
  exit 1
fi

dc up -d --force-recreate --no-deps be

for _ in $(seq 1 30); do
  dc exec -T be node -e "fetch('http://127.0.0.1:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" && break
  sleep 2
done

dc exec -T be node -e "fetch('http://127.0.0.1:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
dc up -d --force-recreate --no-deps fe

dc ps

for _ in $(seq 1 30); do
  wget -qO- https://stg-workorder.ventas.bio/api/health && exit 0
  sleep 2
done

exit 1
