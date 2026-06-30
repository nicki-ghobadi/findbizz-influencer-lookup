"use client";

import { useState } from "react";
import { EmailVerifyStep } from "@/components/email-verify-step";
import { LandingShell } from "@/components/landing-shell";
import {
  ErrorBox,
  FieldInput,
  FieldSelect,
  FormHint,
  Label,
  PreviewBox,
  SubmitButton,
} from "@/components/form-ui";
import { INDUSTRIES } from "@/lib/industries";
import { features, hero, theme } from "@/lib/theme";
import { FOLLOWER_RANGES } from "@/lib/follower-ranges";

export default function Home() {
  const [industry, setIndustry] = useState("");
  const [followerRange, setFollowerRange] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [step, setStep] = useState<"form" | "verify">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedIndustry = INDUSTRIES.find((i) => i.id === industry);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!industry || !followerRange || !email || !confirmEmail) {
      setError("Select an industry, follower range, and both email fields.");
      return;
    }
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      setError("Email addresses do not match.");
      return;
    }
    setError("");
    setLoading(true);

    const res = await fetch("/api/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, confirmEmail, industry, followerRange }),
    });

    const data = await res.json();
    if (data.orderId) {
      setOrderId(data.orderId);
      setStep("verify");
      setLoading(false);
      return;
    }

    setError(data.error || "Something went wrong. Please try again.");
    setLoading(false);
  }

  return (
    <LandingShell
      productName={theme.productName}
      footer={theme.footer}
      accent={theme.accent}
      accentSoft={theme.accentSoft}
      accentBorder={theme.accentBorder}
      glow={theme.glow}
      badge={hero.badge}
      headline={hero.headline}
      accentIndex={hero.accentIndex}
      description={hero.description}
      price={hero.price}
      featuresTitle={features.title}
      features={features.items}
      trustItems={hero.trustItems}
    >
      {step === "verify" ? (
        <EmailVerifyStep
          theme={theme}
          email={email}
          orderId={orderId}
          checkoutPath="/api/checkout"
          submitLabel="Continue to payment — $19 CAD"
          onBack={() => {
            setStep("form");
            setOrderId("");
          }}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>Industry / niche</Label>
            <FieldSelect
              theme={theme}
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            >
              <option value="" disabled>
                Select an industry…
              </option>
              {INDUSTRIES.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </FieldSelect>
          </div>

          <div>
            <Label>Follower range</Label>
            <FieldSelect
              theme={theme}
              value={followerRange}
              onChange={(e) => setFollowerRange(e.target.value)}
            >
              <option value="" disabled>
                Select follower range…
              </option>
              {FOLLOWER_RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </FieldSelect>
          </div>

          <div>
            <Label>Your email</Label>
            <FieldInput
              theme={theme}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div>
            <Label>Confirm email</Label>
            <FieldInput
              theme={theme}
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          {selectedIndustry && followerRange && (
            <PreviewBox>
              {selectedIndustry.label} creators ·{" "}
              {FOLLOWER_RANGES.find((r) => r.id === followerRange)?.label} followers
            </PreviewBox>
          )}

          {error && <ErrorBox message={error} />}

          <SubmitButton theme={theme} loading={loading} gradient={theme.gradient}>
            {loading ? "Sending verification code…" : "Verify email & continue — $19 CAD"}
          </SubmitButton>

          <FormHint>{hero.delivery}</FormHint>
        </form>
      )}
    </LandingShell>
  );
}
