import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const reserve = internalMutation({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    const row = await ctx.db.query("dappResearchLimits").withIndex("by_subject", q => q.eq("subject", subject)).unique();
    const now = Date.now();
    if (row && now - row.lastStartedAt < 180_000) return false;
    const today = Math.floor(now / 86_400_000);
    const count = row?.day === today ? row.count : 0;
    if (count >= 10) return false;
    if (row) await ctx.db.patch(row._id, { lastStartedAt: now, day: today, count: count + 1 });
    else await ctx.db.insert("dappResearchLimits", { subject, lastStartedAt: now, day: today, count: 1 });
    return true;
  },
});
