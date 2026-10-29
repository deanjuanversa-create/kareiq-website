# KareIQ API and app (Render). The Node server plus the tools that read medical report dates:
# Python with OpenCV (image preparation), Tesseract (OCR) and Poppler (PDF text and page images).
FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-opencv python3-numpy tesseract-ocr tesseract-ocr-eng poppler-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
