const { ethers } = require("ethers");
const { defaultRpc, fallbackRpcs } = require("../contract/index.js");
const fs = require("fs");

const getRpc = (retry = 0) => {
  const allRpcs = [defaultRpc, ...fallbackRpcs];

  if (retry < allRpcs.length) {
    return allRpcs[retry];
  }

  throw new Error("All RPC endpoints failed");
};

const getProvider = (retry) => {
  try {
    const rpc = getRpc(retry);
    console.log("using rpc ", rpc);

    return new ethers.JsonRpcProvider(rpc);
  } catch (err) {
    console.log(err);
    retry++;
    return getProvider(retry);
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

function saveResumeData(lastPongBlock, lastBlockHashes) {
  const data = {
    lastPongBlock,
    lastBlockHashes,
  };
  try {
    fs.writeFileSync(RESUME_FILE_PATH, JSON.stringify(data, null, 2));
    console.log("Resume data saved successfully.");
  } catch (error) {
    console.error("Error saving resume data:", error);
  }
}
module.exports = {
  getRpc,
  getProvider,
  loadResumeData,
  saveResumeData,
};
