import { NextRequest, NextResponse } from "next/server";
import { discoverInfluencers, profilesToCSV } from "@/lib/apify";
import {
  autoFulfill,
  sendVerificationFailureEmail,
  VerificationFailedError,
} from "@/lib/auto-fulfill";
import { validateInfluencerProfiles, validationSummaryHtml } from "@/lib/fulfillment-validate";
import { formatRangeLabel, getFollowerRange } from "@/lib/follower-ranges";
import { getIndustry } from "@/lib/industries";
import { crossVerifyInstagramProfiles } from "@/lib/instagram-spot-check";
import { getErrorMessage, requireEnv } from "@/lib/env";
import { markFailed, markPaidFromSession } from "@/lib/orders";
import { escapeHtml, sanitizeFilename } from "@/lib/sanitize";
import {
  claimStripeEvent,
  getOrderForWebhook,
  shouldSkipFulfillment,
} from "@/lib/webhook-guard";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ATTEMPTS = 2;

export async function POST(req: NextRequest) {
  let orderId: string | undefined;

  try {
    const stripe = getStripe();
    requireEnv("APIFY_API_TOKEN");
    requireEnv("RESEND_API_KEY");
    requireEnv("RESEND_FROM_EMAIL");

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, requireEnv("STRIPE_WEBHOOK_SECRET"));
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object;
    orderId = session.metadata?.orderId;

    const claimed = await claimStripeEvent({
      eventId: event.id,
      eventType: event.type,
      orderId,
    });
    if (!claimed) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const existing = orderId ? await getOrderForWebhook(orderId) : null;
    const skip = shouldSkipFulfillment(existing, session.payment_status);
    if (skip) {
      return NextResponse.json({ received: true, skipped: skip });
    }

    if (orderId) {
      await markPaidFromSession(session);
    }

    const email = session.metadata?.email;
    const industryId = session.metadata?.industry;
    const followerRangeId = session.metadata?.followerRange;

    if (!email || !industryId || !followerRangeId || !orderId) {
      if (orderId) await markFailed(orderId, "Missing order metadata");
      return NextResponse.json({ received: true, error: "missing_metadata" });
    }

    const industry = getIndustry(industryId);
    const followerRange = getFollowerRange(followerRangeId);
    if (!industry || !followerRange) {
      if (orderId) await markFailed(orderId, "Invalid industry or follower range");
      return NextResponse.json({ received: true, error: "invalid_metadata" });
    }

    const rangeLabel = formatRangeLabel(followerRange);
    const safeIndustry = escapeHtml(industry.label);
    const safeRange = escapeHtml(rangeLabel);
    let lastError: VerificationFailedError | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const { profiles: rawProfiles } = await discoverInfluencers(industryId, followerRangeId);
        const { items: profiles, report } = validateInfluencerProfiles(rawProfiles, followerRange);
        const crossCheck = await crossVerifyInstagramProfiles(profiles);

        if (profiles.length === 0) {
          await autoFulfill({
            orderId,
            validationReport: report,
            crossCheckReport: crossCheck,
            fulfillment: {
              customerEmail: email,
              subject: `Instagram discovery: no creators found for ${industry.label}`,
              htmlBody: `
                <div style="font-family: sans-serif; max-width: 560px;">
                  <h2>No matching creators found</h2>
                  <p>We searched public Instagram accounts in <strong>${safeIndustry}</strong> with <strong>${safeRange}</strong> but didn't find matches this run.</p>
                  <p>Try a broader follower tier or a different niche. Reply to this email and we'll help.</p>
                </div>
              `,
              rowCount: 0,
              noResults: true,
            },
          });
          lastError = null;
          break;
        }

        const csv = profilesToCSV(profiles, {
          industryLabel: industry.label,
          rangeLabel,
        });

        const topPreview = profiles
          .slice(0, 5)
          .map(
            (p) =>
              `<tr><td style="padding:6px;border:1px solid #eee;">@${escapeHtml(p.username)}</td><td style="padding:6px;border:1px solid #eee;">${p.followers.toLocaleString()}</td><td style="padding:6px;border:1px solid #eee;">${escapeHtml(p.fullName || "—")}</td></tr>`
          )
          .join("");

        await autoFulfill({
          orderId,
          validationReport: report,
          crossCheckReport: crossCheck,
          aiSamples: profiles.slice(0, 8) as unknown as Record<string, unknown>[],
          fulfillment: {
            customerEmail: email,
            subject: `${profiles.length} ${industry.label} creators (${rangeLabel})`,
            htmlBody: `
              <div style="font-family: sans-serif; max-width: 560px;">
                <h2>Your Instagram creator list is ready</h2>
                <p>We found <strong>${profiles.length}</strong> public accounts in <strong>${safeIndustry}</strong> with <strong>${safeRange}</strong>.</p>
                <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
                  <tr style="background:#f5f5f5;">
                    <th style="text-align:left;padding:8px;border:1px solid #ddd;">Username</th>
                    <th style="text-align:left;padding:8px;border:1px solid #ddd;">Followers</th>
                    <th style="text-align:left;padding:8px;border:1px solid #ddd;">Name</th>
                  </tr>
                  ${topPreview}
                </table>
                <p style="font-size:12px;color:#888;">Full CSV attached with bios, profile URLs, categories, and engagement stats where available.</p>
                ${validationSummaryHtml(report)}
              </div>
            `,
            csvFilename: sanitizeFilename(`instagram-${industry.id}-${followerRangeId}.csv`),
            csvContent: csv,
            rowCount: profiles.length,
          },
        });
        lastError = null;
        break;
      } catch (err) {
        if (err instanceof VerificationFailedError) {
          lastError = err;
          console.warn(`Instagram verification attempt ${attempt + 1} failed:`, err.reasons);
          continue;
        }
        throw err;
      }
    }

    if (lastError) {
      await sendVerificationFailureEmail({
        customerEmail: email,
        productLabel: "Influencer Lookup",
      });
      await markFailed(orderId, lastError.message);
      return NextResponse.json({ received: true, failed: true });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Influencer discovery error:", err);
    if (orderId) {
      await markFailed(orderId, getErrorMessage(err, "Discovery failed")).catch(() => {});
    }
    return NextResponse.json({ received: true, error: "internal" });
  }
}
