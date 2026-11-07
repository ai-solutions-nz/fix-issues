import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { orContentItems } from "@workspace/lib/db/schema-or";
import type { DashboardData, RunEvidence } from "@workspace/lib/or/dashboard";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Textarea } from "@workspace/ui/components/textarea";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useBrandId } from "@/hooks/use-brand-id";
import { pageHead } from "@/lib/route-head";
import {
	decideApprovalFn,
	getClientReportFn,
	getContentItemFn,
	getOrDashboardFn,
	getRunEvidenceFn,
	publishContentFn,
	refreshOpportunitiesFn,
	requestApprovalFn,
	reviseContentFn,
	rollbackPublicationFn,
	startContentFn,
} from "@/server/online-reset";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/online-reset")({
	staticData: { crumb: "AI Performance" },
	head: pageHead({ description: "Evidence-backed AI visibility, audits, opportunities and approvals." }),
	component: OnlineResetPage,
});

// Server functions serialise to JSON; dates arrive as ISO strings, which every use below tolerates.
type Dashboard = DashboardData;
type MethodReport = Dashboard["reports"][number];
type Summary = MethodReport["overall"];

/** Server functions send JSON strings; see server/online-reset.ts. */
async function call<T>(fn: Promise<{ json: string }>): Promise<T> {
	return JSON.parse((await fn).json) as T;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);

function useDashboard(brandId: string) {
	return useQuery({
		queryKey: ["or-dashboard", brandId],
		queryFn: () => call<Dashboard>(getOrDashboardFn({ data: { brandId } })),
	});
}

function OnlineResetPage() {
	const brandId = useBrandId();
	const { data, isLoading, error } = useDashboard(brandId);
	const [evidenceRun, setEvidenceRun] = useState<string | null>(null);
	let body: React.ReactNode;
	if (isLoading) body = <p className="text-sm text-muted-foreground">Loading…</p>;
	else if (error || !data)
		body = <p className="text-sm text-destructive">Couldn't load this brand's AI performance data.</p>;
	else
		body = (
			<Tabs defaultValue="visibility">
				<TabsList>
					<TabsTrigger value="visibility">AI Visibility</TabsTrigger>
					<TabsTrigger value="audit">Audit</TabsTrigger>
					<TabsTrigger value="opportunities">Opportunities</TabsTrigger>
					<TabsTrigger value="content">Content and Approvals</TabsTrigger>
					<TabsTrigger value="report">Report</TabsTrigger>
				</TabsList>
				<TabsContent value="visibility" className="space-y-8 pt-4">
					{data.reports.length === 0 && <p className="text-sm text-muted-foreground">No AI answers collected yet.</p>}
					{data.reports.map((r) => (
						<MethodSection key={r.method} report={r} onEvidence={setEvidenceRun} />
					))}
				</TabsContent>
				<TabsContent value="audit" className="pt-4">
					<AuditSection audit={data.audit} />
				</TabsContent>
				<TabsContent value="opportunities" className="pt-4">
					<OpportunitiesSection brandId={brandId} data={data} onEvidence={setEvidenceRun} />
				</TabsContent>
				<TabsContent value="content" className="pt-4">
					<ContentSection brandId={brandId} data={data} />
				</TabsContent>
				<TabsContent value="report" className="pt-4">
					<ReportSection brandId={brandId} />
				</TabsContent>
			</Tabs>
		);
	return (
		<PageHeader
			title="AI Performance"
			subtitle="How AI engines answer your buyers' questions, what to fix, and the approval-gated work to fix it. Every figure links to its evidence."
		>
			{body}
			<EvidenceDialog brandId={brandId} runId={evidenceRun} onClose={() => setEvidenceRun(null)} />
		</PageHeader>
	);
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
	return (
		<Card className="gap-1 py-4">
			<CardHeader className="px-4">
				<CardDescription>{label}</CardDescription>
				<CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
			</CardHeader>
			{note && <CardContent className="px-4 text-xs text-muted-foreground">{note}</CardContent>}
		</Card>
	);
}

