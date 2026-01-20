import {HardhatUserConfig} from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const {
  PRIVATE_KEY = "",
  RPC_URL = "http://127.0.0.1:8545",
  NFT_CHAIN_ID = "31337",
} = process.env;

const accounts: string[] = [];
if (PRIVATE_KEY && PRIVATE_KEY.startsWith("0x") && PRIVATE_KEY.length === 66) {
  accounts.push(PRIVATE_KEY);
}

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    hardhat: {},
    localhost: {
      url: RPC_URL,
      chainId: Number(NFT_CHAIN_ID) || 31337,
      accounts: accounts.length ? accounts : undefined,
    },
  },
  paths: {
    sources: "contracts",
    tests: "test",
    cache: "cache",
    artifacts: "artifacts",
  },
};

export default config;
