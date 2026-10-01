FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src

ENV PORT=3000
ENV DB_PATH=/data/feedback.db

EXPOSE 3000

CMD ["node", "src/server.js"]
