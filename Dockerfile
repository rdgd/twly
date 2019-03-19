FROM node:alpine

WORKDIR /twly

COPY . /twly

RUN npm install

ENTRYPOINT ["node", "/twly/index.js"]

