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

//variables to monitor bot
let startBlock = null;
let lastPongBlock = null;
//maintain only one blocks txn hashes
let lastPongHashes = [];
const processedEvents = new Set();

//start from "startBlock" and sync up the events
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
  if (resumeBlockLogs.length) {
    for (const log of resumeBlockLogs) {
      console.log(lastPongHashes);
      if (!lastPongHashes.includes(log.transactionHash)) {
        addToQueue([log]);
      }
    }
  }

  const logs = await contract.queryFilter("Ping", startBlock + 1, "latest");
  if (logs.length) {
    addToQueue(logs);
  }

  console.log("inital load done");
  //after loaded start a listner to listen to new ones
}

//consume events from events queue
async function startConsuming() {
  const consumerId = setInterval(async () => {
    const event = getEvent();
    if (!event) return;

    const block = event.blockNumber ?? event.log.blockNumber;
    const hash = event.transactionHash ?? event.log.transactionHash;

    //sometimes the event may fire twice due to some reason
    if (lastPongHashes.includes(hash) || processedEvents.has(hash)) return;

    console.log("Consuming event with block : ", block, "hash :", hash);

    //if we enter a new block, maintain a new last block hash array
    if (block != lastPongBlock) {
      lastPongHashes = [hash];
      lastPongBlock = block;
    } else {
      lastPongHashes.push(hash);
    }
    processedEvents.add(hash);
    saveResumeData(lastPongBlock, lastPongHashes);
  }, 5000);

  return consumerId;
}

async function main() {
  try {
    createQueue();
    const provider = getProvider();
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

    console.log("starting live listening");

    contract.on("Ping", (event) => {
      console.log("found event");
      addToQueue([event]);
    });

    //start responding to events
    const consumerId = await startConsuming();

    // Add a listener to check network status every 1 min
    while (true) {
      const available = await isNetworkAvailable(provider);
      if (!available) {
        //clearing all interval before pasuing
        clearInterval(consumerId);
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
    }
  }
}

main().catch((error) => console.error(error));
