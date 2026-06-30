import { ApifyClient } from "apify-client";
import type { SpotCheckReport } from "./spot-check";
import { VERIFICATION_THRESHOLDS } from "./verification";

const PROFILE_ACTOR = "apify~instagram-profile-scraper";

function pickSamples<T>(items: T[], size: number): T[] {
  if (items.length <= size) return [...items];
  const copy = [...items];
  const out: T[] = [];
  while (out.length < size && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

/** Re-scrape up to 3 Instagram profiles and compare follower counts (secondary actor verification). */
export async function crossVerifyInstagramProfiles(
  profiles: { username: string; followers: number }[],
  tolerancePct = VERIFICATION_THRESHOLDS.followerTolerancePct
): Promise<SpotCheckReport> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token || profiles.length === 0) {
    return { samplesChecked: 0, passed: true, issues: [] };
  }

  const samples = pickSamples(profiles, 3);
  const client = new ApifyClient({ token });
  const issues: string[] = [];
  let matched = 0;

  for (const sample of samples) {
    try {
      const run = await client.actor(PROFILE_ACTOR).call(
        { usernames: [sample.username] },
        { waitSecs: 90 }
      );
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      const fresh = Number((items[0] as Record<string, unknown>)?.followersCount || 0);

      if (!fresh) {
        issues.push(`@${sample.username}: re-scrape returned no follower count`);
        continue;
      }

      const delta = Math.abs(fresh - sample.followers) / Math.max(sample.followers, 1);
      if (delta <= tolerancePct / 100) {
        matched += 1;
      } else {
        issues.push(
          `@${sample.username}: followers ${sample.followers} vs re-scraped ${fresh} (${Math.round(delta * 100)}% diff)`
        );
      }
    } catch (err) {
      issues.push(`@${sample.username}: re-scrape failed (${err instanceof Error ? err.message : "error"})`);
    }
  }

  const ratio = samples.length ? matched / samples.length : 1;
  return {
    samplesChecked: samples.length,
    passed: ratio >= VERIFICATION_THRESHOLDS.minCrossMatchRatio,
    issues,
    rescrapeChecked: samples.length,
    rescrapeMatched: matched,
  };
}
