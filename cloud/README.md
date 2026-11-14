# BriefLab encrypted cloud sync

The GitHub Pages frontend remains at its original URL. A Cloudflare Worker plus D1 stores only AES-GCM encrypted progress. A 32-byte random recovery key identifies an account. No personal email, password, or API token is committed to GitHub.

## One-time Cloudflare deployment
1. In `cloud/`, install Wrangler or run it with npx; authenticate to Cloudflare on your own machine via `npx wrangler login`.
2. Create the database with `npx wrangler d1 create brieflab-progress`. Copy the actual database ID.
3. Copy `wrangler.toml.example` to `wrangler.toml`, replace the placeholder database ID, and keep personal Cloudflare configuration out of GitHub.
4. Apply `npx wrangler d1 execute brieflab-progress --remote --file=schema.sql`.
5. Deploy with `npx wrangler deploy`.
6. GET `https://<your-worker>.workers.dev/health` must return `{"ok":true,"storage":true}`.
7. Put the actual HTTPS Worker origin into `cloud-config.js` as `window.BRIEFLAB_CLOUD_API='https://<your-worker>.workers.dev'` and publish it.
8. Open the BriefLab study-record page, create a cloud recovery key, and save the key **outside this browser**. Use the same key on other devices.

## Safety and limits
- Never publish a recovery key. Losing both devices' key copies prevents recovery by design.
- The browser encrypts content with AES-GCM before upload, and only ciphertext reaches D1.
- Every save uses optimistic revisions; the client merges histories and retries on conflicts.
- A device without connectivity retains local progress, then retries cloud syncing later.
- The current frontend enforces the cloud endpoint as HTTPS; no API key needs embedding.
- The public API only accepts requests from the BriefLab Pages origin in normal browsers. The random bearer key is required for all record access.
- This backend does not create a password-based login or Google sign-in. Recovery key ownership controls the account.
- Deploying source files to GitHub alone does not activate sync: Cloudflare account authorization, D1 provisioning, and setting the real Worker URL are required.
