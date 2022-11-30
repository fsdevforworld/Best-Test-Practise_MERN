#! /bin/bash

MIGRATION_NAME=$1

if [[ -z "$MIGRATION_NAME" ]] ; then
    echo "Command takes a migration name as the first argument"
    exit 1
fi

FILE_NAME="migrations/$(date '+%Y%m%d%H%M%S')-${MIGRATION_NAME}.ts"

cp migrations/seeds/migration-template.ts $FILE_NAME

echo "Created migration at ${FILE_NAME}"
