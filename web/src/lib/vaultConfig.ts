export const VAULT_ADDRESS = "0xB763256f9b121516aC0e62298a2f33c623c4D99a" as const;
export const UUSD_ADDRESS = "0x4444A7d9E919D8B1dE6E9298a3B9A8acAD362f1C" as const;
export const PRICE_RELAY_ADDRESS = "0x8450649468613a5073030724d3e6D4681af6794D" as const;
export const MOCK_NVDA_ADDRESS = "0x69743F43f7D41cc61d7Abce7C1cf0DBcE556EeE6" as const;

// Index into the vault's fixed-size asset array, matches the deploy script.
export const ASSET_INDEX = { TSLA: 0, NVDA: 1, WETH: 2 } as const;

// Price feeds the vault needs that aren't in registry.ts's WHITELISTED_ASSETS
// (that list is scanner-only, real holdings). NVDA's token is a mock, its
// price feed is real.
export const VAULT_ONLY_PRICE_FEEDS = [
  {
    symbol: "NVDA",
    mainnetPriceFeedAddress: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15" as const,
  },
];

// MockNVDA is freely mintable, unlike the vault's other collateral.
export const MOCK_NVDA_MINT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const VAULT_ABI = [
  {
    type: "function",
    name: "depositCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assetIndex", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assetIndex", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "borrow",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "liquidate",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getAccountData",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "collateralBalances", type: "uint256[]" },
      { name: "debt18", type: "uint256" },
      { name: "safeBorrowCapUsd8", type: "uint256" },
      { name: "liquidatable", type: "bool" },
    ],
  },
] as const;
