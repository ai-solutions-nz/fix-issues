/**
 * Online Reset: database-enforced tenant isolation for every legacy Elmo entry
 * point. The application-level checks are deliberately taken out of the way
 * (the caller is an instance-admin principal, which those checks let through
 * to anything), while the database tenant scope is pinned to tenant A. Every
 * /api/v1 route and every MCP tool is then pointed at tenant B's ids: the only
 * thing left between the caller and tenant B is Postgres row-level security.
 * Reads must not return tenant B's data; writes must leave tenant B unchanged.
 *
 * Packet 1b made this strict: the route and tool counts are exact, every
 * endpoint (method guards excluded) has a declared expected outcome, an outcome
 * other than an isolation refusal fails, and every route group has a positive
 * check that tenant A's own data still comes back.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { serviceDb } from "@workspace/lib/db/db";
import { insertRuns } from "@workspace/lib/db/runs";
import { brands, citations, competitors, member, organization, prompts, user } from "@workspace/lib/db/schema";
import { orMemberBrandAccess } from "@workspace/lib/db/schema-or";
import type { TenantScope } from "@workspace/lib/db/tenant";
import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ORG_A = "iso-web-org-a";
const ORG_B = "iso-web-org-b";
const BRAND_A = "iso-web-brand-a";
const BRAND_B = "iso-web-brand-b";
const PROMPT_A = "e0000000-0000-4000-8000-00000000000a";
const PROMPT_B = "e0000000-0000-4000-8000-00000000000b";
const RUN_A = "f0000000-0000-4000-8000-00000000000a";
const RUN_B = "f0000000-0000-4000-8000-00000000000b";
const USER_A = "iso-web-user-a";
const USER_CLIENT = "iso-web-user-client";

/**
 * Data that exists only in tenant B's rows. None may appear in any response.
 * The ids themselves are excluded: a "not found" error may echo the id the
 * caller sent, which reveals nothing.
 */
const B_MARKERS = [
	"Isolation Brand B",
	"isolation-b secret question",
	"Isolation Rival B",
	"Isolation Org B",
	"tenant-b.example",
];

const scopeState = vi.hoisted(() => ({ calls: 0, scope: null as TenantScope | null }));

vi.mock("@/lib/auth/api-auth", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth/api-auth")>();
	const admin = { kind: "admin", scopes: null, organizationId: null } as const;
	return { ...actual, resolveApiAuth: vi.fn(async () => ({ auth: admin })) };
});

vi.mock("@/lib/auth/tenant-scope", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth/tenant-scope")>();
	return {
		...actual,
		tenantScopeForPrincipal: vi.fn(() => {
			scopeState.calls++;
			return scopeState.scope;
		}),
	};
});

const { apiHandlerMeta } = await import("@/lib/api/handler");
const { MCP_TOOLS } = await import("@/lib/mcp/tools");
const { runToolInTenant } = await import("@/lib/mcp/server");
const { tenantScopeForUser } = await import("@/lib/auth/tenant-scope");

const V1_ROOT = join(import.meta.dirname, "../../routes/api/v1");

function routeFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return routeFiles(full);
		if (!entry.endsWith(".ts")) return [];
		return readFileSync(full, "utf8").includes("handlers:") ? [full] : [];
	});
}

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function handlersOf(file: string): Promise<Record<string, Handler>> {
	const mod = (await import(/* @vite-ignore */ file)) as Record<
		string,
		{ options?: { server?: { handlers?: unknown } } }
	>;
	for (const value of Object.values(mod)) {
		const handlers = value?.options?.server?.handlers;
		if (handlers && typeof handlers === "object") return handlers as Record<string, Handler>;
	}
	throw new Error(`${file} exports no server handlers`);
}

const ids = (tenant: "A" | "B") => ({
	brandId: tenant === "A" ? BRAND_A : BRAND_B,
	promptId: tenant === "A" ? PROMPT_A : PROMPT_B,
	runId: tenant === "A" ? RUN_A : RUN_B,
	competitorId: "",
	organizationId: tenant === "A" ? ORG_A : ORG_B,
	reportId: "00000000-0000-4000-8000-000000000000",
});

const competitorIds = { A: "", B: "" };

