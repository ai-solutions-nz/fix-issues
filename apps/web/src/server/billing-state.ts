/**
 * The billing settings page's data (Online Reset, Packet 1c). Kept apart from
 * billing-core, which the REST routes and MCP tools import: this module needs
 * the auth helpers, and those construct better-auth when imported.
 */
import type { Entitlements } from "@workspace/config/entitlements";
import { isPremiumAddonAvailable } from "@workspace/config/plans";
import { getDeployment } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { organization } from "@workspace/lib/db/schema";
import {
	countOrgAssignedPremiumSlots,
	countOrgBrands,
	countOrgEnabledPrompts,
	getOrgBillingState,
} from "@workspace/lib/entitlements";
import { eq } from "drizzle-orm";
import { requireOrganization } from "@/lib/auth/helpers";

export type BillingState = {
	billingEnabled: boolean;
	organization: { id: string; name: string; role: string };
	entitlements: Entitlements;
	subscription: {
		id: string;
		stripeSubscriptionId: string | null;
		plan: string;
		status: string;
		periodEnd: string | null;
		cancelAtPeriodEnd: boolean;
		billingInterval: string | null;
		seats: number | null;
	} | null;
	hasBillingAccount: boolean;
	premiumAddonQuantity: number;
	premiumAddonAvailable: boolean;
	usage: { brands: number; enabledPrompts: number; premiumAssigned: number };
};

const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

export function liveSubscription<T extends { status: string | null }>(row: T | null): T | null {
	return row && LIVE_SUBSCRIPTION_STATUSES.has(row.status ?? "") ? row : null;
}

/** The billing settings page's data, for a signed-in member who is not a client. */
export async function loadBillingState(userId: string, organizationId: string): Promise<BillingState> {
	const org = await requireOrganization(userId, organizationId);
	// Online Reset (Packet 1c): plan, status, Stripe ids, renewal date and seats
	// are the agency's business, not its clients'.
	if (org.role === "client") throw new Error("Forbidden: billing is not available to client users");
	const deployment = getDeployment();

	const [state, [billingAccount]] = await Promise.all([
		getOrgBillingState(org.id),
		db
			.select({ stripeCustomerId: organization.stripeCustomerId })
			.from(organization)
			.where(eq(organization.id, org.id))
			.limit(1),
	]);
	const subscription = liveSubscription(state.subscription);
	const [brandsUsed, promptsUsed, premiumAssigned] = state.entitlements.unlimited
		? [0, 0, 0]
		: await Promise.all([countOrgBrands(org.id), countOrgEnabledPrompts(org.id), countOrgAssignedPremiumSlots(org.id)]);

	return {
		billingEnabled: deployment.features.billing,
		organization: org,
		entitlements: state.entitlements,
		subscription: subscription
			? {
					id: subscription.id,
					stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
					plan: subscription.plan,
					status: subscription.status ?? "incomplete",
					periodEnd: subscription.periodEnd?.toISOString() ?? null,
					cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
					billingInterval: subscription.billingInterval ?? null,
					seats: subscription.seats ?? null,
				}
			: null,
		hasBillingAccount: subscription !== null || Boolean(billingAccount?.stripeCustomerId),
		premiumAddonQuantity: state.settings?.premiumAddonQuantity ?? 0,
		premiumAddonAvailable: isPremiumAddonAvailable(state.entitlements.planKey),
		usage: { brands: brandsUsed, enabledPrompts: promptsUsed, premiumAssigned },
	};
}
