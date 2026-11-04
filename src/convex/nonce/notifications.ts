import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireUserId, userIdOrNull, getPrimaryWallet } from "./db";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return { notifications: [], unread: 0 };
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(40);
    return {
      notifications,
      unread: notifications.filter((entry) => entry.readAt === undefined).length,
    };
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== userId) {
      throw new Error("Notification not found.");
    }
    if (!notification.readAt) {
      await ctx.db.patch(notification._id, { readAt: Date.now() });
    }
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    for (const notification of notifications) {
      if (!notification.readAt) {
        await ctx.db.patch(notification._id, { readAt: now });
      }
    }
  },
});

export const settings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const account = await ctx.db.get(userId);
    const wallet = await getPrimaryWallet(ctx, userId);
    return {
      account,
      wallet,
      emailDeliveryConfigured: false,
    };
  },
});

export const updatePreferences = mutation({
  args: {
    displayName: v.string(),
    notifyInApp: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const displayName = args.displayName.trim().slice(0, 60);
    await ctx.db.patch(userId, {
      displayName,
      notifyInApp: args.notifyInApp,
    });
  },
});
