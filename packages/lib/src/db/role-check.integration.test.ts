/**
 * Online Reset (Packet 1c): the startup check on the app's database login.
 * CI runs the integration suites as a NOSUPERUSER, NOBYPASSRLS login whose only
 * role grant is membership of or_tenant (see BUILD-STATUS.md), and there the
 * check must pass. Run as a superuser, it must fail and say why.
 */
import { describe, expect, it } from "vitest";
import { serviceDb } from "./db";
import {
	assertTenantRoleReady,
	inspectTenantRole,
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
	});
});
