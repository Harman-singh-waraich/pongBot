const { configDotenv } = require("dotenv");
configDotenv();
const { ethers } = require("ethers");
const { contractAddress, contractABI } = require("./contract/index.js");
const { getProvider } = require("./helpers/utils.js");
const { saveResumeData, loadResumeData } = require("./helpers/utils.js");
const {
  createQueue,
  addToQueue,
  getEvent,
} = require("./helpers/queueManager.js");
const { isNetworkAvailable } = require("./helpers/utils.js");
const { waitForNetwork } = require("./helpers/utils.js");
const { sendTransactionWithRetry } = require("./helpers/sendTransaction.js");

//variables to monitor bot
let startBlock = null;
let lastPongBlock = null;
//maintain only one blocks txn hashes
let lastBlockHashes = [];
const processedEvents = new Set();

/**
 * @description this checks if there is any pending txn and if the txn is not on chain, it sends a new txn
 * @param {*} provider
 * @returns
 */
async function checkPendingTxn(provider) {
  try {
    const resumeState = loadResumeData();

    if (!resumeState || !resumeState.pendingTxn) return;

    const txnReceipt = await provider.waitForTransaction(
      resumeState.pendingTxn.hash
    );

    //if the pending txn was not found then resend it
    if (!txnReceipt) {
      await sendTransactionWithRetry(
        resumeState.pendingTxn.pingHash,
        resumeState.pendingTxn.block,
        50 //50% higher fee
      );
      return;
    }

    console.log(resumeState.pendingTxn.hash, "was succesfull\n");

    const block = resumeState.pendingTxn.block;
    const hash = resumeState.pendingTxn.pingHash;

    //when the last pending txn is done, remove it from the pending hash and also update the processed events and other variables
    if (block != lastPongBlock) {
      lastBlockHashes = [hash];
      lastPongBlock = block;
    } else {
      lastBlockHashes.push(hash);
    }
    processedEvents.add(hash);

    saveResumeData({ lastPongBlock, lastBlockHashes, pendingTxn: null });
    return;
  } catch (err) {
    console.log("Error checking pending txn", err.message);
    return;
  }
}

/**
 * @description this runs when bot resumes and loads all the events from resume block up untill latest block and adds them to event queue
 * @param {*} contract
 * @param {block to start syncing from} startBlock
 */
async function syncLastBlock(contract, startBlock) {
  //we need to take in account the case , when we are handling events in a block and the bot crashes,
  //since then if we restart it will start fetching the events from same block and might consume the same event twice
  const resumeData = loadResumeData();
  if (resumeData?.lastBlockHashes) {
    lastBlockHashes = resumeData?.lastBlockHashes;
  }

  //EXPLANATION:
  //CASE : one block has multiple pings andthe bot crashes after only some of events in that block are handled
  //       so when we restart it will consume that event again,
  //SOLUTION: we maintain a "lastBlockHashes" array, it will contain the processed events of a block, so if bot dies and restarts, and we check these
  //          against the resume block logs and dont consume the same event twice
  const resumeBlockLogs = await contract.queryFilter(
    "Ping",
    startBlock,
    startBlock
  );
  if (resumeBlockLogs.length) {
    for (const log of resumeBlockLogs) {
      console.log(lastBlockHashes);
      if (!lastBlockHashes.includes(log.transactionHash)) {
        addToQueue([log]);
      }
    }
  }

  //we process the rest toggether, since we are only concerned about resume block
  const logs = await contract.queryFilter("Ping", startBlock + 1, "latest");
  if (logs.length) {
    addToQueue(logs);
  }

  console.log(
    "inital load done\n",
    `Found ${resumeBlockLogs.length + logs.length} events`
  );
  //after loaded start a listner to listen to new ones
}

/**
 * @description a recursive function that continuously consumes the events from the event queue and calls the pong function
 * @param {} provider
 * @returns
 */
async function startConsuming(provider) {
  const event = getEvent();
  if (!event) {
    await new Promise((r) => setTimeout(r, 5000));

    return startConsuming(provider);
  }

  const block = event.blockNumber ?? event.log.blockNumber;
  const hash = event.transactionHash ?? event.log.transactionHash;

  //sometimes the event may fire twice due fallback providers
  if (lastBlockHashes.includes(hash) || processedEvents.has(hash))
    return startConsuming(provider);

  console.log("Consuming event with block : ", block, "hash :", hash, "\n");
  await sendTransactionWithRetry(hash, block);

  //if we enter a new block, maintain a new last block hash array
  // this is for the CASE when a block has ultiple events
  if (block != lastPongBlock) {
    lastBlockHashes = [hash];
    lastPongBlock = block;
  } else {
    lastBlockHashes.push(hash);
  }
  // keeping track so we dont call pong twice for szme event
  processedEvents.add(hash);

  saveResumeData({ lastPongBlock, lastBlockHashes });

  await new Promise((r) => setTimeout(r, 5000));

  return startConsuming(provider);
}

async function main() {
  try {
    createQueue();
    const provider = getProvider();
    const resumeData = loadResumeData();

    //if resume data available start from there
    const currentBlock = await provider.getBlockNumber();
    if (!resumeData) {
      startBlock = currentBlock;
      console.log("Starting from block : ", startBlock);
      saveResumeData({ startBlock });
    } else {
      startBlock = resumeData?.lastPongBlock;
      console.log("Resuming from block : ", startBlock);
    }

    // initial load of events
    const contract = new ethers.Contract(
      contractAddress,
      contractABI,
      provider
    );

    //only sync when resumin
    if (resumeData) {
      await syncLastBlock(contract, startBlock);
    }

    console.log("starting live listening\n");

    contract.on("Ping", (event) => {
      console.log("found event\n");
      addToQueue([event]);
    });

    //calling after starting listener so listener doesnt miss any events in between
    if (resumeData?.pendingTxn) {
      //check if the last pending txn was success or not
      await checkPendingTxn(provider);
    }
    console.log("Starting consuming.. \n");
    //start responding to events
    startConsuming(provider);

    // Add a listener to check network status every 1 min
    while (true) {
      const available = await isNetworkAvailable(provider);
      if (!available) {
        //clearing all interval before pasuing
        contract.removeAllListeners();

        throw new Error("Network is down");
      }
      await new Promise((r) => setTimeout(r, 60000));
    }
  } catch (err) {
    console.error("Error:", err);
    if (err.message == "Network is down") {
      await waitForNetwork();
      return main();
    } else {
      await new Promise((r) => setTimeout(r, 600000)); //wait 10 min and try again
      console.log("Attempting Restart..\n");
      main();
    }
  }
}

main().catch((error) => console.error(error));
