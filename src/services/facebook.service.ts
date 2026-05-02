import { Inject, Injectable } from '@nestjs/common';
import { FacebookOAuthClient } from '../oauth/facebook-oauth.client';
import { MessengerClient } from '../messaging/messenger.client';
import { parseWebhookPayload } from '../webhooks/webhook-parser';

@Injectable()
export class FacebookService {
  constructor(
    @Inject(FacebookOAuthClient) public readonly oauth: FacebookOAuthClient,
    @Inject(MessengerClient) public readonly messenger: MessengerClient,
  ) {}
  parseWebhook = parseWebhookPayload;
}
