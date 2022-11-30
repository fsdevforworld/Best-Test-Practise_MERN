#!/bin/bash

SKIP_MIGRATION=false
DEBUGGER=false
HAD_PATH=false
ADDTL_ARGS=""
FLAG_REGEX="--.*"
PATHS=""

for var in "$@"
do
    if [[ "$var" = "--coverage" ]] ; then
      COVERAGE=true
    elif [[ "$var" = "skip-migrations" || "$var" = "sm" ]] ; then
      SKIP_MIGRATION=true
    elif [[ "$var" = "debug" ]] ; then
      DEBUGGER=true
    elif [[ "$var" =~ $FLAG_REGEX ]] ; then
      ADDTL_ARGS="$ADDTL_ARGS $var"
    elif [[ -a "$var" ]] ; then
      # This allows for tab completion
      HAD_PATH=true
      if [[ -d "$var" ]] ; then
        PATHS="$PATHS \"$var/**/*.ts\""
      else
        PATHS="$PATHS \"$var\""
      fi
    elif [[ -a "test/$var" ]] ; then
      # So as not to break existing habits
      HAD_PATH=true
      if [[ -d "test/$var" ]] ; then
        PATHS="$PATHS \"test/$var/**/*.ts\""
      else
        PATHS="$PATHS \"test/$var\""
      fi
    else
      echo "$var does not exist locally or in the tests directory"
      exit 1
    fi
done

TEST_CMD="./node_modules/.bin/ts-mocha --paths --exit --timeout 30000 --config ./test/mocharc.json 'test/*.ts'"
if [[ $COVERAGE = true ]] ; then
  TEST_CMD="./node_modules/.bin/nyc $TEST_CMD"
fi

EXTRA_ENV="PUBSUB_EMULATOR_HOST='localhost:8682' DB_HOST=localhost DB_PORT=53307"
COMMAND="$EXTRA_ENV $TEST_CMD"

COMMAND="$COMMAND $ADDTL_ARGS"

if [[ $HAD_PATH = false ]] ; then
  COMMAND="$COMMAND 'test/{,!(integration-tests)/**}/*.ts'"
else
    COMMAND="$COMMAND $PATHS"
fi

if [[ $SKIP_MIGRATION = true ]] ; then
  COMMAND="$COMMAND -m skip-migrations"
fi

if [[ $DEBUGGER = true ]] ; then
  COMMAND="$COMMAND --inspect-brk=0.0.0.0"
fi

eval "$COMMAND &"
childPID=$!
wait $childPID
