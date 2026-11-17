import type { ComponentType } from "react";
import {
  Article,
  Browsers,
  Butterfly,
  ChatsCircle,
  Circle,
  DiscordLogo,
  EnvelopeSimple,
  FacebookLogo,
  Ghost,
  Globe,
  GoogleLogo,
  Image,
  InstagramLogo,
  LinkedinLogo,
  MastodonLogo,
  MediumLogo,
  PinterestLogo,
  PlugsConnected,
  RedditLogo,
  Rss,
  SnapchatLogo,
  TelegramLogo,
  ThreadsLogo,
  TiktokLogo,
  TumblrLogo,
  TwitchLogo,
  WechatLogo,
  WhatsappLogo,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react";

export interface PlatformIconProps {
  name: string;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  color?: string;
  className?: string;
}

type IconComponent = ComponentType<{
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  color?: string;
  className?: string;
}>;

const ICONS: Record<string, IconComponent> = {
  InstagramLogo,
  FacebookLogo,
  ThreadsLogo,
  XLogo,
  LinkedinLogo,
  TiktokLogo,
  YoutubeLogo,
  PinterestLogo,
  SnapchatLogo,
  RedditLogo,
  TumblrLogo,
  TelegramLogo,
  WhatsappLogo,
  DiscordLogo,
  MastodonLogo,
  BlueskyLogo: Butterfly,
  TwitchLogo,
  GoogleLogo,
  WordpressLogo: Browsers,
  MediumLogo,
  VkLogo: Globe,
  ChatsCircle,
  WechatLogo,
  Image,
  Ghost,
  Article,
  EnvelopeSimple,
  Rss,
  PlugsConnected,
};

export function PlatformIcon({ name, size = 18, weight = "regular", color, className }: PlatformIconProps) {
  const Icon = ICONS[name] ?? Circle;
  return <Icon size={size} weight={weight} color={color} className={className} />;
}
