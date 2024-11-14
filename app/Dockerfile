# ./audio_stream/Dockerfile
FROM node:23

WORKDIR /usr/src/app/

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]