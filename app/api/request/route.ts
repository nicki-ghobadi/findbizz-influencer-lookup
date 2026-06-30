import { NextRequest, NextResponse } from "next/server";
import { getFollowerRange } from "@/lib/follower-ranges";
import { getIndustry } from "@/lib/industries";
import { createOrder } from "@/lib/orders";
import { getErrorMessage } from "@/lib/env";
import { clientIp, enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { UserFacingError } from "@/lib/user-error";
import { emailsMatch, isValidEmail, normalizeEmail } from "@/lib/validate-email";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body.email);
    const confirmEmail = normalizeEmail(body.confirmEmail);
    const { industry, followerRange } = body;

    if (!email || !confirmEmail || !industry || !followerRange) {
      return NextResponse.json(
        { error: "Fill in industry, follower range, and both email fields." },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (!emailsMatch(email, confirmEmail)) {
      return NextResponse.json({ error: "Email addresses do not match." }, { status: 400 });
    }

    const industryOption = getIndustry(industry);
    if (!industryOption) {
      return NextResponse.json({ error: "Invalid industry." }, { status: 400 });
    }

    if (!getFollowerRange(followerRange)) {
      return NextResponse.json({ error: "Invalid follower range." }, { status: 400 });
    }

    await enforceRateLimit(`request:ip:${clientIp(req)}`, RATE_LIMITS.requestByIp);
    await enforceRateLimit(`request:email:${email}`, RATE_LIMITS.requestByEmail);

    const { orderId } = await createOrder({
      email,
      requestPayload: {
        industry,
        industryLabel: industryOption.label,
        followerRange,
      },
    });

    return NextResponse.json({ orderId, email });
  } catch (err) {
    console.error("Request error:", err);
    const status = err instanceof UserFacingError ? 429 : 500;
    return NextResponse.json(
      { error: getErrorMessage(err, "Unable to start your request. Please try again.") },
      { status }
    );
  }
}
