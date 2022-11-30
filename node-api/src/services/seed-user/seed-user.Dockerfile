FROM node:14.16
LABEL description="Dave API v2"

ARG NODE_ENV
ENV NODE_ENV "$NODE_ENV"

RUN mkdir -p /opt/app

ADD legal-agreement.b64 /opt/app

ADD .npmrc /opt/app
ADD package.json /opt/app
ADD package-lock.json /opt/app
ADD database.json /opt/app

WORKDIR /opt/app
RUN npm install

ADD tsconfig.json /opt/app/tsconfig.json
ADD src /opt/app/src
ADD config /opt/app/config
ADD bin /opt/app/bin
ADD bin/dev-seed /opt/app/bin/dev-seed
ADD bin/dev-seed /opt/app/bin/dev-seed
ADD bin/bootstrap-and-run.sh /opt/app/bootstrap-and-run.sh
RUN ["chmod", "+x", "/opt/app/bootstrap-and-run.sh"]
ADD test /opt/app/test
RUN node_modules/.bin/tsc

EXPOSE 8080

ENTRYPOINT ["./bootstrap-and-run.sh"]
