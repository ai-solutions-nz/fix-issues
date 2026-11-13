/**
 * Billing server functions (cloud mode). Read paths power the paywall, the
 * plan picker, and the billing settings page; the single write path adjusts
 * the extra premium slots add-on quantity. Checkout, plan changes, portal,
 * and cancellation all go through better-auth's Stripe endpoints client-side —
 * no custom payment surface here.
 */
import { createServerFn } from "@tanstack/react-start";
import type { Entitlements } from "@workspace/config/entitlements";
import { isPremiumAddonAvailable, premiumPlanNames } from "@workspace/config/plans";
import { isOrgAdminRole } from "@workspace/config/roles";
import { getDeployment } from "@workspace/deployment";
import { setPremiumAddonQuantity } from "@workspace/deployment/billing";
import { db } from "@workspace/lib/db/db";
import { organization } from "@workspace/lib/db/schema";
import {
	countOrgAssignedPremiumSlots,
	countOrgBrands,
	countOrgEnabledPrompts,
	getOrgBillingState,
	getOrgEntitlementsMap,
} from "@workspace/lib/entitlements";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { listUserOrganizations, requireAuthSession, requireOrganization } from "@/lib/auth/helpers";
import { type BillingState, liveSubscription, loadBillingState } from "./billing-state";

export type { BillingState } from "./billing-state";

export type PaywallRequired = {
	needsPlan: true;
	/** The org that needs the plan — always carried, so checkout can't target the wrong one. */
	organizationId: string;
	organizationName: string;
	isOrgAdmin: boolean;
};

export type PaywallState = { needsPlan: false } | PaywallRequired;

export const getBillingStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string() }))
	.handler(async ({ data }): Promise<BillingState> => {
		const session = await requireAuthSession();
		return loadBillingState(session.user.id, data.organizationId);
	});

export const getPaywallStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string().optional() }).optional())
	.handler(async ({ data }): Promise<PaywallState> => {
		const deployment = getDeployment();
		if (!deployment.features.billing) return { needsPlan: false };

		const session = await requireAuthSession();
		const orgs = await listUserOrganizations(session.user.id);
		if (orgs.length === 0) return { needsPlan: false };

		const requested = data?.organizationId;
		// An org the caller doesn't belong to isn't theirs to be paywalled on;
		// whatever they were reaching for will 404 on its own access check.
		const scoped = requested ? orgs.find((org) => org.id === requested) : undefined;
		if (requested && !scoped) return { needsPlan: false };

		const entitlementsByOrg = await getOrgEntitlementsMap(orgs.map((org) => org.id));
		const needsPlan = (org: { id: string }) => entitlementsByOrg.get(org.id)?.standing === "none";

		const subject = scoped ?? orgs[0];
		if (scoped ? !needsPlan(scoped) : !orgs.every(needsPlan)) {
			return { needsPlan: false };
		}

		return {
			needsPlan: true,
			organizationId: subject.id,
			organizationName: subject.name,
			isOrgAdmin: isOrgAdminRole(subject.role),
		};
	});

export const setPremiumAddonQuantityFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string(), quantity: z.number().int().min(0).max(1000) }))
	.handler(async ({ data }) => {
		const deployment = getDeployment();
		if (!deployment.features.billing) throw new Error("Billing is not enabled on this deployment");

		const session = await requireAuthSession();
		const org = await requireOrganization(session.user.id, data.organizationId);
		if (!isOrgAdminRole(org.role)) {
			throw new Error("Only organization admins can change billing");
		}

		const state = await getOrgBillingState(org.id);
		if (!isPremiumAddonAvailable(state.entitlements.planKey)) {
			throw new Error(`Extra premium pairings are available on the ${premiumPlanNames()} plans`);
		}
		const subscription = liveSubscription(state.subscription);
		if (!subscription?.stripeSubscriptionId) {
			throw new Error("No active subscription to attach the add-on to");
		}

		// Shrinking the add-on below what's assigned would orphan assignments;
		// the worker would stop running the newest ones. Require unassigning first.
		const included = state.entitlements.premiumPool - (state.settings?.premiumAddonQuantity ?? 0);
		const assigned = await countOrgAssignedPremiumSlots(org.id);
		if (assigned > included + data.quantity) {
			throw new Error(
				`${assigned} premium pairings are in use; unassign ${assigned - included - data.quantity} before reducing the add-on`,
			);
		}

		const quantity = await setPremiumAddonQuantity({
			stripeSubscriptionId: subscription.stripeSubscriptionId,
			organizationId: org.id,
			quantity: data.quantity,
		});
		return { quantity };
	});
