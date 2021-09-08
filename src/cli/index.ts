import fs from "fs";
import { request, gql } from "graphql-request";
import BigNumber from "bignumber.js";
import chunk from "lodash/chunk";
import farmsConfig from "../constants/farms";
import dayjs from "dayjs";
import Web3 from "web3";
import { ethers } from "ethers";

const BLOCK_SUBGRAPH_ENDPOINT = "https://api.thegraph.com/subgraphs/name/pancakeswap/blocks";
const STREAMING_FAST_ENDPOINT = "https://bsc.streamingfast.io/subgraphs/name/pancakeswap/exchange-v2";

interface BlockResponse {
  blocks: {
    number: string;
  }[];
}

interface SingleFarmResponse {
  id: string;
  reserveUSD: string;
  volumeUSD: string;
}

interface FarmsResponse {
  farmsAtLatestBlock: SingleFarmResponse[];
  farmsOneWeekAgo: SingleFarmResponse[];
}

interface AprMap {
  [key: string]: BigNumber;
}

const getWeekAgoTimestamp = () => {
  return dayjs().subtract(1, "week").unix();
};

const LP_HOLDERS_FEE = 0.0017;
const WEEKS_IN_A_YEAR = 52.1429;

const getBlockAtTimestamp = async (timestamp: number) => {
  try {
    const { blocks } = await request<BlockResponse>(
      BLOCK_SUBGRAPH_ENDPOINT,
      `query getBlock($timestampGreater: Int!, $timestampLess: Int!) {
        blocks(first: 1, where: { timestamp_gt: $timestampGreater, timestamp_lt: $timestampLess }) {
          number
        }
      }`,
      { timestampGreater: timestamp, timestampLess: timestamp + 600 }
    );
    return parseInt(blocks[0].number, 10);
  } catch (error) {
    throw new Error(`Failed to fetch block number for ${timestamp}\n${error}`);
  }
};

const getAprsForFarmGroup = async (addresses: string[], blockWeekAgo: number): Promise<AprMap> => {
  try {
    console.log(addresses, blockWeekAgo);
    const { farmsAtLatestBlock, farmsOneWeekAgo } = await request<FarmsResponse>(
      STREAMING_FAST_ENDPOINT,
      gql`
        query farmsBulk($addresses: [String]!, $blockWeekAgo: Int!) {
          farmsAtLatestBlock: pairs(first: 30, where: { id_in: $addresses }) {
            id
            volumeUSD
            reserveUSD
          }
          farmsOneWeekAgo: pairs(first: 30, where: { id_in: $addresses }, block: { number: $blockWeekAgo }) {
            id
            volumeUSD
            reserveUSD
          }
        }
      `,
      { addresses, blockWeekAgo }
    );
    console.log(`2`);
    const aprs: AprMap = farmsAtLatestBlock.reduce((aprMap, farm) => {
      const farmWeekAgo = farmsOneWeekAgo.find((oldFarm) => oldFarm.id === farm.id);
      console.log(farmWeekAgo);
      // In case farm is too new to estimate LP APR (i.e. not returned in farmsOneWeekAgo query) - return 0
      let lpApr = new BigNumber(0);
      if (farmWeekAgo) {
        const volume7d = new BigNumber(farm.volumeUSD).minus(new BigNumber(farmWeekAgo.volumeUSD));
        const lpFees7d = volume7d.times(LP_HOLDERS_FEE);
        const lpFeesInAYear = lpFees7d.times(WEEKS_IN_A_YEAR);
        // Some untracked pairs like KUN-QSD will report 0 volume
        if (lpFeesInAYear.gt(0)) {
          const liquidity = new BigNumber(farm.reserveUSD);
          lpApr = lpFeesInAYear.times(100).dividedBy(liquidity);
        }
      }
      return {
        ...aprMap,
        [farm.id]: lpApr.decimalPlaces(2).toNumber(),
      };
    }, {});
    console.log(`done`);
    return aprs;
  } catch (error) {
    throw new Error(`Failed to fetch LP APR data: ${error}`);
  }
};

const fetchAndUpdateLPsAPR = async (customFarms?: FarmConfig[]) => {
  // pids before 250 are inactive farms from v1 and failed v2 migration
  const lowerCaseAddresses = (customFarms ?? farmsConfig)
    .filter((farm) => farm.pid > 250)
    .map((farm) => farm.lpAddresses[56].toLowerCase());
  console.info(`Fetching farm data for ${lowerCaseAddresses.length} addresses`);
  // Split it into chunks of 30 addresses to avoid gateway timeout
  const addressesInGroups = chunk(lowerCaseAddresses, 30);
  const weekAgoTimestamp = getWeekAgoTimestamp();
  const blockWeekAgo = await getBlockAtTimestamp(weekAgoTimestamp);
  console.log(blockWeekAgo);
  let allAprs: AprMap = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const groupOfAddresses of addressesInGroups) {
    // eslint-disable-next-line no-await-in-loop
    const aprs = await getAprsForFarmGroup(groupOfAddresses, blockWeekAgo);
    console.log(`aprs`);
    console.log(aprs);
    allAprs = { ...allAprs, ...aprs };
  }

  console.log(JSON.stringify(allAprs, null, 2));
};

fetchAndUpdateLPsAPR();
