FROM node:8.9.4-alpine
RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

COPY package.json /usr/src/app/
ARG NODE_ENV
ENV NODE_ENV $NODE_ENV

## Add packages needed to build native dependencies
#RUN apk add --no-cache \
#    git \
#    vim
#
#RUN npm install --quit && npm cache clean --force


# Add packages needed to build native dependencies
RUN apk add --no-cache --virtual .gyp \
        python \
        make \
        g++ \
        git \
    && npm install --quit && npm cache clean --force \
    && apk del .gyp


COPY . .

EXPOSE 3333
CMD [ "npm", "start"]
