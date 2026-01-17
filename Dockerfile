# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json yarn.lock ./
# 需要 devDependencies 才能 tsc build
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# ---------- runtime stage ----------
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json yarn.lock ./
# 运行阶段只装 production 依赖
RUN yarn install --frozen-lockfile --production

# 拷贝编译产物
COPY --from=build /app/dist ./dist
# 如果运行时需要其他静态文件/模板，也在这里 COPY
COPY --from=build /app/data ./data

CMD ["yarn", "start"]
