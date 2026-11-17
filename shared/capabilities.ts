/**
 * Postflare — platform ecosystem registry.
 *
 * This module is shared between the Worker (adapter registry, capability
 * gating) and the frontend (integration pages, composer, capability display).
 * It is the single source of truth for what each platform can actually do.
 */

export type CapabilityStatus =
  | "supported"
  | "partial"
  | "permissions"
  | "manual"
  | "unsupported"
  | "deprecated";

export type CapabilityKey =
  | "connect"
  | "oauth"
  | "manualCredentials"
  | "text"
  | "image"
  | "multiImage"
  | "video"
  | "audio"
  | "shorts"
  | "reels"
  | "stories"
  | "carousel"
  | "link"
  | "polls"
  | "hashtags"
  | "location"
  | "firstComment"
  | "scheduled"
  | "immediate"
  | "drafts"
  | "edit"
  | "delete"
  | "comments"
  | "commentReplies"
  | "directMessages"
  | "conversations"
  | "analytics"
  | "audience"
  | "webhooks"
  | "mediaUpload"
  | "multiAccount";

export type CredentialFieldType = "text" | "secret" | "textarea";

export interface CredentialField {
  key: string;
  label: string;
  type: CredentialFieldType;
  required: boolean;
  description?: string;
  placeholder?: string;
}

export interface OAuthConfig {
  /** Authorization endpoint for the OAuth 2.0 authorization-code flow. */
  authorizationUrl: string;
  /** Token endpoint. */
  tokenUrl: string;
  /** Default scopes to request (space separated). */
  scopes: string;
  /** Whether PKCE is supported by this provider. */
  pkce?: boolean;
  /** Whether the access token is a long-lived token (no refresh). */
  noRefreshToken?: boolean;
  /** Required developer-console redirect URI note. */
  redirectNote?: string;
}

export interface PlatformInfo {
  id: string;
  name: string;
  category: "social" | "messaging" | "video" | "blog" | "community" | "destination";
  /** Phosphor icon name used in the UI. */
  icon: string;
  /** Accent color for the platform mark. */
  color: string;
  description: string;
  capabilities: Partial<Record<CapabilityKey, CapabilityStatus>>;
  credentialFields: CredentialField[];
  oauth?: OAuthConfig;
  docsUrl?: string;
  note?: string;
}

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  connect: "Account connection",
  oauth: "OAuth",
  manualCredentials: "Manual credentials",
  text: "Text publishing",
  image: "Image publishing",
  multiImage: "Multi-image publishing",
  video: "Video publishing",
  audio: "Audio publishing",
  shorts: "Short-form video",
  reels: "Reels",
  stories: "Stories",
  carousel: "Carousel publishing",
  link: "Link publishing",
  polls: "Polls",
  hashtags: "Hashtags",
  location: "Location tagging",
  firstComment: "First comment",
  scheduled: "Scheduled publishing",
  immediate: "Immediate publishing",
  drafts: "Drafts",
  edit: "Post editing",
  delete: "Post deletion",
  comments: "Comment retrieval",
  commentReplies: "Comment replies",
  directMessages: "Direct messaging",
  conversations: "Conversation retrieval",
  analytics: "Analytics",
  audience: "Audience insights",
  webhooks: "Webhooks",
  mediaUpload: "Media uploads",
  multiAccount: "Multiple accounts",
};

export const CAPABILITY_STATUS_LABELS: Record<CapabilityStatus, string> = {
  supported: "Supported",
  partial: "Partially supported",
  permissions: "Requires additional permissions",
  manual: "Requires manual setup",
  unsupported: "Not supported",
  deprecated: "Deprecated",
};

function c(
  capabilities: Partial<Record<CapabilityKey, CapabilityStatus>>,
): Partial<Record<CapabilityKey, CapabilityStatus>> {
  return capabilities;
}

