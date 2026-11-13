/**
 * Online Reset (Packet 1c): the startup check on the app's database login.
 * CI runs the integration suites as a NOSUPERUSER, NOBYPASSRLS login whose only
 * role grant is membership of or_tenant (see BUILD-STATUS.md), and there the
 * check must pass. Run as a superuser, it must fail and say why.
 */
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, serviceDb } from "./db";
import {
	assertTenantRoleReady,
	inspectTenantRole,
	SERVER_ACCESS_ROLES,
	TenantRoleMisconfiguredError,
	tenantRoleProblems,
} from "./role-check";

describe("startup check of the database login", () => {
	it("passes for a non-superuser member of or_tenant, and names each problem otherwise", async () => {
		const report = await inspectTenantRole(serviceDb);
		expect(report.tenantRoleExists).toBe(true);
		expect(report.canSetTenantRole).toBe(true);
		expect(report.tenantRoleBypassRls).toBe(false);
		if (report.superuser || report.bypassRls) {
			await expect(assertTenantRoleReady(serviceDb)).rejects.toBeInstanceOf(TenantRoleMisconfiguredError);
			await expect(assertTenantRoleReady(serviceDb)).rejects.toThrow(/superuser|BYPASSRLS/);
		} else {
			await expect(assertTenantRoleReady(serviceDb)).resolves.toMatchObject({ login: report.login });
		}
	});

	it("reports each misconfiguration with the fix", () => {
		const ok = {
			login: "or_app",
			superuser: false,
			bypassRls: false,
			createRole: false,
			otherRoles: [],
			tenantRoleExists: true,
			tenantRoleBypassRls: false,
			canSetTenantRole: true,
		};
		expect(tenantRoleProblems(ok)).toEqual([]);
		expect(tenantRoleProblems({ ...ok, canSetTenantRole: false })).toEqual([
			'login "or_app" cannot SET ROLE or_tenant: run GRANT or_tenant TO "or_app"',
		]);
		expect(tenantRoleProblems({ ...ok, superuser: true }).join()).toMatch(/superuser/);
		expect(tenantRoleProblems({ ...ok, bypassRls: true }).join()).toMatch(/NOBYPASSRLS/);
		expect(tenantRoleProblems({ ...ok, tenantRoleBypassRls: true }).join()).toMatch(/or_tenant can bypass/);
		expect(tenantRoleProblems({ ...ok, tenantRoleExists: false }).join()).toMatch(/does not exist/);
		expect(tenantRoleProblems({ ...ok, createRole: true })).toEqual([
			'login "or_app" has CREATEROLE: ALTER ROLE "or_app" NOCREATEROLE',
		]);
		expect(tenantRoleProblems({ ...ok, otherRoles: ["cloudsqlsuperuser", "rds_superuser"] }).join()).toMatch(
			/member of "cloudsqlsuperuser", "rds_superuser"/,
		);
	});
});

/**
 * Real logins, created through an administrator connection. CI and the local
 * setup set TEST_ADMIN_DATABASE_URL (the postgres superuser on the same test
 * database); without it these are skipped.
 */
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
const LOGIN = "or_check_login";
const EXTRA = "or_check_rds_superuser";

