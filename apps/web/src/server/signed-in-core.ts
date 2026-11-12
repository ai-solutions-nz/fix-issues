/**
 * Online Reset: the database work behind signed-in actions that the tenant
 * scope (Packet 1) had broken, kept apart from their server functions so the
 * integration tests can run each one as a real signed-in user.
 */
import { db, serviceDb } from "@workspace/lib/db/db";
import { brands, member, oauthClient, organization } from "@workspace/lib/db/schema";
import {
	claimNewBrandSlug,
	claimOrgSlug,
	findUnusedBrandSlug,
	isOrgSlugAvailable,
	newBrandId,
} from "@workspace/lib/db/unique-names";
import { and, eq } from "drizzle-orm";
import { type McpClientSummary, summarizeMcpClient } from "@/lib/mcp/client-summary";
import { TAKEN_SLUG } from "@/lib/slug-errors";

/**
 * Renames an organization the caller administers. The write runs in the
 * caller's tenant scope; migration 0040 lets an owner or admin update only the
 * name and slug of their own organization. Slugs are instance-wide, so the
 * availability check reads every organization (the unique index still decides).
 */
export async function renameOrganization(
	org: { id: string; slug: string },
	data: { name: string; slug?: string },
): Promise<string> {
	if (data.slug !== undefined && !(await isOrgSlugAvailable(data.slug, { excludeOrgId: org.id }))) {
		throw new Error(TAKEN_SLUG);
	}
	return claimOrgSlug(async () => {
		const updated = await db
			.update(organization)
			.set({ name: data.name, ...(data.slug !== undefined && { slug: data.slug }) })
			.where(eq(organization.id, org.id))
			.returning({ id: organization.id });
		if (updated.length === 0) throw new Error("Forbidden: No access to this organization");
		return data.slug ?? org.slug;
	}, TAKEN_SLUG);
}

/** OAuth clients belong to the instance, not to a tenant, so the consent page reads them on the system handle. */
export async function findMcpClientSummary(clientId: string): Promise<McpClientSummary | null> {
	const [client] = await serviceDb
		.select({
			clientId: oauthClient.clientId,
			clientDiscoveryId: oauthClient.clientDiscoveryId,
			name: oauthClient.name,
			redirectUris: oauthClient.redirectUris,
		})
		.from(oauthClient)
		.where(eq(oauthClient.clientId, clientId))
		.limit(1);
	return client ? summarizeMcpClient(client) : null;
}

/**
 * The slug of an organization the user has just joined. The request's tenant
 * scope was fixed before the membership existed, so it cannot see the
 * organization yet; this reads it on the system handle, and only once the
 * membership is confirmed there.
 */
export async function joinedOrganizationSlug(userId: string, organizationId: string): Promise<string> {
	const [row] = await serviceDb
		.select({ slug: organization.slug })
		.from(organization)
		.innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, userId)))
		.where(eq(organization.id, organizationId))
		.limit(1);
	if (!row) throw new Error("The organization for this invitation no longer exists");
	return row.slug;
}

/**
 * Inserts a brand into an organization the caller can write to. Its id is
 * random, never derived from the name, so it cannot collide with another
 * tenant's brand (which this scope cannot see) or reveal that one exists.
 */
export async function insertBrandInOrganization(input: {
	organizationId: string;
	name: string;
	baseSlug: string;
	website: string;
	enabledModels?: string[] | null;
	additionalDomains?: string[];
}): Promise<{ brandId: string; brandSlug: string }> {
	return claimNewBrandSlug(() =>
		db.transaction(async (tx) => {
			const brandId = newBrandId(input.baseSlug);
			const slug = await findUnusedBrandSlug(input.organizationId, input.baseSlug, tx);
			await tx.insert(brands).values({
				id: brandId,
				organizationId: input.organizationId,
				name: input.name,
				slug,
				website: input.website,
				enabled: true,
				...(input.enabledModels && { enabledModels: input.enabledModels }),
				...(input.additionalDomains?.length && { additionalDomains: input.additionalDomains }),
			});
			return { brandId, brandSlug: slug };
		}),
	);
}