/** Write bodies valid enough to reach the database, aimed at tenant B. */
const WRITE_BODIES: Record<string, unknown> = {
	"POST competitors/index.ts": { brandId: BRAND_B, name: "Injected Competitor" },
	"PATCH competitors/$competitorId.ts": { name: "Hijacked Competitor" },
	"POST prompts/index.ts": { brandId: BRAND_B, value: "Injected prompt" },
	"PATCH prompts/$promptId.ts": { value: "Hijacked prompt" },
	"PATCH brands/$brandId.ts": { brandName: "Hijacked Brand" },
	"POST brands/index.ts": {
		id: "iso-web-injected",
		name: "Injected Brand",
		domains: ["injected.example"],
		organizationId: ORG_B,
	},
	"POST reports/index.ts": { brandName: "Injected", brandWebsite: "https://injected.example" },
	"POST tools/analyze.ts": {},
};

async function tenantBSnapshot(): Promise<string> {
	const rows = await serviceDb.execute(sql`
		select
			(select json_agg(b order by b.id) from brands b where b.organization_id = ${ORG_B} or b.id = 'iso-web-injected') as brands,
			(select json_agg(p.value order by p.id) from prompts p where p.brand_id = ${BRAND_B}) as prompts,
			(select json_agg(json_build_object('name', c.name, 'domains', c.domains) order by c.id) from competitors c where c.brand_id = ${BRAND_B}) as competitors,
			(select count(*) from prompt_runs r where r.brand_id = ${BRAND_B}) as runs,
			(select json_agg(o.name) from organization o where o.id = ${ORG_B}) as org`);
	return JSON.stringify(rows.rows[0]);
}

async function cleanup() {
	const brandIds = [BRAND_A, BRAND_B, "iso-web-injected"];
	await serviceDb.delete(citations).where(inArray(citations.brandId, brandIds));
	await serviceDb.execute(sql`DELETE FROM prompt_runs WHERE brand_id IN (${BRAND_A}, ${BRAND_B})`);
	await serviceDb.delete(prompts).where(inArray(prompts.brandId, brandIds));
	await serviceDb.delete(competitors).where(inArray(competitors.brandId, brandIds));
	await serviceDb.delete(orMemberBrandAccess).where(inArray(orMemberBrandAccess.organizationId, [ORG_A, ORG_B]));
	await serviceDb.delete(brands).where(inArray(brands.id, brandIds));
	await serviceDb.delete(member).where(inArray(member.organizationId, [ORG_A, ORG_B]));
	await serviceDb.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
	await serviceDb.delete(user).where(inArray(user.id, [USER_A, USER_CLIENT]));
}

