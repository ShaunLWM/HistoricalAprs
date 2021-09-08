import { ethers } from "ethers";
import MultiCallAbi from "../constants/contracts/Multicall.json";
import addresses from "../constants/contracts";
import Web3 from "web3";

export const simpleRpcProvider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed1.ninicoin.io");

const httpProvider = new Web3.providers.HttpProvider("https://bsc-dataseed1.ninicoin.io", {
  timeout: 10000,
});
export const web3NoAccount = new Web3(httpProvider);

export const getAddress = (address: Address): string => {
  return address[56];
};

const getContract = (abi: any, address: string, signer?: ethers.Signer | ethers.providers.Provider) => {
  const signerOrProvider = signer ?? simpleRpcProvider;
  return new ethers.Contract(address, abi, signerOrProvider);
};

export const getMulticallContract = (signer?: ethers.Signer | ethers.providers.Provider) => {
  return getContract(MultiCallAbi, getMulticallAddress(), signer);
};

export const getMulticallAddress = () => {
  return getAddress(addresses.multiCall);
};

export const getMasterChefAddress = () => {
  return getAddress(addresses.masterChef);
};

export const getCakeVaultAddress = () => {
  return getAddress(addresses.cakeVault);
};
