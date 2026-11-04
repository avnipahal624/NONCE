import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { audit, notify, requireVaultOwner, userIdOrNull, getVaultForUser } from "./db";
import { sha256Hex } from "./hash";
import { canonicalJson } from "./shared";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return [];
    const vault = await getVaultForUser(ctx, userId);
    if (!vault) return [];
    const incidents = await ctx.db
      .query("incidents")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .order("desc")
      .take(50);
    return await Promise.all(
      incidents.map(async (incident) => {
        const lockdowns = await ctx.db
          .query("lockdownRequests")
          .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
          .collect();
        const evidence = await ctx.db
          .query("incidentEvidence")
          .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
          .collect();
        const decoy = incident.affectedDecoyId
          ? await ctx.db.get(incident.affectedDecoyId)
          : null;
        return {
          ...incident,
          decoyLabel: decoy?.label ?? null,
          decoyAddress: decoy?.address ?? null,
          evidenceCount: evidence.length,
          lockdownRequests: lockdowns.sort((a, b) => b.requestedAt - a.requestedAt),
        };
      }),
    );
  },
});

export const detail = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const userId = await userIdOrNull(ctx);
    if (!userId) return null;
    const vault = await getVaultForUser(ctx, userId);
    if (!vault) return null;
    const incident = await ctx.db.get(args.incidentId);
    if (!incident || incident.vaultId !== vault._id) return null;

    const evidence = await ctx.db
      .query("incidentEvidence")
      .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
      .collect();
    const signals = await ctx.db
      .query("threatSignals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const relatedSignals = await Promise.all(
      signals
        .filter((signal) => incident.eventIds.includes(signal.eventId))
        .map(async (signal) => {
          const event = await ctx.db.get(signal.eventId);
          return { signal, event };
        }),
    );
    const assessments = await ctx.db
      .query("threatAssessments")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const lockdowns = await ctx.db
      .query("lockdownRequests")
      .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
      .collect();
    const decoy = incident.affectedDecoyId
      ? await ctx.db.get(incident.affectedDecoyId)
      : null;
    const proposals = await ctx.db
      .query("recoveryProposals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    const proposal =
      proposals.find((entry) => entry.incidentId === incident._id) ?? null;

    return {
      incident,
      decoy,
      evidence: evidence.sort((a, b) => b.observedAt - a.observedAt),
      signals: relatedSignals,
      assessments: assessments
        .filter((entry) =>
          incident.eventIds.some((id) => id === entry.eventId),
        )
        .sort((a, b) => b.createdAt - a.createdAt),
      lockdownRequests: lockdowns.sort((a, b) => b.requestedAt - a.requestedAt),
      recoveryProposal: proposal,
      vaultState: vault.state,
      vaultMode: vault.mode,
    };
  },
});

export const acknowledge = mutation({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident) throw new Error("Incident not found.");
    const { userId, vault } = await requireVaultOwner(ctx, incident.vaultId);
    if (incident.acknowledgedAt) return;
    await ctx.db.patch(incident._id, { acknowledgedAt: Date.now() });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "INCIDENT_ACKNOWLEDGED",
      detail: `Owner acknowledged incident ${incident.reference}.`,
    });
  },
});

/**
 * False-positive review is only allowed while the vault is not locked down.
 * Restoring a locked vault requires guardian recovery, never a review click.
 */
export const markFalsePositive = mutation({
  args: { incidentId: v.id("incidents"), note: v.string() },
  handler: async (ctx, args) => {
    const incident = await ctx.db.get(args.incidentId);
    if (!incident) throw new Error("Incident not found.");
    const { userId, vault } = await requireVaultOwner(ctx, incident.vaultId);
    if (["RESOLVED", "FALSE_POSITIVE"].includes(incident.status)) {
      throw new Error("This incident is already closed.");
    }
    if (vault.state === "LOCKDOWN" || vault.state === "RECOVERY") {
      throw new Error(
        "A locked vault cannot be released by a review action. Complete guardian recovery first.",
      );
    }
    const lockdowns = await ctx.db
      .query("lockdownRequests")
      .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
      .collect();
    if (lockdowns.some((request) => request.status === "CONFIRMED")) {
      throw new Error("A confirmed lockdown cannot be dismissed as a false positive.");
    }
    const note = args.note.trim().slice(0, 400);
    if (note.length < 10) {
      throw new Error("Add a short review note explaining why this was benign.");
    }
    await ctx.db.patch(incident._id, {
      status: "FALSE_POSITIVE",
      falsePositive: true,
      closedAt: Date.now(),
      resolutionNote: note,
      responseStatus: "Reviewed by owner as a false positive.",
    });
    const signals = await ctx.db
      .query("threatSignals")
      .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
      .collect();
    for (const signal of signals) {
      if (incident.eventIds.includes(signal.eventId)) {
        await ctx.db.patch(signal._id, { detectionState: "RESOLVED" });
      }
    }
    const decoy = incident.affectedDecoyId
      ? await ctx.db.get(incident.affectedDecoyId)
      : null;
    if (decoy) await ctx.db.patch(decoy._id, { riskLevel: "LOW" });
    await audit(ctx, {
      userId,
      vaultId: vault._id,
      action: "INCIDENT_FALSE_POSITIVE",
      detail: `Incident ${incident.reference} reviewed as benign: ${note} Evidence hash ${sha256Hex(
        canonicalJson({ reference: incident.reference, note }),
      ).slice(0, 16)}…`,
    });
    await notify(ctx, {
      userId,
      vaultId: vault._id,
      category: "incident_reviewed",
      title: "Incident marked benign",
      body: "The alert was reviewed and closed without changing vault permissions.",
      severity: "SUCCESS",
    });
  },
});
