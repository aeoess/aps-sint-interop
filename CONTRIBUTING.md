# Contributing to aps-sint-interop

Thanks for showing up here. This repo is the interop specification between the Agent Passport System (APS) and SINT Protocol — digital-plus-physical AI agent governance. Co-developed with the SINT team at [`sint-ai/sint-protocol`](https://github.com/sint-ai/sint-protocol).

## Quick start

**For a fixture or test vector**, submit:
1. Generator script (reproducible — same inputs produce same bytes)
2. Fixture file at the correct path
3. Expected results documented in the vector
4. License compatible with Apache 2.0 downstream

**For a spec text change**, open an issue first. Spec changes affect both APS and SINT implementations; direction needs alignment before prose.

**For a crosswalk or mapping update**, a PR is fine if it stays in its own file (`crosswalk/` or `mappings/`) and doesn't modify authoritative descriptions of either system.

**Submission mechanics:** fork the repo, create a feature branch from `main`, open a PR against `main`.

---

## What makes a PR mergeable

1. **Vectors are reproducible.** Generator script included; independent reviewer can regenerate identical bytes. No hand-crafted vectors.
2. **Field-level documentation.** Every field in a fixture maps to a documented spec field or is annotated as implementation-specific.
3. **Cross-system claims are accurate.** Claims about APS behavior must be verifiable against `agent-passport-system`. Claims about SINT behavior must be verifiable against `sint-ai/sint-protocol`. No fabricated convergence.
4. **License conformance** with the repo.

## Stability expectations

Spec text follows backward-compatible revision conventions. Changes that would break existing implementations require a major version bump with migration notes. Fixture additions are always additive and land in patch releases.

## Out of scope

- **Renaming established field names** in either system's authoritative spec.
- **Vectors generated from non-public implementations** — if independent reviewers can't run the generator, the vector isn't reproducible.
- **Claims of consensus that haven't been demonstrated.** Single-implementation features stay marked as implementation-specific until a second independent system adopts them.

---

## How review works

Every PR is evaluated against five questions, applied to every contributor equally:

1. **Identity.** Is the contributor identifiable, with a real GitHub presence?
2. **Format.** Does the file match the structure of merged fixtures and spec text?
3. **Substance.** Are claims accurate and verifiable from public artifacts?
4. **Scope.** Does the PR stay within its own files, or reach into authoritative descriptions of other systems?
5. **Reversibility.** Can the change be reverted cleanly?

Substantive declines include the reason.

---

## Practical details

- **Maintainers:** [@aeoess](https://github.com/aeoess) (Tymofii Pidlisnyi, APS side) + [@pshkv](https://github.com/pshkv) (Illia Pashkov, SINT side).
- **Review timing:** maintainer-bandwidth dependent. If a PR has had no response after 5 business days, ping it.
- **CLA / DCO:** no CLA is required. Contributions accepted on the understanding that the submitter has the right to contribute under the Apache 2.0 license.
- **Security issues:** open a private security advisory via GitHub rather than a public issue.
- **Code of Conduct:** Contributor Covenant 2.1 — see [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

---

## Licensing

Apache License 2.0 (see [`LICENSE`](./LICENSE)). By contributing, you agree that your contributions will be licensed under the same license.
