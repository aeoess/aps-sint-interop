# APS ↔ SINT Interoperability Specification

**Version:** 0.1-draft
**Date:** 2026-04-04
**Status:** Active — seeking feedback

---

## 1. Scope

This specification defines how Agent Passport System (APS) delegations and SINT Protocol capability tokens compose when an agent crosses the digital-physical boundary.

**In scope:**
- Identity layer interop (Ed25519 + did:key)
- Delegation chain composition (APS chain → SINT token)
- Constraint mapping (digital scope ↔ physical constraints)
- Tier floor enforcement (delegation depth → minimum approval tier)
- Collective constraint manifests (aggregate physical + digital bounds)
- Audit trail composition (APS receipts + SINT evidence ledger)

**Out of scope:**
- Internal APS governance rules
- Internal SINT physical enforcement
- Transport-layer security (use mTLS)

---

## 2. Identity Layer

### 2.1 Key Format

Both systems use Ed25519 keypairs. Public keys are encoded as:

| System | Format | Example |
|---|---|---|
| APS | `did:aps:<base58btc(multicodec(pubkey))>` | `did:aps:z6MkhaXgBZ...` |
| SINT | `did:key:z6Mk<base58btc(multicodec(pubkey))>` | `did:key:z6MkhaXgBZ...` |

**Multicodec prefix:** `[0xed, 0x01]` (Ed25519 public key) prepended before base58btc encoding.

**Round-trip property (proved):**
```
keyToDid(didToKey(did)) === did  ∀ valid Ed25519 did:key
```

### 2.2 Cross-Verification

An APS gateway can verify a SINT capability token signature using:
```
valid = Ed25519.verify(
  publicKey = hexToBytes(token.issuer),   // SINT issuer field
  message   = canonicalPayload(token),
  signature = hexToBytes(token.signature),
)
```

A SINT gateway can verify an APS delegation signature symmetrically.
No adapter code, no translation layer. Same cryptographic primitive.

---

## 3. Delegation Chain Composition

### 3.1 Attenuation Invariant

Both systems enforce the same invariant independently:

> **Attenuation invariant:** Each hop in a delegation chain can only narrow permissions. Authority cannot expand.

APS: `DelegationChain[n+1].scope ⊆ DelegationChain[n].scope`
SINT: `token[n+1].constraints ⊆ token[n].constraints` (narrower resource, fewer actions, tighter limits)

**Composed invariant:** When an APS delegation chain terminates in a SINT capability token, the SINT token's permissions must be a subset of the terminal APS delegation scope.

### 3.2 Delegation Depth Floor

Deeper delegation chains impose stricter minimum approval tiers in SINT:

```
delegation_depth_floor(depth: number): ApprovalTier
  depth 0–1  → T0_OBSERVE  (root or one hop — full authority)
  depth 2    → T1_PREPARE  (two hops — audit trail required)
  depth 3–4  → T2_ACT      (three+ hops — human review required)
  depth ≥ 5  → T3_COMMIT   (deep chain — explicit sign-off required)
```

**Effective tier formula:**
```
effective_tier = max(tier_rule(resource, action), delegation_depth_floor(chain.depth))
```

This means: an agent sub-delegated at depth 4 requesting a `cmd/takeoff` (tier rule = T2_ACT) faces T2_ACT. An agent at depth 5 faces T3_COMMIT even if the tier rule says T2.

### 3.3 TypeScript Reference

```typescript
import { ApprovalTier } from "@sint/core";

export function delegationDepthFloor(depth: number): ApprovalTier {
  if (depth >= 5) return ApprovalTier.T3_COMMIT;
  if (depth >= 3) return ApprovalTier.T2_ACT;
  if (depth >= 2) return ApprovalTier.T1_PREPARE;
  return ApprovalTier.T0_OBSERVE;
}

export function effectiveTier(
  tierRule: ApprovalTier,
  delegationDepth: number,
): ApprovalTier {
  const floor = delegationDepthFloor(delegationDepth);
  // Tiers are ordered: T0 < T1 < T2 < T3
  const order = [
    ApprovalTier.T0_OBSERVE,
    ApprovalTier.T1_PREPARE,
    ApprovalTier.T2_ACT,
    ApprovalTier.T3_COMMIT,
  ];
  const a = order.indexOf(tierRule);
  const b = order.indexOf(floor);
  return order[Math.max(a, b)]!;
}
```

---

## 4. Constraint Mapping

### 4.1 APS → SINT

