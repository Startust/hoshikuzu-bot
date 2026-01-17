FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN yarn install --production

COPY . .
RUN yarn build

# sqlite 数据目录（挂卷会覆盖）
RUN mkdir -p /data

ENV NODE_ENV=production
CMD ["yarn", "start"]
