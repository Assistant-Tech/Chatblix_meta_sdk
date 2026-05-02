export const FACEBOOK_SCOPES = [
  'email','public_profile','pages_show_list','pages_manage_metadata','pages_messaging',
  'pages_read_engagement','instagram_basic','instagram_manage_messages','business_management',
] as const;
export type FacebookScope = typeof FACEBOOK_SCOPES[number];

export const INSTAGRAM_SCOPES = [
  'instagram_business_basic','instagram_business_manage_messages',
  'instagram_business_manage_comments','instagram_business_content_publish',
] as const;
export type InstagramScope = typeof INSTAGRAM_SCOPES[number];