function RunLinks({ runIds, onEvidence }: { runIds: string[]; onEvidence: (id: string) => void }) {
	if (runIds.length === 0) return <span className="text-muted-foreground">—</span>;
	return (
		<span className="flex flex-wrap gap-1">
			{runIds.slice(0, 4).map((id, i) => (
				<Button key={id} size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onEvidence(id)}>
					Answer {i + 1}
				</Button>
			))}
			{runIds.length > 4 && <span className="text-xs text-muted-foreground">+{runIds.length - 4}</span>}
		</span>
	);
}

function SummaryKpis({ s }: { s: Summary }) {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
			<Kpi label="Visibility" value={pct(s.visibility)} note={`${s.n} answers`} />
			<Kpi label="Recommended" value={pct(s.recommendation)} />
			<Kpi
				label="Share of Voice"
				value={s.shareOfVoice.score === null ? "—" : `${s.shareOfVoice.score}%`}
				note={s.shareOfVoice.reason ?? undefined}
			/>
			<Kpi label="Avg List Position" value={s.averageListPosition === null ? "—" : String(s.averageListPosition)} />
			<Kpi label="Own-Site Citations" value={pct(s.ownCitationShare)} />
		</div>
	);
}

function MethodSection({ report, onEvidence }: { report: MethodReport; onEvidence: (id: string) => void }) {
	const s = report.overall;
	return (
		<section className="space-y-4">
			<div className="flex items-center gap-2">
				<h2 className="text-lg font-semibold">{report.label}</h2>
				<Badge variant={report.simulated ? "destructive" : "secondary"}>
					{report.simulated ? "Simulated" : "Live"}
				</Badge>
			</div>
			{report.simulated && (
				<Alert variant="destructive">
					<AlertTitle>Simulated Data</AlertTitle>
					<AlertDescription>
						These figures come from fixture answers, not live AI responses. They show how the platform works and must
						not be presented as results.
					</AlertDescription>
				</Alert>
			)}
			{s.lowSample && (
				<p className="text-sm text-muted-foreground">
					Low sample ({s.n} answers): treat these figures as indicative. {s.excludedBranded} branded questions are
					excluded from headline figures.
				</p>
			)}
			<SummaryKpis s={s} />
			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Visibility by Engine</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Engine</TableHead>
									<TableHead>Answers</TableHead>
									<TableHead>Visibility</TableHead>
									<TableHead>Recommended</TableHead>
									<TableHead>Avg Position</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{Object.entries(report.byEngine).map(([engine, e]) => (
									<TableRow key={engine}>
										<TableCell>{engine}</TableCell>
										<TableCell>{e.n}</TableCell>
										<TableCell>{pct(e.visibility)}</TableCell>
										<TableCell>{pct(e.recommendation)}</TableCell>
										<TableCell>{e.averageListPosition ?? "—"}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Brand and Competitors</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Business</TableHead>
									<TableHead>Visibility</TableHead>
									<TableHead>Recommendations</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<TableRow className="font-medium">
									<TableCell>You</TableCell>
									<TableCell>{pct(s.visibility)}</TableCell>
									<TableCell>{pct(s.recommendation)}</TableCell>
								</TableRow>
								{s.competitors.map((c) => (
									<TableRow key={c.name}>
										<TableCell>{c.name}</TableCell>
										<TableCell>{pct(c.visibility)}</TableCell>
										<TableCell>{pct(s.n ? Math.round((c.recommendations / s.n) * 1000) / 10 : null)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Buyer-Question Coverage</CardTitle>
					<CardDescription>Which questions mention you, and who AI recommends instead.</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Question</TableHead>
								<TableHead>Intent</TableHead>
								<TableHead>Mentioned</TableHead>
								<TableHead>Recommended Instead</TableHead>
								<TableHead>Evidence</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{report.questions.map((q) => (
								<TableRow key={q.promptId}>
									<TableCell className="max-w-md whitespace-normal">{q.question}</TableCell>
									<TableCell>{q.intent ?? "—"}</TableCell>
									<TableCell className="tabular-nums">
										{q.brandMentioned}/{q.runs}
									</TableCell>
									<TableCell className="whitespace-normal">{q.recommendedCompetitors.join(", ") || "—"}</TableCell>
									<TableCell>
										<RunLinks runIds={q.runIds} onEvidence={onEvidence} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Cited Sources</CardTitle>
						<CardDescription>Domains AI engines cite that are neither you nor a tracked competitor.</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableBody>
								{report.sources.slice(0, 10).map((src) => (
									<TableRow key={src.domain}>
										<TableCell>{src.domain}</TableCell>
										<TableCell className="text-right tabular-nums">{src.answers} answers</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>History</CardTitle>
						<CardDescription>Weekly figures under this collection method.</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Week Of</TableHead>
									<TableHead>Answers</TableHead>
									<TableHead>Visibility</TableHead>
									<TableHead>Share of Voice</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{report.weekly.map((w) => (
									<TableRow key={w.weekStart}>
										<TableCell>{w.weekStart}</TableCell>
										<TableCell>{w.summary.n}</TableCell>
										<TableCell>{pct(w.summary.visibility)}</TableCell>
										<TableCell>
											{w.summary.shareOfVoice.score === null ? "—" : `${w.summary.shareOfVoice.score}%`}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</div>
		</section>
	);
}

type Finding = {
	id: string;
	category: string;
	status: string;
	severity: string;
	title: string;
	evidence: string;
	fix?: string;
	pages: string[];
};

function AuditSection({ audit }: { audit: Dashboard["audit"] }) {
	if (!audit) return <p className="text-sm text-muted-foreground">No audit has run yet. Audits run weekly.</p>;
	const findings = audit.findings as Finding[];
	const scores = audit.scores as { category: string; score: number | null }[];
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<Kpi label="Brand Completeness" value={pct(audit.brandCompleteness)} />
				<Kpi label="AI Agent Readiness" value={audit.agentReadiness === null ? "—" : String(audit.agentReadiness)} />
				{scores.slice(0, 2).map((s) => (
					<Kpi key={s.category} label={s.category.replace("_", " ")} value={s.score === null ? "—" : String(s.score)} />
				))}
			</div>
			<p className="text-sm text-muted-foreground">
				{audit.pagesAudited.length} pages audited
				{audit.completedAt ? ` on ${new Date(audit.completedAt).toLocaleDateString()}` : ""}.
			</p>
			<Card>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Status</TableHead>
								<TableHead>Check</TableHead>
								<TableHead>Evidence</TableHead>
								<TableHead>Fix</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{findings.map((f) => (
								<TableRow key={f.id}>
									<TableCell>
										<Badge
											variant={f.status === "pass" ? "secondary" : f.status === "fail" ? "destructive" : "outline"}
										>
											{f.status}
										</Badge>
									</TableCell>
									<TableCell className="max-w-xs whitespace-normal">{f.title}</TableCell>
									<TableCell className="max-w-md whitespace-normal text-muted-foreground">{f.evidence}</TableCell>
									<TableCell className="max-w-md whitespace-normal">{f.status === "pass" ? "" : f.fix}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}

function OpportunitiesSection({
	brandId,
	data,
	onEvidence,
}: {
	brandId: string;
	data: Dashboard;
	onEvidence: (id: string) => void;
}) {
	const qc = useQueryClient();
	const refresh = useMutation({
		mutationFn: () => refreshOpportunitiesFn({ data: { brandId } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["or-dashboard", brandId] }),
	});
	const [showAll, setShowAll] = useState(false);
	const visible = showAll ? data.opportunities : data.opportunities.slice(0, 12);
	const start = useMutation({
		mutationFn: (opportunityId: string) => startContentFn({ data: { brandId, opportunityId } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["or-dashboard", brandId] }),
	});
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					Each recommendation is a hypothesis based on the evidence shown. Its effect is measured by retesting after the
					change is published.
				</p>
				<Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
					Recalculate
				</Button>
			</div>
			{start.error && <p className="text-sm text-destructive">{String(start.error.message)}</p>}
			{visible.map((o) => (
				<Card key={o.opportunityId}>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Badge variant="outline">{o.priority}</Badge>
							{o.title}
						</CardTitle>
						<CardDescription>{o.rationale}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						<p>{o.recommendedAction}</p>
						<p className="text-xs text-muted-foreground">
							Demand {o.components.demand} × gap {o.components.gap} × winnability {o.components.winnability} × value{" "}
							{o.components.commercialValue} × confidence {o.components.confidence}
							{o.collectionMethod ? ` · evidence method: ${o.collectionMethod}` : ""} · status: {o.status}
						</p>
						<div className="flex items-center gap-3">
							<RunLinks runIds={o.evidence.runIds} onEvidence={onEvidence} />
							{(o.type === "content_gap" || o.type === "ai_answer_gap" || o.type === "technical_fix") &&
								o.status === "open" && (
									<Button size="sm" onClick={() => start.mutate(o.opportunityId)} disabled={start.isPending}>
										Draft a Fix
									</Button>
								)}
						</div>
					</CardContent>
				</Card>
			))}
			{data.opportunities.length > visible.length && (
				<Button variant="outline" onClick={() => setShowAll(true)}>
					Show All {data.opportunities.length} Opportunities
				</Button>
			)}
		</div>
	);
}

function ContentSection({ brandId, data }: { brandId: string; data: Dashboard }) {
	const qc = useQueryClient();
	const invalidate = () => qc.invalidateQueries({ queryKey: ["or-dashboard", brandId] });
	const [editing, setEditing] = useState<string | null>(null);
	const decide = useMutation({
		mutationFn: (v: { approvalId: string; decision: "approved" | "rejected" }) =>
			decideApprovalFn({ data: { brandId, ...v } }),
		onSuccess: invalidate,
	});
	const publish = useMutation({
		mutationFn: (v: { itemId: string; connectionId: string }) => publishContentFn({ data: { brandId, ...v } }),
		onSuccess: invalidate,
	});
	const rollback = useMutation({
		mutationFn: (publicationId: string) => rollbackPublicationFn({ data: { brandId, publicationId } }),
		onSuccess: invalidate,
	});
	const pending = data.approvals.filter((a) => a.status === "pending");
	const connection = data.connections[0];
	const error = decide.error ?? publish.error ?? rollback.error;
	return (
		<div className="space-y-6">
			{error && <p className="text-sm text-destructive">{error.message}</p>}
			<Card>
				<CardHeader>
					<CardTitle>Approval Queue</CardTitle>
					<CardDescription>Nothing is published until the exact content is approved.</CardDescription>
				</CardHeader>
				<CardContent>
					{pending.length === 0 && <p className="text-sm text-muted-foreground">No approvals waiting.</p>}
					{pending.map((a) => {
						const item = data.content.find((c) => c.id === a.contentItemId);
						return (
							<div key={a.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
								<span>
									{item?.title ?? a.contentItemId} (v{a.contentVersion})
								</span>
								<span className="flex gap-2">
									<Button size="sm" variant="outline" onClick={() => setEditing(a.contentItemId)}>
										Review
									</Button>
									<Button size="sm" onClick={() => decide.mutate({ approvalId: a.id, decision: "approved" })}>
										Approve
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => decide.mutate({ approvalId: a.id, decision: "rejected" })}
									>
										Reject
									</Button>
								</span>
							</div>
						);
					})}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Content and Implementation</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Content</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>QA</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.content.map((c) => {
								const qa = c.qa as { ok: boolean; blocking: boolean }[];
								const blocking = qa.filter((q) => !q.ok && q.blocking).length;
								return (
									<TableRow key={c.id}>
										<TableCell className="max-w-md whitespace-normal">
											{c.title} <span className="text-muted-foreground">v{c.version}</span>
										</TableCell>
										<TableCell>
											<Badge variant="outline">{c.status.replaceAll("_", " ")}</Badge>
										</TableCell>
										<TableCell>{blocking ? `${blocking} blocking` : "passed"}</TableCell>
										<TableCell className="flex gap-2">
											<Button size="sm" variant="outline" onClick={() => setEditing(c.id)}>
												Open
											</Button>
											{c.status === "approved" && connection && (
												<Button
													size="sm"
													onClick={() => publish.mutate({ itemId: c.id, connectionId: connection.id })}
													disabled={publish.isPending}
												>
													Publish to {connection.label}
												</Button>
											)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Publication History</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Page</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Measured Change</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.publications.map((p) => {
								const m = (
									p.retest as {
										measurements?: {
											method: string;
											before: { rate: number | null };
											after: { rate: number | null; runs: number };
											interpretation: string;
										}[];
									} | null
								)?.measurements;
								return (
									<TableRow key={p.id}>
										<TableCell className="max-w-xs truncate">{p.remoteUrl}</TableCell>
										<TableCell>
											<Badge variant={p.status === "verified" ? "secondary" : "outline"}>
												{p.status.replaceAll("_", " ")}
											</Badge>
										</TableCell>
										<TableCell className="max-w-md whitespace-normal text-xs">
											{m?.length
												? m
														.map(
															(x) =>
																`${x.method}: ${pct(x.before.rate)} → ${pct(x.after.rate)} (${x.after.runs} answers since). ${x.interpretation}`,
														)
														.join(" ")
												: "Awaiting retest"}
										</TableCell>
										<TableCell>
											{p.status !== "rolled_back" && (
												<Button size="sm" variant="outline" onClick={() => rollback.mutate(p.id)}>
													Roll Back
												</Button>
											)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
			<ContentEditor brandId={brandId} itemId={editing} onClose={() => setEditing(null)} onChanged={invalidate} />
		</div>
	);
}

function ContentEditor({
	brandId,
	itemId,
	onClose,
	onChanged,
}: {
	brandId: string;
	itemId: string | null;
	onClose: () => void;
	onChanged: () => void;
}) {
	const { data: item, refetch } = useQuery({
		queryKey: ["or-content", itemId],
		queryFn: () =>
			call<typeof orContentItems.$inferSelect>(getContentItemFn({ data: { brandId, itemId: itemId as string } })),
		enabled: !!itemId,
	});
	const [draft, setDraft] = useState<string | null>(null);
	const save = useMutation({
		mutationFn: () =>
			reviseContentFn({ data: { brandId, itemId: itemId as string, markdown: draft ?? item?.markdown ?? "" } }),
		onSuccess: () => {
			setDraft(null);
			refetch();
			onChanged();
		},
	});
	const request = useMutation({
		mutationFn: () => requestApprovalFn({ data: { brandId, itemId: itemId as string } }),
		onSuccess: () => (refetch(), onChanged()),
	});
	return (
		<Dialog open={!!itemId} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>{item?.title ?? "Content"}</DialogTitle>
					<DialogDescription>
						Version {item?.version} · {item?.status?.replaceAll("_", " ")}. Drafts use only facts from the business
						profile; write any answers marked for the reviewer before approval.
					</DialogDescription>
				</DialogHeader>
				{item && (
					<div className="space-y-3">
						<Textarea
							className="min-h-72 font-mono text-xs"
							value={draft ?? item.markdown}
							onChange={(e) => setDraft(e.target.value)}
							disabled={item.status === "published" || item.status === "verified"}
						/>
						<ul className="space-y-1 text-xs">
							{item.qa.map((q) => (
								<li key={q.id} className={q.ok ? "text-muted-foreground" : q.blocking ? "text-destructive" : ""}>
									{q.ok ? "✓" : "✗"} {q.detail}
								</li>
							))}
						</ul>
						{(save.error ?? request.error) && (
							<p className="text-sm text-destructive">{(save.error ?? request.error)?.message}</p>
						)}
						<div className="flex gap-2">
							<Button variant="outline" onClick={() => save.mutate()} disabled={draft === null || save.isPending}>
								Save Revision
							</Button>
							<Button
								onClick={() => request.mutate()}
								disabled={item.status !== "ready_for_approval" || request.isPending}
							>
								Request Approval
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function ReportSection({ brandId }: { brandId: string }) {
	const { data, isLoading } = useQuery({
		queryKey: ["or-report", brandId],
		queryFn: () => call<{ html: string }>(getClientReportFn({ data: { brandId } })),
	});
	if (isLoading || !data) return <p className="text-sm text-muted-foreground">Preparing report…</p>;
	const open = () => {
		const url = URL.createObjectURL(new Blob([data.html], { type: "text/html" }));
		window.open(url, "_blank", "noopener");
	};
	return (
		<div className="space-y-3">
			<Button onClick={open}>Open Printable Report</Button>
			<iframe title="Client report" className="h-[70vh] w-full rounded-lg border" srcDoc={data.html} sandbox="" />
		</div>
	);
}

function highlight(text: string, spans: { start: number; end: number; brand: string }[]): React.ReactNode[] {
	const out: React.ReactNode[] = [];
	let at = 0;
	for (const s of [...spans].sort((a, b) => a.start - b.start)) {
		if (s.start < at) continue;
		out.push(text.slice(at, s.start));
		out.push(
			<mark key={`${s.start}-${s.end}`} title={s.brand} className="rounded bg-yellow-200 px-0.5">
				{text.slice(s.start, s.end)}
			</mark>,
		);
		at = s.end;
	}
	out.push(text.slice(at));
	return out;
}

function EvidenceDialog({ brandId, runId, onClose }: { brandId: string; runId: string | null; onClose: () => void }) {
	const { data } = useQuery({
		queryKey: ["or-run", runId],
		queryFn: () => call<RunEvidence>(getRunEvidenceFn({ data: { brandId, runId: runId as string } })),
		enabled: !!runId,
	});
	return (
		<Dialog open={!!runId} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Evidence</DialogTitle>
					<DialogDescription>The stored answer behind the figures, exactly as collected.</DialogDescription>
				</DialogHeader>
				{data && (
					<div className="space-y-3 text-sm">
						{data.simulated && (
							<Alert variant="destructive">
								<AlertTitle>Simulated Answer</AlertTitle>
								<AlertDescription>This answer is fixture data, not a live AI response.</AlertDescription>
							</Alert>
						)}
						<dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-1 break-words text-xs">
							<dt className="text-muted-foreground">Question</dt>
							<dd>{data.question}</dd>
							<dt className="text-muted-foreground">Method</dt>
							<dd>{data.methodLabel}</dd>
							<dt className="text-muted-foreground">Engine / model</dt>
							<dd>
								{data.engine} · {data.provider} · {data.modelVersion}
							</dd>
							<dt className="text-muted-foreground">Collected</dt>
							<dd>{new Date(data.createdAt).toLocaleString()}</dd>
							<dt className="text-muted-foreground">Location</dt>
							<dd>
								{JSON.stringify(data.locationRequested) ?? "none"} — applied: {data.locationApplied ?? "n/a"}
							</dd>
							<dt className="text-muted-foreground">Methodology</dt>
							<dd>{data.methodologyVersion ?? "—"}</dd>
							<dt className="text-muted-foreground">Run id</dt>
							<dd className="font-mono">{data.runId}</dd>
						</dl>
						<pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-xs">
							{data.text ? highlight(data.text, data.spans) : "No text stored."}
						</pre>
						<div>
							<p className="font-medium">Citations</p>
							<ul className="list-disc pl-5 text-xs">
								{data.citations.map((c) => (
									<li key={c.url}>{c.url}</li>
								))}
							</ul>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
