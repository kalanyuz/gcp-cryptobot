FROM node:14 AS development
RUN npm install -g @nestjs/cli@7
WORKDIR /usr/src/app

FROM node:14-slim AS production
RUN npm install -g @nestjs/cli@7
WORKDIR /usr/src/app
# Copy application dependency manifests to the container image.
# Copying this separately prevents re-running npm install on every code change.
COPY package.json yarn.lock tsconfig*.json ./
COPY . ./ 
RUN yarn install
RUN yarn build
USER node
ENTRYPOINT ["node", "--unhandled-rejections=strict", "dist/main"]