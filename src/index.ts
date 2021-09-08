import BigNumber from "bignumber.js";
import cakeABI from "./constants/contracts/cake.json";
import cakeVaultAbi from "./constants/contracts/cakeVault.json";
import sousChefABI from "./constants/contracts/sousChef.json";
import wbnbABI from "./constants/contracts/weth.json";
import farmsConfig from "./constants/farms";
import poolsConfig from "./constants/pools";
import priceHelperLpsConfig from "./constants/priceHelperLps";
import { tokens } from "./constants/tokens";
import { getAddress, getCakeVaultAddress } from "./lib/contractHelper";
import fetchFarmsPrices from "./lib/fetchFarmsPrices";
import fetchPublicFarmData from "./lib/fetchPublicFarmData";
import {
  BIG_ZERO,
  BLOCKS_PER_YEAR,
  convertSharesToCake,
  getAprData,
  getBalanceNumber,
  multicall,
  multicallv2,
} from "./lib/Helpers";

export const getWbnbAddress = () => {
  return getAddress(tokens.wbnb.address);
};

export const fetchPoolsBlockLimits = async () => {
  const poolsWithEnd = poolsConfig.filter((p) => p.sousId !== 0);
  const callsStartBlock = poolsWithEnd.map((poolConfig) => {
    return {
      address: getAddress(poolConfig.contractAddress),
      name: "startBlock",
    };
  });
  const callsEndBlock = poolsWithEnd.map((poolConfig) => {
    return {
      address: getAddress(poolConfig.contractAddress),
      name: "bonusEndBlock",
    };
  });

  const starts = await multicall(sousChefABI, callsStartBlock);
  const ends = await multicall(sousChefABI, callsEndBlock);

  return poolsWithEnd.map((cakePoolConfig, index) => {
    const startBlock = starts[index];
    const endBlock = ends[index];
    return {
      sousId: cakePoolConfig.sousId,
      startBlock: new BigNumber(startBlock).toJSON(),
      endBlock: new BigNumber(endBlock).toJSON(),
    };
  });
};

export const fetchPoolsTotalStaking = async () => {
  const nonBnbPools = poolsConfig.filter((p) => p.stakingToken.symbol !== "BNB");
  const bnbPool = poolsConfig.filter((p) => p.stakingToken.symbol === "BNB");

  const callsNonBnbPools = nonBnbPools.map((poolConfig) => {
    return {
      address: getAddress(poolConfig.stakingToken.address),
      name: "balanceOf",
      params: [getAddress(poolConfig.contractAddress)],
    };
  });

  const callsBnbPools = bnbPool.map((poolConfig) => {
    return {
      address: getWbnbAddress(),
      name: "balanceOf",
      params: [getAddress(poolConfig.contractAddress)],
    };
  });

  const nonBnbPoolsTotalStaked = await multicall(cakeABI, callsNonBnbPools);
  const bnbPoolsTotalStaked = await multicall(wbnbABI, callsBnbPools);

  return [
    ...nonBnbPools.map((p, index) => ({
      sousId: p.sousId,
      totalStaked: new BigNumber(nonBnbPoolsTotalStaked[index]).toJSON(),
    })),
    ...bnbPool.map((p, index) => ({
      sousId: p.sousId,
      totalStaked: new BigNumber(bnbPoolsTotalStaked[index]).toJSON(),
    })),
  ];
};

export const getTokenPricesFromFarm = (farms: Farm[]) => {
  return farms.reduce((prices, farm) => {
    const quoteTokenAddress = getAddress(farm.quoteToken.address).toLocaleLowerCase();
    const tokenAddress = getAddress(farm.token.address).toLocaleLowerCase();
    /* eslint-disable no-param-reassign */
    if (!prices[quoteTokenAddress]) {
      prices[quoteTokenAddress] = new BigNumber(farm.quoteToken.busdPrice).toNumber();
    }
    if (!prices[tokenAddress]) {
      prices[tokenAddress] = new BigNumber(farm.token.busdPrice).toNumber();
    }
    /* eslint-enable no-param-reassign */
    return prices;
  }, {});
};