beforeAll(async () => {
	(process.env as Record<string, string | undefined>).DEPLOYMENT_MODE ??= "local";
	await cleanup();
	await serviceDb.insert(organization).values([
		{ id: ORG_A, name: "Isolation Org A", slug: "iso-web-org-a", createdAt: new Date() },
		{ id: ORG_B, name: "Isolation Org B", slug: "iso-web-org-b", createdAt: new Date() },
	]);
	await serviceDb.insert(user).values([
		{ id: USER_A, name: "User A", email: "a@tenant-a.example" },
		{ id: USER_CLIENT, name: "Client", email: "client@tenant-a.example" },
	]);
	await serviceDb.insert(member).values([
		{ id: "iso-web-m1", organizationId: ORG_A, userId: USER_A, role: "member", createdAt: new Date() },
		{ id: "iso-web-m2", organizationId: ORG_A, userId: USER_CLIENT, role: "client", createdAt: new Date() },
	]);
	await serviceDb.insert(brands).values([
		{
			id: BRAND_A,
			name: "Isolation Brand A",
			website: "https://tenant-a.example",
			organizationId: ORG_A,
			onboarded: true,
		},
		{
			id: BRAND_B,
			name: "Isolation Brand B",
			website: "https://tenant-b.example",
			organizationId: ORG_B,
			onboarded: true,
		},
	]);
	await serviceDb.insert(orMemberBrandAccess).values({ organizationId: ORG_A, userId: USER_CLIENT, brandId: BRAND_A });
	const [ca] = await serviceDb
		.insert(competitors)
		.values({ brandId: BRAND_A, name: "Isolation Rival A", domains: ["rival-a.example"] })
		.returning();
	const [cb] = await serviceDb
		.insert(competitors)
		.values({ brandId: BRAND_B, name: "Isolation Rival B", domains: ["rival-b.example"] })
		.returning();
	competitorIds.A = ca?.id ?? "";
	competitorIds.B = cb?.id ?? "";
	await serviceDb.insert(prompts).values([
		{ id: PROMPT_A, brandId: BRAND_A, value: "isolation-a public question" },
		{ id: PROMPT_B, brandId: BRAND_B, value: "isolation-b secret question" },
	]);
	const mention = (brandMentioned: boolean) => ({
		brandMentioned,
		competitorsMentioned: [],
		assessments: null,
		stamp: null,
	});
	await insertRuns(serviceDb, [
		{
			id: RUN_A,
			promptId: PROMPT_A,
			brandId: BRAND_A,
			model: "chatgpt",
			provider: "fixture",
			version: "1",
			webSearchEnabled: true,
			rawOutput: { text: "a" },
			collectionMethod: "fixture",
			textContent: "Isolation Brand A",
			mentions: mention(true),
		},
		{
			id: RUN_B,
			promptId: PROMPT_B,
			brandId: BRAND_B,
			model: "chatgpt",
			provider: "fixture",
			version: "1",
			webSearchEnabled: true,
			rawOutput: { text: "b" },
			collectionMethod: "fixture",
			textContent: "Isolation Brand B",
			mentions: mention(true),
		},
	]);
	await serviceDb.insert(citations).values({
		promptRunId: RUN_B,
		promptId: PROMPT_B,
		brandId: BRAND_B,
		model: "chatgpt",
		url: "https://tenant-b.example/page",
		domain: "tenant-b.example",
		citationIndex: 0,
		createdAt: new Date(),
	});
});

afterAll(cleanup);

const files = routeFiles(V1_ROOT);
const routes = await Promise.all(
	files.map(async (file) => ({ name: file.slice(V1_ROOT.length + 1), handlers: await handlersOf(file) })),
);

const WINDOW = {
	start: "2026-01-01T00:00:00Z",
	end: "2027-01-01T00:00:00Z",
	startDate: "2026-01-01",
	endDate: "2026-12-31",
};

function callRoute(route: (typeof routes)[number], method: string, tenant: "A" | "B") {
	const values = { ...ids(tenant), competitorId: competitorIds[tenant] };
	const params: Record<string, string> = {};
	const path = route.name
		.replace(/\.ts$/, "")
		.replace(/(^|\/)index$/, "")
		.replace(/\$(\w+)/g, (_m, key: string) => {
			params[key] = (values as Record<string, string>)[key] ?? "unknown";
			return params[key] as string;
		});
	// A window on every call, so analytics routes get past validation and reach the database.
	const query = new URLSearchParams({ brandId: values.brandId, organizationId: values.organizationId, ...WINDOW });
	const body = method === "GET" ? undefined : JSON.stringify(WRITE_BODIES[`${method} ${route.name}`] ?? {});
	const request = new Request(`http://localhost/api/v1/${path}?${query}`, {
		method,
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body,
	});
	const handler = route.handlers[method] as Handler;
	return handler({ request, params });
}

/**
 * What each endpoint must answer when tenant A's scope is pointed at tenant
 * B's ids:
 * - `not-found`: 404 not_found, or a 400 whose message says tenant B's row was not found.
 * - `scoped-list`: 200 listing only rows in scope.
 * - `denied`: 500 whose cause is Postgres refusing the table (42501). These are
 *   instance-admin-only tables outside every tenant scope (an instance admin
 *   key runs at system scope in production).
 * - `no-tenant-data`: the endpoint reads no tenant table (identity, model
 *   catalogue, the unknown-path catch-all, and a body-validation failure on an
 *   admin-only tool that would otherwise fetch the open web).
 */
