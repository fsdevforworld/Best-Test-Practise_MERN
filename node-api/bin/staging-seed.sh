#!/bin/bash

DIRECTION=$1
PHONE_NUMBER_SEED=$2

### Checking if some user is trying to overwrite numbers reserved for tests
if [[ "$PHONE_NUMBER_SEED" == 899 || "$PHONE_NUMBER_SEED" == 949 ]] && [ -z "$CIRCLE_BRANCH" ]; then
	echo "Looks like you're trying to use reserved prefix. Try different 3 numbers"
	exit 1
fi

if [[ -z "$DIRECTION" ]]; then
  echo "command takes a direction as the first argument"
  exit 1
elif [[ -z "$PHONE_NUMBER_SEED" ]]; then
  echo "command takes a phoneNumberSeed as the second argument"
  exit 1
elif [[ "$DIRECTION" != "up" ]] && [[ "$DIRECTION" != "down" ]]; then
  echo "direction must be up or down"
  exit 1
elif ! [[ "$PHONE_NUMBER_SEED" =~ ^[0-9]{3}$ ]]; then
  echo "phoneNumberSeed must be a 3 digit number"
  exit 1
fi

echo "seeding staging database $DIRECTION..."
COMMAND="curl -X POST -H \"Content-Type: application/json\" -d '{\"direction\":\"$DIRECTION\",\"phoneNumSeed\":$PHONE_NUMBER_SEED}' https://staging.trydave.com/services/seed-user/v1/seed"

eval $COMMAND
