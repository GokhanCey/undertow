import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnetClient, testnetClient, robinhoodTestnet, CHAINLINK_AGGREGATOR_ABI } from "./chain";
import { WHITELISTED_ASSETS } from "./registry";
import { VAULT_ONLY_PRICE_FEEDS } from "./vaultConfig";

const PRICE_RELAY_ADDRESS = process.env.PRICE_RELAY_ADDRESS as `0x${string}` | undefined;
const KEEPER_PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;

const PRICE_RELAY_ABI = [
  {
    type: "function",
    name: "updatePrice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "symbol", type: "string" },
      { name: "price", type: "uint256" },
      { name: "sourceUpdatedAt", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

function getKeeperClient() {
  if (!KEEPER_PRIVATE_KEY) return null;
  const account = privateKeyToAccount(KEEPER_PRIVATE_KEY);
  return createWalletClient({ account, chain: robinhoodTestnet, transport: http() });
}

let pushInFlight = false;

/** Reads each asset's price from mainnet and pushes it to the testnet PriceRelay. */
export async function pushPricesToRelay(): Promise<void> {
  if (!PRICE_RELAY_ADDRESS || !KEEPER_PRIVATE_KEY) return;
  if (pushInFlight) return; // avoid overlapping submissions racing on nonce
  const client = getKeeperClient();
  if (!client) return;

  pushInFlight = true;
  try {
    await pushAllPrices(client, PRICE_RELAY_ADDRESS);
  } finally {
    pushInFlight = false;
  }
}

async function pushAllPrices(
  client: NonNullable<ReturnType<typeof getKeeperClient>>,
  priceRelayAddress: `0x${string}`,
): Promise<void> {
  // Fetched once and incremented locally: two sequential writeContract calls
  // in this same tick would otherwise both read the same 'latest' nonce,
  // since neither transaction is mined yet when the second one is prepared.
  let nonce = await testnetClient.getTransactionCount({ address: client.account.address, blockTag: "pending" });

  const feedsToRelay = [...WHITELISTED_ASSETS, ...VAULT_ONLY_PRICE_FEEDS];

  for (const asset of feedsToRelay) {
    try {
      const [, answer, , updatedAt] = await mainnetClient.readContract({
        address: asset.mainnetPriceFeedAddress,
        abi: CHAINLINK_AGGREGATOR_ABI,
        functionName: "latestRoundData",
      });
      if (answer <= 0n) continue;

      await client.writeContract({
        address: priceRelayAddress,
        abi: PRICE_RELAY_ABI,
        functionName: "updatePrice",
        args: [asset.symbol, answer, updatedAt],
        nonce: nonce++,
      });
    } catch (err) {
      console.error(`Price relay push failed for ${asset.symbol}`, err);
    }
  }
}
