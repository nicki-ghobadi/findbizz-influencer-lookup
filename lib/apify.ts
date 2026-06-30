import { ApifyClient } from "apify-client";
import { getIndustry, type IndustryOption } from "./industries";
import { countInRange, getFollowerRange, type NumericRange } from "./follower-ranges";

export interface InfluencerProfile {
  username: string;
  fullName: string;
  bio: string;
  followers: number;
  following: number;
  posts: number;
  isVerified: boolean;
  profileUrl: string;
  externalUrl: string;
  category: string;
  engagementRate?: string;
  avgLikes?: number;
  avgComments?: number;
  source: string;
}

const PRIMARY_ACTOR = "apify~instagram-scraper";
const BOOST_ACTOR = "coregent~instagram-creator-leads-scraper";

function engagementFromPosts(
  followers: number,
  recentPosts: Record<string, unknown>[]
): { avgLikes?: number; avgComments?: number; engagementRate?: string } {
  if (!recentPosts.length || followers <= 0) return {};

  const avgLikes = Math.round(
    recentPosts.reduce((sum, post) => sum + Number(post.likesCount || 0), 0) /
      recentPosts.length
  );
  const avgComments = Math.round(
    recentPosts.reduce((sum, post) => sum + Number(post.commentsCount || 0), 0) /
      recentPosts.length
  );
  const engagementRate = (((avgLikes + avgComments) / followers) * 100).toFixed(2) + "%";

  return { avgLikes, avgComments, engagementRate };
}

function mapApifyProfile(item: Record<string, unknown>, source: string): InfluencerProfile | null {
  const username = String(item.username || "").trim();
  if (!username) return null;

  const followers = Number(item.followersCount || 0);
  const recentPosts = (item.latestPosts as Record<string, unknown>[]) || [];
  const engagement = engagementFromPosts(followers, recentPosts);

  return {
    username,
    fullName: String(item.fullName || ""),
    bio: String(item.biography || ""),
    followers,
    following: Number(item.followsCount || 0),
    posts: Number(item.postsCount || 0),
    isVerified: Boolean(item.verified),
    profileUrl: `https://instagram.com/${username}`,
    externalUrl: String(item.externalUrl || ""),
    category: String(item.businessCategoryName || "Creator"),
    source,
    ...engagement,
  };
}

function mapCoregentProfile(item: Record<string, unknown>): InfluencerProfile | null {
  const username = String(item.username || "").trim();
  if (!username) return null;

  return {
    username,
    fullName: String(item.fullName || ""),
    bio: String(item.biography || ""),
    followers: Number(item.followersCount || 0),
    following: Number(item.followsCount || 0),
    posts: Number(item.postsCount || 0),
    isVerified: Boolean(item.isVerified),
    profileUrl: String(item.profileUrl || `https://instagram.com/${username}`),
    externalUrl: String(item.externalUrl || ""),
    category: String(item.categoryName || "Creator"),
    source: String(item.sourceType || "hashtag"),
  };
}

async function scrapeUserSearch(
  client: ApifyClient,
  searchQuery: string,
  searchLimit: number
): Promise<InfluencerProfile[]> {
  const actorId = process.env.APIFY_ACTOR_ID || PRIMARY_ACTOR;
  const run = await client.actor(actorId).call({
    searchType: "user",
    search: searchQuery,
    resultsType: "details",
    searchLimit,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return (items as Record<string, unknown>[])
    .filter((item) => !item.error)
    .map((item) => mapApifyProfile(item, "user_search"))
    .filter((p): p is InfluencerProfile => p !== null);
}

async function scrapeHashtagBoost(
  client: ApifyClient,
  industry: IndustryOption,
  maxProfiles: number
): Promise<InfluencerProfile[]> {
  const boostActor = process.env.APIFY_BOOST_ACTOR_ID || BOOST_ACTOR;

  const run = await client.actor(boostActor).call({
    searchTerms: [industry.searchQuery],
    hashtags: industry.hashtags.slice(0, 3),
    maxProfilesPerInput: maxProfiles,
    deduplicateProfiles: true,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return (items as Record<string, unknown>[])
    .filter((item) => !item.error)
    .map(mapCoregentProfile)
    .filter((p): p is InfluencerProfile => p !== null);
}

export async function discoverInfluencers(
  industryId: string,
  followerRangeId: string
): Promise<{ profiles: InfluencerProfile[]; industry: IndustryOption; range: NumericRange }> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("Missing APIFY_API_TOKEN");

  const industry = getIndustry(industryId);
  const range = getFollowerRange(followerRangeId);
  if (!industry) throw new Error("Invalid industry");
  if (!range) throw new Error("Invalid follower range");

  const client = new ApifyClient({ token });
  const byUsername = new Map<string, InfluencerProfile>();

  const userResults = await scrapeUserSearch(client, industry.searchQuery, 80);
  for (const profile of userResults) {
    byUsername.set(profile.username.toLowerCase(), profile);
  }

  if (byUsername.size < 25) {
    const boostResults = await scrapeHashtagBoost(client, industry, 60);
    for (const profile of boostResults) {
      const key = profile.username.toLowerCase();
      if (!byUsername.has(key)) byUsername.set(key, profile);
    }
  }

  const profiles = Array.from(byUsername.values())
    .filter((p) => countInRange(p.followers, range))
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 100);

  return { profiles, industry, range };
}

import { sanitizeCsvCell } from "./sanitize";

export function profilesToCSV(
  profiles: InfluencerProfile[],
  options: { industryLabel: string; rangeLabel: string }
): string {
  const header = [
    "Username",
    "Full Name",
    "Followers",
    "Following",
    "Posts",
    "Verified",
    "Category",
    "Bio",
    "Profile URL",
    "External URL",
    "Est. Engagement Rate",
    "Avg Likes",
    "Avg Comments",
    "Source",
    "Industry",
    "Target Follower Range",
  ];

  const rows = profiles.map((p) => [
    sanitizeCsvCell(p.username),
    sanitizeCsvCell(p.fullName),
    String(p.followers),
    String(p.following),
    String(p.posts),
    p.isVerified ? "Yes" : "No",
    sanitizeCsvCell(p.category),
    sanitizeCsvCell(p.bio.replace(/\n/g, " ")),
    sanitizeCsvCell(p.profileUrl),
    sanitizeCsvCell(p.externalUrl),
    sanitizeCsvCell(p.engagementRate || "N/A"),
    p.avgLikes !== undefined ? String(p.avgLikes) : "N/A",
    p.avgComments !== undefined ? String(p.avgComments) : "N/A",
    sanitizeCsvCell(p.source),
    sanitizeCsvCell(options.industryLabel),
    sanitizeCsvCell(options.rangeLabel),
  ]);

  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
