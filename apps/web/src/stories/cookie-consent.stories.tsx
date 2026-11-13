/**
 * Online Reset (Packets 2b and 2c): the consent banner and the footer's
 * Cookie Preferences control. Neo's review asked for the empty-policy-link
 * banner (F1) and the whitelabel footer (F2) to be pinned by stories.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { CookieConsentBanner } from "@workspace/ui/consent/cookie-consent-banner";
import { expect, within } from "storybook/test";
import { NavAppInfo } from "@/components/nav-app-info";
import { setMockRouteContext } from "./_mocks/tanstack-router";

const meta = {
	title: "Consent/Cookie Consent",
	parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

/** The banner opens unprompted only while no answer is stored. */
function forgetConsent(): void {
	try {
		window.localStorage.removeItem("elmo.cookie-consent");
	} catch {
		// Storage unavailable: the banner then opens as for a first visit anyway.
	}
}

/** F1: no Cookie Policy published yet, no ad tags: no policy link, no mention of advertising, the deployment's own name. */
export const BannerWithoutPolicyLink: StoryObj = {
	render: () => {
		forgetConsent();
		return <CookieConsentBanner consentRequired policyHref="" appName="Acme Visibility" mentionsAdvertising={false} />;
	},
	play: async ({ canvasElement }) => {
		const banner = await within(canvasElement).findByRole("region", { name: "Cookie consent" });
		await expect(banner).toHaveTextContent("find Acme Visibility");
		await expect(banner).not.toHaveTextContent(/Online Reset/);
		await expect(banner).not.toHaveTextContent(/advertising/i);
		await expect(within(banner).queryByRole("link", { name: "Cookie Policy" })).toBeNull();
		await expect(banner.querySelector('a[href=""]')).toBeNull();
	},
};

/** Once a policy is published and ad ids are set, both appear. */
export const BannerWithPolicyAndAdvertising: StoryObj = {
	render: () => {
		forgetConsent();
		return (
			<CookieConsentBanner
				consentRequired
				policyHref="https://legal.example.com/legal/cookies"
				appName="Online Reset"
				mentionsAdvertising
			/>
		);
	},
	play: async ({ canvasElement }) => {
		const banner = await within(canvasElement).findByRole("region", { name: "Cookie consent" });
		await expect(banner).toHaveTextContent("analytics and advertising cookies");
		await expect(within(banner).getByRole("link", { name: "Cookie Policy" })).toHaveAttribute(
			"href",
			"https://legal.example.com/legal/cookies",
		);
	},
};

function Footer() {
	return (
		<TooltipProvider>
			<div className="w-64 bg-sidebar p-2">
				<NavAppInfo />
			</div>
		</TooltipProvider>
	);
}

/** F2: a whitelabel deployment with analytics keeps the consent control, and nothing else from the footer. */
export const WhitelabelFooterWithAnalytics: StoryObj = {
	render: () => {
		setMockRouteContext({ clientConfig: { mode: "whitelabel", analytics: { clarityProjectId: "simulated" } } });
		return <Footer />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("button", { name: "Cookie Preferences" })).toBeVisible();
		await expect(canvas.queryByText(/^v\d/)).toBeNull();
		await expect(canvas.queryByRole("link")).toBeNull();
	},
};

/** A whitelabel deployment with nothing to consent to shows no footer at all. */
export const WhitelabelFooterWithoutAnalytics: StoryObj = {
	render: () => {
		setMockRouteContext({ clientConfig: { mode: "whitelabel", analytics: {} } });
		return <Footer />;
	},
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).queryByRole("button", { name: "Cookie Preferences" })).toBeNull();
	},
};

/** Our hosted deployments always ask, so the control is there even with no legal site configured. */
export const HostedFooter: StoryObj = {
	render: () => {
		setMockRouteContext({ clientConfig: { mode: "cloud", analytics: {} } });
		return <Footer />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("button", { name: "Cookie Preferences" })).toBeVisible();
		await expect(canvas.queryByRole("button", { name: "Legal" })).toBeNull();
	},
};