describe.skipIf(!adminUrl)("startup check against real logins", () => {
	const admin = adminUrl ? createDb(adminUrl) : undefined;
	const appUrl = () => {
		const url = new URL(adminUrl as string);
		url.username = LOGIN;
		url.password = LOGIN;
		return url.toString();
	};
	async function reset() {
		await admin?.execute(sql.raw(`DROP ROLE IF EXISTS ${LOGIN}`));
		await admin?.execute(sql.raw(`DROP ROLE IF EXISTS ${EXTRA}`));
	}
	async function inspectAs() {
		const conn = createDb(appUrl());
		try {
			return await inspectTenantRole(conn);
		} finally {
			await conn.$client.end();
		}
	}
	afterAll(async () => {
		await reset();
		await admin?.$client.end();
	});

	it("passes for a login whose only grant is or_tenant", async () => {
		await reset();
		await admin?.execute(
			sql.raw(`CREATE ROLE ${LOGIN} LOGIN PASSWORD '${LOGIN}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE`),
		);
		await admin?.execute(sql.raw(`GRANT or_tenant TO ${LOGIN}`));
		const report = await inspectAs();
		expect(tenantRoleProblems(report)).toEqual([]);
	});

	it("fails a login with CREATEROLE", async () => {
		await reset();
		await admin?.execute(sql.raw(`CREATE ROLE ${LOGIN} LOGIN PASSWORD '${LOGIN}' NOSUPERUSER NOBYPASSRLS CREATEROLE`));
		await admin?.execute(sql.raw(`GRANT or_tenant TO ${LOGIN}`));
		const report = await inspectAs();
		expect(report.createRole).toBe(true);
		expect(tenantRoleProblems(report).join()).toMatch(/CREATEROLE/);
	});

	// Packet 1e (Neo, N1): an underscore is a LIKE wildcard, so the old filter
	// passed any role starting "pg" plus one character. Neo's pgsuper_x was a
	// superuser role the login could SET ROLE to, and it read every tenant.
	it("fails a login holding a superuser role whose name merely starts with pg", async () => {
		await reset();
		await admin?.execute(sql.raw("DROP ROLE IF EXISTS pgsuper_x"));
		await admin?.execute(sql.raw("CREATE ROLE pgsuper_x NOLOGIN SUPERUSER"));
		await admin?.execute(
			sql.raw(`CREATE ROLE ${LOGIN} LOGIN PASSWORD '${LOGIN}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE`),
		);
		await admin?.execute(sql.raw(`GRANT or_tenant TO ${LOGIN}`));
		await admin?.execute(sql.raw(`GRANT pgsuper_x TO ${LOGIN}`));
		try {
			const report = await inspectAs();
			expect(report.otherRoles).toEqual(["pgsuper_x"]);
			expect(tenantRoleProblems(report).join()).toMatch(/member of "pgsuper_x"/);
		} finally {
			await admin?.execute(sql.raw(`REVOKE pgsuper_x FROM ${LOGIN}`));
			await admin?.execute(sql.raw("DROP ROLE pgsuper_x"));
		}
	});

	it("fails a login holding the built-in server file or program roles, but allows other pg_* roles", async () => {
		await reset();
		await admin?.execute(
			sql.raw(`CREATE ROLE ${LOGIN} LOGIN PASSWORD '${LOGIN}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE`),
		);
		await admin?.execute(sql.raw(`GRANT or_tenant TO ${LOGIN}`));
		await admin?.execute(sql.raw(`GRANT pg_read_all_stats TO ${LOGIN}`));
		expect(tenantRoleProblems(await inspectAs())).toEqual([]);
		for (const role of SERVER_ACCESS_ROLES) {
			await admin?.execute(sql.raw(`GRANT ${role} TO ${LOGIN}`));
			const report = await inspectAs();
			expect(report.otherRoles, role).toEqual([role]);
			expect(tenantRoleProblems(report).join()).toMatch(new RegExp(`member of "${role}"`));
			await admin?.execute(sql.raw(`REVOKE ${role} FROM ${LOGIN}`));
		}
	});

	it("fails a login that also belongs to a host admin role, directly or through another role", async () => {
		await reset();
		await admin?.execute(sql.raw(`CREATE ROLE ${EXTRA} NOLOGIN`));
		await admin?.execute(
			sql.raw(`CREATE ROLE ${LOGIN} LOGIN PASSWORD '${LOGIN}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE`),
		);
		await admin?.execute(sql.raw(`GRANT or_tenant TO ${LOGIN}`));
		await admin?.execute(sql.raw(`GRANT pg_read_all_stats TO ${LOGIN}`));
		await admin?.execute(sql.raw(`GRANT ${EXTRA} TO ${LOGIN}`));
		const direct = await inspectAs();
		expect(direct.otherRoles).toEqual([EXTRA]);
		expect(tenantRoleProblems(direct).join()).toMatch(new RegExp(`member of "${EXTRA}"`));

		// Nested: the login reaches the admin role only through a middle role.
		await admin?.execute(sql.raw(`REVOKE ${EXTRA} FROM ${LOGIN}`));
		await admin?.execute(sql.raw(`DROP ROLE IF EXISTS or_check_middle`));
		await admin?.execute(sql.raw(`CREATE ROLE or_check_middle NOLOGIN`));
		await admin?.execute(sql.raw(`GRANT ${EXTRA} TO or_check_middle`));
		await admin?.execute(sql.raw(`GRANT or_check_middle TO ${LOGIN}`));
		const nested = await inspectAs();
		expect(nested.otherRoles).toEqual(["or_check_middle", EXTRA]);
		await admin?.execute(sql.raw(`DROP ROLE or_check_middle`));
	});
});
