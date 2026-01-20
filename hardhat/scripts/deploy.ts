import {ethers} from "hardhat";
import * as dotenv from "dotenv";
import {writeFileSync, existsSync, readFileSync} from "fs";
import {join} from "path";

dotenv.config();

async function main() {
  const BASE_URI = process.env.BASE_URI || "";
  const lootEnv = process.env.LOOT_POOL || "c1,c2,c3";
  let LOOT_POOL: string[] = [];
  try {
    if (lootEnv.includes("/") && existsSync(lootEnv)) {
      const raw = readFileSync(lootEnv, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        LOOT_POOL = parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    }
  } catch {
  }
  if (LOOT_POOL.length === 0) {
    LOOT_POOL = lootEnv.split(",").map(s => s.trim()).filter(Boolean);
  }
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Cards = await ethers.getContractFactory("TowerlordsCards");
  const cards = await Cards.deploy("Towerlords Cards", "TLCRD");
  await cards.waitForDeployment();
  const cardsAddr = await cards.getAddress();
  console.log("Deployed TowerlordsCards:", cardsAddr);

  if (BASE_URI) {
    const tx = await cards.setBaseURI(BASE_URI);
    await tx.wait();
    console.log("Base URI set");
  }

  const Pack = await ethers.getContractFactory("TowerlordsPack");
  const pack = await Pack.deploy(cardsAddr, LOOT_POOL);
  await pack.waitForDeployment();
  const packAddr = await pack.getAddress();
  console.log("Deployed TowerlordsPack:", packAddr);

  const txMinter = await cards.setMinter(packAddr);
  await txMinter.wait();
  console.log("Pack set as minter on cards");

  const addrFile = join(process.cwd(), "contract-address.txt");
  const packFile = join(process.cwd(), "pack-address.txt");
  writeFileSync(addrFile, cardsAddr, "utf8");
  writeFileSync(packFile, packAddr, "utf8");
  console.log("Saved addresses to", addrFile, "and", packFile);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
