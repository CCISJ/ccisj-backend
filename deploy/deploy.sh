#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${1:?Uso: deploy.sh api|web checkout sha}"
SOURCE="${2:?Falta directorio del checkout}"
SHA="${3:?Falta SHA}"
ROOT=/opt/ccisj/deploy
STATE="$ROOT/.image-tags"
COMPOSE=(docker compose -f "$ROOT/compose.yaml" -f "$ROOT/compose.deploy.yaml")

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA inválido' >&2; exit 1; }
[[ -d "$SOURCE/.git" && -f "$SOURCE/Dockerfile.prod" ]] || { echo 'Checkout inválido' >&2; exit 1; }
[[ "$(git -C "$SOURCE" rev-parse HEAD)" == "$SHA" ]] || { echo 'SHA no coincide con checkout' >&2; exit 1; }
case "$SERVICE" in
  api) IMAGE=ccisj-api; KEY=API_IMAGE_TAG ;;
  web) IMAGE=ccisj-web; KEY=WEB_IMAGE_TAG ;;
  *) echo 'Servicio no permitido' >&2; exit 1 ;;
esac

exec 9>"$ROOT/.deploy.lock"
flock -x 9
cd "$ROOT"

read_tag() {
  local value
  value="$(sed -n "s/^$1=//p" "$STATE")"
  [[ "$value" =~ ^[a-zA-Z0-9_.-]+$ ]] || { echo "Etiqueta inválida: $1" >&2; exit 1; }
  printf '%s' "$value"
}
OLD_API="$(read_tag API_IMAGE_TAG)"
OLD_WEB="$(read_tag WEB_IMAGE_TAG)"
export API_IMAGE_TAG="$OLD_API" WEB_IMAGE_TAG="$OLD_WEB"
OLD_TAG="$(read_tag "$KEY")"
"${COMPOSE[@]}" config --quiet
docker image inspect "$IMAGE:$OLD_TAG" >/dev/null

# No desplegar una ejecución de CI que quedó atrasada.
git -C "$SOURCE" fetch --quiet origin main
[[ "$(git -C "$SOURCE" rev-parse FETCH_HEAD)" == "$SHA" ]] || {
  echo 'Hay un commit más reciente en main. Se omite el despliegue.'
  exit 0
}

printf 'Construyendo %s:%s\n' "$IMAGE" "$SHA"
if [[ "$SERVICE" == web ]]; then
  docker build -f "$SOURCE/Dockerfile.prod" \
    --build-arg VITE_API_URL=https://172-183-48-152.sslip.io/api \
    -t "$IMAGE:$SHA" "$SOURCE"
else
  docker build -f "$SOURCE/Dockerfile.prod" -t "$IMAGE:$SHA" "$SOURCE"

  # Comprobar las migraciones pendientes, sin aplicar cambios a la BD.
  # Si la BD no está actualizada, se bloquea el despliegue.
  docker build -f "$SOURCE/Dockerfile.prod" --target migraciones \
    -t "ccisj-migraciones:$SHA" "$SOURCE"
  docker run --rm --env-file "$ROOT/.env" "ccisj-migraciones:$SHA" \
    ./node_modules/.bin/prisma migrate status
fi

rollback() {
  echo "Restaurando $IMAGE:$OLD_TAG"
  export "$KEY=$OLD_TAG"
  "${COMPOSE[@]}" up -d --no-deps --no-build "$SERVICE"
}

export "$KEY=$SHA"
if ! "${COMPOSE[@]}" up -d --no-deps --no-build "$SERVICE"; then
  rollback
  exit 1
fi

HEALTHY=false
for _ in $(seq 1 60); do
  CID="$("${COMPOSE[@]}" ps -q "$SERVICE")"
  if [[ -n "$CID" ]]; then
    STATUS="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$CID")"
    RUNNING="$(docker inspect -f '{{.State.Running}}' "$CID")"
    if [[ "$STATUS" == healthy && "$RUNNING" == true ]]; then
      HEALTHY=true
      break
    fi
    [[ "$STATUS" == unhealthy || "$RUNNING" == false || "$STATUS" == missing ]] && break
  fi
  sleep 2
done

if [[ "$HEALTHY" != true ]]; then
  echo 'Health check fallido: iniciando rollback' >&2
  rollback
  exit 1
fi

if [[ "$SERVICE" == api ]]; then OLD_API="$SHA"; else OLD_WEB="$SHA"; fi
TEMP="$(mktemp "$ROOT/.image-tags.XXXXXX")"
chmod 600 "$TEMP"
printf 'API_IMAGE_TAG=%s\nWEB_IMAGE_TAG=%s\n' "$OLD_API" "$OLD_WEB" > "$TEMP"
mv "$TEMP" "$STATE"
echo "Desplegado $SERVICE: $SHA (anterior: $OLD_TAG)"
