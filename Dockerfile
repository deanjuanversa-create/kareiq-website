# KareIQ API and app (Render). The Node server plus the tools that read medical report dates:
# Python with OpenCV (image preparation), Tesseract (OCR) and Poppler (PDF text and page images).
# Node.js 22 LTS (Node 20 reached end of life on 30 April 2026)
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-opencv python3-numpy tesseract-ocr tesseract-ocr-eng poppler-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
# exactly the versions in package-lock.json
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# NODE_ENV=production: without APP_ENV the server counts as production and refuses unsafe setups
# (src/runtime.js). The demo service sets APP_ENV=demo, staging APP_ENV=staging (render.yaml).
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
