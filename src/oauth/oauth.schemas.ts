import { z } from 'zod';
export const ShortLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().default('bearer'),
  expires_in: z.number().int().optional(),
  user_id: z.union([z.string(), z.number()]).optional(),
});
export const LongLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().int(),
});
// Facebook omits `expires_in` when the exchanged token never expires (seen for
// users with a role on the app), so it cannot be required as it is for Instagram.
export const FacebookLongLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().default('bearer'),
  expires_in: z.number().int().optional(),
});
export const FacebookPageAccountsResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string(), name: z.string(), access_token: z.string(),
    category: z.string().optional(),
    connected_instagram_account: z.object({
      id: z.string(), username: z.string(), name: z.string().optional(),
    }).optional().nullable(),
  })),
});
export const InstagramAccountSchema = z.object({
  id: z.string(),
  username: z.string(),
  account_type: z.string().optional(),
  user_id: z.union([z.string(), z.number()]).optional(),
});
