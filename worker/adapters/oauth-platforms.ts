import type { SocialPlatformAdapter, AdapterCredentials, AccountProfile, PublishResult } from "./types";
import { redactError } from "./types";
import { buildAuthorizationUrl, exchangeCode, refreshToken, notImplementedPublish, base64UrlSha256 } from "./oauth/helpers";

/**
 * OAuth 2.0-based platform adapters.
 *
 * These implement the full authorization-code + PKCE flow and account profile
 * retrieval. Publishing is implemented for the platforms whose endpoints are
 * stable and well documented (X, Facebook Pages, LinkedIn, Instagram); the
 * remaining OAuth platforms expose a truthful `not_implemented` result rather
 * than a fake success, and are completed in later phases.
 */

interface OAuthAdapterConfig {
  providerId: string;
  displayName: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string;
  pkce?: boolean;
  clientSecretRequired?: boolean;
  /** Return the account profile from the given token. */
  profile?: (credentials: AdapterCredentials) => Promise<AccountProfile>;
  /** Custom publish implementation. */
  publish?: (credentials: AdapterCredentials, input: Parameters<NonNullable<SocialPlatformAdapter["publishPost"]>>[1]) => Promise<PublishResult>;
}

function makeOAuthAdapter(config: OAuthAdapterConfig): SocialPlatformAdapter {
  return {
    providerId: config.providerId,
    displayName: config.displayName,

    async getAuthorizationUrl(params) {
      let codeChallenge: string | undefined;
      if (config.pkce && params.codeVerifier) {
        codeChallenge = await base64UrlSha256(params.codeVerifier);
      }
      return buildAuthorizationUrl(config.authorizationUrl, {
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        scopes: params.scopes || config.scopes,
        state: params.state,
        codeChallenge,
      });
    },

    async exchangeAuthorizationCode(params) {
      return exchangeCode(config.tokenUrl, params);
    },

    async refreshAccessToken(params) {
      return refreshToken(config.tokenUrl, params);
    },

    getAccountProfile: config.profile,

    publishPost: config.publish ?? notImplementedPublish(`Publishing to ${config.displayName}`),
  };
}

// ---------------------------------------------------------------------------
// X / Twitter
// ---------------------------------------------------------------------------

