# Builds the whole product into one container for the Hugging Face Docker Space.
# Stage 0 compiles the C++ engine to WebAssembly with the Emscripten toolchain, so
# the wasm is built from source here rather than shipped as a binary. Stage 1 builds
# the React frontend, and stage 2 runs the Node API which also serves that build.

# Stage 0: compile the C++ matching engine to a single-file WebAssembly module
FROM emscripten/emsdk:latest AS wasm
WORKDIR /src
COPY engine/ ./engine/
RUN em++ -O3 -std=c++17 -Iengine/include \
    engine/src/metrics.cpp engine/src/nicknames.cpp engine/src/matcher.cpp engine/wasm/bindings.cpp \
    -lembind \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
    -sEXPORT_NAME=createMatcherModule -sSINGLE_FILE=1 -sALLOW_MEMORY_GROWTH=1 \
    -o /src/matcher.js

# Stage 1: build the frontend (uses the freshly built wasm module)
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY --from=wasm /src/matcher.js ./src/wasm/matcher.js
RUN npm run build

# Stage 2: backend runtime serving the API and the built frontend
FROM node:22-slim
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
COPY --from=wasm /src/matcher.js ./src/wasm/matcher.js
COPY --from=web /web/dist ./public
ENV PORT=7860
ENV NODE_ENV=production
EXPOSE 7860
CMD ["npm", "run", "start"]
