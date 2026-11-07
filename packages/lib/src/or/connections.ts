import { eq } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { orCmsConnections } from "../db/schema-or";
import { decryptSecret, encryptSecret, getKeyring } from "../secrets/crypto";
import { shopifyTarget } from "./publishing/shopify";
import type { PublishTarget } from "./publishing/types";
import { wordpressTarget } from "./publishing/wordpress";

const aad = (id: string) => `or-cms:${id}`;

function keyring() {
	const ring = getKeyring();
	if (!ring) throw new Error("ELMO_ENCRYPTION_KEY must be set to store CMS credentials");
	return ring;
}

export interface NewCmsConnection {
	brandId: string;
	kind: "wordpress" | "shopify";
	label: string;
	baseUrl: string;
	username?: string;
	/** WordPress application password or Shopify Admin API access token. Stored encrypted only. */
	secret: string;
	publishStatus?: "publish" | "draft";
}

export async function createCmsConnection(conn: DbConnection, input: NewCmsConnection): Promise<string> {
	const id = crypto.randomUUID();
	const encryptedSecret = await encryptSecret(input.secret, { key: keyring().primary, aad: aad(id) });
	await conn.insert(orCmsConnections).values({
		id,
		brandId: input.brandId,
		kind: input.kind,
		label: input.label,
		baseUrl: input.baseUrl,
		username: input.username ?? null,
		encryptedSecret,
		publishStatus: input.publishStatus ?? "draft",
	});
	return id;
}

/** The connection's publish target, with its credential decrypted only in memory. */
export async function publishTargetFor(
	conn: DbConnection,
	connectionId: string,
	fetchImpl?: typeof fetch,
): Promise<PublishTarget> {
	const [row] = await conn.select().from(orCmsConnections).where(eq(orCmsConnections.id, connectionId)).limit(1);
	if (!row) throw new Error("CMS connection not found");
	const secret = await decryptSecret(row.encryptedSecret, { keyring: keyring(), aad: aad(row.id) });
	if (row.kind === "wordpress") {
		return wordpressTarget({
			siteUrl: row.baseUrl,
			username: row.username ?? "",
			appPassword: secret,
			status: row.publishStatus,
			...(fetchImpl ? { fetchImpl } : {}),
		});
	}
	return shopifyTarget({
		shopUrl: row.baseUrl,
		accessToken: secret,
		status: row.publishStatus,
		...(fetchImpl ? { fetchImpl } : {}),
	});
}
