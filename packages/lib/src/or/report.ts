import type { Finding } from "@workspace/or-core/audits";
import type { DashboardData } from "./dashboard";

const esc = (s: unknown) =>
	String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
const pct = (v: number | null) => (v === null ? "not measured" : `${v}%`);

/**
 * A self-contained HTML client report. Every figure states its collection
 * method and sample size and lists the run ids it was computed from; fixture
 * data carries an unmissable SIMULATED banner.
 */
export function renderClientReport(d: DashboardData, options: { agencyName?: string } = {}): string {
	const sections = d.reports.map((r) => {
		const o = r.overall;
		const engines = Object.entries(r.byEngine)
			.map(
				([engine, s]) =>
					`<tr><td>${esc(engine)}</td><td>${s.n}</td><td>${pct(s.visibility)}</td><td>${pct(s.recommendation)}</td><td>${s.averageListPosition ?? "—"}</td></tr>`,
			)
			.join("");
		const competitors = o.competitors
			.map((c) => `<tr><td>${esc(c.name)}</td><td>${pct(c.visibility)}</td><td>${c.recommendations}</td></tr>`)
			.join("");
		const questions = r.questions
			.map(
				(q) =>
					`<tr><td>${esc(q.question)}</td><td>${esc(q.intent ?? "")}</td><td>${q.brandMentioned}/${q.runs}</td><td>${esc(q.recommendedCompetitors.join(", "))}</td><td class="ids">${q.runIds.map(esc).join(" ")}</td></tr>`,
			)
			.join("");
		return `<section>
<h2>${esc(r.label)}</h2>
${r.simulated ? '<p class="sim">SIMULATED DATA — these figures come from fixture answers, not live AI responses. Do not present them as results.</p>' : ""}
<p>Sample: ${o.n} answers (${o.excludedBranded} branded questions excluded)${o.lowSample ? " — <strong>low sample, treat as indicative</strong>" : ""}.</p>
<table><tr><th>Visibility</th><th>Recommended</th><th>Share of voice</th><th>Avg list position</th><th>Own-site citation share</th></tr>
<tr><td>${pct(o.visibility)}</td><td>${pct(o.recommendation)}</td><td>${o.shareOfVoice.score === null ? `not measured (${esc(o.shareOfVoice.reason)})` : `${o.shareOfVoice.score}%`}</td><td>${o.averageListPosition ?? "—"}</td><td>${pct(o.ownCitationShare)}</td></tr></table>
<h3>By engine</h3><table><tr><th>Engine</th><th>n</th><th>Visibility</th><th>Recommended</th><th>Avg position</th></tr>${engines}</table>
<h3>Competitors</h3><table><tr><th>Competitor</th><th>Visibility</th><th>Recommendations</th></tr>${competitors}</table>
<h3>Buyer questions</h3><table><tr><th>Question</th><th>Intent</th><th>Mentioned</th><th>AI recommended instead</th><th>Evidence (run ids)</th></tr>${questions}</table>
<h3>Most-cited sources</h3><ul>${r.sources
			.slice(0, 10)
			.map((s) => `<li>${esc(s.domain)} — ${s.answers} answer(s)</li>`)
			.join("")}</ul>
</section>`;
	});
	const findings = ((d.audit?.findings ?? []) as Finding[]).filter((f) => f.status !== "pass");
	const audit = d.audit
		? `<section><h2>Website and brand audit</h2><p>Brand completeness: ${d.audit.brandCompleteness ?? "—"}% · AI agent readiness: ${d.audit.agentReadiness ?? "—"} · ${d.audit.pagesAudited.length} pages audited${d.audit.completedAt ? ` on ${esc(new Date(d.audit.completedAt).toISOString().slice(0, 10))}` : ""}.</p>
<table><tr><th>Finding</th><th>Severity</th><th>Evidence</th></tr>${findings.map((f) => `<tr><td>${esc(f.title)}</td><td>${esc(f.severity)}</td><td>${esc(f.evidence)}</td></tr>`).join("")}</table></section>`
		: "<section><h2>Website and brand audit</h2><p>No audit has run yet.</p></section>";
	const opps = `<section><h2>Recommended next steps</h2><p class="note">Each recommendation is a hypothesis based on the evidence shown; its effect is measured by retesting.</p><ol>${d.opportunities
		.slice(0, 10)
		.map(
			(o) =>
				`<li><strong>${esc(o.title)}</strong> (priority ${o.priority})<br>${esc(o.rationale)}<br><em>${esc(o.recommendedAction)}</em></li>`,
		)
		.join("")}</ol></section>`;
	const changes = d.publications
		.filter((p) => (p.retest as { measurements?: unknown[] } | null)?.measurements)
		.flatMap((p) =>
			(
				(
					p.retest as {
						measurements: {
							method: string;
							before: { rate: number | null; runs: number };
							after: { rate: number | null; runs: number };
							interpretation: string;
						}[];
					}
				).measurements ?? []
			).map(
				(m) =>
					`<li>${esc(p.remoteUrl)} (${esc(m.method)}): ${pct(m.before.rate)} of ${m.before.runs} before → ${pct(m.after.rate)} of ${m.after.runs} after. ${esc(m.interpretation)}</li>`,
			),
		)
		.join("");
	return `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8"><title>${esc(d.brand.name)} — AI visibility report</title>
<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}table{border-collapse:collapse;width:100%;margin:.5rem 0 1rem}th,td{border:1px solid #ddd;padding:.35rem .5rem;text-align:left;font-size:.9rem;vertical-align:top}.sim{background:#fff3cd;border:2px solid #d39e00;padding:.75rem;font-weight:700}.ids{font-family:monospace;font-size:.7rem;color:#666}.note{color:#555}</style></head>
<body><h1>${esc(d.brand.name)} — AI visibility report</h1>
<p>Prepared by ${esc(options.agencyName ?? "Online Reset")} on ${esc(d.generatedAt.slice(0, 10))}. Results from different collection methods are reported separately and never combined.</p>
${sections.join("\n") || "<p>No AI answers collected yet.</p>"}
${audit}
${opps}
${changes ? `<section><h2>Measured changes after publishing</h2><ul>${changes}</ul></section>` : ""}
</body></html>`;
}