export const xAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "x",
  displayName: "X / Twitter",
  authorizationUrl: "https://x.com/i/oauth2/authorize",
  tokenUrl: "https://api.x.com/2/oauth2/token",
  scopes: "tweet.read tweet.write users.read offline.access",
  pkce: true,

  async profile(credentials) {
    const res = await fetch("https://api.x.com/2/users/me?user.fields=name,username,profile_image_url", {
      headers: { authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) throw new Error(`Could not load X profile: HTTP ${res.status}`);
    const j = (await res.json()) as { data: { id: string; name: string; username: string; profile_image_url?: string } };
    return {
      accountName: j.data.name,
      username: j.data.username,
      avatarUrl: j.data.profile_image_url,
      externalId: j.data.id,
    };
  },

  async publish(credentials, input) {
    try {
      let mediaIds: string[] = [];
      if (input.mediaUrls?.length) {
        mediaIds = await uploadXMedia(credentials.accessToken, input.mediaUrls.slice(0, 4));
      }
      const body: Record<string, unknown> = { text: input.text };
      if (mediaIds.length) body.media = { media_ids: mediaIds };
      const res = await fetch("https://api.x.com/2/tweets", {
        method: "POST",
        headers: {
          authorization: `Bearer ${credentials.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { data?: { id: string }; errors?: { message?: string }[] };
      if (!res.ok) {
        return { ok: false, error: redactError(j.errors?.[0]?.message ?? `HTTP ${res.status}`), errorCode: "publish_failed", retryable: res.status >= 500 };
      }
      return { ok: true, remoteId: j.data?.id, responseSummary: "tweet:created" };
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
    }
  },
});

async function uploadXMedia(token: string, urls: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const url of urls) {
    const fileRes = await fetch(url);
    if (!fileRes.ok) throw new Error(`Could not fetch media: HTTP ${fileRes.status}`);
    const form = new FormData();
    form.append("media", new Blob([await fileRes.arrayBuffer()], { type: fileRes.headers.get("content-type") ?? "application/octet-stream" }), "media");
    const up = await fetch("https://upload.x.com/1.1/media/upload.json", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    const upj = (await up.json()) as { media_id_string?: string; error?: string };
    if (!up.ok) throw new Error(upj.error ?? `Media upload failed: HTTP ${up.status}`);
    ids.push(upj.media_id_string!);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Facebook Pages
// ---------------------------------------------------------------------------

export const facebookAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "facebook",
  displayName: "Facebook",
  authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
  tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
  scopes: "pages_show_list pages_read_engagement pages_manage_posts pages_manage_metadata business_management",
  pkce: true,

  async profile(credentials) {
    const token = credentials.pageAccessToken || credentials.accessToken;
    const res = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,picture`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Could not load Facebook profile: HTTP ${res.status}`);
    const j = (await res.json()) as { id: string; name: string; picture?: { data?: { url?: string } } };
    return { accountName: j.name, username: j.name, avatarUrl: j.picture?.data?.url, externalId: j.id };
  },

  async publish(credentials, input) {
    try {
      const pageToken = credentials.pageAccessToken || credentials.accessToken;
      const pageId = credentials.pageId;
      if (!pageId) {
        return { ok: false, error: "No Facebook Page ID configured. Add a 'pageId' credential.", errorCode: "missing_page_id", retryable: false };
      }
      const params = new URLSearchParams({ message: input.text });
      if (input.link) params.set("link", input.link);
      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed?${params.toString()}`, {
        method: "POST",
        headers: { authorization: `Bearer ${pageToken}` },
      });
      const j = (await res.json()) as { id?: string; error?: { message?: string; code?: number } };
      if (!res.ok || j.error) {
        return { ok: false, error: redactError(j.error?.message ?? `HTTP ${res.status}`), errorCode: "publish_failed", retryable: res.status >= 500 };
      }
      return { ok: true, remoteId: j.id, responseSummary: "post:created" };
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
    }
  },
});

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

export const instagramAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "instagram",
  displayName: "Instagram",
  authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
  tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
  scopes: "instagram_basic instagram_content_publish instagram_manage_comments",
  pkce: true,

  async profile(credentials) {
    const token = credentials.accessToken;
    const res = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,username`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Could not load Instagram profile: HTTP ${res.status}`);
    const j = (await res.json()) as { id: string; name?: string; username?: string };
    return { accountName: j.name ?? j.username ?? "Instagram account", username: j.username ?? "", externalId: j.id };
  },

  async publish(credentials, input) {
    try {
      const igId = credentials.instagramAccountId;
      if (!igId) {
        return {
          ok: false,
          error: "No Instagram account ID configured. Add an 'instagramAccountId' credential (the Instagram Business account ID).",
          errorCode: "missing_ig_account",
          retryable: false,
        };
      }
      const token = credentials.accessToken;
      const mediaUrl = input.mediaUrls?.[0];
      const isVideo = input.options?.mediaType === "video";

      if (!mediaUrl) {
        // Text-only: Instagram requires media; return a clear validation error.
        return { ok: false, error: "Instagram publishing requires at least one image or video.", errorCode: "media_required", retryable: false };
      }

      const containerBody: Record<string, unknown> = {
        [isVideo ? "video_url" : "image_url"]: mediaUrl,
        caption: input.text,
      };
      if (isVideo) containerBody.media_type = "REELS";

      const container = await fetch(`https://graph.facebook.com/v19.0/${igId}/media`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(containerBody),
      });
      const cj = (await container.json()) as { id?: string; error?: { message?: string } };
      if (!container.ok || cj.error) {
        return { ok: false, error: redactError(cj.error?.message ?? `HTTP ${container.status}`), errorCode: "publish_failed", retryable: container.status >= 500 };
      }

      const pub = await fetch(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ creation_id: cj.id }),
      });
      const pj = (await pub.json()) as { id?: string; error?: { message?: string } };
      if (!pub.ok || pj.error) {
        return { ok: false, error: redactError(pj.error?.message ?? `HTTP ${pub.status}`), errorCode: "publish_failed", retryable: pub.status >= 500 };
      }
      return { ok: true, remoteId: pj.id, responseSummary: "media:published" };
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
    }
  },
});

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