type Expected = "not-found" | "scoped-list" | "denied" | "no-tenant-data";
const EXPECTED: Record<string, Expected> = {
	"GET $.ts": "no-tenant-data",
	"POST $.ts": "no-tenant-data",
	"PUT $.ts": "no-tenant-data",
	"PATCH $.ts": "no-tenant-data",
	"DELETE $.ts": "no-tenant-data",
	"GET brands/$brandId/analytics.ts": "not-found",
	"GET brands/$brandId/citations/domains.ts": "not-found",
	"GET brands/$brandId/citations/urls.ts": "not-found",
	"GET brands/$brandId/opportunities.ts": "not-found",
	"GET brands/$brandId/prompt-performance.ts": "not-found",
	"GET brands/$brandId/query-fanout.ts": "not-found",
	"GET brands/$brandId/tags/index.ts": "not-found",
	"GET brands/$brandId.ts": "not-found",
	"PATCH brands/$brandId.ts": "not-found",
	"GET brands/index.ts": "scoped-list",
	"POST brands/index.ts": "not-found",
	"GET competitors/$competitorId.ts": "not-found",
	"PATCH competitors/$competitorId.ts": "not-found",
	"DELETE competitors/$competitorId.ts": "not-found",
	"GET competitors/index.ts": "scoped-list",
	"POST competitors/index.ts": "not-found",
	"GET me.ts": "no-tenant-data",
	"GET models.ts": "no-tenant-data",
	"GET organizations/$organizationId/billing.ts": "not-found",
	"GET organizations/$organizationId.ts": "not-found",
	"GET organizations/index.ts": "scoped-list",
	"GET prompts/$promptId/runs/$runId.ts": "not-found",
	"GET prompts/$promptId/runs/index.ts": "not-found",
	"GET prompts/$promptId/snapshot.ts": "not-found",
	"GET prompts/$promptId.ts": "not-found",
	"PATCH prompts/$promptId.ts": "not-found",
	"DELETE prompts/$promptId.ts": "not-found",
	"GET prompts/index.ts": "scoped-list",
	"POST prompts/index.ts": "not-found",
	"GET reports/$reportId.ts": "denied",
	"GET reports/index.ts": "denied",
	"POST reports/index.ts": "denied",
	"POST tools/analyze.ts": "no-tenant-data",
};

const ROUTE_FILE_COUNT = 25;
const MCP_TOOL_COUNT = 17;

const endpointCases = routes.flatMap((route) =>
	Object.keys(route.handlers)
		.filter((method) => apiHandlerMeta(route.handlers[method])?.kind !== "method-guard")
		.map((method) => [`${method} ${route.name}`, route, method] as const),
);
const methodGuardCount = routes.reduce(
	(n, route) =>
		n + Object.keys(route.handlers).filter((m) => apiHandlerMeta(route.handlers[m])?.kind === "method-guard").length,
	0,
);

/** True when some error logged during the call was Postgres refusing access (SQLSTATE 42501). */
function wasPermissionDenied(logged: unknown[][]): boolean {
	const denied = (value: unknown, depth = 0): boolean => {
		if (!value || typeof value !== "object" || depth > 8) return false;
		const err = value as { code?: string; cause?: unknown };
		return err.code === "42501" || denied(err.cause, depth + 1);
	};
	return logged.some((args) => args.some((arg) => denied(arg)));
}

