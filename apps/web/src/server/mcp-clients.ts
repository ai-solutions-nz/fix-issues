import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession } from "@/lib/auth/helpers";
import type { McpClientSummary } from "@/lib/mcp/client-summary";
import { findMcpClientSummary } from "./signed-in-core";

export const getMcpClientFn = createServerFn({ method: "GET" })
	.validator(z.object({ clientId: z.string().min(1) }))
	.handler(async ({ data }): Promise<McpClientSummary | null> => {
		// Otherwise this is a directory of every client registered against the
		// instance.
		await requireAuthSession();

		return findMcpClientSummary(data.clientId);
	});
