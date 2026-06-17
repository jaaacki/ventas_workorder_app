#!/bin/sh
# Dev entrypoint: dependencies are baked into the image and copied into the named
# volume on first mount. Rebuild the image or run `npm install` inside the
# container when dependencies change.
set -e

cd "$WORKDIR"
exec "$@"
