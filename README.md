# Pong Bot


## About

This bot pongs for every ping made at [0x7D3a625977bFD7445466439E60C495bdc2855367](https://goerli.etherscan.io/address/0x7d3a625977bfd7445466439e60c495bdc2855367)

## Challenges
### Fallback rpcs
In case a rpc fails or rate limit is reached ,we need a way to keep the bot running.
Used ethers Fallback Providers , to use multiple RPC's to ensure bot keeps running properly

### Handle Network outage
Bot keeps constant check of network, and if the network goes out , bot will pause automatically and once the network is back it will resume the Ponging.

### Handle Bot crashes
Implemented a resume state file that keeps track of the bot's state, in case bot crashes due to any reason, the bot is restarted from the same point and no event is lost.

### Streamline events handling
Used a custom event queue to handle events.
Wanted to use something like kafka,redis or pub/sub ,but since its a small application,
I ended up using a custom queue.
This helps in seperating the process into two parts.
One listener constantly listens to new events and push them to queue.
While another one constantly consumes the events and calls the pong function.
Making listening and handling event two seperate functions.

### Handling multiple pings in one block

let's assume there are multiple pings in 1 block, if the bot is in process of handling these and crashes in between, then
on restart the bot will resume from hat block and consume the event twice.
To mitigate this, i used a "lastBlockHashes" that maintains an array of hashes/events that have been handled in that particular block.
Also it only saves the block that the bot is consuming currently so there's constant space.
So when the bot restart, it loads the events from the resume block seperately and removes the one's that are in the "lastBlockHashes".
I explain it more in the code here:

https://github.com/Harman-singh-waraich/pongBot/blob/6c76fe9dbdee3d5d14b0ec327bb83cfce8d06651/index.js#L83-L101

### Handling pendnig txn

The bot sends txn with increased gas to make sure the txn get mined fast, but let's say a txn was submitted and bot crashed.
For that, the bot maintains a "pendingTxn" field in the resume file, and when the bot restarts, it first calls the "checkPendingTxn" function which ensures the txn was successfull, if it's still pending then , a new txn with higher gas fee is sent and after that the bot resumes.

https://github.com/Harman-singh-waraich/pongBot/blob/6c76fe9dbdee3d5d14b0ec327bb83cfce8d06651/index.js#L23-L68 

### some small challenges or cases handled

 - Using dedicated RPC provider for sending transaction, and using new RPC if txn failed with previous one, since fallback provider broadcasts the txn to multiple nodes at once and does not properly handle the error due to conflicts.
 - Used async recursive functions to constantly act on new events in the queue, since using "setInterval" we couldn't wait for txn to be mined. and with "while" loop it blocks the process and then the contract.on listener stops working.
 - Using a set to keep track of duplicate events

Take a stroll through the code , as i explain things there too.

Cheers
