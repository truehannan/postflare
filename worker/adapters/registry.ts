import type { SocialPlatformAdapter } from "./types";
import { blueskyAdapter } from "./bluesky";
import { mastodonAdapter } from "./mastodon";
import { telegramAdapter } from "./telegram";
import { wordpressAdapter } from "./wordpress";
import { webhookAdapter } from "./webhook";
import {
  xAdapter,
  facebookAdapter,
  instagramAdapter,
  threadsAdapter,
  linkedinAdapter,
  tiktokAdapter,
  youtubeAdapter,
  pinterestAdapter,
  redditAdapter,
  twitchAdapter,
  googleBusinessAdapter,
  bloggerAdapter,
  snapchatAdapter,
  tumblrAdapter,
} from "./oauth-platforms";

const ADAPTERS: Record<string, SocialPlatformAdapter> = {
  bluesky: blueskyAdapter,
  mastodon: mastodonAdapter,
  telegram: telegramAdapter,
  wordpress: wordpressAdapter,
  webhook: webhookAdapter,
  x: xAdapter,
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  threads: threadsAdapter,
  linkedin: linkedinAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
  pinterest: pinterestAdapter,
  reddit: redditAdapter,
  twitch: twitchAdapter,
  "google-business": googleBusinessAdapter,
  blogger: bloggerAdapter,
  snapchat: snapchatAdapter,
  tumblr: tumblrAdapter,
};

/** Fallback adapter for platforms that are catalogued but not yet implemented. */
const NOT_IMPLEMENTED: SocialPlatformAdapter = {
  providerId: "unknown",
  displayName: "Not implemented",
  async validateCredentials() {
    return { ok: false, message: "This integration is not implemented yet." };
  },
};

export function getAdapter(providerId: string): SocialPlatformAdapter {
  return ADAPTERS[providerId] ?? { ...NOT_IMPLEMENTED, providerId };
}

export function listAdapters(): SocialPlatformAdapter[] {
  return Object.values(ADAPTERS);
}

export function hasAdapter(providerId: string): boolean {
  return providerId in ADAPTERS;
}