describe("REST /api/v1: every route, database scope pinned to tenant A, tenant B's ids", () => {
	it("found exactly the routes and MCP tools this suite declares", () => {
		expect(routes.length).toBe(ROUTE_FILE_COUNT);
		expect(MCP_TOOLS.length).toBe(MCP_TOOL_COUNT);
		expect(endpointCases.map(([label]) => label).sort()).toEqual(Object.keys(EXPECTED).sort());
		expect(endpointCases.length + methodGuardCount).toBe(
			routes.reduce((n, route) => n + Object.keys(route.handlers).length, 0),
		);
	});

	it.each(endpointCases)(
		"%s returns nothing of tenant B and changes nothing of tenant B",
		async (label, route, method) => {
			scopeState.scope = { organizationIds: [ORG_A] };
			const expected = EXPECTED[label];
			const errors = vi.spyOn(console, "error").mockImplementation(() => {});
			const before = await tenantBSnapshot();
			const callsBefore = scopeState.calls;
			const response = await callRoute(route, method, "B");
			const text = await response.text();
			const logged = errors.mock.calls;
			errors.mockRestore();

			for (const marker of B_MARKERS) expect(text, `${marker} leaked`).not.toContain(marker);
			expect(await tenantBSnapshot()).toBe(before);
			expect(response.status, `${label} answered ${response.status}: ${text}`).not.toBe(405);
			const json = JSON.parse(text) as { code?: string; message?: string; data?: unknown[] };

			switch (expected) {
				case "not-found": {
					const isNotFound = response.status === 404 && json.code === "not_found";
					const isMissingRef = response.status === 400 && /not found/i.test(json.message ?? "");
					expect(isNotFound || isMissingRef, `${label}: ${response.status} ${text}`).toBe(true);
					expect(scopeState.calls, "the handler ran under the tenant scope").toBeGreaterThan(callsBefore);
					break;
				}
				case "scoped-list":
					expect(response.status, text).toBe(200);
					expect(Array.isArray(json.data)).toBe(true);
					expect(scopeState.calls).toBeGreaterThan(callsBefore);
					break;
				case "denied":
					expect(response.status, text).toBe(500);
					expect(wasPermissionDenied(logged), `${label} failed for a reason other than isolation`).toBe(true);
					break;
				case "no-tenant-data":
					expect(response.status, text).toBeLessThan(500);
					break;
				default:
					throw new Error(`${label} has no declared expectation`);
			}
			if (method !== "GET") expect(response.status, "a write into tenant B succeeded").toBeGreaterThanOrEqual(400);
		},
	);
});

describe("REST /api/v1: positive controls, one per route group, under the same tenant A scope", () => {
	const byName = (name: string) => {
		const route = routes.find((r) => r.name === name);
		if (!route) throw new Error(`no route ${name}`);
		return route;
	};
	const getA = async (name: string) => {
		scopeState.scope = { organizationIds: [ORG_A] };
		const response = await callRoute(byName(name), "GET", "A");
		return { status: response.status, text: await response.text() };
	};

	it.each([
		["brands", "brands/$brandId.ts", "Isolation Brand A"],
		["brands list", "brands/index.ts", "Isolation Brand A"],
		["brand analytics", "brands/$brandId/analytics.ts", BRAND_A],
		["brand citations", "brands/$brandId/citations/domains.ts", BRAND_A],
		["brand opportunities", "brands/$brandId/opportunities.ts", BRAND_A],
		["brand tags", "brands/$brandId/tags/index.ts", BRAND_A],
		["competitors", "competitors/$competitorId.ts", "Isolation Rival A"],
		["competitors list", "competitors/index.ts", "Isolation Rival A"],
		["organizations", "organizations/$organizationId.ts", "Isolation Org A"],
		["organizations list", "organizations/index.ts", "Isolation Org A"],
		["organization billing", "organizations/$organizationId/billing.ts", ORG_A],
		["prompts", "prompts/$promptId.ts", "isolation-a public question"],
		["prompts list", "prompts/index.ts", "isolation-a public question"],
		["prompt runs", "prompts/$promptId/runs/index.ts", RUN_A],
		["prompt run", "prompts/$promptId/runs/$runId.ts", RUN_A],
		["prompt snapshot", "prompts/$promptId/snapshot.ts", PROMPT_A],
		["identity", "me.ts", "admin"],
		["models", "models.ts", "chatgpt"],
	])("%s: %s serves tenant A", async (_group, name, marker) => {
		const { status, text } = await getA(name);
		expect(status, text).toBe(200);
		expect(text).toContain(marker);
		expect(text).not.toContain("Isolation Brand B");
	});

	it("reports: served at system scope, which is what an instance admin key gets", async () => {
		scopeState.scope = null;
		const response = await callRoute(byName("reports/index.ts"), "GET", "A");
		expect(response.status, await response.clone().text()).toBe(200);
	});

	it("tools/analyze: validates its body before any work (no outbound calls in tests)", async () => {
		scopeState.scope = { organizationIds: [ORG_A] };
		const response = await callRoute(byName("tools/analyze.ts"), "POST", "A");
		expect(response.status).toBe(400);
	});
});

