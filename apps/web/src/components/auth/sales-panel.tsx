/**
 * The pitch shown beside the sign-in and sign-up forms in local and cloud mode.
 *
 * Sign-in is the highest-intent page either deployment has, so it carries the
 * argument for the product rather than just a card on an empty background: what
 * Elmo does, which engines it reaches, and — for a self-hosted instance — that
 * a managed option exists.
 *
 * Demo and whitelabel deliberately never see this. A demo visitor has already
 * decided to look, and a whitelabel tenant is not ours to sell to.
 */

import { IconCheck, IconCloud, IconEye } from "@tabler/icons-react";
import { PLANS, platformTierMembers } from "@workspace/config/plans";
import {
	cloudPricingUrl,
	cloudSignupUrl,
	demoSiteUrl,
	marketingUrl,
	type ReferralSource,
} from "@workspace/config/referrals";
import { CUSTOMER_QUOTES } from "@workspace/ui/brand/customers";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";

/** Everything Elmo reaches, named — the coverage claim is the product. */
const ENGINES = [...platformTierMembers("scraped"), ...platformTierMembers("api")];

const GITHUB_URL = "https://github.com/elmohq/elmo";

/** The comparison the pricing rests on, kept in step with what a plan actually samples. */
const RUNS_PER_DAY = PLANS.basic.standardRunsPerDay;

interface Bullet {
	/** Doubles as the list key. */
	text: string;
	/** Set where the bullet is an invitation rather than a statement. */
	href?: string;
}

interface Pitch {
	headline: string;
	bullets: Bullet[];
}

const CLOUD_PITCH: Pitch = {
	headline: "Be the brand AI recommends.",
	bullets: [
		{ text: "Track your AI visibility on any model" },
		{ text: "Benchmark against your competitors" },
		{ text: "Analyze citations to find opportunities" },
		{ text: `${RUNS_PER_DAY}× Profound's daily runs, same price` },
	],
};

const SELF_HOSTED_PITCH: Pitch = {
	headline: "Self-host your AEO.",
	bullets: [
		{ text: "Track your AI visibility on any model" },
		{ text: "Unlimited prompts, brands, and seats" },
		{ text: "Bring your own model and scraper keys" },
		{ text: "Please star us on GitHub!", href: GITHUB_URL },
	],
};

type SalesPanelVariant = "cloud" | "self-hosted";

/** Online Reset: a neutral product panel in place of the upstream marketing (testimonials, cloud upsell). */
export function SalesPanel(_props: { variant: SalesPanelVariant; source: ReferralSource }) {
	return (
		<div className="flex h-full flex-col justify-center gap-6 px-10">
			<h2 className="text-3xl font-semibold tracking-tight">Your AI Online Performance Partner</h2>
			<ul className="space-y-3 text-sm text-muted-foreground">
				<li>See how AI engines answer your buyers' questions, city by city.</li>
				<li>Every figure links to the stored answer it came from.</li>
				<li>Nothing is published to your website without your approval.</li>
			</ul>
		</div>
	);
}

export function SalesFooterLinks(_props: { source: ReferralSource }): ReactNode {
	return null;
}