| APS `DelegationScope` field | SINT `SintCapabilityToken` field | Notes |
|---|---|---|
| `toolScope: ["ros2://host/topic:action"]` | `resource`, `actions[]` | Direct mapping |
| `spendLimit: N` | `constraints.rateLimit.maxCalls = ceil(N/10)` | 1 call ≈ $10 proxy; configurable |
| `expiresAt` | `expiresAt` | ISO 8601, same format |
| `allowedAgents: [did]` | `subject` | Single subject; multi-agent needs separate tokens |
| `dataAccessTerms.physicalConstraints` | `constraints.*` | Physical limits passed through |
| `attestationGrade < 2` | tier escalation +1 | Lower APS confidence → higher SINT tier |

### 4.2 SINT → APS

| SINT `SintCapabilityToken` field | APS `DelegationScope` / attestation field | Notes |
|---|---|---|
| `resource + actions[]` | `toolScope` | SINT resource URI → APS tool scope entry |
| `constraints.rateLimit` | `spendLimit` | Reverse proxy conversion |
| `constraints.maxVelocityMps` | `dataAccessTerms.physicalConstraints.maxVelocityMps` | APS logs; SINT enforces |
| `constraints.geofence` | `dataAccessTerms.physicalConstraints.geofence` | Same |
| `delegationChain.depth` | `delegationDepth` | Preserved for depth floor calculation |
| `executionContext.model.modelFingerprintHash` | `modelAttestation.fingerprintHash` | Supply chain verification |

### 4.3 Multi-scope Mapping

When APS scope covers multiple resources, SINT uses wildcard attenuation:
```
toolScope: ["ros2:///cmd_vel:publish", "ros2:///cmd_vel:subscribe"]
→ resource: "ros2:///cmd_vel", actions: ["publish", "subscribe"]

toolScope: ["ros2:///camera/*:subscribe", "ros2:///lidar/*:subscribe"]
→ Two separate SINT tokens (different resources)
```

---

## 5. Collective Constraint Manifest

### 5.1 The Coordination Problem

N individually-valid agents can produce collectively-invalid behavior:
- **Physical:** 10 robots each within kinetic energy limit, but Σ½mv² exceeds safe ceiling
- **Digital:** 10 agents each within data rate limit, but aggregate queries constitute exfiltration

Neither per-agent token scoping nor per-agent delegation scope can express these collective constraints.

### 5.2 CollectiveConstraintManifest

```typescript
export interface CollectiveConstraintManifest {
  /**
   * Maximum total kinetic energy across all active agents (Joules).
   * Σ½mv² across concurrent T2+ actors must not exceed this.
   * SINT SwarmCoordinator enforces this.
   */
  readonly maxCollectiveKineticEnergyJ?: number;

  /**
   * Maximum concurrent agents in T2 (act) or T3 (commit) tier.
   * Prevents coordinated action without human overview.
   */
  readonly maxConcurrentActors?: number;

  /**
   * Minimum physical distance between any two active agents (metres).
   */
  readonly minInterAgentDistanceM?: number;

  /**
   * Maximum fraction of agents simultaneously in escalated state.
   * e.g., 0.3 means no more than 30% of the fleet can be T3 at once.
   */
  readonly maxEscalatedFraction?: number;

  /**
   * Maximum aggregate data read rate across all agents (bytes/sec).
   * APS AggregateConstraints enforces this.
   */
  readonly maxAggregateDataRateBytesPerSec?: number;

  /**
   * Maximum total spend across all agents in the session (tokens).
   * APS session-level spend cap.
   */
  readonly maxCollectiveSpend?: number;

  /**
   * Maximum unique data subjects accessed across all agents.
   * Prevents distributed exfiltration via individually-scoped agents.
   */
  readonly maxUniqueDataSubjects?: number;
}
```

### 5.3 Enforcement Split

| Constraint | Enforced by |
|---|---|
| `maxCollectiveKineticEnergyJ` | SINT `SwarmCoordinator` |
| `maxConcurrentActors` | SINT `SwarmCoordinator` |
| `minInterAgentDistanceM` | SINT `SwarmCoordinator` |
| `maxEscalatedFraction` | SINT `SwarmCoordinator` |
| `maxAggregateDataRateBytesPerSec` | APS `AggregateConstraints` |
| `maxCollectiveSpend` | APS session-level gate |
| `maxUniqueDataSubjects` | APS `AggregateConstraints` |

The manifest is issued by the human principal at session start and shared with both gateways. Neither gateway needs to understand the other's constraints — each enforces its own half.