export const PLATFORMS: PlatformInfo[] = [
  {
    id: "instagram",
    name: "Instagram",
    category: "social",
    icon: "InstagramLogo",
    color: "#E4405F",
    description: "Meta's photo and video platform, including Reels and Stories.",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "partial",
      image: "supported",
      multiImage: "supported",
      video: "supported",
      reels: "supported",
      stories: "permissions",
      carousel: "supported",
      link: "partial",
      hashtags: "supported",
      location: "permissions",
      firstComment: "supported",
      scheduled: "supported",
      immediate: "supported",
      drafts: "partial",
      comments: "supported",
      commentReplies: "supported",
      directMessages: "permissions",
      conversations: "permissions",
      analytics: "supported",
      audience: "partial",
      webhooks: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      {
        key: "appId",
        label: "App ID",
        type: "text",
        required: true,
        description: "Facebook app ID used for the Instagram Graph API.",
      },
      {
        key: "appSecret",
        label: "App secret",
        type: "secret",
        required: true,
        description: "Facebook app secret (used only server-side for OAuth exchange).",
      },
      {
        key: "accessToken",
        label: "Long-lived access token",
        type: "secret",
        required: false,
        description: "Optional long-lived Instagram access token for manual connection.",
      },
    ],
    oauth: {
      authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
      scopes: "instagram_basic instagram_content_publish instagram_manage_comments instagram_manage_messages pages_read_engagement pages_show_list",
      pkce: true,
      redirectNote: "Add the Postflare redirect URI under Facebook Login settings in your app.",
    },
    note: "Publishing to personal Instagram requires a business/creator account linked to a Facebook Page.",
  },
  {
    id: "facebook",
    name: "Facebook",
    category: "social",
    icon: "FacebookLogo",
    color: "#1877F2",
    description: "Meta's social network for pages and profiles.",
    docsUrl: "https://developers.facebook.com/docs",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      multiImage: "supported",
      video: "supported",
      link: "supported",
      hashtags: "partial",
      location: "permissions",
      scheduled: "supported",
      immediate: "supported",
      comments: "supported",
      commentReplies: "supported",
      directMessages: "supported",
      conversations: "supported",
      analytics: "supported",
      audience: "supported",
      webhooks: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "appId", label: "App ID", type: "text", required: true },
      { key: "appSecret", label: "App secret", type: "secret", required: true },
      {
        key: "pageAccessToken",
        label: "Page access token",
        type: "secret",
        required: false,
        description: "Optional long-lived Page access token for manual connection.",
      },
    ],
    oauth: {
      authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
      scopes: "pages_show_list pages_read_engagement pages_manage_posts pages_manage_metadata pages_messaging business_management",
      pkce: true,
      redirectNote: "App review is required for pages_messaging and public publishing.",
    },
  },
  {
    id: "threads",
    name: "Threads",
    category: "social",
    icon: "ThreadsLogo",
    color: "#000000",
    description: "Meta's text-first conversation app.",
    docsUrl: "https://developers.facebook.com/docs/threads",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      multiImage: "supported",
      video: "supported",
      carousel: "supported",
      scheduled: "supported",
      immediate: "supported",
      analytics: "supported",
      audience: "partial",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "appId", label: "App ID", type: "text", required: true },
      { key: "appSecret", label: "App secret", type: "secret", required: true },
      { key: "accessToken", label: "Access token", type: "secret", required: false },
    ],
    oauth: {
      authorizationUrl: "https://www.threads.net/oauth/authorize",
      tokenUrl: "https://graph.threads.net/oauth/access_token",
      scopes: "threads_basic threads_content_publish threads_manage_insights threads_manage_replies",
      pkce: true,
    },
    note: "Threads uses the Instagram Graph API family. Requires a Threads-enabled account.",
  },
  {
    id: "x",
    name: "X / Twitter",
    category: "social",
    icon: "XLogo",
    color: "#000000",
    description: "X (formerly Twitter) real-time feed.",
    docsUrl: "https://developer.x.com/en/docs",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      multiImage: "supported",
      video: "supported",
      polls: "permissions",
      hashtags: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "partial",
      delete: "supported",
      comments: "supported",
      commentReplies: "supported",
      directMessages: "permissions",
      conversations: "permissions",
      analytics: "supported",
      audience: "partial",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "apiKey", label: "API key", type: "text", required: false, description: "OAuth 1.0a consumer key." },
      { key: "apiSecret", label: "API secret", type: "secret", required: false },
      {
        key: "clientId",
        label: "OAuth 2.0 client ID",
        type: "text",
        required: false,
        description: "Required for OAuth 2.0 PKCE flow.",
      },
      {
        key: "clientSecret",
        label: "OAuth 2.0 client secret",
        type: "secret",
        required: false,
      },
      { key: "accessToken", label: "Access token", type: "secret", required: false },
      { key: "accessTokenSecret", label: "Access token secret", type: "secret", required: false },
    ],
    oauth: {
      authorizationUrl: "https://x.com/i/oauth2/authorize",
      tokenUrl: "https://api.x.com/2/oauth2/token",
      scopes: "tweet.read tweet.write users.read offline.access",
      pkce: true,
    },
    note: "Free tier is limited to 1,500 posts/month. Direct messages require elevated access.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "social",
    icon: "LinkedinLogo",
    color: "#0A66C2",
    description: "Professional network with pages and profiles.",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "supported",
      multiImage: "partial",
      link: "supported",
      hashtags: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "supported",
      delete: "supported",
      comments: "supported",
      commentReplies: "permissions",
      analytics: "supported",
      audience: "partial",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
    ],
    oauth: {
      authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes: "w_member_social r_organization_social rw_organization_admin w_organization_social openid profile email",
      pkce: true,
    },
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "video",
    icon: "TiktokLogo",
    color: "#000000",
    description: "Short-form video platform.",
    docsUrl: "https://developers.tiktok.com",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "partial",
      image: "supported",
      video: "supported",
      shorts: "supported",
      hashtags: "supported",
      scheduled: "supported",
      immediate: "supported",
      analytics: "permissions",
      audience: "permissions",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "clientKey", label: "Client key", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
    ],
    oauth: {
      authorizationUrl: "https://www.tiktok.com/v2/auth/authorize",
      tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
      scopes: "user.info.basic video.publish video.upload",
      pkce: true,
    },
    note: "Video publish APIs require an audited TikTok app.",
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "video",
    icon: "YoutubeLogo",
    color: "#FF0000",
    description: "Google's video platform, including Shorts.",
    docsUrl: "https://developers.google.com/youtube/v3",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "partial",
      video: "supported",
      shorts: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "supported",
      delete: "supported",
      comments: "supported",
      commentReplies: "supported",
      analytics: "supported",
      audience: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
    ],
    oauth: {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      pkce: true,
    },
  },
  {
    id: "pinterest",
    name: "Pinterest",
    category: "social",
    icon: "PinterestLogo",
    color: "#E60023",
    description: "Visual discovery and inspiration platform.",
    docsUrl: "https://developers.pinterest.com",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "partial",
      image: "supported",
      video: "supported",
      carousel: "supported",
      link: "supported",
      scheduled: "supported",
      immediate: "supported",
      analytics: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "appId", label: "App ID", type: "text", required: true },
      { key: "appSecret", label: "App secret", type: "secret", required: true },
    ],
    oauth: {
      authorizationUrl: "https://www.pinterest.com/oauth/",
      tokenUrl: "https://api.pinterest.com/v5/oauth/token",
      scopes: "boards:read pins:read pins:write user_accounts:read",
    },
  },
  {
    id: "snapchat",
    name: "Snapchat",
    category: "social",
    icon: "SnapchatLogo",
    color: "#FFFC00",
    description: "Ephemeral messaging and Stories platform.",
    docsUrl: "https://developers.snap.com",
    capabilities: c({
      connect: "permissions",
      oauth: "permissions",
      manualCredentials: "permissions",
      analytics: "partial",
    }),
    credentialFields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
    ],
    note: "Snapchat Marketing API publishing requires an approved app and business.",
  },
  {
    id: "reddit",
    name: "Reddit",
    category: "community",
    icon: "RedditLogo",
    color: "#FF4500",
    description: "Community and discussion platform.",
    docsUrl: "https://www.reddit.com/dev/api",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "supported",
      link: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "supported",
      delete: "supported",
      comments: "supported",
      commentReplies: "supported",
      directMessages: "supported",
      conversations: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
      { key: "username", label: "Username", type: "text", required: false },
      { key: "password", label: "Password", type: "secret", required: false },
    ],
    oauth: {
      authorizationUrl: "https://www.reddit.com/api/v1/authorize",
      tokenUrl: "https://www.reddit.com/api/v1/access_token",
      scopes: "identity submit edit read privatemessages",
      pkce: true,
    },
  },
  {
    id: "tumblr",
    name: "Tumblr",
    category: "blog",
    icon: "TumblrLogo",
    color: "#001935",
    description: "Microblogging and social platform.",
    docsUrl: "https://www.tumblr.com/docs/en/api/v2",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "supported",
      link: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "supported",
      delete: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "consumerKey", label: "Consumer key", type: "text", required: true },
      { key: "consumerSecret", label: "Consumer secret", type: "secret", required: true },
      { key: "token", label: "OAuth token", type: "secret", required: false },
      { key: "tokenSecret", label: "OAuth token secret", type: "secret", required: false },
    ],
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "messaging",
    icon: "TelegramLogo",
    color: "#26A5E4",
    description: "Cloud messaging with a full Bot API.",
    docsUrl: "https://core.telegram.org/bots/api",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "supported",
      audio: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "supported",
      delete: "supported",
      directMessages: "supported",
      conversations: "supported",
      webhooks: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      {
        key: "botToken",
        label: "Bot token",
        type: "secret",
        required: true,
        description: "Token obtained from @BotFather.",
      },
      {
        key: "chatId",
        label: "Chat ID",
        type: "text",
        required: false,
        description: "Channel or chat to publish to (e.g. @yourchannel or a numeric id).",
      },
      {
        key: "apiBaseUrl",
        label: "API base URL",
        type: "text",
        required: false,
        description: "Optional. Override the Bot API endpoint for testing.",
      },
    ],
    note: "Telegram bots can only message users who have started a conversation first.",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "messaging",
    icon: "WhatsappLogo",
    color: "#25D366",
    description: "Meta's business messaging platform.",
    docsUrl: "https://developers.facebook.com/docs/whatsapp",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "supported",
      directMessages: "supported",
      conversations: "supported",
      webhooks: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "accessToken", label: "Access token", type: "secret", required: true },
      { key: "phoneNumberId", label: "Phone number ID", type: "text", required: true },
      { key: "wabaId", label: "WABA ID", type: "text", required: false },
      { key: "verifyToken", label: "Webhook verify token", type: "secret", required: false },
      { key: "appSecret", label: "App secret", type: "secret", required: false, description: "Used to verify webhook signatures." },
    ],
    note: "Business-initiated conversations require approved message templates.",
  },
  {
    id: "discord",
    name: "Discord",
    category: "messaging",
    icon: "DiscordLogo",
    color: "#5865F2",
    description: "Community chat platform with a bot API.",
    docsUrl: "https://discord.com/developers/docs",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "supported",
      directMessages: "supported",
      conversations: "supported",
      webhooks: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "botToken", label: "Bot token", type: "secret", required: true },
      { key: "clientId", label: "Application ID", type: "text", required: false },
    ],
  },
  {
    id: "mastodon",
    name: "Mastodon",
    category: "social",
    icon: "MastodonLogo",
    color: "#6364FF",
    description: "Federated microblogging on ActivityPub.",
    docsUrl: "https://docs.joinmastodon.org",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "supported",
      polls: "supported",
      hashtags: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "supported",
      delete: "supported",
      comments: "supported",
      commentReplies: "supported",
      directMessages: "supported",
      conversations: "supported",
      webhooks: "partial",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      {
        key: "baseUrl",
        label: "Instance URL",
        type: "text",
        required: true,
        placeholder: "https://mastodon.social",
      },
      { key: "accessToken", label: "Access token", type: "secret", required: true },
    ],
  },
  {
    id: "bluesky",
    name: "Bluesky",
    category: "social",
    icon: "BlueskyLogo",
    color: "#1185FE",
    description: "Decentralized social network on the AT Protocol.",
    docsUrl: "https://docs.bsky.app",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "partial",
      hashtags: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "unsupported",
      delete: "supported",
      comments: "supported",
      commentReplies: "supported",
      directMessages: "unsupported",
      analytics: "unsupported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "identifier", label: "Handle or email", type: "text", required: true, placeholder: "you.bsky.social" },
      {
        key: "appPassword",
        label: "App password",
        type: "secret",
        required: true,
        description: "Create an app password under Settings → App passwords.",
      },
      {
        key: "apiBaseUrl",
        label: "API base URL",
        type: "text",
        required: false,
        description: "Optional. Override the AT Protocol service endpoint (self-hosted PDS or a test mock).",
      },
    ],
    note: "Bluesky has no scheduling or analytics API; Postflare schedules via its own queue.",
  },
  {
    id: "twitch",
    name: "Twitch",
    category: "video",
    icon: "TwitchLogo",
    color: "#9146FF",
    description: "Live streaming platform.",
    docsUrl: "https://dev.twitch.tv/docs",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "supported",
      text: "partial",
      analytics: "supported",
      audience: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
    ],
    oauth: {
      authorizationUrl: "https://id.twitch.tv/oauth2/authorize",
      tokenUrl: "https://id.twitch.tv/oauth2/token",
      scopes: "channel:read:subscriptions user:read:email",
      pkce: true,
    },
  },
  {
    id: "google-business",
    name: "Google Business Profile",
    category: "destination",
    icon: "GoogleLogo",
    color: "#4285F4",
    description: "Manage a local business presence on Google.",
    docsUrl: "https://developers.google.com/my-business",
    capabilities: c({
      connect: "permissions",
      oauth: "permissions",
      text: "partial",
      image: "partial",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
    ],
    oauth: {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/business.manage",
      pkce: true,
    },
    note: "Requires business verification and API access approval.",
  },
  {
    id: "wordpress",
    name: "WordPress",
    category: "blog",
    icon: "WordpressLogo",
    color: "#21759B",
    description: "Self-hosted or hosted WordPress sites.",
    docsUrl: "https://developer.wordpress.org/rest-api",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "supported",
      link: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "supported",
      delete: "supported",
      comments: "supported",
      commentReplies: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "baseUrl", label: "Site URL", type: "text", required: true, placeholder: "https://example.com" },
      { key: "username", label: "Username", type: "text", required: true },
      {
        key: "appPassword",
        label: "Application password",
        type: "secret",
        required: true,
        description: "Create under Users → Profile → Application Passwords.",
      },
    ],
  },
  {
    id: "medium",
    name: "Medium",
    category: "blog",
    icon: "MediumLogo",
    color: "#000000",
    description: "Writing and publishing platform.",
    docsUrl: "https://github.com/Medium/medium-api-docs",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      scheduled: "partial",
      immediate: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "integrationToken", label: "Integration token", type: "secret", required: true },
    ],
    note: "Medium's API supports content upload but no scheduling or image upload.",
  },
  {
    id: "vk",
    name: "VK",
    category: "social",
    icon: "VkLogo",
    color: "#0077FF",
    description: "Russian social network.",
    docsUrl: "https://dev.vk.com",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "supported",
      polls: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "supported",
      delete: "supported",
      comments: "supported",
      commentReplies: "supported",
      directMessages: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "accessToken", label: "Access token", type: "secret", required: true },
      { key: "groupId", label: "Group ID", type: "text", required: false },
    ],
  },
  {
    id: "line",
    name: "LINE",
    category: "messaging",
    icon: "ChatsCircle",
    color: "#06C755",
    description: "Messaging platform popular in East Asia.",
    docsUrl: "https://developers.line.biz",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      video: "supported",
      directMessages: "supported",
      conversations: "supported",
      webhooks: "supported",
      mediaUpload: "supported",
    }),
    credentialFields: [
      { key: "channelAccessToken", label: "Channel access token", type: "secret", required: true },
      { key: "channelSecret", label: "Channel secret", type: "secret", required: false },
    ],
  },
  {
    id: "wechat",
    name: "WeChat",
    category: "messaging",
    icon: "WechatLogo",
    color: "#07C160",
    description: "Messaging platform subject to official API access.",
    docsUrl: "https://developers.weixin.qq.com",
    capabilities: c({
      connect: "permissions",
      manualCredentials: "permissions",
      text: "permissions",
      directMessages: "permissions",
      webhooks: "permissions",
    }),
    credentialFields: [
      { key: "appId", label: "App ID", type: "text", required: true },
      { key: "appSecret", label: "App secret", type: "secret", required: true },
    ],
    note: "Official Accounts API access is limited to approved accounts in supported regions.",
  },
  {
    id: "flickr",
    name: "Flickr",
    category: "social",
    icon: "Image",
    color: "#FF0084",
    description: "Photo-sharing platform.",
    docsUrl: "https://www.flickr.com/services/api",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "partial",
      image: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "apiKey", label: "API key", type: "text", required: true },
      { key: "apiSecret", label: "API secret", type: "secret", required: true },
    ],
  },
  {
    id: "ghost",
    name: "Ghost",
    category: "blog",
    icon: "Ghost",
    color: "#15171A",
    description: "Modern publishing platform.",
    docsUrl: "https://ghost.org/docs/admin-api",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      scheduled: "supported",
      immediate: "supported",
      edit: "supported",
      delete: "supported",
      mediaUpload: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "baseUrl", label: "Admin URL", type: "text", required: true, placeholder: "https://example.com" },
      { key: "adminApiKey", label: "Admin API key", type: "secret", required: true },
    ],
  },
  {
    id: "blogger",
    name: "Blogger",
    category: "blog",
    icon: "Article",
    color: "#F57C00",
    description: "Google's blogging platform.",
    docsUrl: "https://developers.google.com/blogger",
    capabilities: c({
      connect: "supported",
      oauth: "permissions",
      manualCredentials: "permissions",
      text: "supported",
      image: "supported",
      scheduled: "supported",
      immediate: "supported",
      multiAccount: "supported",
    }),
    credentialFields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      { key: "clientSecret", label: "Client secret", type: "secret", required: true },
    ],
    oauth: {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: "https://www.googleapis.com/auth/blogger",
      pkce: true,
    },
  },
  {
    id: "substack",
    name: "Substack",
    category: "blog",
    icon: "EnvelopeSimple",
    color: "#FF6719",
    description: "Newsletter platform.",
    docsUrl: "https://substack.com",
    capabilities: c({
      connect: "unsupported",
      manualCredentials: "unsupported",
      text: "unsupported",
    }),
    credentialFields: [],
    note: "Substack does not provide an official public publishing API. Not available for direct publishing.",
  },
  {
    id: "rss",
    name: "RSS feed",
    category: "destination",
    icon: "Rss",
    color: "#F26522",
    description: "Publish posts to an RSS feed endpoint.",
    docsUrl: "https://www.rssboard.org/rss-specification",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
    }),
    credentialFields: [
      { key: "feedUrl", label: "Feed URL", type: "text", required: false, description: "URL of the feed to monitor for new content." },
    ],
    note: "RSS is a read-oriented format; Postflare can monitor a feed but cannot push posts into an arbitrary third-party feed.",
  },
  {
    id: "webhook",
    name: "Custom webhook",
    category: "destination",
    icon: "PlugsConnected",
    color: "#6B7280",
    description: "POST published content to any HTTP endpoint.",
    docsUrl: "https://developers.cloudflare.com/workers",
    capabilities: c({
      connect: "supported",
      manualCredentials: "supported",
      text: "supported",
      image: "supported",
      scheduled: "supported",
      immediate: "supported",
    }),
    credentialFields: [
      { key: "webhookUrl", label: "Webhook URL", type: "text", required: true },
      {
        key: "signingSecret",
        label: "Signing secret",
        type: "secret",
        required: false,
        description: "Optional HMAC secret added as X-Postflare-Signature.",
      },
    ],
  },
];