export const linkedinAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "linkedin",
  displayName: "LinkedIn",
  authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
  tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
  scopes: "openid profile email w_member_social",
  pkce: true,

  async profile(credentials) {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) throw new Error(`Could not load LinkedIn profile: HTTP ${res.status}`);
    const j = (await res.json()) as { sub: string; name?: string; email?: string; picture?: string };
    return { accountName: j.name ?? j.email ?? "LinkedIn account", username: j.email ?? j.sub, avatarUrl: j.picture, externalId: j.sub };
  },

  async publish(credentials, input) {
    try {
      const author = credentials.authorUrn ?? `urn:li:person:${credentials.externalId}`;
      const res = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          authorization: `Bearer ${credentials.accessToken}`,
          "content-type": "application/json",
          "LinkedIn-Version": "202405",
        },
        body: JSON.stringify({
          author,
          commentary: input.text,
          visibility: "PUBLIC",
          lifecycleState: "PUBLISHED",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        }),
      });
      const j = (await res.json()) as { id?: string; message?: string };
      if (!res.ok) {
        return { ok: false, error: redactError(j.message ?? `HTTP ${res.status}`), errorCode: "publish_failed", retryable: res.status >= 500 };
      }
      return { ok: true, remoteId: j.id, responseSummary: "post:created" };
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
    }
  },
});

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export const threadsAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "threads",
  displayName: "Threads",
  authorizationUrl: "https://www.threads.net/oauth/authorize",
  tokenUrl: "https://graph.threads.net/oauth/access_token",
  scopes: "threads_basic threads_content_publish",
  pkce: true,

  async profile(credentials) {
    const res = await fetch("https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url", {
      headers: { authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) throw new Error(`Could not load Threads profile: HTTP ${res.status}`);
    const j = (await res.json()) as { id: string; username: string; name?: string; threads_profile_picture_url?: string };
    return { accountName: j.name ?? j.username, username: j.username, avatarUrl: j.threads_profile_picture_url, externalId: j.id };
  },

  async publish(credentials, input) {
    try {
      const res = await fetch(`https://graph.threads.net/v1.0/${credentials.externalId}/threads`, {
        method: "POST",
        headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ text: input.text, media_type: "TEXT" }),
      });
      const j = (await res.json()) as { id?: string; error?: { message?: string } };
      if (!res.ok || j.error) {
        return { ok: false, error: redactError(j.error?.message ?? `HTTP ${res.status}`), errorCode: "publish_failed", retryable: res.status >= 500 };
      }
      return { ok: true, remoteId: j.id, responseSummary: "thread:created" };
    } catch (e) {
      return { ok: false, error: redactError(e), errorCode: "publish_error", retryable: true };
    }
  },
});

// ---------------------------------------------------------------------------
// Remaining OAuth platforms (connection + profile only; publishing later)
// ---------------------------------------------------------------------------

export const tiktokAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "tiktok",
  displayName: "TikTok",
  authorizationUrl: "https://www.tiktok.com/v2/auth/authorize",
  tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
  scopes: "user.info.basic video.publish video.upload",
  pkce: true,
});

export const youtubeAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "youtube",
  displayName: "YouTube",
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
  pkce: true,
  async profile(credentials) {
    const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { authorization: `Bearer ${credentials.accessToken}` },
    });
    if (!res.ok) throw new Error(`Could not load YouTube profile: HTTP ${res.status}`);
    const j = (await res.json()) as { items?: { id: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } } }[] };
    const item = j.items?.[0];
    return { accountName: item?.snippet?.title ?? "YouTube channel", username: item?.snippet?.title ?? "", avatarUrl: item?.snippet?.thumbnails?.default?.url ?? undefined, externalId: item?.id ?? "" };
  },
});

export const pinterestAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "pinterest",
  displayName: "Pinterest",
  authorizationUrl: "https://www.pinterest.com/oauth/",
  tokenUrl: "https://api.pinterest.com/v5/oauth/token",
  scopes: "boards:read pins:read pins:write user_accounts:read",
});

export const redditAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "reddit",
  displayName: "Reddit",
  authorizationUrl: "https://www.reddit.com/api/v1/authorize",
  tokenUrl: "https://www.reddit.com/api/v1/access_token",
  scopes: "identity submit edit read privatemessages",
  pkce: true,
});

export const twitchAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "twitch",
  displayName: "Twitch",
  authorizationUrl: "https://id.twitch.tv/oauth2/authorize",
  tokenUrl: "https://id.twitch.tv/oauth2/token",
  scopes: "channel:read:subscriptions user:read:email",
  pkce: true,
});

export const googleBusinessAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "google-business",
  displayName: "Google Business Profile",
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: "https://www.googleapis.com/auth/business.manage",
  pkce: true,
});

export const bloggerAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "blogger",
  displayName: "Blogger",
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: "https://www.googleapis.com/auth/blogger",
  pkce: true,
});

export const snapchatAdapter: SocialPlatformAdapter = makeOAuthAdapter({
  providerId: "snapchat",
  displayName: "Snapchat",
  authorizationUrl: "https://accounts.snapchat.com/accounts/oauth2/auth",
  tokenUrl: "https://accounts.snapchat.com/accounts/oauth2/token",
  scopes: "snapchat-marketing-api",
  pkce: true,
});

export const tumblrAdapter: SocialPlatformAdapter = {
  providerId: "tumblr",
  displayName: "Tumblr",
  // Tumblr uses OAuth 1.0a; connection requires manual tokens for now.
  async validateCredentials(credentials) {
    if (!credentials.token || !credentials.tokenSecret) {
      return { ok: false, message: "Tumblr requires an OAuth token and token secret" };
    }
    return { ok: true, message: "Tumblr tokens accepted (publishing is implemented in a later phase)" };
  },
  publishPost: notImplementedPublish("Publishing to Tumblr"),
};