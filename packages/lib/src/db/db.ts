import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import * as orSchema from "./schema-or";

export const fullSchema = { ...schema, ...orSchema };

export function createDb(url: string) {
	return drizzle({
		connection: {
			connectionString: url,
			connectionTimeoutMillis: 15_000,
			idleTimeoutMillis: 5_000,
		},
		schema: fullSchema,
	});
}

export type Db = ReturnType<typeof createDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Online Reset: while `withTenant` (./tenant.ts) runs, the shared `db` handle
 * resolves to that tenant's transaction, which runs as the RLS-restricted
 * `or_tenant` role. Code that imports `db` therefore gets database-enforced
 * isolation without being rewritten.
 */
export const tenantContext = new AsyncLocalStorage<{
	tx: Tx;
	organizationId: string;
	organizationIds: string[];
	brandIds?: string[];
	/** Set when the transaction has ended. Work still running in its async context must not reuse the connection. */
	closed: boolean;
}>();

export class TenantTransactionClosedError extends Error {
	constructor() {
		super("The tenant transaction for this request has ended; its database handle can no longer be used");
		this.name = "TenantTransactionClosedError";
	}
}

const baseDb = createDb(process.env.DATABASE_URL!);

/** The connection-owning handle, never redirected to a tenant transaction. System jobs only. */
export const serviceDb: Db = baseDb;

export const db: Db = new Proxy(baseDb, {
	get(target, property, receiver) {
		const scope = tenantContext.getStore();
		// The transaction's connection is back in the pool and may be serving another tenant.
		if (scope?.closed) throw new TenantTransactionClosedError();
		const source = (scope ? scope.tx : target) as object;
		const value = Reflect.get(source, property, scope ? source : receiver);
		return typeof value === "function" ? value.bind(source) : value;
	},
});
