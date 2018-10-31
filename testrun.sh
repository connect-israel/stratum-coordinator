#!/bin/bash

year=`date +%Y`
month=`date +%m`
day=`date +%d`

mkdir -p ./log/$year/$month
npm start >> ./log/$year/$month/$day.log

