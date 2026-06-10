# OurGlass — independent delegation verifier

A small, standalone tool to decode and verify an OurGlass subscription
**delegation** (or its IPFS **agreement**) and confirm exactly what it
authorizes — before you sign, or any time after.

## Why this is a separate repo

The whole point of a verifier is that it must **not** share a fate with the app
it checks. If it lived inside the OurGlass app (same bundle, same host), an
attacker who compromised that host would tamper with the verifier too, and the
check would be worthless.

So this tool is:

- a **separate repository**, deployed independently (IPFS / a different domain);
- **content-addressed** when pinned to IPFS — its hash is its identity, so a
  swapped build is a different CID and is detectable;
- **dependency-light** and fully **client-side** — it calls no server and needs
  no wallet;
- holds the canonical, audited contract addresses **hard-coded** in
  [`src/verify.ts`](src/verify.ts), never fetched from a source an attacker
  could control.

## What it checks

Paste a subscription record (the app's *Copy JSON*) or an agreement document:

**For a delegation**
- decodes each caveat (`ERC20PeriodTransferEnforcer`, `TimestampEnforcer`) to
  show the real **cap**, **token**, **period** and **start** encoded in the
  signed bytes — not what a UI claims;
- checks every enforcer address is one of MetaMask's **audited** contracts;
- checks the **salt** equals the pinned agreement hash (signature bound to the
  exact agreement).

**For an agreement (the IPFS JSON)**
- recomputes `keccak256(canonicalize(terms))` and checks it equals the declared
  `termsHash`. That hash is the **salt** your signature commits to — confirm it
  matches the salt shown in your wallet at signing.

## Verify it the right way

This tool only helps if you trust *this* copy. To use it as a real defence:

1. Load it from its **IPFS CID** (or a domain you trust), not from a link the
   OurGlass app handed you.
2. When you sign in your wallet, compare the **salt** and **delegate** shown by
   your wallet against what this tool computed. Your wallet renders that screen,
   so a tampered front-end cannot fake it.

## Provenance of the addresses

The hard-coded addresses are the MetaMask Delegation Framework deployments,
audited by Consensys Diligence. Cross-check them against MetaMask's official
list: <https://github.com/MetaMask/delegation-framework/blob/main/documents/Deployments.md>

## Run / build

```bash
bun install                 # or npm install
bun run dev                 # local dev server
bun run build               # static build in dist/
PINATA_JWT=... bun run pin  # build + pin dist/ to IPFS, prints the CID
```

`bun run pin` uploads the static build to IPFS via Pinata and prints the CID,
the IPFS URL, and the value to set as an ENS content hash. No server to run.

## Canonical entry point (ENS)

The verifier's stable address is an **ENS name** whose content hash points to the
current build's CID — `verify.ourglass.eth` (a free subname of the `ourglass.eth`
brand), reachable at `https://verify.ourglass.eth.limo/`.

Why ENS rather than a DNSLink/domain: control of an ENS name lives in an
Ethereum key, **separate** from the web hosting/DNS that a front-end attacker
might compromise. So the canonical pointer can't be repointed by whoever hacks
the hosting — only by the key holder.

This name is the reference users should know (published here, in docs — never
only inside the OurGlass app, which is the thing being verified). Point OurGlass's
`VITE_VERIFIER_URL` at `https://<name>.eth.limo/`; it then stays stable forever.

On each new build: `bun run pin`, then update the ENS name's content hash to the
new `ipfs://<CID>`. OurGlass needs no change.

**Current build CID:** `bafybeiaqtihw7t77vgx6s2q53uolr2v75ojvumhzae4dqa366ht2uyp2cm`
(`https://bafybeiaqtihw7t77vgx6s2q53uolr2v75ojvumhzae4dqa366ht2uyp2cm.ipfs.dweb.link/`)

**Canonical ENS:** `verify.ourglass.eth` → `https://verify.ourglass.eth.limo/`
_(pending registration of `ourglass.eth` + content hash on the `verify` subname)._
