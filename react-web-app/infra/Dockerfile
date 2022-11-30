FROM node:14 as build-deps
WORKDIR /usr/src/app
COPY package.json yarn.lock .npmrc ./
RUN yarn install
COPY . ./

RUN GENERATE_SOURCEMAP=false yarn build

# ingress configuration for react-website needs a separate folder for static because it's used already
# we can remove this once we finish migrating old web content to react-web-app
RUN cd build && \
  sed -i'.original' -e 's/static\//app-static\//g' index.html asset-manifest.json && \
  find . -type f -name '*.js' -exec sed -i'.original' 's/static\//app-static\//g' {} \; && \
  find . -type f -name '*.css' -exec sed -i'.original' 's/static\//app-static\//g' {} \; && \
  mv static app-static

FROM nginx:1.15.7-alpine
COPY --from=build-deps /usr/src/app/build /usr/share/nginx/html
COPY --from=build-deps /usr/src/app/infra/web-app-nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
