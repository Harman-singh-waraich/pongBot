const { ethers } = require("ethers");
const { contractAddress, contractABI } = require("../contract");
const { getRpc } = require("./utils");
const { saveResumeData } = require("./utils");

/**
 *
 * @param {hash of the ping ponging to} hash
 * @param {*multiplier in form of percent, 10 => 10%} gasPriceMultiplier
 * @returns txn receipt
 */
async function sendTransactionWithRetry(hash, block, gasPriceMultiplier = 20) {
  let retryCount = 0;
  //using providers one by one, since fallback providers emits txn to all nodes and creates a race condition
  while (retryCount < 4) {
    try {
      const provider = new ethers.JsonRpcProvider(getRpc(retryCount));

      const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
      const contract = new ethers.Contract(
        contractAddress,
        contractABI,
        signer
      );

      const nonce = await signer.getNonce();
      const feeData = await provider.getFeeData();

      const estimatedGasLimit = await contract.pong.estimateGas(hash);
      const unsignedTxn = await contract.pong.populateTransaction(hash);

      const adjustedFee =
        (feeData.maxFeePerGas * BigInt(100 + gasPriceMultiplier)) / BigInt(100);

      //configure the txn
      unsignedTxn.gasPrice = feeData.gasPrice;
      unsignedTxn.maxFeePerGas = adjustedFee;
      unsignedTxn.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      unsignedTxn.nonce = nonce;
      unsignedTxn.gasLimit = estimatedGasLimit;
      unsignedTxn.chainId = 5n;

      const signedTxn = await signer.signTransaction(unsignedTxn);

      const tx = await provider.broadcastTransaction(signedTxn);
      console.log("Pong submitted \n");

      //saving immediately after getting hash, in cash bot dies before processing fully
      saveResumeData({
        pendingTxn: { hash: tx.hash, pingHash: hash, block: block },
        lastPongBlock: block,
      });

      const receipt = await tx.wait();

      console.log("Pong succesfull\n");
      return receipt;
    } catch (error) {
      console.error(`Error sending transaction: ${error.message}`);

      retryCount++;
      console.error(`Retrying in ${5000 / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  throw new Error(`Max retry limit reached. Unable to send transaction.`);
}

module.exports = { sendTransactionWithRetry };
