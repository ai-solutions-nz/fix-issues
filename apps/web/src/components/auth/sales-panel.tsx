/**
 * The panel shown beside the sign-in and sign-up forms in local and cloud mode.
 * Online Reset: a neutral product description; the upstream marketing
 * (testimonials, ratings, cloud upsell, GitHub link) is gone.
 */
import type { ReferralSource } from "@workspace/config/referrals";
import type { ReactNode } from "react";

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
