#!/usr/bin/env bash
# Builds the C++ matching engine to a single-file WebAssembly ES module that runs in
# both the browser (the workspace UI) and Node (the API), so there is exactly one
# matching implementation. Run from the repo root after sourcing the emsdk env:
#   source tools/emsdk/emsdk_env.sh
#   bash engine/scripts/build-wasm.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$here"

out_frontend="frontend/src/wasm/matcher.js"
out_backend="backend/src/wasm/matcher.js"
mkdir -p "$(dirname "$out_frontend")" "$(dirname "$out_backend")"

em++ -O3 -std=c++17 -Iengine/include \
  engine/src/metrics.cpp engine/src/nicknames.cpp engine/src/matcher.cpp engine/wasm/bindings.cpp \
  -lembind \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
  -sEXPORT_NAME=createMatcherModule \
  -sSINGLE_FILE=1 -sALLOW_MEMORY_GROWTH=1 \
  -o "$out_frontend"

cp "$out_frontend" "$out_backend"
echo "built $out_frontend and $out_backend"
