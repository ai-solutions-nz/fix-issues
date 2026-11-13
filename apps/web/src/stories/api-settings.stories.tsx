import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentType, ReactNode } from "react";
import { expect, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/settings/api";
import { setMockRouteContext } from "./_mocks/tanstack-router";

const ApiSettingsPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

function load(mode = "cloud", appName = "Online Reset", appUrl = "https://reset.example.com/", readOnly = false) {
	setMockRouteContext({ clientConfig: { mode, branding: { name: appName, url: appUrl }, features: { readOnly } } });
}

function Shell({ children }: { children: ReactNode }) {
	return <div className="bg-background text-foreground antialiased min-h-svh p-4 md:p-6">{children}</div>;
}

const meta = {
	title: "Settings/API",
	component: ApiSettingsPage,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<Shell>
				<Story />
			</Shell>
		),
	],
} satisfies Meta<typeof ApiSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {
	render: () => {
		load();
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "API Docs" })).toBeVisible();
		await expect(canvas.queryByText(/disabled in demo mode/)).toBeNull();
		// Whatever host the app is being served from is the one people should call.
		await expect(await canvas.findByRole("textbox", { name: "Base URL" })).toHaveValue(
			`${window.location.origin}/api/v1`,
		);
		// The reference reads the instance's own spec rather than a hosted copy.
		await expect(await canvas.findByTestId("api-reference-mock")).toHaveTextContent("/api/v1/openapi.json");
		// Online Reset: the typed SDKs are the upstream project's packages, so none is advertised.
		await expect(canvas.queryByRole("heading", { name: "SDKs" })).toBeNull();
		await expect(canvas.queryByText(/elmo/i)).toBeNull();
	},
};

export const SelfHosted: Story = {
	render: () => {
		load("local");
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "API Docs" })).toBeVisible();
		await expect(canvas.queryByRole("tab", { name: "Python" })).toBeNull();
	},
};

export const Whitelabel: Story = {
	render: () => {
		load("whitelabel", "Acme Visibility", "https://visibility.acme.com/");
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Programmatic interface for Acme Visibility.")).toBeVisible();
		// Nothing on the page names the upstream vendor.
		await expect(canvas.queryByText(/elmo/i)).toBeNull();
	},
};

export const ReadOnlyDeployment: Story = {
	render: () => {
		load("demo", "Online Reset", "https://reset.example.com/", true);
		return <ApiSettingsPage />;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("API access is disabled in demo mode.")).toBeVisible();
		await expect(canvas.queryByRole("heading", { name: "SDKs" })).toBeNull();
	},
};
