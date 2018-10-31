#!/bin/bash
set -x

docker rm -f rabbitmq || true
docker rm -f redis || true