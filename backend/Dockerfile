# backend\Dockerfile
FROM node:20-alpine
WORKDIR /usr/src/app
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev
COPY package*.json ./
RUN npm install --omit=dev

ENV DB_PORT=3306 
ENV DB_HOST=localhost
ENV DB_USER="u1773579_kencrot"
ENV DB_PASS="%+o,x0B1V*Omg8yO?C"
ENV DB_NAME="dpvindon_wms"

COPY . .
EXPOSE 3000
CMD ["node", "server.js"]