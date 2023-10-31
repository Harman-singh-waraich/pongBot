const { ethers } = require("ethers");
const { defaultRpc, fallbackRpcs } = require("../contract/index.js");
const fs = require("fs");

const getRpc = (retry) => {
  const allRpcs = [defaultRpc, ...fallbackRpcs];
  if (retry >= allRpcs.length) throw Error("Out of rpcs");
  return allRpcs[retry];
};

//returns a fallback provider
const getProvider = () => {
  try {
    const allRpcs = [defaultRpc, ...fallbackRpcs];
    const providers = allRpcs.map((rpc) => new ethers.JsonRpcProvider(rpc));

    const network = new ethers.Network("goerli", 5n);

    return new ethers.FallbackProvider(providers, network, {
      cacheTimeout: 5000,
      eventQuorum: 2,
      eventWorkers: 1,
      pollingInterval: 1000,
      quorum: 1,
    });
  } catch (err) {
    console.log(err);
  }
};

const RESUME_FILE_PATH = "resume.json";

function loadResumeData() {
  try {
    if (fs.existsSync(RESUME_FILE_PATH)) {
      const data = fs.readFileSync(RESUME_FILE_PATH);
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading resume data:", error);
  }
  return null;
}

function saveResumeData(data) {
  const savedState = loadResumeData();

  let saveData = {};

  if (savedState) {
    saveData = { ...savedState, ...data };
  } else {
    saveData = data;
  }

  try {
    fs.writeFileSync(RESUME_FILE_PATH, JSON.stringify(saveData, null, 2));
    console.log("Resume data saved successfully.\n");
  } catch (error) {
    console.error("Error saving resume data:", error);
  }
}

async function isNetworkAvailable(provider) {
  try {
    await provider.getNetwork();
    return true;
  } catch (error) {
    return false;
  }
}

async function waitForNetwork() {
  return new Promise(async (resolve) => {
    while (true) {
      const provider = getProvider();
      const available = await isNetworkAvailable(provider);
      if (available) {
        console.log("Network is back up. Resuming main function...\n");
        resolve();
        break;
      }
      await new Promise((r) => setTimeout(r, 60000)); //every 10 min retry
    }
  });
}

module.exports = {
  getRpc,
  getProvider,
  loadResumeData,
  saveResumeData,
  isNetworkAvailable,
  waitForNetwork,
};
