# Local demo

The workspace uses dated research observations alongside current venue reads. Mainnet research
and Testnet execution are labeled independently. Connect Freighter on the network shown in the header
before reviewing a transaction.

## Arbitrage alert simulation

1. Open **Lab → Set automation → Demo arbitrage**.
2. Choose **Simulate price gap**. Synthetic reserves produce one check and one demo alert.
3. Choose **Check gap again**. The check count increases; the alert count stays at one.
4. Choose **Close gap** to re-arm. Simulating another gap can produce another demo alert.
5. Choose **Reset demo** to clear the simulation.

The simulation uses the same constant-product round-trip calculation as the live monitor, including
pool fees and price impact. Its reserves, profit and alerts are explicitly simulated. It does not
send requests to the monitoring or execution services, alter saved rules, move pool prices, or trade.

The live monitor remains below the strategy conversation. Its preview reads both venues, and saved
rules begin scheduled checks only after explicit activation. Local scheduled checks still need
`pnpm --filter @nest/worker cron:local http://localhost:<port>` alongside the app backend.

## Vault deposits

1. Open **Earn → Vaults**. Live DeFindex vaults appear in the main opportunity list.
2. Filter by **DeFindex**, or search the vault name. Check the row's network and observation label.
3. Choose **Deposit** on the XLM vault, enter an amount and read the withdrawal timing and allocation.
4. Connect Freighter if necessary. **Review deposit** builds and checks the exact transaction.
5. Review the asset changes and maximum network fee, then sign in Freighter yourself.
6. Wait for the on-chain confirmation and inspect its transaction link.

Vault names also open a detail page with live figures, strategy names and the vault contract. The
same deposit dialog handles list and detail entry points. Research-only products stay inspectable;
they do not become executable because they appear beside connected vaults.
