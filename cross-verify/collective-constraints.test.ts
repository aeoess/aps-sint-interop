/**
 * APS ↔ SINT Cross-Verification — Collective Constraint Manifests
 *
 * Tests that physical (SINT) and digital (APS) collective constraints
 * compose correctly when a fleet of agents operates under a shared manifest.
 *
 * Run from SINT side: these tests use only @sint/core types.
 * APS side runs equivalent tests against AggregateConstraints.
 */

import { describe, it, expect } from "vitest";

// ─── Types matching SPEC.md §5.2 ─────────────────────────────────────────────

interface CollectiveConstraintManifest {
  maxCollectiveKineticEnergyJ?: number;
  maxConcurrentActors?: number;
  minInterAgentDistanceM?: number;
  maxEscalatedFraction?: number;
  maxAggregateDataRateBytesPerSec?: number;
  maxCollectiveSpend?: number;
  maxUniqueDataSubjects?: number;
}

interface AgentState {
  agentId: string;
  massKg: number;
  velocityMps: number;
  positionM: { x: number; y: number };
  tier: "T0_observe" | "T1_prepare" | "T2_act" | "T3_commit";
}

// ─── Enforcement functions (SINT SwarmCoordinator logic) ─────────────────────

function computeKineticEnergy(agents: AgentState[]): number {
  return agents.reduce((sum, a) => sum + 0.5 * a.massKg * a.velocityMps ** 2, 0);
}

function countConcurrentActors(agents: AgentState[]): number {
  return agents.filter(a => a.tier === "T2_act" || a.tier === "T3_commit").length;
}

function minInterAgentDistance(agents: AgentState[]): number {
  let min = Infinity;
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const a = agents[i]!;
      const b = agents[j]!;
      const d = Math.sqrt((a.positionM.x - b.positionM.x) ** 2 + (a.positionM.y - b.positionM.y) ** 2);
      if (d < min) min = d;
    }
  }
  return min;
}

