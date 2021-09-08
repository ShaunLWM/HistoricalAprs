interface Token {
  symbol: string;
  address?: Address;
  decimals?: number;
  projectLink?: string;
  busdPrice?: string;
}

interface Address {
  97?: string;
  56: string;
}

interface PoolConfig {
  sousId: number;
  earningToken: Token;
  stakingToken: Token;
  contractAddress: Address;
  poolCategory: PoolCategory;
  tokenPerBlock: string;
  sortOrder?: number;
  harvest?: boolean;
  isFinished?: boolean;
  enableEmergencyWithdraw?: boolean;
}

type SerializedBigNumber = string;

interface FarmConfig {
  pid: number;
  lpSymbol: string;
  lpAddresses: Address;
  token: Token;
  quoteToken: Token;
  multiplier?: string;
  isCommunity?: boolean;
  dual?: {
    rewardPerBlock: number;
    earnLabel: string;
    endBlock: number;
  };
}
interface Farm extends FarmConfig {
  tokenAmountMc?: SerializedBigNumber;
  quoteTokenAmountMc?: SerializedBigNumber;
  tokenAmountTotal?: SerializedBigNumber;
  quoteTokenAmountTotal?: SerializedBigNumber;
  lpTotalInQuoteToken?: SerializedBigNumber;
  lpTotalSupply?: SerializedBigNumber;
  tokenPriceVsQuote?: SerializedBigNumber;
  poolWeight?: SerializedBigNumber;
  userData?: {
    allowance: string;
    tokenBalance: string;
    stakedBalance: string;
    earnings: string;
  };
}