describe("MCP: every tool, database scope pinned to tenant A, tenant B's ids", () => {
	const admin = { kind: "admin", scopes: null, organizationId: null } as const;
	const argsB = {
		brandId: BRAND_B,
		promptId: PROMPT_B,
		runId: RUN_B,
		organizationId: ORG_B,
		value: "Hijacked by MCP",
		prompts: [{ value: "Injected by MCP" }],
		...WINDOW,
	};
	/** Tools that read no tenant row, or list only what is in scope. Every other tool must refuse tenant B as not found. */
	const SUCCEEDS = new Set(["whoami", "list_models", "list_brands"]);

	it.each(MCP_TOOLS.map((tool) => [tool.name, tool] as const))(
		"%s returns nothing of tenant B and changes nothing of tenant B",
		async (name, tool) => {
			scopeState.scope = { organizationIds: [ORG_A] };
			const before = await tenantBSnapshot();
			const callsBefore = scopeState.calls;
			const outcome = await runToolInTenant(tool, { auth: admin, toolNames: MCP_TOOLS.map((t) => t.name) }, argsB).then(
				(result) => ({ ok: true as const, text: JSON.stringify(result) ?? "" }),
				(error: unknown) => ({ ok: false as const, text: String(error) }),
			);
			for (const marker of B_MARKERS) expect(outcome.text, `${marker} leaked`).not.toContain(marker);
			expect(await tenantBSnapshot()).toBe(before);
			expect(scopeState.calls).toBeGreaterThan(callsBefore);
			if (SUCCEEDS.has(name)) expect(outcome.ok, outcome.text).toBe(true);
			else {
				expect(outcome.ok, `${name} succeeded against tenant B`).toBe(false);
				expect(outcome.text, `${name} failed for a reason other than isolation`).toMatch(/not found/i);
			}
		},
	);

	it.each([
		["list_brands", {}, "Isolation Brand A"],
		["get_brand", { brandId: BRAND_A }, "Isolation Brand A"],
		["list_competitors", { brandId: BRAND_A }, "Isolation Rival A"],
		["get_billing", { organizationId: ORG_A }, ORG_A],
		["list_prompts", { brandId: BRAND_A }, "isolation-a public question"],
		["list_prompt_tags", { brandId: BRAND_A }, BRAND_A],
		["get_analytics", { brandId: BRAND_A, start: WINDOW.start, end: WINDOW.end }, BRAND_A],
		["get_opportunities", { brandId: BRAND_A }, BRAND_A],
		["list_runs", { promptId: PROMPT_A, start: WINDOW.start, end: WINDOW.end }, RUN_A],
		["get_run", { promptId: PROMPT_A, runId: RUN_A }, RUN_A],
		["whoami", {}, "instance admin"],
		["list_models", {}, "chatgpt"],
	] as const)("positive control: %s serves tenant A under the same scope", async (name, args, marker) => {
		scopeState.scope = { organizationIds: [ORG_A] };
		const tool = MCP_TOOLS.find((t) => t.name === name);
		if (!tool) throw new Error(`no tool ${name}`);
		const result = JSON.stringify(await runToolInTenant(tool, { auth: admin, toolNames: [] }, args));
		expect(result).toContain(marker);
		expect(result).not.toContain("Isolation Brand B");
	});
});

describe("server functions: global tenant middleware", () => {
	it("is registered after auth for every server function", () => {
		const start = readFileSync(join(import.meta.dirname, "../../start.ts"), "utf8");
		expect(start).toMatch(/functionMiddleware:\s*\[[^\]]*authMiddleware,\s*tenantMiddleware\]/);
	});

	it("scopes a signed-in user to their organizations and a client to granted brands", async () => {
		expect(await tenantScopeForUser({ id: USER_A, role: "user" })).toEqual({
			organizationIds: [ORG_A],
			adminOrganizationIds: [],
			userId: USER_A,
		});
		expect(await tenantScopeForUser({ id: USER_CLIENT, role: "user" })).toEqual({
			organizationIds: [ORG_A],
			adminOrganizationIds: [],
			brandIds: [BRAND_A],
			restrictedOrganizationIds: [ORG_A],
			userId: USER_CLIENT,
		});
		expect(await tenantScopeForUser({ id: "nobody", role: "user" })).toEqual({
			organizationIds: [],
			adminOrganizationIds: [],
			userId: "nobody",
		});
		expect(await tenantScopeForUser({ id: USER_A, role: "admin" })).toBeNull();
	});
});
