const contractABI = [
  { inputs: [], stateMutability: "nonpayable", type: "constructor" },
  { anonymous: false, inputs: [], name: "Ping", type: "event" },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes32",
        name: "txHash",
        type: "bytes32",
      },
    ],
    name: "Pong",
    type: "event",
  },
  {
    inputs: [],
    name: "ping",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "pinger",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "_txHash", type: "bytes32" }],
    name: "pong",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const contractAddress = "0x7D3a625977bFD7445466439E60C495bdc2855367";

const defaultRpc = `https://goerli.infura.io/v3/${process.env.INFURA_KEY}`;
const fallbackRpcs = [
  `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
  "https://ethereum-goerli.publicnode.com",
  "https://rpc.ankr.com/eth_goerli",
];
module.exports = {
  contractABI,
  contractAddress,
  defaultRpc,
  fallbackRpcs,
};
