#!/bin/bash

set -e

cp $1 /etc/nginx/sites-enabled/
service nginx reload