import { Inject, Injectable } from '@nestjs/common';
import { InstagramOAuthClient } from '../oauth/instagram-oauth.client';
import { InstagramMessagingClient } from '../messaging/instagram-messaging.client';
import { parseWebhookPayload } from '../webhooks/webhook-parser';

@Injectable()
export class InstagramService {
  constructor(
    @Inject(InstagramOAuthClient) public readonly oauth: InstagramOAuthClient,
    @Inject(InstagramMessagingClient) public readonly messaging: InstagramMessagingClient,
  ) {}
  parseWebhook = parseWebhookPayload;
}
