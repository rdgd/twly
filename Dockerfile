FROM node:alpine

RUN npm install -g twly

ENTRYPOINT ["twly"]

