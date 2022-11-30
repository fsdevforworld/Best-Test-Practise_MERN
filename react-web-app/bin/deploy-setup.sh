#!/bin/bash
set -e

echo ${GCLOUD_SERVICE_KEY} > ${HOME}/gcloud-service-key.json

gcloud auth activate-service-account --key-file=${HOME}/gcloud-service-key.json

gcloud --quiet config set project ${GOOGLE_PROJECT_ID}

gcloud --quiet config set compute/zone ${GOOGLE_COMPUTE_ZONE}

gcloud --quiet container clusters get-credentials ${GOOGLE_CLUSTER_NAME}

gcloud --quiet auth configure-docker

curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
curl -sL https://deb.nodesource.com/setup_8.x | bash -
apt-get update && apt-get install -y nodejs && apt-get install -y yarn
