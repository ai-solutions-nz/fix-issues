import { IconBrandGithub, IconScale, IconWorld } from "@tabler/icons-react";
import { useRouteContext } from "@tanstack/react-router";
import { PUBLIC_SITE_URL, PUBLIC_SOURCE_URL } from "@workspace/config/brand-links";
import { isElmoHosted, LEGAL_DOCUMENTS, legalUrl, showsLegalLinks } from "@workspace/config/legal";
import type { ClientConfig } from "@workspace/config/types";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { openCookiePreferences } from "@workspace/ui/lib/cookie-consent";

export function NavAppInfo() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;

	// Whitelabel deployments hide the version/website/github links.
	if (mode === "whitelabel") return null;

	const linkClass =
		"text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors";

	// Online Reset: the website and source links appear only once those sites
	// exist (brand-links.ts); until then the version is plain text.
	const versionClass = "flex-1 text-xs font-medium text-muted-foreground";
	return (
		<div className="mx-2 mt-1 flex items-center gap-2 border-t border-sidebar-border/60 px-1 pt-2">
			{PUBLIC_SOURCE_URL ? (
				<a
					href={`${PUBLIC_SOURCE_URL}/releases/tag/v${__APP_VERSION__}`}
					target="_blank"
					rel="noreferrer"
					className={`${versionClass} hover:text-foreground transition-colors`}
				>
					v{__APP_VERSION__}
				</a>
			) : (
				<span className={versionClass}>v{__APP_VERSION__}</span>
			)}
			<div className="flex items-center gap-1">
				{PUBLIC_SITE_URL && (
					<Tooltip>
						<TooltipTrigger render={<a href={PUBLIC_SITE_URL} target="_blank" className={linkClass} rel="noopener" />}>
							<IconWorld className="size-4" />
						</TooltipTrigger>
						<TooltipContent>{new URL(PUBLIC_SITE_URL).host}</TooltipContent>
					</Tooltip>
				)}
				{showsLegalLinks(mode) && (
					<DropdownMenu>
						<DropdownMenuTrigger className={linkClass} aria-label="Legal" title="Legal">
							<IconScale className="size-4" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" side="top" className="w-48">
							{LEGAL_DOCUMENTS.map((document) => (
								<DropdownMenuItem
									key={document.slug}
									render={<a href={legalUrl(document.slug)} target="_blank" rel="noreferrer" />}
								>
									{document.title}
								</DropdownMenuItem>
							))}
							{/* Only our hosted deployments gate anything on consent, so only they have a choice to revisit. */}
							{isElmoHosted(mode) && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={openCookiePreferences}>Cookie Preferences</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				{PUBLIC_SOURCE_URL && (
					<Tooltip>
						<TooltipTrigger
							render={<a href={PUBLIC_SOURCE_URL} target="_blank" rel="noreferrer" className={linkClass} />}
						>
							<IconBrandGithub className="size-4" />
						</TooltipTrigger>
						<TooltipContent>View source</TooltipContent>
					</Tooltip>
				)}
			</div>
		</div>
	);
}