---

## 6. Audit Trail Composition

### 6.1 SINT EvidenceLedger

Every policy decision emits a ledger event:
```json
{
  "eventId": "uuid-v7",
  "eventType": "policy.evaluated",
  "agentId": "ed25519-public-key-hex",
  "tokenId": "uuid-v7",
  "payload": { "decision": "allow", "tier": "T2_act", "risk": "MEDIUM" },
  "prevHash": "sha256-of-previous-event",
  "hash": "sha256-of-this-event"
}
```

The chain is tamper-evident: `verifyChain()` checks `hash = SHA256(eventId + eventType + agentId + payload + prevHash)` for every event.

### 6.2 APS Receipt Chain

APS issues receipts for every delegation evaluation. Each receipt references the delegation chain root.

### 6.3 Composed Audit Query

To answer "who authorized this robot action and under what constraints?":

```
1. SINT ledger: query events for agentId, find policy.evaluated event
2. Extract tokenId from event payload
3. Resolve capability token → delegationChain.parentTokenId
4. APS: resolve parentTokenId → APS delegation chain root
5. APS: resolve root → human principal
→ Full chain: human → digital delegation → physical token → hardware action
```

This requires both systems to use compatible `requestId` and `tokenId` references. The interop spec mandates:
- SINT tokens reference APS delegation root via `delegationChain.parentTokenId`
- APS receipts reference SINT token ID via `physicalTokenRef` in the receipt payload

---

## 7. Wire Format

### 7.1 Boundary Request

When a digital agent (APS-governed) issues a physical action request (SINT-governed):

```json
{
  "sintRequest": {
    "requestId": "01905f7c-...",
    "agentId": "ed25519-hex",
    "tokenId": "sint-token-uuid",
    "resource": "ros2:///cmd_vel",
    "action": "publish",
    "params": { "linear": { "x": 0.5 } },
    "executionContext": {
      "bridgeId": "a2a",
      "bridgeProtocol": "a2a-v0",
      "attestation": { "grade": 2, "teeBackend": "arm-trustzone" }
    }
  },
  "apsAttestation": {
    "delegationChainRoot": "did:aps:z6Mk...",
    "delegationDepth": 3,
    "scopeProof": "base64-encoded-aps-delegation-signature",
    "receiptRef": "aps-receipt-uuid"
  }
}
```

### 7.2 Boundary Response

```json
{
  "sintDecision": {
    "action": "allow",
    "assignedTier": "T2_act",
    "assignedRisk": "MEDIUM",
    "effectiveTier": "T2_act"
  },
  "ledgerEventRef": "sint-evidence-event-uuid",
  "apsReceiptRef": "aps-receipt-uuid"
}
```

---

## 8. Conformance Requirements

An implementation claiming APS↔SINT interop compliance MUST:

1. **CR-1 Identity:** `keyToDid(didToKey(did)) === did` for all Ed25519 did:key values
2. **CR-2 Cross-sig:** APS gateway MUST verify SINT Ed25519 signatures without adapter code
3. **CR-3 Attenuation:** SINT tokens derived from APS delegations MUST satisfy the composed attenuation invariant
4. **CR-4 Depth floor:** `effective_tier >= delegation_depth_floor(chain.depth)` for all requests
5. **CR-5 Constraint mapping:** APS `spendLimit → rateLimit.maxCalls` ratio MUST be configurable, default 10 calls/$10
6. **CR-6 Audit:** SINT `delegationChain.parentTokenId` MUST reference the APS delegation chain root for boundary tokens
7. **CR-7 Collective:** Both gateways MUST independently enforce their respective half of any `CollectiveConstraintManifest`

---

## 9. Reference Implementations

| System | Repo | Relevant files |
|---|---|---|
| SINT | [pshkv/sint-protocol](https://github.com/pshkv/sint-protocol) | `packages/bridge-a2a/src/aps-mapping.ts`, `packages/capability-tokens/src/` |
| APS | [aeoess/agent-passport-system](https://github.com/aeoess/agent-passport-system) | `tests/cross-protocol/sint-crossverify.test.ts` |

Cross-verification test suites: `cross-verify/` in this repository.

---

## Changelog

- **2026-04-04 v0.1-draft:** Initial spec. Identity layer (CR-1, CR-2). Delegation composition (CR-3, CR-4). Constraint mapping table. CollectiveConstraintManifest design. Audit trail composition. 9/9 cross-verification proof.