export interface PlatformLimits {
  maxTextLength?: number;
  maxImages?: number;
  maxVideoDurationSec?: number;
}

/** Per-platform publishing limits used by the composer to show live counters. */
export const PLATFORM_LIMITS: Record<string, PlatformLimits> = {
  instagram: { maxTextLength: 2200, maxImages: 10, maxVideoDurationSec: 90 },
  facebook: { maxTextLength: 63206, maxImages: 10 },
  threads: { maxTextLength: 500, maxImages: 10 },
  x: { maxTextLength: 280, maxImages: 4, maxVideoDurationSec: 140 },
  linkedin: { maxTextLength: 3000, maxImages: 9 },
  tiktok: { maxTextLength: 2200, maxImages: 1 },
  youtube: { maxTextLength: 5000 },
  pinterest: { maxTextLength: 500, maxImages: 1 },
  reddit: { maxTextLength: 40000 },
  tumblr: { maxTextLength: 4096, maxImages: 10 },
  telegram: { maxTextLength: 4096 },
  mastodon: { maxTextLength: 500, maxImages: 4 },
  bluesky: { maxTextLength: 300, maxImages: 4 },
  wordpress: { maxTextLength: 100000, maxImages: 20 },
  medium: { maxTextLength: 100000 },
  vk: { maxTextLength: 4096, maxImages: 10 },
  ghost: { maxTextLength: 100000 },
  webhook: { maxTextLength: 100000, maxImages: 20 },
};

export function getPlatformLimit(
  platformId: string,
  key: keyof PlatformLimits,
): number | undefined {
  return PLATFORM_LIMITS[platformId]?.[key];
}

export function getPlatform(id: string): PlatformInfo | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

export function capabilityStatus(
  platformId: string,
  capability: CapabilityKey,
): CapabilityStatus {
  return getPlatform(platformId)?.capabilities[capability] ?? "unsupported";
}

export function supports(platformId: string, capability: CapabilityKey): boolean {
  const status = capabilityStatus(platformId, capability);
  return status === "supported" || status === "partial" || status === "permissions";
}