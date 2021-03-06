import { PoolCategory } from "../lib/Helpers";
import { tokens } from "./tokens";

const pools: PoolConfig[] = [
  {
    sousId: 0,
    stakingToken: tokens.cake,
    earningToken: tokens.cake,
    contractAddress: {
      97: "0xd3af5fe61dbaf8f73149bfcfa9fb653ff096029a",
      56: "0x73feaa1eE314F8c655E354234017bE2193C9E24E",
    },
    poolCategory: PoolCategory.CORE,
    harvest: true,
    tokenPerBlock: "10",
    sortOrder: 1,
    isFinished: false,
  },
  {
    sousId: 210,
    stakingToken: tokens.cake,
    earningToken: tokens.pots,
    contractAddress: {
      97: "",
      56: "0xBeDb490970204cb3CC7B0fea94463BeD67d5364D",
    },
    poolCategory: PoolCategory.CORE,
    harvest: true,
    sortOrder: 999,
    tokenPerBlock: "0.0868",
  },
];

export default pools;
