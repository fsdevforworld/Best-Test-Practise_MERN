# syntax=docker/dockerfile:1.2
FROM node:14.16
LABEL description="Dave API v2"

ARG NODE_ENV
ENV NODE_ENV "$NODE_ENV"

RUN mkdir -p /opt/app
WORKDIR /opt/app

ADD package.json /opt/app
ADD package-lock.json /opt/app

RUN --mount=type=secret,id=npmrc,dst=/opt/app/.npmrc npm install --production

ADD legal-agreement.b64 /opt/app

ADD database.json /opt/app
ADD example-screenshot.png /opt/app
ADD migrations /opt/app/migrations

ADD tsconfig.json /opt/app/tsconfig.json
ADD src /opt/app/src
ADD config /opt/app/config
ADD bin/scripts /opt/app/bin/scripts
ADD bin/bootstrap-and-run.sh /opt/app/bootstrap-and-run.sh
RUN ["chmod", "+x", "/opt/app/bootstrap-and-run.sh"]
RUN rm -rf /opt/app/src/services/seed-user
RUN node_modules/.bin/tsc

EXPOSE 8080

ENTRYPOINT ["./bootstrap-and-run.sh"]
