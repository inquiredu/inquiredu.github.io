# Connect GitHub sign-in once

The public website stays on GitHub Pages at **inquiredu.org**. The studio lives at **/admin/**. GitHub Pages cannot run the OAuth secret exchange, so `worker.mjs` is a small separate Cloudflare Worker. It authenticates only GitHub user ID `192934662` (inquiredu). GitHub enforces the repository permissions on every read and write.

## Setup

1. In Cloudflare Workers, create a Worker named `inquiredu-studio-auth`, or deploy this directory using the official Wrangler CLI. Note its HTTPS `workers.dev` address.
2. [Register a GitHub App](https://github.com/settings/apps/new) owned by **inquiredu**:
   - Homepage: `https://inquiredu.org`
   - Callback URL: `https://YOUR-WORKER.workers.dev/callback`
   - Turn off the webhook; this app does not receive webhooks.
   - Repository permissions: **Contents: read and write**, and the default Metadata read permission. No account, organization, administration, or workflow permissions.
   - Keep user access token expiration enabled. The editor signs in again rather than retaining a refresh token.
   - Install it **only** on `inquiredu.github.io` and `site-catalog`.
3. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the Worker's encrypted secrets. Never put the client secret in the repo, chat, `config.json`, or a command argument. The non-secret variables in `wrangler.jsonc` are `SITE_ORIGIN=https://inquiredu.org` and `OWNER_ID=192934662`.
4. Deploy `worker.mjs`. With an already installed Wrangler CLI, from this directory:

   ```sh
   wrangler secret put GITHUB_CLIENT_ID
   wrangler secret put GITHUB_CLIENT_SECRET
   wrangler deploy
   ```

   Each secret command prompts for its value. A Cloudflare dashboard deployment works too.
5. Set `authOrigin` in `admin/config.json` to the Worker's exact HTTPS origin, without a trailing slash. Commit that change along with this site update.
6. Open `https://inquiredu.org/admin/`, choose **Sign in with GitHub**, and authorize the app. Verify that only the intended two repositories are listed. Open each editor section before making a small first publication.

The sign-in button intentionally stays disabled until the Worker URL is configured. No live OAuth credentials are included in this change.

## Security and publishing behavior

- OAuth uses signed, ten-minute, HttpOnly Secure state cookies and S256 PKCE. The callback checks the numeric GitHub owner ID before returning a token.
- Tokens travel only to the configured site origin via a checked popup message. The editor additionally checks the popup, per-attempt channel, user ID, and access to both repositories. Tokens stay in tab memory and are cleared on sign-out; there are no analytics or third-party scripts in the editor.
- The `/admin/` page shell is public, like a sign-in page. Private catalog data and write operations require GitHub authorization. The preview URL `?preview=1` loads public data only and disables publishing.
- Private project data remains in `site-catalog/catalog.json`. Writing and song-list drafts are in `site-catalog/content.json`. Only explicitly published entries are projected to the public `content.json`.
- Private and public saves are separate GitHub writes. The editor saves private data first. If public publishing fails, it reports the failure and keeps in-memory edits; private drafts remain saved. File SHAs prevent silent overwrites. Reload after an external update before retrying.
- Photo batches create one Git tree and commit, then advance the branch without force. A changed baseline is rejected. New images and their manifest therefore publish together. Files are resized to 1600 pixels, re-encoded without embedded EXIF, and receive a smaller thumbnail. A strict allowlist preserves chosen capture/camera notes in the manifest; serial numbers are excluded. Full GPS coordinates are stored in private `site-catalog/photo-locations.json`; the public manifest includes only locations chosen for sharing, rounded to one decimal degree by default or five decimals for an explicitly selected exact pin. Hidden photos never expose locations. The original files stay on the device.
- Unchecking an already-published photo hides it from the slideshow; it does not erase its public URL or repository history. New unuploaded photos can be removed before publishing.

## Verification

Run `node --test tests/*.test.mjs` from the repository root. The tests cover private draft filtering, file conflicts, atomic photo publishing, Unicode writing, OAuth state validation, expiry, PKCE, and owner enforcement. Live GitHub authorization and publishing still require the configuration above and must be checked after deployment.

Primary documentation: [GitHub App web application flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).

## Editable AI photo descriptions

The same Worker now serves owner-authenticated `/ai/config` and `/ai/describe` endpoints. Add an encrypted **Secret** named `OPENAI_API_KEY` under Cloudflare → this Worker → Settings → Runtime variables and secrets. Enter it directly in Cloudflare, never in chat or the repository. Use a dedicated OpenAI project with Responses API access and active API billing. API usage is billed separately from a ChatGPT subscription. The default model is `gpt-5.6-terra`, with reasoning disabled, high-detail images and a 600-token response limit. An optional `OPENAI_MODEL` variable can select a compatible vision/structured-output model.

Deploy `worker.mjs` with its `photo-ai.mjs` import using Wrangler, or bundle them into one ES module for the Cloudflare code editor. Keep the existing GitHub secrets and owner/origin variables. The studio CSP must include the exact backend origin. Once the secret is deployed, use **Check connection** in Photographs; the automatic draft checkbox will become available.

New uploads get editable caption and accessibility drafts while enabled. Existing photographs have **Suggest description**. Blank fields may be filled; existing words and text edited during generation are preserved, with suggestions offered for explicit application. AI never publishes anything itself. Errors leave the imported photo available for manual description or retry. Turning the checkbox off lasts for the current tab session.

Only a re-encoded JPEG preview of at most 1024 pixels goes to the Worker. The Worker accepts an optional, bounded photographer-confirmed place name, rejects metadata fields/URLs, validates the JPEG dimensions, and strips APP/COM metadata before sending it to OpenAI. GPS, capture metadata, filenames, originals and the GitHub token are not part of the OpenAI request. Provider responses are requested with `store:false`; this disables Responses storage, but does not promise zero provider retention. The Worker logs no request bodies or credentials. Only the configured GitHub numeric owner can request descriptions. Per-isolate burst protection allows 20 attempts/minute; it is not a durable account spending cap. Manage API budgets and billing in the OpenAI project.

Tests use mocked provider responses and real JPEG fixtures. A live inference must also be checked after adding the API key. Documentation: [vision inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [model configuration](https://developers.openai.com/api/docs/models/gpt-5.6-terra).

Confirmed place/landmark notes are saved under `contexts` in private `photo-locations.json` when photographs are published. They are excluded from `slides.json`. Only the typed note is sent as context, never EXIF or coordinates. High-detail previews help read signs and recognize public landmarks; ambiguous places remain generic. Confirmations are per photo, never inferred from unrelated photographs.
