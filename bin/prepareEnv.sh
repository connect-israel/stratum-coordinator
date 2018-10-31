#!/bin/bash
set -x

docker rm -f rabbitmq || true
docker rm -f redis || true

CONFIG=$(cat config/default.json)
RABBITMQ_DEFAULT_VHOST=$(echo $CONFIG | jq -r '.report.rabbitmq.vhost')
RABBITMQ_DEFAULT_USER=$(echo $CONFIG | jq -r '.report.rabbitmq.login')
RABBITMQ_DEFAULT_PASS=$(echo $CONFIG | jq -r '.report.rabbitmq.password')
RABBITMQ_DEFAULT_PORT=$(echo $CONFIG | jq -r '.report.rabbitmq.port')
RABBITMQ_DEFAULT_MANAGMENT_PORT=$(echo $CONFIG | jq -r '.report.rabbitmq.managment_port')
RABBITMQ_DEFAULT_EXCHANGE_NAME=$(echo $CONFIG | jq -r '.report.rabbitmq.exchange_name')

docker run -d --name rabbitmq \
  -p "$RABBITMQ_DEFAULT_MANAGMENT_PORT":15672 \
  -p "$RABBITMQ_DEFAULT_PORT":5672 \
  -e RABBITMQ_DEFAULT_VHOST="$RABBITMQ_DEFAULT_VHOST" \
  -e RABBITMQ_DEFAULT_USER="$RABBITMQ_DEFAULT_USER" \
  -e RABBITMQ_DEFAULT_PASS="$RABBITMQ_DEFAULT_PASS" rabbitmq:3-management

docker run -d --name redis -p 6379:6379 redis
