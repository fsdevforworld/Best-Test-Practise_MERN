#!/bin/bash

# Exit on error
set -e

# Run this script with: ./testing-deploy.sh BRANCH_NAME
branch_name=$1

# clone or git pull branch
if [ -e "$branch_name" ]; then
  echo "$branch_name found locally, pulling latest code"
  cd $branch_name
  git pull origin $branch_name
else
  echo "$branch_name not found, cloning"
  git clone -b $branch_name --single-branch git@github.com:dave-inc/node-api $branch_name
  cd $branch_name
fi

# Build and run the project
echo "cleaning any existing project"
docker-compose -p $branch_name down --remove-orphans
echo "building and running $branch_name"
docker-compose -p $branch_name up -d --remove-orphans --build

echo "waiting for services to start"
sleep 10

# run migrations
echo "running migrations"
docker-compose -p $branch_name exec -T node-api npm run db-migrate up

# dev-seed
echo "running dev-seed down"
docker-compose -p $branch_name exec -T node-api ./node_modules/.bin/ts-node ./bin/dev-seed down
echo "running dev-seed up"
docker-compose -p $branch_name exec -T node-api ./node_modules/.bin/ts-node ./bin/dev-seed up

echo "finding node-api service port"
port=$(docker-compose -p $branch_name port node-api 8080 | sed s/.*\://)
echo "node-api running on $port"

# create a custom nginx config pointing to the right port
echo "creating nginx conf"
cat infra/api/testing-nginx.conf | sed s/BRANCH_NAME/$branch_name/ | sed s/PORT/$port/ > $branch_name.conf

# copy the nginx config over and reload nginx
echo "applying nginx conf"
sudo $HOME/node-api/bin/update-testing-nginx.sh $branch_name.conf

echo "done!"
