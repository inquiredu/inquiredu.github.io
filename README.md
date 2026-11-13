# inquiredu.github.io

The site at [inquiredu.org](https://inquiredu.org): Sean Beaverson's project catalog. The cards come from `projects.json`.

## Put a project in the catalog

Give its repo the GitHub topic `catalog`. Within the hour (or about two minutes if you use the command below), the **Sync catalog** action adds a card and the site republishes. Remove the topic and the card is hidden. It stays in `projects.json`, so tagging it again brings it back as you left it.

From inside the project's folder:

```bash
gh catalog
```

```bash
gh uncatalog
```

Both are `gh` aliases. Set them up once:

```bash
gh alias set --shell catalog 'gh repo edit --add-topic catalog && gh workflow run sync-catalog.yml -R inquiredu/inquiredu.github.io && echo "Tagged. The card appears on inquiredu.org in a couple of minutes."'
```

```bash
gh alias set --shell uncatalog 'gh repo edit --remove-topic catalog && gh workflow run sync-catalog.yml -R inquiredu/inquiredu.github.io && echo "Untagged. The card is hidden in a couple of minutes."'
```

You can also add the topic on the repo's GitHub page (the gear next to **About**). The hourly run picks it up.

### What the card says

| Field | Where it comes from |
| --- | --- |
| Title | The live page's title, else the repo name |
| Note | The repo's description, else the live page's description |
| Link | The repo's website field, else its GitHub Pages address, else the repo itself if it's public. Private repos with no site get no link and land in the Workshop group |
| Status | Live, Open source or In progress, unless the repo has a `status-…` topic |
| Subject | Up to three of the repo's other topics |
| Call number | `000` plus three letters, the same as cards added in admin.html |

To set a status from the command line, add a topic such as `status-alpha`, `status-draft` or `status-in-progress`. A status topic always wins over the card's status.

New cards go to the top of the shelf. Polish them in `admin.html` (title, note, call number, order). The sync only acts when a tag is added or removed, so your edits stay.

### Preview without changing anything

```bash
CATALOG_TOKEN=$(gh auth token) node scripts/sync-catalog.mjs --dry-run --assume-tagged=some-repo
```

## One-time setup: the token

Most projects are private repos, and GitHub only shares their topics with a signed-in caller. The action reads them with a read-only token stored as the secret `CATALOG_TOKEN`.

1. Create a fine-grained token at <https://github.com/settings/personal-access-tokens/new>. Resource owner: **inquiredu**. Repository access: **All repositories**. Permissions: leave the defaults, which give **Metadata: Read-only** and nothing else.
2. Save it as the secret:

```bash
gh secret set CATALOG_TOKEN -R inquiredu/inquiredu.github.io
```

Paste the token when asked. When it expires, make a new one and run the same command. Until the secret is set, the action skips with a warning instead of failing.
