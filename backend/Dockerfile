# ./audio_stream/Dockerfile
FROM node:14

WORKDIR /usr/src/audio_stream

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]