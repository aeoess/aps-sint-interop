/**
 * APS ↔ SINT Interop Example — Digital-to-Physical Boundary Request
 *
 * Shows how a digital agent (APS-governed) authorizes a physical action (SINT-governed).
 *
 * This is reference code — adapt to your APS and SINT gateway configurations.
 */

// ─── Types (copy from respective packages or import directly) ────────────────

interface ApsAttestation {
  delegationChainRoot: string;   // did:aps:z6Mk...
  delegationDepth: number;
  scopeProof: string;            // base64 Ed25519 signature over delegation chain
  receiptRef: string;            // APS receipt UUID
}

interface SintInterceptRequest {
  requestId: string;             // UUID v7
  agentId: string;               // Ed25519 public key hex
  tokenId: string;               // UUID v7
  resource: string;              // e.g. "ros2:///cmd_vel"
  action: string;                // e.g. "publish"
  params: Record<string, unknown>;
  executionContext?: {
    bridgeId?: string;
    bridgeProtocol?: string;
    attestation?: { grade: 0|1|2|3; teeBackend?: string };
  };
}

// ─── Delegation depth → SINT tier floor ──────────────────────────────────────

type ApprovalTier = "T0_observe" | "T1_prepare" | "T2_act" | "T3_commit";

function delegationDepthFloor(depth: number): ApprovalTier {
  if (depth >= 5) return "T3_commit";
  if (depth >= 3) return "T2_act";
  if (depth >= 2) return "T1_prepare";
  return "T0_observe";
}

function effectiveTier(tierRule: ApprovalTier, delegationDepth: number): ApprovalTier {
  const order: ApprovalTier[] = ["T0_observe", "T1_prepare", "T2_act", "T3_commit"];
  const a = order.indexOf(tierRule);
  const b = order.indexOf(delegationDepthFloor(delegationDepth));
  return order[Math.max(a, b)]!;
}

// ─── Example: warehouse robot move command ────────────────────────────────────

async function authorizeRobotMove(
  apsAttestation: ApsAttestation,
  sintGatewayUrl: string,
  agentPublicKeyHex: string,
  sintTokenId: string,
) {
  // The digital agent is at delegation depth 3 (root → org → team → agent)
  // The tier rule for ros2:///cmd_vel/publish is T2_act
  // effective_tier = max(T2_act, depth_floor(3)=T2_act) = T2_act
  const depth = apsAttestation.delegationDepth;  // 3
  const tierRule: ApprovalTier = "T2_act";        // from SINT tier rules
  const tier = effectiveTier(tierRule, depth);    // "T2_act"

  console.log(`Delegation depth ${depth} → effective tier: ${tier}`);
  // → "T2_act" — requires human review

  const request: SintInterceptRequest = {
    requestId: crypto.randomUUID(),           // client-side; server validates schema
    agentId: agentPublicKeyHex,
    tokenId: sintTokenId,
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: { linear: { x: 0.5, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },
    executionContext: {
      bridgeId: "a2a",
      bridgeProtocol: "a2a-v0",
      attestation: { grade: 2, teeBackend: "arm-trustzone" },
    },
  };

  // Attach APS attestation as a header (out of SINT schema — gateway ignores unknown)
  const response = await fetch(`${sintGatewayUrl}/v1/intercept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-APS-Delegation-Depth": String(depth),
      "X-APS-Chain-Root": apsAttestation.delegationChainRoot,
      "X-APS-Scope-Proof": apsAttestation.scopeProof,
      "X-APS-Receipt-Ref": apsAttestation.receiptRef,
    },
    body: JSON.stringify(request),
  });

  const decision = await response.json();
  console.log("SINT decision:", decision.action, "tier:", decision.assignedTier);

  if (decision.action === "escalate") {
    // Human approval required — poll the approval queue
    const approvalId = decision.approvalRequestId;
    console.log(`Waiting for human approval: ${approvalId}`);
    // ... poll GET /v1/approvals/:approvalId
  }

  return decision;
}

// ─── Constraint mapping helper ────────────────────────────────────────────────

interface ApsDelegationScope {
  toolScope: string[];
  spendLimit?: number;
  expiresAt: string;
  dataAccessTerms?: {
    physicalConstraints?: {
      maxVelocityMps?: number;
      maxForceNewtons?: number;
      geofence?: { coordinates: Array<[number, number]> };
    };
  };
}

interface SintTokenRequest {
  resource: string;
  actions: string[];
  constraints: {
    rateLimit?: { maxCalls: number; windowMs: number };
    maxVelocityMps?: number;
    maxForceNewtons?: number;
    geofence?: { coordinates: Array<[number, number]> };
  };
  expiresAt: string;
}

function apsScopeToSintToken(scope: ApsDelegationScope): SintTokenRequest {
  // Parse first tool scope entry for resource and action
  const [resourceAction] = scope.toolScope;
  const [resource, action] = resourceAction!.split(":");

  return {
    resource: resource!,
    actions: [action ?? "call"],
    constraints: {
      ...(scope.spendLimit !== undefined && {
        rateLimit: {
          maxCalls: Math.ceil(scope.spendLimit / 10),  // 1 call ≈ $10 proxy
          windowMs: 3_600_000,  // 1 hour window
        },
      }),
      ...(scope.dataAccessTerms?.physicalConstraints?.maxVelocityMps !== undefined && {
        maxVelocityMps: scope.dataAccessTerms.physicalConstraints.maxVelocityMps,
      }),
      ...(scope.dataAccessTerms?.physicalConstraints?.maxForceNewtons !== undefined && {
        maxForceNewtons: scope.dataAccessTerms.physicalConstraints.maxForceNewtons,
      }),
      ...(scope.dataAccessTerms?.physicalConstraints?.geofence !== undefined && {
        geofence: scope.dataAccessTerms.physicalConstraints.geofence,
      }),
    },
    expiresAt: scope.expiresAt,
  };
}

// Example usage
const apsScope: ApsDelegationScope = {
  toolScope: ["ros2:///cmd_vel:publish"],
  spendLimit: 50,  // → rateLimit.maxCalls = 5
  expiresAt: "2026-12-31T23:59:59.000000Z",
  dataAccessTerms: {
    physicalConstraints: {
      maxVelocityMps: 0.5,
      geofence: {
        coordinates: [[-10, -10], [10, -10], [10, 10], [-10, 10]],
      },
    },
  },
};

console.log("APS → SINT mapping:", JSON.stringify(apsScopeToSintToken(apsScope), null, 2));
