# inquiredu.github.io

The site at [inquiredu.org](https://inquiredu.org): Sean Beaverson's project catalog.

Two files hold the catalog:

| File | Where | What |
| --- | --- | --- |
| `projects.json` | this repo, public | The cards on the site. Shown cards only. |
| `catalog.json` | [`inquiredu/site-catalog`](https://github.com/inquiredu/site-catalog), private | Every card, in shelf order, hidden ones included. |
| `repos.json` | `inquiredu/site-catalog`, private | Every repository you own, for Settings to list. The sync writes it. |

Both are written together, private first, by either of the two ways below. Don't edit `projects.json` by hand: the next save rebuilds it from the private catalog.

## The studio: sign in and edit

The browser editor at [`/admin/`](https://inquiredu.org/admin/) manages projects, photographs, writing, song lists, and the introduction. It uses **Sign in with GitHub** for the inquiredu owner. Connect it once using [the authentication setup](auth/README.md); until then its sign-in button stays disabled. The public page stays open to visitors.

**Add a project** opens a searchable repository picker. It combines live public repositories, repositories available to the current GitHub sign-in, and the private saved repository index. Existing shelf entries reopen for editing without duplicates; a new selection fills a hidden draft with its title, description, link, and topics. Review it before publishing. **Add without a repository** keeps manual project creation available. Private repositories outside the app’s approved access depend on the saved index and its checked date.

Project changes preserve the existing private catalog, including hidden entries and sync bookkeeping. Reorder with Move up / Move down, edit a card, choose whether it is shown, then **Save & publish this section**. Each section saves separately. Writing and song-list drafts stay in the private `site-catalog/content.json`; only published entries reach the public page. Empty writing and music sections are omitted from the landing page.

The original computer-only Settings and Light Table, if already installed, remain available on that computer. They are not included in this repository. The studio replaces their need for a manually pasted publishing key.

## Or tag a repo `shelf`

Give a repo the GitHub topic `shelf` and the **Sync catalog** action adds a card and shows it. That happens within the hour, or in about two minutes if you use the command below. Remove the topic and the card is hidden. It stays in the private catalog, so tagging it again brings it back as you left it.

From inside the project's folder:

```bash
gh shelve
```

```bash
gh unshelve
```

Both are `gh` aliases. Set them up once:

```bash
gh alias set --shell shelve 'gh repo edit --add-topic shelf && gh workflow run sync-catalog.yml -R inquiredu/inquiredu.github.io && echo "Shelved. The card appears on inquiredu.org in a couple of minutes."'
```

```bash
gh alias set --shell unshelve 'gh repo edit --remove-topic shelf && gh workflow run sync-catalog.yml -R inquiredu/inquiredu.github.io && echo "Unshelved. The card is hidden in a couple of minutes."'
```

You can also add the topic on the repo's GitHub page (the gear next to **About**). The hourly run picks it up.

### What a new card says

| Field | Where it comes from |
| --- | --- |
| Title | The live page's title, else the repo name |
| Note | The repo's description, else the live page's description |
| Link | The repo's website field, else its GitHub Pages address, else the repo itself if it's public. Private repos with no site get no link and land in the Workshop group |
| Status | Live, Open source or In progress, unless the repo has a `status-…` topic |
| Subject | Up to three of the repo's other topics |
| Call number | `000` plus three letters, the same as cards added in Settings |

To set a status from the command line, add a topic such as `status-alpha`, `status-draft` or `status-in-progress`. A status topic always wins over the card's status.

New cards go to the top of the shelf. Polish them in Settings (title, note, call number, order). The sync only acts when a tag is added or removed, so your edits stay. One exception: choosing **Not listed** in Settings for a repo that still has the `shelf` tag doesn't last, because the sync adds it back. Remove the tag to keep it off.

The sync and Settings never overwrite each other silently. If one saves while the other has the catalog open, GitHub refuses the second save and it says to reload (Settings) or tries again next hour (the sync).

### Preview without changing anything

```bash
REPO_LIST_KEY=$(gh auth token) PUBLISHING_KEY=$(gh auth token) node scripts/sync-catalog.mjs --dry-run --assume-tagged=some-repo
```

## One-time setup: the two keys

Make two fine-grained tokens at <https://github.com/settings/personal-access-tokens/new> with resource owner **inquiredu**.

| Key | Repository access | Permissions | Used by |
| --- | --- | --- | --- |
| Publishing key | Only `inquiredu.github.io` and `site-catalog` | Contents: Read and write. Actions: Read and write | You, to log in to Settings. Also the sync. |
| Repo list key | All repositories | None added. The default, Metadata: Read-only, is all it needs | The sync only. It never goes in a browser. |

Paste the publishing key into Settings. Save both as secrets, so the sync can run:

```bash
gh secret set REPO_LIST_KEY -R inquiredu/inquiredu.github.io
```

```bash
gh secret set PUBLISHING_KEY -R inquiredu/inquiredu.github.io
```

Paste each token when asked. When one expires, make a new one and run the same command. If it's the publishing key, paste it into Settings again too. Until both secrets are set, the action skips with a warning instead of failing.

This repo is public, so its Action logs are too. The sync logs counts only, never repo names or card titles. Details go in the commit to the private catalog.

## Photographs and the viewfinder

A compact viewfinder in the upper introduction quietly cycles through `slides.json`. It pauses on hover, keyboard focus, or a hidden tab. Reduced-motion visitors start in manual mode. Click the frame to flip it to a contact sheet. Choose a photograph to flip back, or use Back / Escape. The full frame is preserved, including portraits; reduced-motion mode also disables the flip animation.

**Frame notes** reveals the capture date, camera and lens, exposure settings, and frame dimensions when available. The color swatches are sampled from the photograph itself. **Kaleidoscope** is an optional mirrored view made from that same photo; it gently turns, responds to pointer movement, and pauses when offscreen, in the background, or on the contact sheet. Reduced-motion mode keeps the pattern still.

The seven original uploads no longer contain EXIF. They show their known month, dimensions, and sampled colors. In the editor, **Read place & notes from original** restores selected camera details and GPS from a file you choose without replacing the displayed photo. New imports read those details before resizing. Each image has a **Share capture date and camera notes** choice; device serial numbers, owner names, and paths are never copied into the public manifest. Disabling camera notes omits them from the saved public manifest (the manually entered month remains).

In **Studio → Photographs**, **Choose photos** uses the device’s image chooser (including Photo Library on iPhone/iPad). **Choose original files** accepts exported JPEG, PNG, WebP, HEIC, or HEIF files. On a Mac, the file chooser may offer Photos under Media; browser support varies. Apple Photos originals are the reliable option for retaining map coordinates. The import summary counts images with and without a location. This is selected-photo import, not continuous iCloud library sync. Add several images at once, write captions and image descriptions, reorder them, and choose a daily shuffle or your own sequence. The studio resizes new photographs to 1600 pixels, removes embedded metadata from the image file, saves selected camera notes separately, generates small thumbnails, and publishes the batch and manifest in one commit. Public image files upload only when you publish; AI requests send a small re-encoded preview while originals stay on your device. Captions and image descriptions are optional and can be added after publication. An AI error never blocks publishing. Photo saves preserve unrelated site code updates and still refuse concurrent edits to the photo collection. Unsaved edits remain in the current tab until published.

Hiding an existing photo removes it from the tray, but its published image URL and Git history remain public. The studio does not request access to an entire photo library. Select the photographs you want to share; on devices that expose a photo library in their file chooser, you can select from there. HEIC support depends on the browser; export as JPEG if conversion fails.

`node scripts/darkroom.mjs` is still available for the original macOS folder/Google Photos ZIP workflow.

## YouTube television and studio assistant

The Moving pictures section uses a wooden tube-TV enclosure with working power and channel controls. The official YouTube player loads only after a visitor switches it on, supports inline playback, and keeps its native controls clear. Turning power off removes the player and stops playback. The public channel feed is cached in `feeds/youtube.json`; the existing hourly creative-feeds workflow refreshes it without a YouTube API key and keeps the previous feed on failure. Curated titles and notes take precedence. In **Studio → Videos**, bring a channel video into the editor to edit or hide it, or paste a YouTube link into Quick add. Private video context is omitted from published content.

**Studio assistant** offers reviewable editorial suggestions across projects, writing, listening, videos, and the introduction. **Test AI connection** checks the service, upload path, and AI response. Every suggestion remains a draft until explicitly applied and published.

## Local preview and checks

Serve this directory with a local static HTTP server, then open its address. `/admin/?preview=1` demonstrates the editor using public data, with publishing disabled. It never loads private content. Run:

```sh
node --test tests/*.test.mjs
```

The EXIF reader is the vendored `exifr` 7.1.3 distribution (MIT license in `assets/vendor/exifr-LICENSE.txt`). It runs locally in the editor; photo originals are not sent to a metadata service.


## Places, as a light print

**Places → Light print** draws an exportable density artwork from shared photo locations, without a basemap. More photographs make a place glow more brightly. Visitors can filter by year, show place labels, select photographs, or switch to an OpenStreetMap view. No sample coordinates are published; the view stays empty until photographs have shared locations.

The studio stores full coordinates in private `site-catalog/photo-locations.json`. A new geotagged import defaults to approximate sharing: public coordinates are rounded to one decimal degree (roughly 10 km, varying by latitude). Choose **Keep this location private** or **Exact pin** per photo. Hidden photographs never contribute to the public print. Original image files stay on the device; resized uploads have embedded metadata removed. Any location deliberately published remains in Git history even after it is hidden.

Apple Photos originals or JPEG exports with location information are the most useful input. Google Photos downloads can be imported too; add missing places manually. This is selected-file import, not automatic library synchronization. Google Photos Picker requires separate OAuth setup and strips GPS from downloads, so it is not connected here.

## Writing and listening

**Studio → Inbox** accepts Medium, Spotify, and SoundCloud links as drafts. The optional bookmark-bar shortcut brings the current source page into that inbox. Set profile links under **Connected shelves** and save. Individual Spotify selections and public SoundCloud profiles, tracks, or sets open their official players on demand; nothing autoplays. Updating a playlist at its source updates the embedded player.

Medium stories come from the public RSS feed. The hourly **Refresh Medium** workflow refreshes `feeds/medium.json`, keeping only titles, dates, short plain-text excerpts, and source links. It preserves the last good feed on network failure. It uses the temporary repository GITHUB_TOKEN with contents/write and pages/write, needs no saved publishing key, and explicitly requests a Pages build after changes. The older project-topic sync is independent and still needs its two keys. The source profile must match before cached stories are displayed. Local writing and imported stories share one reading shelf, with duplicate links removed. Spotify profile links are navigation links; add a playlist, album, track, or other supported selection to create a player.

Leaflet 1.9.4 and fast-xml-parser 5.12.1 are vendored with their licenses. The map loads only when selected, credits OpenStreetMap, and does not prefetch tiles. The light print needs no map service.
