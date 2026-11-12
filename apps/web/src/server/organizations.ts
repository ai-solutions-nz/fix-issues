import { createServerFn } from "@tanstack/react-start";
import { isOrgAdminRole } from "@workspace/config/roles";
import { getDeployment } from "@workspace/deployment";
import { syncAuth0UserById } from "@workspace/deployment/auth-hooks/whitelabel";
import { isValidSlug, MAX_SLUG_LENGTH } from "@workspace/lib/app-urls";
import { provisionUmbrellaOrg } from "@workspace/lib/db/provisioning";
import { z } from "zod";
import { getAuthSession, listUserOrganizations, requireAuthSession, requireOrganization } from "@/lib/auth/helpers";
import { summarizeOrganizations } from "@/lib/organizations/summarize";
import type { OrganizationsView } from "@/lib/organizations/types";
import { INVALID_SLUG } from "@/lib/slug-errors";
import { renameOrganization } from "./signed-in-core";

export type { OrganizationsView } from "@/lib/organizations/types";

export const listOrganizationsFn = createServerFn({ method: "GET" }).handler(async (): Promise<OrganizationsView> => {
	const session = await getAuthSession();
	if (!session) return { signedIn: false, organizations: [] };
	return { signedIn: true, organizations: await summarizeOrganizations(await listUserOrganizations(session.user.id)) };
});

export const syncOrganizationMembershipsFn = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => {
	if (getDeployment().mode !== "whitelabel") return false;

	const session = await requireAuthSession();
	try {
		await syncAuth0UserById(session.user.id);
	} catch (error) {
		console.error("[auth0-sync] Failed to sync user memberships; continuing with cached ones", error);
	}
	return true;
});

export const createOrganizationFn = createServerFn({ method: "POST" })
	.validator(z.object({ name: z.string().trim().min(1).max(100) }))
	.handler(async ({ data }): Promise<{ slug: string }> => {
		const session = await requireAuthSession();
		if (!getDeployment().features.canCreateOrganizations) {
			throw new Error("This deployment does not create organizations");
		}

		const { slug } = await provisionUmbrellaOrg({ userId: session.user.id, name: data.name });
		return { slug };
	});

export const updateOrganizationFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			organizationId: z.string(),
			name: z.string().trim().min(1).max(100),
			slug: z.string().trim().toLowerCase().max(MAX_SLUG_LENGTH).optional(),
		}),
	)
	.handler(async ({ data }): Promise<{ slug: string }> => {
		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.organizationId);

		if (!isOrgAdminRole(org.role)) {
			throw new Error("Only organization admins can change the organization name or URL Slug");
		}
		if (!getDeployment().features.canEditOrganizations) {
			throw new Error("This organization cannot be renamed in this deployment");
		}
		if (data.slug !== undefined && !isValidSlug(data.slug)) throw new Error(INVALID_SLUG);

		const slug = await renameOrganization(org, data);
		return { slug };
	});
