import { type GeoTarget, NZ_CITIES, NZ_TIMEZONE } from "@workspace/or-core/geo";
import { type CollectionMethod, deriveCollectionMethod, METHODOLOGY_VERSION } from "@workspace/or-core/measurement";
import { eq } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { orBrandProfiles } from "../db/schema-or";
import { resolveProviderAccess } from "../providers";
import type { ModelConfig, ScrapeResult } from "../providers/types";

/** The location a brand's questions are asked from, from its profile; null when none is set. */
export async function brandGeoTarget(conn: DbConnection, brandId: string): Promise<GeoTarget | null> {
	const [profile] = await conn
		.select({ country: orBrandProfiles.country, region: orBrandProfiles.region, city: orBrandProfiles.city })
		.from(orBrandProfiles)
		.where(eq(orBrandProfiles.brandId, brandId))
		.limit(1);
	if (!profile) return null;
	return geoFromProfile(profile);
}

export function geoFromProfile(profile: { country: string; region: string | null; city: string | null }): GeoTarget {
	const nz =
		profile.country === "NZ" ? NZ_CITIES.find((c) => c.city.toLowerCase() === profile.city?.toLowerCase()) : undefined;
	return {
		country: profile.country,
		...(profile.region || nz ? { region: profile.region ?? nz?.region } : {}),
		...(profile.city ? { city: nz?.city ?? profile.city } : {}),
		...(profile.country === "NZ" ? { timezone: NZ_TIMEZONE } : {}),
	};
}

export interface RunEvidence {
	collectionMethod: CollectionMethod;
	locationRequested: GeoTarget | null;
	locationApplied: "native" | "prompt_text" | "none" | null;
	methodologyVersion: string;
}

/** The evidence columns stored with every prompt run. */
export function runEvidence(
	config: ModelConfig,
	result: Pick<ScrapeResult, "locationApplied">,
	location: GeoTarget | null,
): RunEvidence {
	return {
		collectionMethod: deriveCollectionMethod({
			providerId: config.provider,
			access: resolveProviderAccess(config),
			webSearch: config.webSearch,
		}),
		locationRequested: location,
		locationApplied: location ? (result.locationApplied ?? "none") : null,
		methodologyVersion: METHODOLOGY_VERSION,
	};
}
