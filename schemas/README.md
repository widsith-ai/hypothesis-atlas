# Atlas schemas

JSON Schema definitions for data shapes that Hypothesis Atlas exchanges with
outside tools (other agents, labs, the future `/api/claims` API — #59).

These schemas are licensed under **MIT** (see [LICENSE](./LICENSE)), separately
from the rest of this repository, which is AGPL-licensed (see the root
[LICENSE](../LICENSE)). The intent is that anything implementing or consuming
`atlas.claim/v1` doesn't need to be AGPL itself just because the schema lives
in this repo.

## `atlas.claim.v1.schema.json`

The shape of a single claim as read from or written to the research graph —
see [`#55/V3.0.2`](../src/lib/claimVerification.ts) for the verification gate
every claim is checked against before being badged with a `verification`
block.
