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

let rpcRetry = 0;
let startBlock = null;
let lastPongBlock = null;
//maintain only one blocks txn hashes
let lastPongHashes = [];

async function syncLastBlock(contract, startBlock) {
  //we need to take in account the case , when we are handling events in a block and the bot crashes,
  //since then if we restart it will start fetching the events from same block and might consume the same event twice
  const resumeData = loadResumeData();
  if (resumeData?.lastBlockHashes) {
    lastPongHashes = resumeData?.lastBlockHashes;
  }

  //load last block hashes
  //load past events from the start block
  //handle the resume block logs
  const resumeBlockLogs = await contract.queryFilter(
    "Ping",
    startBlock,
    startBlock
  );
  console.log("same", resumeBlockLogs);
  if (resumeBlockLogs.length) {
    for (const log of resumeBlockLogs) {
      console.log(lastPongHashes);
      if (!lastPongHashes.includes(log.transactionHash)) {
        addToQueue([log]);
      }
    }
  }

  const logs = await contract.queryFilter("Ping", startBlock + 1, "latest");
  console.log(logs);
  if (logs.length) {
    addToQueue(logs);
  }

  console.log("inital load done");
  //after loaded start a listner to listen to new ones
}

async function startConsuming() {
  setInterval(async () => {
    const event = getEvent();
    if (!event) return;
    console.log("handling", event);
    const block = event.blockNumber ?? event.log.blockNumber;
    const hash = event.transactionHash ?? event.log.transactionHash;
    console.log("Consuming event with block : ", block, "hash :", hash);

    //if we enter a new block, maintain a new last block hash array
    if (block != lastPongBlock) {
      lastPongHashes = [hash];
      lastPongBlock = block;
    } else {
      lastPongHashes.push(hash);
    }

    saveResumeData(lastPongBlock, lastPongHashes);
  }, 5000);
}

async function main() {
  try {
    createQueue();
    const provider = getProvider(rpcRetry);
    const resumeData = loadResumeData();

    const currentBlock = await provider.getBlockNumber();
    if (!resumeData) {
      startBlock = currentBlock;
      console.log("Starting from block : ", startBlock);
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

    await syncLastBlock(contract, startBlock);

    contract.on("Ping", (event) => {
      console.log("found event");
      addToQueue([event]);
    });

    await startConsuming();
  } catch (err) {
    console.error("Error:", err);
    rpcRetry++;

    if (rpcRetry >= 4) {
      console.error(`Max retry limit reached. Exiting...`);
      process.exit(1);
    }
  }
}

main().catch((error) => console.error(error));
