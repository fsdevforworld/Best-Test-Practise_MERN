FROM node:14
LABEL description="Dave API v2"

ARG NODE_ENV
ENV NODE_ENV "$NODE_ENV"

ARG NPM_TOKEN
ENV NPM_TOKEN "$NPM_TOKEN"

WORKDIR /opt/app

ADD package.json /opt/app
ADD package-lock.json /opt/app

ADD .npmrc /opt/app
RUN echo '//npm.pkg.github.com/:_authToken=${NPM_TOKEN}' >> .npmrc
RUN npm ci

ADD migrations /opt/app/migrations
ADD database.json /opt/app
ADD legal-agreement.b64 /opt/app/legal-agreement.b64
ADD example-screenshot.png /opt/app/example-screenshot.png
ADD tsconfig.json /opt/app/tsconfig.json
ADD .nycrc /opt/app
