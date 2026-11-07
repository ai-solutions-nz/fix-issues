import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceDb } from "../db/db";
import { brands, member, organization, prompts, user } from "../db/schema";
import { orMemberBrandAccess } from "../db/schema-or";
import { withTenant } from "../db/tenant";
import { resolveTenantScope } from "./tenant-scope";

const ORG = "or-scope-org";
const OTHER_ORG = "or-scope-other";
const STAFF = "or-scope-staff";
const CLIENT = "or-scope-client";
const BRAND_MINE = "or-scope-brand-mine";
const BRAND_SIBLING = "or-scope-brand-sibling";
const BRAND_FOREIGN = "or-scope-brand-foreign";

async function cleanup() {
	await serviceDb.delete(orMemberBrandAccess).where(inArray(orMemberBrandAccess.organizationId, [ORG, OTHER_ORG]));
	await serviceDb.delete(prompts).where(inArray(prompts.brandId, [BRAND_MINE, BRAND_SIBLING, BRAND_FOREIGN]));
	await serviceDb.delete(brands).where(inArray(brands.id, [BRAND_MINE, BRAND_SIBLING, BRAND_FOREIGN]));
	await serviceDb.delete(member).where(inArray(member.organizationId, [ORG, OTHER_ORG]));
	await serviceDb.delete(organization).where(inArray(organization.id, [ORG, OTHER_ORG]));
	await serviceDb.delete(user).where(inArray(user.id, [STAFF, CLIENT]));
}

beforeAll(async () => {
	await cleanup();
	await serviceDb.insert(user).values([
		{ id: STAFF, name: "Agency Staff", email: "staff@agency.example" },
		{ id: CLIENT, name: "Client Owner", email: "owner@client.example" },
	]);
	await serviceDb.insert(organization).values([
		{ id: ORG, name: "Agency", slug: "or-scope-agency", createdAt: new Date() },
		{ id: OTHER_ORG, name: "Other Agency", slug: "or-scope-other", createdAt: new Date() },
	]);
	await serviceDb.insert(member).values([
		{ id: "or-scope-m1", organizationId: ORG, userId: STAFF, role: "member", createdAt: new Date() },
		{ id: "or-scope-m2", organizationId: ORG, userId: CLIENT, role: "client", createdAt: new Date() },
	]);
	await serviceDb.insert(brands).values([
		{ id: BRAND_MINE, name: "Client Business", website: "https://client.example", organizationId: ORG },
		{ id: BRAND_SIBLING, name: "Another Client", website: "https://another.example", organizationId: ORG },
		{ id: BRAND_FOREIGN, name: "Foreign", website: "https://foreign.example", organizationId: OTHER_ORG },
	]);
	await serviceDb.insert(prompts).values([
		{ brandId: BRAND_MINE, value: "mine" },
		{ brandId: BRAND_SIBLING, value: "sibling" },
	]);
	await serviceDb.insert(orMemberBrandAccess).values({ organizationId: ORG, userId: CLIENT, brandId: BRAND_MINE });
});

afterAll(cleanup);

describe("resolveTenantScope", () => {
	it("gives agency staff the whole organization", async () => {
		const scope = await resolveTenantScope(STAFF, BRAND_SIBLING);
		expect(scope).toEqual({ organizationId: ORG, role: "member" });
	});

	it("restricts a client to granted brands, and the database enforces it", async () => {
		const scope = await resolveTenantScope(CLIENT, BRAND_MINE);
		expect(scope.brandIds).toEqual([BRAND_MINE]);
		const visible = await withTenant(scope, (tx) => tx.select({ value: prompts.value }).from(prompts));
		expect(visible.map((p) => p.value)).toEqual(["mine"]);
	});

	it("refuses a client's sibling brand and any brand outside the organization", async () => {
		await expect(resolveTenantScope(CLIENT, BRAND_SIBLING)).rejects.toThrow(/Forbidden/);
		await expect(resolveTenantScope(STAFF, BRAND_FOREIGN)).rejects.toThrow(/Forbidden/);
	});
});
