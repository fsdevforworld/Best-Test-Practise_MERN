#!/bin/bash

# Exit on error
set -e

# Run this script with: ./testing-deploy.sh BRANCH_NAME
branch_name=$1
branch_name_lower=$(echo "$1" | awk '{print tolower($0)}')

# Doing web stuff!
mkdir -p testing-web-app && cd testing-web-app

# clone or git pull branch
if [ -e "$branch_name_lower" ]; then
  echo "$branch_name_lower found locally, deleting"
  rm -rf $branch_name_lower
fi

git clone -b $branch_name --single-branch git@github.com:dave-inc/react-web-app $branch_name_lower
cd $branch_name_lower

# Shallow-clone the Node API
git clone --single-branch --depth 1 git@github.com:dave-inc/node-api
cd node-api

# Build and run the API
echo "cleaning any existing project"
docker-compose -p $branch_name_lower-api down --remove-orphans
echo "building and running $branch_name_lower"
docker-compose -p $branch_name_lower-api up -d --remove-orphans --build

echo "waiting for services to start"
sleep 10

# run migrations
echo "running migrations"
docker-compose -p $branch_name_lower-api exec -T node-api yarn run db-migrate up

# dev-seed
echo "running dev-seed down"
docker-compose -p $branch_name_lower-api exec -T node-api yarn ts-node ./bin/dev-seed down
echo "running dev-seed up"
docker-compose -p $branch_name_lower-api exec -T node-api yarn ts-node ./bin/dev-seed up

echo "finding node-api service port"
api_port=$(docker-compose -p $branch_name_lower-api port node-api 8080 | sed s/.*\://)
echo "node-api running on $api_port"

# Run the website pointing at $api_port
# figure out the website's port, and make it available through nginx
cd ..

# write env for docker build
API_URL=http://$branch_name_lower.api.test.trydave.com
PLAID_WEBHOOK_URL=$API_URL/v1/bank/plaid_webhook

# using | as a delimiter because URLS have `/` character
sed -i.original "s|\(REACT_APP_API_URL\)='\(.*\)'$|\1='$API_URL'|" .env
sed -i.original "s|\(REACT_APP_PLAID_WEBHOOK_URL\)='(.*)'$|\1='$PLAID_WEBHOOK_URL'|" .env

# Build and run the WEB APP
echo "cleaning any existing project"
docker-compose -p $branch_name_lower-app down --remove-orphans
echo "building and running $branch_name_lower"
docker-compose -p $branch_name_lower-app up -d --remove-orphans --build

echo "finding react-web-app port"
react_web_app_port=$(docker-compose -p $branch_name_lower-app port react-web-app 80 | sed s/.*\://)
echo "react-web-app running on $react_web_app_port"

# create a custom nginx config pointing to the right port
echo "creating nginx conf"
cat infra/testing-nginx.conf | sed s/BRANCH_NAME/$branch_name_lower/ | sed s/API_PORT/$api_port/ | sed s/PORT/$react_web_app_port/ > $branch_name_lower.conf

# copy the nginx config over and reload nginx
echo "applying nginx conf"
# We run this script as root because it has to update the nginx config.
# the user running `testing-deploy.sh` (`deploy`) does not have full sudo permission,
# so I've used visudo to allow the `deploy` user to run this script as root.
sudo $HOME/react-web-app/bin/update-testing-nginx.sh $branch_name_lower.conf

echo "done!"
