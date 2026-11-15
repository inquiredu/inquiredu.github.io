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

In **Studio → Photographs**, add several images at once, write captions and image descriptions, reorder them, and choose a daily shuffle or your own sequence. The studio resizes new photographs to 1600 pixels, removes embedded location/camera metadata, generates small thumbnails, and publishes the batch and manifest in one commit. Files never leave the device until you publish. New visible images require an image description.

Hiding an existing photo removes it from the tray, but its published image URL and Git history remain public. The studio does not request access to an entire photo library. Select the photographs you want to share; on devices that expose a photo library in their file chooser, you can select from there. HEIC support depends on the browser; export as JPEG if conversion fails.

`node scripts/darkroom.mjs` is still available for the original macOS folder/Google Photos ZIP workflow.

## Local preview and checks

Serve this directory with a local static HTTP server, then open its address. `/admin/?preview=1` demonstrates the editor using public data, with publishing disabled. It never loads private content. Run:

```sh
node --test tests/studio.test.mjs
```
