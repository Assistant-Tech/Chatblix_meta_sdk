// Sources:
// - https://developers.facebook.com/documentation/business-messaging/messenger-platform/error-codes
// - https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/error-codes/

export const AUTH_CODES: ReadonlySet<number> = new Set([
  102, 190,
  200, // 200 = Meta permission error (NOT HTTP 200)
  458, 459, 460, 463, 464, 467,
]);

export const RATE_LIMIT_CODES: ReadonlySet<number> = new Set([
  4, 17, 32, 613, 80004,
]);

// Note: code 100 appears in both Messenger and Instagram tables — fromGraphApiError disambiguates via the platform hint.
export const MESSENGER_MESSAGE_CODES: ReadonlySet<number> = new Set([
  100, 551, 1200, 1545041,
  2018001, 2018028, 2018065, 2018108, 2018109, 2018278,
]);

export const INSTAGRAM_MESSAGE_CODES: ReadonlySet<number> = new Set([
  100, 10903, 2534014, 2534015,
]);

export type MetaPlatformHint = 'messenger' | 'instagram';
