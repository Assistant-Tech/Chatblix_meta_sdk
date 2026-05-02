# Extending MetaSdkModule

The module is layered around a thin core (`HttpClient`, `Result`, `MetaError`) plus per-resource clients. To add Comments or Posts:

## 1. New resource client

`src/comments/comments.client.ts`:

```ts
@Injectable()
export class CommentsClient {
  constructor(
    @Inject(HttpClient) private readonly http: HttpClient,
    @Inject(META_SDK_RESOLVED_CONFIG) cfg: ResolvedMetaSdkConfig,
  ) {}
  async listForPost(postId: string, accessToken: string): Promise<Result<Comment[], MetaError>> { /* ... */ }
  async create(postId: string, accessToken: string, message: string): Promise<Result<{ id: string }, MetaError>> { /* ... */ }
  async delete(commentId: string, accessToken: string): Promise<Result<void, MetaError>> { /* ... */ }
}
```

## 2. Add zod schemas + types

Mirror the `messaging/` layout: `comments.types.ts`, `comments.schemas.ts`.

## 3. Register in MetaSdkModule

In `buildFeatureProviders` / `buildAsyncFeatureProviders`, add `CommentsClient` (gated by an option flag, e.g. `opts.comments?.enabled`).

## 4. Inject into FacebookService / InstagramService

Add `commentsFb` / `commentsIg` parameters — existing constructors keep DI symmetry.

## 5. Posts

Same pattern: `src/posts/posts.client.ts` with `publish`, `getById`, `listForUser`, etc.

The Open/Closed principle holds — existing clients/tests untouched.
