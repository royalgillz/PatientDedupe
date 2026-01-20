# Builds the whole product into one container for the Hugging Face Docker Space:
# stage one compiles the React frontend, stage two runs the Node API which also
# serves that build. The C++ engine ships as a prebuilt WebAssembly module in the
# source, so no C++ toolchain is needed here.

# Stage 1: build the frontend
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend runtime serving the API and the built frontend
FROM node:22-slim
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
COPY --from=web /web/dist ./public
ENV PORT=7860
ENV NODE_ENV=production
EXPOSE 7860
CMD ["npm", "run", "start"]
