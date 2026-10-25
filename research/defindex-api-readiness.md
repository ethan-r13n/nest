# DeFindex API readiness

Checked on 25 October 2026 at approximately 14:40 UTC. The supplied credential was read programmatically from ignored local environment storage and was never printed or copied here.

The official [quickstart](https://docs.defindex.io/integration-guide/quickstart) specifies `Authorization: Bearer <API key>`. Its [API reference](https://api.defindex.io/docs) loads the published schema from `https://api.defindex.io/api-json`.

## Read availability

The schema documents `GET https://api.defindex.io/vault/discover?network=mainnet` as vault discovery. Requests returned HTTP 200 with the supplied key, without authentication, and with an intentionally invalid placeholder bearer token. The response contained `totalVaults` and `vaults`; the final read reported 14 vaults.

This establishes public discovery availability. It does **not** validate the supplied key: this read endpoint does not reject missing or invalid bearer credentials. Authenticated build permissions remain an integration check once the application adapter is ready.

No deposit, withdrawal, transaction-build, signing, send, API-key-management, or account-modification endpoint was called. No wallet transaction was performed. Mainnet vault identities still require registry verification before enabling execution.
