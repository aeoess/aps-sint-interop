# Cross-Verification Test Suites

These tests prove APS ↔ SINT interoperability without adapter code.

## Test Results (2026-04-04)

| Suite | Repo | Tests | Status | Commit |
|---|---|---|---|---|
| `sint-crossverify.test.ts` | SINT | 9/9 | ✅ PASS | [f98e281](https://github.com/pshkv/sint-protocol/commit/f98e281) |
| `aps-crossverify.test.ts` | APS | 9/9 | ✅ PASS | [c429713](https://github.com/aeoess/agent-passport-system/commit/c429713) |

## What Each Test Proves

1. `did:key format is W3C-spec compliant` — multibase z-prefix + [0xed, 0x01] multicodec
2. `keyToDid → didToKey round-trips` — lossless identity encoding
3. `multicodec prefix bytes preserved` — Ed25519 tag intact after encoding
4. `APS verifies simulated SINT token signature` — cross-system Ed25519 verification
5. `SINT verifies simulated APS delegation signature` — reverse direction
6. `Ed25519 cross-verification: SINT→APS` — production-format tokens
7. `Ed25519 cross-verification: APS→SINT` — production-format passports
8. `Capability attenuation invariant` — narrowing preserved across boundary
9. `Constraint composition` — physical + digital constraints compose correctly

## Running

SINT side:
```bash
pnpm --filter @sint/gate-capability-tokens test
```

APS side:
```bash
# In agent-passport-system repo
pytest tests/cross-protocol/sint-crossverify.test.ts
```

## Adding Conformance Tests

New conformance requirements in SPEC.md MUST have corresponding tests in both suites before the spec section is marked `Stable`.
