# APS ↔ SINT Interoperability Specification

**Status:** Draft v0.1 — Active development
**Authors:** [Agent Passport System](https://github.com/aeoess/agent-passport-system) · [SINT Protocol](https://github.com/pshkv/sint-protocol)
**Proved:** 9/9 cross-verification tests pass with zero adapter code (see [Cross-Verification](#cross-verification))

---

## What This Is

APS and SINT arrived at the same cryptographic primitives independently:

| Primitive | APS | SINT |
|---|---|---|
| Identity | Ed25519 keypair + `did:aps:` | Ed25519 keypair + `did:key:z6Mk...` |
| Delegation | `DelegationChain` — scope-narrowing links | `SintDelegationChain` — attenuation-only |
| Constraint domain | **Digital** — tool scope, spend limits, temporal validity | **Physical** — max velocity, geofence, force limits |
| Enforcement | Digital governance gateway | Physical AI gateway (PolicyGateway) |
| Audit | Receipt chain | SHA-256 hash-chained EvidenceLedger |

**The architectures are isomorphic at the identity and delegation layers.** The difference is the constraint envelope: APS governs digital actions, SINT governs physical execution.

This repository formalizes how the two systems compose when an agent crosses the digital-physical boundary — a digital workflow agent authorizing a physical robot action, or a physical agent reporting back through a digital accountability chain.

---

## The Composition Problem

Neither system alone handles the boundary case:

```
Human principal
  │
  ▼ (APS delegation chain)
Digital agent (LangGraph, CrewAI, AutoGPT...)
  │   "move robot to position X"
  ▼ (boundary — where the two systems meet)
Physical agent (ROS 2, MAVLink, industrial PLC...)
  │
  ▼ (SINT capability token)
Hardware execution
```

At the boundary, three invariants must hold simultaneously:
1. **APS attenuation invariant** — the physical agent's authority cannot exceed what the digital delegation chain grants
2. **SINT attenuation invariant** — physical constraints can only narrow, never expand, at each hop
3. **Delegation depth floor** — deeper delegation chains impose stricter minimum tiers: `effective_tier = max(tier_rule, delegation_depth_floor(depth))`

---

## Documents

| Document | Description |
|---|---|
| [SPEC.md](SPEC.md) | The full interoperability specification |
| [examples/](examples/) | Code examples in TypeScript, Python |
| [cross-verify/](cross-verify/) | Cross-verification test suites (both repos pass) |

---

## Cross-Verification

Both systems independently verified zero-adapter interop on 2026-04-04:

**SINT side** ([commit f98e281](https://github.com/pshkv/sint-protocol/commit/f98e281)):
```
✓ did:key format is W3C-spec compliant (z6Mk prefix)
✓ keyToDid → didToKey round-trips perfectly for any key
✓ multicodec prefix bytes [0xed, 0x01] preserved in encoded DID
✓ APS verifies a simulated SINT capability token signature
✓ SINT verifies a simulated APS delegation signature
✓ Ed25519 cross-verification: SINT token signed, APS verifies
✓ Ed25519 cross-verification: APS passport signed, SINT verifies
✓ Capability attenuation invariant preserved across boundary
✓ Constraint narrowing: physical constraints composed with digital scope
9/9 tests, 61ms
```

**APS side** ([commit c429713](https://github.com/aeoess/agent-passport-system/commit/c429713)):
```
9/9 pass, zero adapter code
```

---

## Quick Start

```typescript
import { apsScopeToSintMapping, sintTokenToApsProjection } from "@sint/bridge-a2a";

// APS delegation scope → SINT capability token fields
const mapping = apsScopeToSintMapping({
  toolScope: ["ros2:///cmd_vel:publish"],
  spendLimit: 100,
  expiresAt: "2026-12-31T23:59:59.000000Z",
});
// → { resource: "ros2:///cmd_vel", actions: ["publish"], constraints: { rateLimit: { maxCalls: 10 } } }

// SINT capability token → APS-compatible attestation
const projection = sintTokenToApsProjection(token);
// → { delegationScope: [...], dataAccessTerms: { physicalConstraints: {...} }, attestationGrade: 2 }
```

---

## Contributing

Open issues or PRs in this repo. For protocol-breaking changes, open an issue in both [aeoess/agent-passport-system](https://github.com/aeoess/agent-passport-system) and [pshkv/sint-protocol](https://github.com/pshkv/sint-protocol) simultaneously.

Conformance tests in `cross-verify/` must pass on both sides for any spec change to be accepted.
