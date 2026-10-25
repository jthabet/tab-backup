# Releasing a new version

Both stores ship the same version from `src/manifest.json`. Each release needs
a version higher than the one already published. Replace `0.9.0` with the new
version in every command.

## Prepare

1. Start from an up-to-date `master`:

   ```sh
   git switch master
   git pull --ff-only
   pnpm install --frozen-lockfile
   ```

2. Run the [smoke test](DEVELOPMENT.md#smoke-test) with `pnpm dev` and
   `pnpm dev:chrome`.
3. Set the new version:

   ```sh
   sed -i '' -E 's/"version": "[^"]+"/"version": "0.9.0"/' src/manifest.json
   ```

4. Build and lint. This must report 0 errors:

   ```sh
   pnpm lint
   ```

5. Commit, tag and push:

   ```sh
   git add src/manifest.json
   git commit -m "release: 0.9.0"
   git tag v0.9.0
   git push origin master v0.9.0
   ```

## Firefox Add-ons

1. Package the extension and zip the source code for Mozilla's reviewers:

   ```sh
   pnpm build-extension
   git archive --format=zip -o web-ext-artifacts/tab_backup-0.9.0-source.zip v0.9.0
   ```

2. Submit it. This reads the AMO API key and secret from 1Password, then waits
   up to 15 minutes for approval; if it times out, the submission still went
   through.

   ```sh
   pnpm exec web-ext sign --channel=listed --api-key="$(op read 'op://dev/Firefox add-on/username')" --api-secret="$(op read 'op://dev/Firefox add-on/credential')" --upload-source-code=web-ext-artifacts/tab_backup-0.9.0-source.zip
   ```

3. Check the review status and add release notes in the
   [Add-on Developer Hub](https://addons.mozilla.org/developers/addons).

The listing text and screenshots are in [`store/listing.md`](../store/listing.md).

The first release with translations (manifest `default_locale` `en`, while
the listing's default language is English (UK)): check afterwards that the
listing's default language and summary on Firefox Add-ons are unchanged.

## Chrome Web Store

1. Package the Chromium build:

   ```sh
   pnpm build-extension:chrome
   ```

2. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole),
   open Tab Backup, go to **Package** and upload
   `web-ext-artifacts/tab_backup-chrome-0.9.0.zip`.
3. Update the listing and privacy answers if anything changed. They are in
   [`store/chrome/listing.md`](../store/chrome/listing.md); add the version to
   its version history.
4. Select **Submit for review**. Reviews usually take a few days.

If permissions change, update [`PRIVACY.md`](../PRIVACY.md) and both listings
before submitting.
