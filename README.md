# inquiredu.github.io

The site at [inquiredu.org](https://inquiredu.org): Sean Beaverson's project catalog.

Two files hold the catalog:

| File | Where | What |
| --- | --- | --- |
| `projects.json` | this repo, public | The cards on the site. Shown cards only. |
| `catalog.json` | [`inquiredu/site-catalog`](https://github.com/inquiredu/site-catalog), private | Every card, in shelf order, hidden ones included. |

Both are written together, private first, by either of the two ways below. Don't edit `projects.json` by hand: the next save rebuilds it from the private catalog.

## Choose projects in Site settings

[inquiredu.org/settings.html](https://inquiredu.org/settings.html), or the gear at the bottom of the home page. It lists every repository you own, and each one can be **Not listed**, **Hidden** or **Shown**. Drag cards into order, edit them, then publish. Anyone can open the page, but it's read-only until your publishing key connects.

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

Settings and the sync use the same two fine-grained tokens. Make them at <https://github.com/settings/personal-access-tokens/new> with resource owner **inquiredu**.

| Key | Repository access | Permissions |
| --- | --- | --- |
| Repo list key | All repositories | None added. The default, Metadata: Read-only, is all it needs. |
| Publishing key | Only `inquiredu.github.io` and `site-catalog` | Contents: Read and write |

Paste them into Settings when it asks. For the sync, save them as secrets:

```bash
gh secret set REPO_LIST_KEY -R inquiredu/inquiredu.github.io
```

```bash
gh secret set PUBLISHING_KEY -R inquiredu/inquiredu.github.io
```

Paste each token when asked. When one expires, make a new one, run the same command, and paste it into Settings again. Until both secrets are set, the action skips with a warning instead of failing.

This repo is public, so its Action logs are too. The sync logs counts only, never repo names or card titles. Details go in the commit to the private catalog.
