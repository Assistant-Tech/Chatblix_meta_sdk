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