export const getPoolApr = (
  stakingTokenPrice: number,
  rewardTokenPrice: number,
  totalStaked: number,
  tokenPerBlock: number
): number => {
  const totalRewardPricePerYear = new BigNumber(rewardTokenPrice).times(tokenPerBlock).times(BLOCKS_PER_YEAR);
  const totalStakingTokenInPool = new BigNumber(stakingTokenPrice).times(totalStaked);
  const apr = totalRewardPricePerYear.div(totalStakingTokenInPool).times(100);
  return apr.isNaN() || !apr.isFinite() ? 0 : apr.toNumber();
};

const fetchFarm = async (farm: Farm): Promise<Farm> => {
  const farmPublicData = await fetchPublicFarmData(farm);
  return { ...farm, ...farmPublicData };
};

const fetchFarms = async (farmsToFetch: FarmConfig[]) => {
  const data = await Promise.all(
    farmsToFetch.map(async (farmConfig) => {
      const farm = await fetchFarm(farmConfig);
      return farm;
    })
  );
  return data;
};

export const fetchFarmsPublicDataAsync = async (pids: number[]) => {
  const farmsToFetch = farmsConfig.filter((farmConfig) => pids.includes(farmConfig.pid));

  // Add price helper farms
  const farmsWithPriceHelpers = farmsToFetch.concat(priceHelperLpsConfig);

  const farms = await fetchFarms(farmsWithPriceHelpers);
  const farmsWithPrices = await fetchFarmsPrices(farms);

  // Filter out price helper LP config farms
  const farmsWithoutHelperLps = farmsWithPrices.filter((farm: Farm) => {
    return farm.pid || farm.pid === 0;
  });

  return farmsWithoutHelperLps;
};

const fetchPoolsPublicDataAsync = async (currentBlock: number) => {
  const farms = await fetchFarmsPublicDataAsync([251, 252]);
  const blockLimits = await fetchPoolsBlockLimits();
  const totalStakings = await fetchPoolsTotalStaking();

  const prices = getTokenPricesFromFarm(farms);

  return poolsConfig.map((pool) => {
    const blockLimit = blockLimits.find((entry) => entry.sousId === pool.sousId);
    const totalStaking = totalStakings.find((entry) => entry.sousId === pool.sousId);
    const isPoolEndBlockExceeded = currentBlock > 0 && blockLimit ? currentBlock > Number(blockLimit.endBlock) : false;
    const isPoolFinished = pool.isFinished || isPoolEndBlockExceeded;

    const stakingTokenAddress = pool.stakingToken.address ? getAddress(pool.stakingToken.address).toLowerCase() : null;
    const stakingTokenPrice = stakingTokenAddress ? prices[stakingTokenAddress] : 0;

    const earningTokenAddress = pool.earningToken.address ? getAddress(pool.earningToken.address).toLowerCase() : null;
    const earningTokenPrice = earningTokenAddress ? prices[earningTokenAddress] : 0;

    const apr = !isPoolFinished
      ? getPoolApr(
          stakingTokenPrice,
          earningTokenPrice,
          getBalanceNumber(new BigNumber(totalStaking.totalStaked), pool.stakingToken.decimals),
          parseFloat(pool.tokenPerBlock)
        )
      : 0;

    return {
      ...blockLimit,
      ...totalStaking,
      stakingTokenPrice,
      earningTokenPrice,
      apr,
      isFinished: isPoolFinished,
    };
  });
};

(async () => {
  const pools = await fetchPoolsPublicDataAsync(10469147);
  const calls = ["performanceFee"].map((method) => ({
    address: getCakeVaultAddress(),
    name: method,
  }));

  const [[performanceFee]] = await multicallv2(cakeVaultAbi, calls);
  const performanceFeeAsDecimal = performanceFee && performanceFee / 100;

  const activePools = pools.filter((pool) => !pool.isFinished);
  const cakePool = activePools.find((pool) => pool.sousId === 0);
  const cakeAutoVault = { ...cakePool, isAutoVault: true };
  const cakeAutoVaultWithApr = { ...cakeAutoVault, apr: getAprData(cakeAutoVault, performanceFeeAsDecimal).apr };
  console.log(`---------- FINAL`);
  console.log(cakeAutoVaultWithApr);
})();
