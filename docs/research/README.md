# Online Reset: open-source discovery, gap analysis and architecture

This folder holds the research deliverables (2026-11-07). The research was done by reading source code only. Nothing was built or deployed, and no paid API was used.

| File | Contents |
|---|---|
| [01-adaptify-capability-benchmark.md](01-adaptify-capability-benchmark.md) | Adaptify features, evidence classes, confirmed baseline |
| [02-open-source-repository-audit.md](02-open-source-repository-audit.md) | 36 repos + 5 additions: commits, status, licences, risks, local test results |
| [03-reusable-code-inventory.md](03-reusable-code-inventory.md) | Exact modules, paths, symbols, licences, actions |
| [04-feature-coverage-matrix.md](04-feature-coverage-matrix.md) | Every Online Reset feature mapped to code, plus remaining gaps |
| [05-recommended-architecture.md](05-recommended-architecture.md) | Architecture, data flows, data model, isolation, interfaces |
| [06-build-vs-reuse-decisions.md](06-build-vs-reuse-decisions.md) | Weighted scores and the selection for each capability |
| [07-cost-and-risk-assessment.md](07-cost-and-risk-assessment.md) | Volume/cost model, NZ$0 POC, risk register |
| [08-phased-development-plan.md](08-phased-development-plan.md) | Phases, dependencies, acceptance criteria |
| [09-competitive-differentiation.md](09-competitive-differentiation.md) | Parity map + 8 evidence-backed differentiators |
| [10-executive-decision-report.md](10-executive-decision-report.md) | Owner summary and decisions D1–D9 |
| `evidence/` | Raw per-group audit findings and the audit method brief |

## Known limitations

- **Adaptify:** adaptify.ai was blocked by the session network policy. Its evidence comes from search snippets of its first-party pages.
- **GitHub metadata:** the GitHub REST API returned 403, so stars, the archived flag and security advisories are unverified.
- **Tests:** only Limelit's mentions, metrics and citations tests were executed, and they passed.
