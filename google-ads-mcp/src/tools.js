const { z } = require("zod");
const { getCustomer } = require("./adsClient");

// Every write tool here requires confirm: true. This is a deliberate safety
// gate — Claude (or any caller) must pass explicit confirmation for anything
// that spends money or changes a live campaign. Read tools need no such gate.

const tools = [
  {
    name: "get_account_summary",
    description: "Overall account performance for a date range: impressions, clicks, cost, conversions, cost/conversion.",
    schema: {
      days: z.number().int().min(1).max(365).default(30).describe("Lookback window in days"),
    },
    handler: async ({ days }) => {
      const customer = getCustomer();
      const rows = await customer.query(`
        SELECT metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.conversions_value
        FROM customer
        WHERE segments.date DURING LAST_${days}_DAYS
      `);
      const totals = rows.reduce(
        (acc, r) => {
          acc.impressions += r.metrics.impressions || 0;
          acc.clicks += r.metrics.clicks || 0;
          acc.cost += (r.metrics.cost_micros || 0) / 1e6;
          acc.conversions += r.metrics.conversions || 0;
          acc.conversions_value += r.metrics.conversions_value || 0;
          return acc;
        },
        { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0 }
      );
      totals.cost_per_conversion = totals.conversions ? totals.cost / totals.conversions : null;
      return totals;
    },
  },

  {
    name: "list_campaigns",
    description: "List campaigns with status, budget, and performance over a date range.",
    schema: {
      days: z.number().int().min(1).max(365).default(30),
    },
    handler: async ({ days }) => {
      const customer = getCustomer();
      const rows = await customer.query(`
        SELECT campaign.id, campaign.name, campaign.status,
               campaign_budget.amount_micros,
               metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions
        FROM campaign
        WHERE segments.date DURING LAST_${days}_DAYS
        ORDER BY metrics.cost_micros DESC
      `);
      return rows.map((r) => ({
        id: r.campaign.id,
        name: r.campaign.name,
        status: r.campaign.status,
        daily_budget: (r.campaign_budget.amount_micros || 0) / 1e6,
        impressions: r.metrics.impressions,
        clicks: r.metrics.clicks,
        cost: (r.metrics.cost_micros || 0) / 1e6,
        conversions: r.metrics.conversions,
      }));
    },
  },

  {
    name: "get_search_terms",
    description: "Search terms that triggered ads, with cost/clicks/conversions — use to find negative-keyword candidates.",
    schema: {
      days: z.number().int().min(1).max(365).default(30),
      min_clicks: z.number().int().min(0).default(0).describe("Only return terms with at least this many clicks"),
    },
    handler: async ({ days, min_clicks }) => {
      const customer = getCustomer();
      const rows = await customer.query(`
        SELECT search_term_view.search_term, campaign.id, ad_group.id,
               metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions
        FROM search_term_view
        WHERE segments.date DURING LAST_${days}_DAYS
          AND metrics.clicks >= ${min_clicks}
        ORDER BY metrics.cost_micros DESC
        LIMIT 200
      `);
      return rows.map((r) => ({
        search_term: r.search_term_view.search_term,
        campaign_id: r.campaign.id,
        ad_group_id: r.ad_group.id,
        clicks: r.metrics.clicks,
        impressions: r.metrics.impressions,
        cost: (r.metrics.cost_micros || 0) / 1e6,
        conversions: r.metrics.conversions,
      }));
    },
  },

  {
    name: "add_negative_keyword",
    description: "Add a negative keyword to an ad group, to stop wasting spend on an irrelevant search term. Requires confirm: true.",
    schema: {
      ad_group_id: z.string().describe("The ad group to add the negative keyword to"),
      keyword_text: z.string().describe("The keyword text to exclude"),
      match_type: z.enum(["EXACT", "PHRASE", "BROAD"]).default("BROAD"),
      confirm: z.literal(true).describe("Must be true — explicit confirmation this write should execute"),
    },
    handler: async ({ ad_group_id, keyword_text, match_type }) => {
      const customer = getCustomer();
      const result = await customer.adGroupCriteria.create([
        {
          ad_group: `customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/adGroups/${ad_group_id}`,
          negative: true,
          keyword: { text: keyword_text, match_type },
        },
      ]);
      return { success: true, resource_name: result.results?.[0]?.resource_name };
    },
  },

  {
    name: "update_campaign_budget",
    description: "Change a campaign's daily budget. Requires confirm: true.",
    schema: {
      budget_resource_name: z.string().describe("campaign_budget.resource_name, from list_campaigns' underlying budget"),
      new_daily_budget_nzd: z.number().positive().describe("New daily budget in dollars (NZD)"),
      confirm: z.literal(true),
    },
    handler: async ({ budget_resource_name, new_daily_budget_nzd }) => {
      const customer = getCustomer();
      const result = await customer.campaignBudgets.update([
        { resource_name: budget_resource_name, amount_micros: Math.round(new_daily_budget_nzd * 1e6) },
      ]);
      return { success: true, resource_name: result.results?.[0]?.resource_name };
    },
  },

  {
    name: "set_campaign_status",
    description: "Pause or enable a campaign. Requires confirm: true.",
    schema: {
      campaign_resource_name: z.string().describe("campaign.resource_name, e.g. customers/123/campaigns/456"),
      status: z.enum(["PAUSED", "ENABLED"]),
      confirm: z.literal(true),
    },
    handler: async ({ campaign_resource_name, status }) => {
      const customer = getCustomer();
      const result = await customer.campaigns.update([{ resource_name: campaign_resource_name, status }]);
      return { success: true, resource_name: result.results?.[0]?.resource_name };
    },
  },

  {
    name: "set_device_bid_modifier",
    description: "Adjust bid modifier for a device (e.g. boost desktop, reduce mobile) on a campaign. Requires confirm: true.",
    schema: {
      campaign_resource_name: z.string(),
      device: z.enum(["MOBILE", "DESKTOP", "TABLET"]),
      bid_modifier: z.number().min(0.1).max(10).describe("Multiplier, e.g. 1.2 = +20%, 0.8 = -20%"),
      confirm: z.literal(true),
    },
    handler: async ({ campaign_resource_name, device, bid_modifier }) => {
      const customer = getCustomer();
      const result = await customer.campaignCriteria.create([
        { campaign: campaign_resource_name, device: { type: device }, bid_modifier },
      ]);
      return { success: true, resource_name: result.results?.[0]?.resource_name };
    },
  },
];

module.exports = { tools };