function checkCollectiveManifest(
  agents: AgentState[],
  manifest: CollectiveConstraintManifest,
): { allowed: boolean; violations: string[] } {
  const violations: string[] = [];

  if (manifest.maxCollectiveKineticEnergyJ !== undefined) {
    const ke = computeKineticEnergy(agents);
    if (ke > manifest.maxCollectiveKineticEnergyJ) {
      violations.push(`Collective KE ${ke.toFixed(1)}J exceeds limit ${manifest.maxCollectiveKineticEnergyJ}J`);
    }
  }

  if (manifest.maxConcurrentActors !== undefined) {
    const actors = countConcurrentActors(agents);
    if (actors > manifest.maxConcurrentActors) {
      violations.push(`${actors} concurrent T2/T3 actors exceeds limit ${manifest.maxConcurrentActors}`);
    }
  }

  if (manifest.minInterAgentDistanceM !== undefined && agents.length >= 2) {
    const minDist = minInterAgentDistance(agents);
    if (minDist < manifest.minInterAgentDistanceM) {
      violations.push(`Min inter-agent distance ${minDist.toFixed(2)}m below limit ${manifest.minInterAgentDistanceM}m`);
    }
  }

  if (manifest.maxEscalatedFraction !== undefined && agents.length > 0) {
    const escalatedFraction = countConcurrentActors(agents) / agents.length;
    if (escalatedFraction > manifest.maxEscalatedFraction) {
      violations.push(`Escalated fraction ${escalatedFraction.toFixed(2)} exceeds limit ${manifest.maxEscalatedFraction}`);
    }
  }

  return { allowed: violations.length === 0, violations };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CollectiveConstraintManifest — cross-verification suite", () => {
  const manifest: CollectiveConstraintManifest = {
    maxCollectiveKineticEnergyJ: 1000,
    maxConcurrentActors: 3,
    minInterAgentDistanceM: 2.0,
    maxEscalatedFraction: 0.4,
  };

  it("fleet within all collective limits → allowed", () => {
    const agents: AgentState[] = [
      { agentId: "a1", massKg: 100, velocityMps: 1.0, positionM: { x: 0, y: 0 }, tier: "T2_act" },
      { agentId: "a2", massKg: 100, velocityMps: 1.0, positionM: { x: 5, y: 0 }, tier: "T1_prepare" },
      { agentId: "a3", massKg: 100, velocityMps: 1.0, positionM: { x: 10, y: 0 }, tier: "T0_observe" },
    ];
    // KE = 3 * 0.5 * 100 * 1 = 150J < 1000J ✓
    // actors = 1 < 3 ✓
    // minDist = 5m > 2m ✓
    // escalated fraction = 1/3 ≈ 0.33 < 0.4 ✓
    const result = checkCollectiveManifest(agents, manifest);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("collective KE exceeds limit → denied", () => {
    const agents: AgentState[] = [
      { agentId: "a1", massKg: 200, velocityMps: 3.0, positionM: { x: 0, y: 0 }, tier: "T2_act" },
      { agentId: "a2", massKg: 200, velocityMps: 3.0, positionM: { x: 10, y: 0 }, tier: "T2_act" },
      // KE = 2 * 0.5 * 200 * 9 = 1800J > 1000J
    ];
    const result = checkCollectiveManifest(agents, manifest);
    expect(result.allowed).toBe(false);
    expect(result.violations.some(v => v.includes("KE"))).toBe(true);
  });

  it("too many concurrent T2/T3 actors → denied", () => {
    const agents: AgentState[] = [
      { agentId: "a1", massKg: 50, velocityMps: 0.5, positionM: { x: 0, y: 0 }, tier: "T2_act" },
      { agentId: "a2", massKg: 50, velocityMps: 0.5, positionM: { x: 5, y: 0 }, tier: "T2_act" },
      { agentId: "a3", massKg: 50, velocityMps: 0.5, positionM: { x: 10, y: 0 }, tier: "T3_commit" },
      { agentId: "a4", massKg: 50, velocityMps: 0.5, positionM: { x: 15, y: 0 }, tier: "T2_act" },
      // 4 T2/T3 actors > limit 3
    ];
    const result = checkCollectiveManifest(agents, manifest);
    expect(result.allowed).toBe(false);
    expect(result.violations.some(v => v.includes("concurrent"))).toBe(true);
  });

  it("agents too close → denied", () => {
    const agents: AgentState[] = [
      { agentId: "a1", massKg: 100, velocityMps: 0.5, positionM: { x: 0, y: 0 }, tier: "T1_prepare" },
      { agentId: "a2", massKg: 100, velocityMps: 0.5, positionM: { x: 1, y: 0 }, tier: "T1_prepare" },
      // distance = 1m < minInterAgentDistanceM=2m
    ];
    const result = checkCollectiveManifest(agents, manifest);
    expect(result.allowed).toBe(false);
    expect(result.violations.some(v => v.includes("distance"))).toBe(true);
  });

  it("escalated fraction too high → denied", () => {
    const agents: AgentState[] = [
      { agentId: "a1", massKg: 50, velocityMps: 0.5, positionM: { x: 0, y: 0 }, tier: "T2_act" },
      { agentId: "a2", massKg: 50, velocityMps: 0.5, positionM: { x: 5, y: 0 }, tier: "T2_act" },
      { agentId: "a3", massKg: 50, velocityMps: 0.5, positionM: { x: 10, y: 0 }, tier: "T0_observe" },
      // escalated = 2/3 ≈ 0.67 > 0.4
    ];
    const result = checkCollectiveManifest(agents, manifest);
    expect(result.allowed).toBe(false);
    expect(result.violations.some(v => v.includes("fraction"))).toBe(true);
  });

  it("multiple simultaneous violations reported together", () => {
    const agents: AgentState[] = [
      { agentId: "a1", massKg: 300, velocityMps: 4.0, positionM: { x: 0, y: 0 }, tier: "T2_act" },
      { agentId: "a2", massKg: 300, velocityMps: 4.0, positionM: { x: 0.5, y: 0 }, tier: "T2_act" },
      // KE: 2 * 0.5 * 300 * 16 = 4800J > 1000J
      // distance: 0.5m < 2m
    ];
    const result = checkCollectiveManifest(agents, manifest);
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it("single agent fleet always passes inter-agent distance check", () => {
    const agents: AgentState[] = [
      { agentId: "a1", massKg: 100, velocityMps: 0.5, positionM: { x: 0, y: 0 }, tier: "T0_observe" },
    ];
    const result = checkCollectiveManifest(agents, manifest);
    expect(result.allowed).toBe(true);
  });

  it("collective KE formula: Σ½mv² computed correctly", () => {
    const agents: AgentState[] = [
      { agentId: "a1", massKg: 100, velocityMps: 2.0, positionM: { x: 0, y: 0 }, tier: "T0_observe" },
      { agentId: "a2", massKg: 50, velocityMps: 4.0, positionM: { x: 5, y: 0 }, tier: "T0_observe" },
    ];
    // ½*100*4 + ½*50*16 = 200 + 400 = 600J
    expect(computeKineticEnergy(agents)).toBe(600);
  });
});
