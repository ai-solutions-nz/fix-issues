/**
 * Online Reset: database-enforced tenant isolation for every legacy Elmo entry
 * point. The application-level checks are deliberately taken out of the way
 * (the caller is an instance-admin principal, which those checks let through
 * to anything), while the database tenant scope is pinned to tenant A. Every
 * /api/v1 route and every MCP tool is then pointed at tenant B's ids: the only
 * thing left between the caller and tenant B is Postgres row-level security.
 * Reads must not return tenant B's data; writes must leave tenant B unchanged.
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
	process.env.DEPLOYMENT_MODE ??= "local";
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
	const query = new URLSearchParams({ brandId: values.brandId, organizationId: values.organizationId });
	const body = method === "GET" ? undefined : JSON.stringify(WRITE_BODIES[`${method} ${route.name}`] ?? {});
	const request = new Request(`http://localhost/api/v1/${path}?${query}`, {
		method,
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body,
	});
	const handler = route.handlers[method] as Handler;
	return handler({ request, params });
}

describe("REST /api/v1: every route, database scope pinned to tenant A, tenant B's ids", () => {
	it("found the routes and MCP tools", () => {
		expect(routes.length).toBeGreaterThan(20);
		expect(MCP_TOOLS.length).toBeGreaterThan(10);
	});

	const cases = routes.flatMap((route) =>
		Object.keys(route.handlers).map((method) => [`${method} ${route.name}`, route, method] as const),
	);

	it.each(cases)("%s returns nothing of tenant B and changes nothing of tenant B", async (_label, route, method) => {
		scopeState.scope = { organizationIds: [ORG_A] };
		const before = await tenantBSnapshot();
		const callsBefore = scopeState.calls;
		const response = await callRoute(route, method, "B");
		const text = await response.text();
		for (const marker of B_MARKERS) expect(text, `${marker} leaked`).not.toContain(marker);
		expect(await tenantBSnapshot()).toBe(before);
		const meta = apiHandlerMeta(route.handlers[method]);
		// A handler that reached its body ran under the tenant scope (validation and method guards answer before it).
		if (meta?.kind === "endpoint" && response.status !== 400 && response.status !== 405)
			expect(scopeState.calls).toBeGreaterThan(callsBefore);
		if (method !== "GET") expect(response.status, "a write into tenant B succeeded").toBeGreaterThanOrEqual(400);
	});

	it("still serves tenant A's own data under the same scope (positive control)", async () => {
		scopeState.scope = { organizationIds: [ORG_A] };
		const byName = (name: string) => routes.find((r) => r.name === name) as (typeof routes)[number];
		const brand = await (await callRoute(byName("brands/$brandId.ts"), "GET", "A")).text();
		expect(brand).toContain("Isolation Brand A");
		const list = await (await callRoute(byName("brands/index.ts"), "GET", "A")).text();
		expect(list).toContain("Isolation Brand A");
		expect(list).not.toContain("Isolation Brand B");
		const promptList = await (await callRoute(byName("prompts/index.ts"), "GET", "A")).text();
		expect(promptList).toContain("isolation-a public question");
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
	};

	it.each(MCP_TOOLS.map((tool) => [tool.name, tool] as const))(
		"%s returns nothing of tenant B and changes nothing of tenant B",
		async (_name, tool) => {
			scopeState.scope = { organizationIds: [ORG_A] };
			const before = await tenantBSnapshot();
			const callsBefore = scopeState.calls;
			const outcome = await runToolInTenant(tool, { auth: admin, toolNames: MCP_TOOLS.map((t) => t.name) }, argsB).then(
				(result) => JSON.stringify(result) ?? "",
				(error: unknown) => String(error),
			);
			for (const marker of B_MARKERS) expect(outcome, `${marker} leaked`).not.toContain(marker);
			expect(await tenantBSnapshot()).toBe(before);
			expect(scopeState.calls).toBeGreaterThan(callsBefore);
		},
	);

	it("still serves tenant A's own data under the same scope (positive control)", async () => {
		scopeState.scope = { organizationIds: [ORG_A] };
		const tool = MCP_TOOLS.find((t) => t.name === "list_prompts");
		const result = JSON.stringify(await runToolInTenant(tool!, { auth: admin, toolNames: [] }, { brandId: BRAND_A }));
		expect(result).toContain("isolation-a public question");
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
			userId: USER_A,
		});
		expect(await tenantScopeForUser({ id: USER_CLIENT, role: "user" })).toEqual({
			organizationIds: [ORG_A],
			brandIds: [BRAND_A],
			userId: USER_CLIENT,
		});
		expect(await tenantScopeForUser({ id: "nobody", role: "user" })).toEqual({ organizationIds: [], userId: "nobody" });
		expect(await tenantScopeForUser({ id: USER_A, role: "admin" })).toBeNull();
	});
});
