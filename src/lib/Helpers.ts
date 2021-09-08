import BigNumber from "bignumber.js";
import { ethers } from "ethers";
import Web3 from "web3";
import { getRoi, tokenEarnedPerThousandDollarsCompounding } from "./compoundApyHelpers";
import { getMulticallContract } from "./contractHelper";

export const BIG_ZERO = new BigNumber(0);
export const BIG_ONE = new BigNumber(1);
export const BIG_NINE = new BigNumber(9);
export const BIG_TEN = new BigNumber(10);

export enum PoolCategory {
  "COMMUNITY" = "Community",
  "CORE" = "Core",
  "BINANCE" = "Binance", // Pools using native BNB behave differently than pools using a token
  "AUTO" = "Auto",
}

export interface Call {
  address: string; // Address of the contract
  name: string; // Function name on the contract (example: balanceOf)
  params?: any[]; // Function params
}

interface MulticallOptions {
  web3?: Web3;
  blockNumber?: number;
  requireSuccess?: boolean;
}

export const multicall = async <T = any>(abi: any[], calls: Call[]): Promise<T> => {
  try {
    const multi = getMulticallContract();
    const itf = new ethers.utils.Interface(abi);

    const calldata = calls.map((call) => [call.address.toLowerCase(), itf.encodeFunctionData(call.name, call.params)]);
    const { returnData } = await multi.aggregate(calldata);

    const res = returnData.map((call, i) => itf.decodeFunctionResult(calls[i].name, call));

    return res;
  } catch (error) {
    throw new Error(error);
  }
};

export const multicallv2 = async (abi: any[], calls: Call[], options: MulticallOptions = {}): Promise<any> => {
  const multi = getMulticallContract();
  const itf = new ethers.utils.Interface(abi);
  const calldata = calls.map((call) => [call.address.toLowerCase(), itf.encodeFunctionData(call.name, call.params)]);
  const returnData = await multi.tryAggregate(
    options.requireSuccess === undefined ? true : options.requireSuccess,
    calldata
  );
  const res = returnData.map((call, i) => {
    const [result, data] = call;
    return result ? itf.decodeFunctionResult(calls[i].name, data) : null;
  });

  return res;
};

export const getBalanceAmount = (amount: BigNumber, decimals = 18) => {
  return new BigNumber(amount).dividedBy(BIG_TEN.pow(decimals));
};

export const getBalanceNumber = (balance: BigNumber, decimals = 18) => {
  return getBalanceAmount(balance, decimals).toNumber();
};

export const BSC_BLOCK_TIME = 3;

export const CAKE_PER_BLOCK = new BigNumber(40);
export const BLOCKS_PER_YEAR = new BigNumber((60 / BSC_BLOCK_TIME) * 60 * 24 * 365); // 10512000
export const CAKE_PER_YEAR = CAKE_PER_BLOCK.times(BLOCKS_PER_YEAR);

export const convertSharesToCake = (
  shares: BigNumber,
  cakePerFullShare: BigNumber,
  decimals = 18,
  decimalsToRound = 3
) => {
  const sharePriceNumber = getBalanceNumber(cakePerFullShare, decimals);
  const amountInCake = new BigNumber(shares.multipliedBy(sharePriceNumber));
  const cakeAsNumberBalance = getBalanceNumber(amountInCake, decimals);
  const cakeAsBigNumber = getDecimalAmount(new BigNumber(cakeAsNumberBalance), decimals);
  const cakeAsDisplayBalance = getFullDisplayBalance(amountInCake, decimals, decimalsToRound);
  return { cakeAsNumberBalance, cakeAsBigNumber, cakeAsDisplayBalance };
};

export const getDecimalAmount = (amount: BigNumber, decimals = 18) => {
  return new BigNumber(amount).times(BIG_TEN.pow(decimals));
};
export const getFullDisplayBalance = (balance: BigNumber, decimals = 18, displayDecimals?: number) => {
  return getBalanceAmount(balance, decimals).toFixed(displayDecimals);
};

const AUTO_VAULT_COMPOUND_FREQUENCY = 288;
const MANUAL_POOL_COMPOUND_FREQUENCY = 1;

export const getAprData = (pool: any, performanceFee: number) => {
  const { isAutoVault, earningTokenPrice, apr } = pool;
  // special handling for tokens like tBTC or BIFI where the daily token rewards for $1000 dollars will be less than 0.001 of that token
  const isHighValueToken = Math.round(earningTokenPrice / 1000) > 0;
  const roundingDecimals = isHighValueToken ? 4 : 2;

  //   Estimate & manual for now. 288 = once every 5 mins. We can change once we have a better sense of this
  const compoundFrequency = isAutoVault ? AUTO_VAULT_COMPOUND_FREQUENCY : MANUAL_POOL_COMPOUND_FREQUENCY;

  if (isAutoVault) {
    const oneThousandDollarsWorthOfToken = 1000 / earningTokenPrice;
    const tokenEarnedPerThousand365D = tokenEarnedPerThousandDollarsCompounding({
      numberOfDays: 365,
      farmApr: apr,
      tokenPrice: earningTokenPrice,
      roundingDecimals,
      compoundFrequency,
      performanceFee,
    });
    const autoApr = getRoi({
      amountEarned: tokenEarnedPerThousand365D,
      amountInvested: oneThousandDollarsWorthOfToken,
    });
    return { apr: autoApr, isHighValueToken, roundingDecimals, compoundFrequency };
  }
  return { apr, isHighValueToken, roundingDecimals, compoundFrequency };
};
