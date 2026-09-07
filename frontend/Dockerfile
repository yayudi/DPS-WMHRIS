# Tahap 1: Build aplikasi Vue.js
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package.json dan package-lock.json (jika ada)
COPY package*.json ./

# Install dependensi
RUN npm install

# Copy seluruh source code frontend
COPY . .

# Build aplikasi untuk production (menghasilkan folder /dist)
RUN npm run build

# Tahap 2: Serve aplikasi menggunakan Nginx
FROM nginx:alpine

# Copy hasil build dari tahap 1 ke folder default nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy file konfigurasi nginx khusus (opsional, tapi direkomendasikan untuk SPA/Vue Router)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Nginx berjalan di port 80 secara default
EXPOSE 80

# Jalankan Nginx
CMD ["nginx", "-g", "daemon off;"]
