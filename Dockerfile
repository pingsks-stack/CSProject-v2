# image สำหรับเดโม (Render, Cloudflare Containers หรือ Docker ทั่วไป)
# รวมหน้าเว็บ + API + MongoDB ชั่วคราวไว้ด้วยกัน ข้อมูลตัวอย่างถูกใส่ใหม่ทุกครั้งที่ container เริ่ม
# ใช้งานจริงกับข้อมูลจริงให้ติดตั้งตาม docs/INSTALL.md แทน

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --ignore-scripts
COPY client client
COPY server server
RUN npm run build

FROM node:22-bookworm-slim
# ไลบรารีที่ mongod ต้องใช้
RUN apt-get update \
  && apt-get install -y --no-install-recommends libcurl4 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
  DEMO_MODE=true \
  PORT=8080 \
  MONGOMS_DOWNLOAD_DIR=/opt/mongodb-binaries
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
# ดาวน์โหลด mongod ไว้ใน image ตั้งแต่ตอน build (container เริ่มได้เร็วขึ้น)
RUN node -e "import('mongodb-memory-server').then(async ({ MongoMemoryServer }) => { const s = await MongoMemoryServer.create(); await s.stop() })"
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
WORKDIR /app/server
EXPOSE 8080
CMD ["node", "dist/index.js"]
