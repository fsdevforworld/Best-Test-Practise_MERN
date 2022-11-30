#!/bin/sh

args=$@
npm run secrets:fetch
exec node $@
