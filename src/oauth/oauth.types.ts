import type { FacebookScope, InstagramScope } from "./scopes";

export interface FacebookOAuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: readonly FacebookScope[];
}
export interface InstagramOAuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: readonly InstagramScope[];
}
export interface BuildAuthUrlInput {
  state: string;
  scopes?: readonly string[];
}
export interface ShortLivedToken {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  userId?: string;
}
export interface LongLivedToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}
/** `expiresIn` is absent when Facebook issued a token that never expires. */
export interface FacebookLongLivedToken {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
}
export interface FacebookPageAccount {
  id: string;
  name: string;
  accessToken: string;
  category?: string;
  instagramAccount: { id: string; username: string; name?: string } | null;
}
export interface InstagramAccount {
  id: string;
  username: string;
  accountType?: string;
  /** IGBA — the IG Graph API account ID. Required for messaging endpoints and webhook entry.id matching. Distinct from `id` (IGSID). */
  userId: string;
}

/** One entry from a `subscribed_apps` edge. Meta omits fields freely here. */
export interface SubscribedApp {
  id?: string;
  name?: string;
  category?: string;
  link?: string;
  subscribed_fields?: string[];
}

export interface SubscribedAppsList {
  data: SubscribedApp[];
}

/** Outcome of removing an app's webhook subscription. */
export interface UnsubscribeResult {
  success: boolean;
  /** `true` when nothing was subscribed, so no DELETE was issued. */
  alreadyUnsubscribed: boolean;
}
