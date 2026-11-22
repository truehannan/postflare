/**
 * Postflare — Composio hub integration (shared).
 *
 * Composio (https://composio.dev) lets a workspace connect every social
 * platform with a single API key: the end user authorizes each app through
 * Composio's hosted OAuth, and publishing happens by executing Composio
 * "tools" with the connected account id.
 *
 * This module maps Postflare platforms to the verified Composio tool slugs
 * (REST API v3.1, `x-api-key`, POST /tools/execute/{tool_slug}). Only
 * platforms whose tool slugs and argument shapes have been verified against
 * the Composio docs are listed here — nothing is faked.
 */

export const COMPOSIO_PROVIDER_ID = "composio";

export interface ComposioAccountConfigField {
  key: string;
  label: string;
  required: boolean;
  description?: string;
}

export interface ComposioSupport {
  /** Postflare platform id (must exist in shared/capabilities.ts). */
  platformId: string;
  /** Composio toolkit slug (used to filter connected accounts). */
  toolkit: string;
  /** Main publish tool slug. */
  publishTool: string;
  /**
   * Instagram publishes in two steps: create a media container, then publish
   * it. When set, this is the container-creation tool.
   */
  containerTool?: string;
  /** Argument name that carries the post text. */
  textParam: string;
  /** Argument name that carries the post title (Reddit), if different. */
  titleParam?: string;
  /** Platform requires media for publishing (Instagram). */
  mediaRequired?: boolean;
  /** LinkedIn requires an author URN, resolved at import time. */
  needsAuthorUrn?: boolean;
  /** Extra per-account configuration collected at import time. */
  accountConfigFields: ComposioAccountConfigField[];
}

export const COMPOSIO_SUPPORTED: ComposioSupport[] = [
  {
    platformId: "x",
    toolkit: "TWITTER",
    publishTool: "TWITTER_CREATION_OF_A_POST",
    textParam: "text",
    accountConfigFields: [],
  },
  {
    platformId: "instagram",
    toolkit: "INSTAGRAM",
    containerTool: "INSTAGRAM_POST_IG_USER_MEDIA",
    publishTool: "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",
    textParam: "caption",
    mediaRequired: true,
    accountConfigFields: [],
  },
  {
    platformId: "facebook",
    toolkit: "FACEBOOK",
    publishTool: "FACEBOOK_CREATE_POST",
    textParam: "message",
    accountConfigFields: [
      {
        key: "pageId",
        label: "Facebook Page ID",
        required: true,
        description: "Numeric ID of the Page to publish to.",
      },
    ],
  },
  {
    platformId: "linkedin",
    toolkit: "LINKEDIN",
    publishTool: "LINKEDIN_CREATE_LINKED_IN_POST",
    textParam: "commentary",
    needsAuthorUrn: true,
    accountConfigFields: [],
  },
  {
    platformId: "threads",
    toolkit: "THREADS",
    publishTool: "THREADS_CREATE_POST",
    textParam: "text",
    accountConfigFields: [],
  },
  {
    platformId: "reddit",
    toolkit: "REDDIT",
    publishTool: "REDDIT_CREATE_REDDIT_POST",
    textParam: "text",
    titleParam: "title",
    accountConfigFields: [
      {
        key: "subreddit",
        label: "Subreddit",
        required: true,
        description: "Subreddit name without the r/ prefix.",
      },
    ],
  },
  {
    platformId: "telegram",
    toolkit: "TELEGRAM",
    publishTool: "TELEGRAM_SEND_MESSAGE",
    textParam: "text",
    accountConfigFields: [
      {
        key: "chatId",
        label: "Chat ID",
        required: true,
        description: "Channel or chat to publish to (e.g. @yourchannel).",
      },
    ],
  },
];

export function getComposioSupport(platformId: string): ComposioSupport | undefined {
  return COMPOSIO_SUPPORTED.find((s) => s.platformId === platformId);
}

export function getComposioSupportByToolkit(toolkit: string): ComposioSupport | undefined {
  return COMPOSIO_SUPPORTED.find((s) => s.toolkit === toolkit);
}

/** Credential fields for the Composio hub key (stored via the vault). */
export const COMPOSIO_CREDENTIAL_FIELDS = [
  {
    key: "apiKey",
    label: "Composio API key",
    type: "secret" as const,
    required: true,
    description: "Project API key from app.composio.dev. Encrypted at rest like every other credential.",
  },
];
