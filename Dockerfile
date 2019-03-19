FROM node

RUN npm install -g twly

ENTRYPOINT ["twly"]

