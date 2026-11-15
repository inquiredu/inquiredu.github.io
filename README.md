# inquiredu.github.io

The site at [inquiredu.org](https://inquiredu.org): Sean Beaverson's project catalog.

Two files hold the catalog:

| File | Where | What |
| --- | --- | --- |
| `projects.json` | this repo, public | The cards on the site. Shown cards only. |
| `catalog.json` | [`inquiredu/site-catalog`](https://github.com/inquiredu/site-catalog), private | Every card, in shelf order, hidden ones included. |
| `repos.json` | `inquiredu/site-catalog`, private | Every repository you own, for Settings to list. The sync writes it. |

Both are written together, private first, by either of the two ways below. Don't edit `projects.json` by hand: the next save rebuilds it from the private catalog.

## Choose projects in Site settings

Site settings runs only on the owner's computer, at `http://127.0.0.1:8787/settings.html`. It is not on inquiredu.org: GitHub Pages can't put a login in front of a page, so the admin stays off the public site. Its files (`settings.html` and `assets/settings.*`) sit in a local copy of this repo, listed in `.git/info/exclude` so they are never committed. A small local server starts it (`start-settings.command`, kept beside the repo). Log in with your publishing key and it lists every repository you own. Each one can be **Not listed**, **Hidden** or **Shown**. Drag cards into order, edit them, then publish. The key is held in the tab's memory only and is never saved in the browser.

The repo list comes from `repos.json`, which the hourly sync keeps current. **Refresh list** in Settings runs the sync right away and reloads the list when it finishes, usually within a minute. It also picks up any card a `shelf` tag just added.

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

## Slides

The slide projector next to the catalog plays the photographs listed in `slides.json`, with the images in `assets/slides/`. Each day it loads a fresh tray of up to 24 (the `tray` setting) drawn from the whole collection. Everyone sees the same tray that day, Minnesota time. With no slides, the projector stays hidden.

### Add photos: the light table

Open [inquiredu.org/lighttable.html](https://inquiredu.org/lighttable.html), or follow the link at the top of Site settings.

1. **Sign in** with your publishing key, the same one Site settings uses.
2. **Load your film.** Drop photos on the page or press **Choose photos**. On a Mac or iPhone the chooser includes your Photos library. In your browser, each photo is shrunk to 1600 px on the long edge, turned the right way up, and stripped of camera and location data. The month it was taken is read when the photo carries it.
3. **Lay out the slides.** They sit in mounts on a lit table. Click one to look closer and write a caption (it goes on the projector's label tape), the month taken, and a description for screen readers. Untick **In projector** to set a slide aside, or remove it from the collection.
4. **Publish.** One commit uploads the new slides and the updated `slides.json`. The projector picks it up in a minute or two.

Safari reads iPhone HEIC photos directly. Chrome can't; if a HEIC won't open there, use Safari or export it as JPEG.

### Or from the command line

`node scripts/darkroom.mjs` does the same from **Pictures › Slideshow** on a Mac: drop photos (or a Google Photos zip) in that folder and run it. It commits and asks before publishing. Both tools name slides the same way, so a photo added by one is recognized by the other.
