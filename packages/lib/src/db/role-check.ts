/**
 * Online Reset (Packet 1c): the web app's isolation depends on how its database
 * login is set up, so the server checks it at startup and refuses to serve when
 * it is wrong:
 * - the login must be able to `SET ROLE or_tenant` (membership with SET), or
 *   every tenant request fails;
 * - the login must not be a superuser, and must not have BYPASSRLS, so that a
 *   mistake that skips `withTenant` cannot read across tenants silently through
 *   a privileged connection;
 * - `or_tenant` itself must not have BYPASSRLS or be a superuser;
 * - (Packet 1d) the login must not have CREATEROLE, and must not be a member
 *   of any role other than or_tenant and the built-in pg_* roles. Managed
 *   hosts grant their own admin roles (rds_superuser, cloudsqlsuperuser,
 *   azure_pg_admin) that bypass these checks in other ways.
 * The login should own the tables (it runs the migrations): an owner is exempt
 * from row-level security without FORCE, which is what the system handle
 * (`serviceDb`) relies on.
 */
import { sql } from "drizzle-orm";
import { type Db, serviceDb } from "./db";

export interface TenantRoleReport {
	login: string;
	superuser: boolean;
	bypassRls: boolean;
	createRole: boolean;
	/** Roles the login belongs to, directly or through other roles, other than or_tenant and pg_*. */
	otherRoles: string[];
	tenantRoleExists: boolean;
	tenantRoleBypassRls: boolean;
	canSetTenantRole: boolean;
}

export class TenantRoleMisconfiguredError extends Error {
	constructor(public readonly problems: string[]) {
		super(
			`Database login is not safe for tenant isolation:\n- ${problems.join("\n- ")}\n` +
				'See BUILD-STATUS.md, "Database login for tenant isolation".',
		);
		this.name = "TenantRoleMisconfiguredError";
	}
}

export async function inspectTenantRole(conn: Db = serviceDb): Promise<TenantRoleReport> {
	const result = await conn.execute(sql`
		select current_user::text as login,
			l.rolsuper as superuser,
			l.rolbypassrls as bypass_rls,
			l.rolcreaterole as create_role,
			t.oid is not null as tenant_exists,
			coalesce(t.rolbypassrls or t.rolsuper, false) as tenant_bypass
		from pg_roles l
		left join pg_roles t on t.rolname = 'or_tenant'
		where l.rolname = current_user`);
	const row = result.rows[0] as {
		login: string;
		superuser: boolean;
		bypass_rls: boolean;
		create_role: boolean;
		tenant_exists: boolean;
		tenant_bypass: boolean;
	};
	// Actual grants, followed through nested roles (pg_has_role would answer
	// true for every role when the login is a superuser).
	const memberships = await conn.execute(sql`
		with recursive granted(oid) as (
			select m.roleid from pg_auth_members m join pg_roles l on l.oid = m.member where l.rolname = current_user
			union
			select m.roleid from pg_auth_members m join granted g on m.member = g.oid
		)
		select r.rolname::text as name from granted g join pg_roles r on r.oid = g.oid
		where r.rolname <> 'or_tenant' and r.rolname not like 'pg\_%'
		order by r.rolname`);
	const otherRoles = (memberships.rows as Array<{ name: string }>).map((m) => m.name);
	let canSetTenantRole = false;
	if (row.tenant_exists) {
		// The definitive test: membership alone is not enough on Postgres 16+ (SET option).
		// Thrown after a successful SET ROLE so the trial transaction rolls back.
		const succeeded = new Error("or_tenant role check: rollback");
		canSetTenantRole = await conn
			.transaction(async (tx) => {
				await tx.execute(sql`set local role or_tenant`);
				throw succeeded;
			})
			.then(
				() => false,
				(error: unknown) => error === succeeded,
			);
	}
	return {
		login: row.login,
		superuser: row.superuser,
		bypassRls: row.bypass_rls,
		createRole: row.create_role,
		otherRoles,
		tenantRoleExists: row.tenant_exists,
		tenantRoleBypassRls: row.tenant_bypass,
		canSetTenantRole,
	};
}

export function tenantRoleProblems(report: TenantRoleReport): string[] {
	const problems: string[] = [];
	if (!report.tenantRoleExists) problems.push("role or_tenant does not exist (run the migrations)");
	else if (!report.canSetTenantRole)
		problems.push(`login "${report.login}" cannot SET ROLE or_tenant: run GRANT or_tenant TO "${report.login}"`);
	if (report.superuser) problems.push(`login "${report.login}" is a superuser: use a NOSUPERUSER login`);
	if (report.bypassRls)
		problems.push(`login "${report.login}" has BYPASSRLS: ALTER ROLE "${report.login}" NOBYPASSRLS`);
	if (report.createRole)
		problems.push(`login "${report.login}" has CREATEROLE: ALTER ROLE "${report.login}" NOCREATEROLE`);
	if (report.otherRoles.length > 0) {
		problems.push(
			`login "${report.login}" is a member of ${report.otherRoles.map((r) => `"${r}"`).join(", ")}: ` +
				"the app login may belong only to or_tenant (and built-in pg_* roles); REVOKE the others",
		);
	}
	if (report.tenantRoleBypassRls)
		problems.push("role or_tenant can bypass row-level security: ALTER ROLE or_tenant NOBYPASSRLS NOSUPERUSER");
	return problems;
}

/** Throws TenantRoleMisconfiguredError listing every problem found. */
export async function assertTenantRoleReady(conn: Db = serviceDb): Promise<TenantRoleReport> {
	const report = await inspectTenantRole(conn);
	const problems = tenantRoleProblems(report);
	if (problems.length > 0) throw new TenantRoleMisconfiguredError(problems);
	return report;
}
