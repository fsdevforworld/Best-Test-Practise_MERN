export REACT_APP_WEBHOOK_URL="$(curl -s http://localhost:4040/api/tunnels | jq .tunnels[0].public_url | sed s/\"//g)"

if [ -z "$REACT_APP_WEBHOOK_URL" ]; then
  echo "!!! PLAID WEBHOOKS ARE REQUIRED TO RUN THIS APPLICATION. RUN PLAID WEBHOOKS WITH THE FOLLOWING COMMAND: "
  echo
  echo "> yarn webhooks"
fi

export REACT_APP_PLAID_WEBHOOK_URL=$REACT_APP_WEBHOOK_URL/v1/bank/plaid_webhook
react-scripts start