# connect-coordinator
coordinates mining operation.
- provide miners work with adjust difficulty and different SHA-256 coins (BTC/BCH)
- manage communicataion with miners according to [stratum protocol](https://slushpool.com/help/manual/stratum-protocol)
- communincate with bitcoind servers

### Project dependencies
- Redis
- connect-workers service (provide api to workers data)
- rabbit-mq (message broker - used for recording shares from miners)

### Installing

``` shell
  npm i
```

### Pre-requisite
- Running rabbit-mq e.g.:
```
  docker run -d --name rabbitmq --network="host" -e RABBITMQ_DEFAULT_VHOST=testnet -e RABBITMQ_DEFAULT_USER=guest -e RABBITMQ_DEFAULT_PASS=guest rabbitmq:3-management
```
- Running bitcoind server (e.g. BCH):
```
  docker run --rm -it --name bitcoind zquestz/bitcoin-abc:0.18.2 bitcoind -rpcuser=test -rpcpassword=1234 -testnet
```

- Running redis:
```
docker run --name some-redis -d redis
```

### Running
This project can run using Docker, in order to run the project just from root project run:
```
  docker build . -t coordinator
  docker run --network="host" coordinator
```
or using node.js environment with:
```
  npm start
```
### Logs
coordinator uses winston as an underlying framework to handle logs

#### Log messages structure
coordinator supports the following log messages:
- **submit_new** - sent whenever a new share received from one of the connected miners structure:
  2018-04-17T09:31:17.138Z - info:
  - **type** submit_new
  - **ip** (ip | remote_ip - miner’s ip)
  - **create** (timestamp | share created time)
  - **sId** (string | session id)
  - **time** (timestamp | share created time)
  - **nonce** (string | share's nonce)
  - **ntime** (timestamp | nonce timestamp)
  - **en1** (string | extra nonce 1)
  - **en2** (string | extra nonce 2)
  - **diff** (integer | share's difficulty)
  - **wId** (string | worker id)
  - **wName** (string | worker name)
  - **uName** (string | user name)
  - **hash** (string | share's hash)
  - **tId** (string | template id)
  - **height** (integer | share's block height)
  - **jId** (string | job id)
  - **coin** (string | coin type e.g. btc\bch)
  - **cId** (string | connection id)
  - **pId** (string | process id)
  - **mId** (string | machine id)


### Contribution
Thanks for the following people helped building this project:

Ofer ben-zvi  
Tal Weinfeld  
Eliran Zach  
Robert Ferentz  
Adi biton  
Yuval Heftman  

## License
[MIT](http://opensource.org/licenses/MIT) 
