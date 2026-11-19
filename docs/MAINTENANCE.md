# Maintaining the creative portfolio

Updated 2026-11-16. The public site and studio shell deploy from [inquiredu/inquiredu.github.io](https://github.com/inquiredu/inquiredu.github.io) on GitHub Pages. Login and AI run in a separate Cloudflare Worker. Keep those two deployment paths distinct.

## Source and data ownership

| Area | Source of truth |
| --- | --- |
| Public presentation | `index.html`, `assets/collection.js`, and the modules and styles below |
| Public project cards | `projects.json`, generated from the private catalog |
| Private project catalog and repository index | `inquiredu/site-catalog`: `catalog.json`, `repos.json` |
| Writing, music, video, and introduction drafts | Private `site-catalog/content.json`; published projection in public `content.json` |
| Photo presentation and images | `slides.json`, `assets/slides/` |
| Private GPS, confirmed photo context, and place reviews | Private `photo-locations.json` and `photo-place-suggestions.json` |
| Cached public feeds | `feeds/medium.json`, `feeds/youtube.json` |
| Dated printable playlist snapshots | `feeds/tape-inserts.json`; manual Studio track lists override them |
| Login and AI | `auth/worker.mjs` and its local imports; `auth/wrangler.jsonc` |
| Public studio service address | `admin/config.json` |

Do not hand-edit generated public content as the normal editorial workflow: the next Studio publication can rebuild it. Preserve current remote changes before any source deployment, especially when editing from several machines. Use non-forced branch updates and reconcile conflicts.

## Presentation file map

| Feature | Main files |
| --- | --- |
| Introduction, projector markup and slideshow | `index.html`, `assets/photo-player.css`, `assets/viewfinder.mjs`, `assets/photo-notes.mjs` |
| Shared theme and compact layout | `assets/winter.css`, `assets/compact-layout.css` |
| Viewfinder stage: one room in view, the scale in the top bar, turning between rooms, fit-to-frame scaling, the upright-phone prompt | `index.html` (`.stage-bar`, `main.stage`, `.scene`), `assets/stage.css`, `assets/stage.mjs`, `tests/stage.test.mjs` |
| Cassette deck and playback | `assets/tape-deck.mjs`, `assets/analog.css`, `assets/listening-room.css` |
| Hinged cases and printed inserts | `assets/tape-cases.css`, `assets/tape-inserts.mjs`, `feeds/tape-inserts.json` |
| Music visualization and shared focus behavior | `assets/music-visualizer.mjs`, `assets/focus-view.mjs`, `assets/focus-view.css` |
| Tube television and channel lineup | `assets/tube-tv.mjs`, `assets/tube-tv.css`, `assets/youtube-source.mjs` |
| Afterimage location artwork | `assets/photo-atlas.mjs`, `assets/geo-art.mjs` |
| Studio publishing and editorial UI | `admin/editor.mjs`, `admin/core.mjs`, `admin/photo-publish.mjs` |
| AI connection and repository context | `admin/ai-client.mjs`, `admin/repo-context.mjs`, `admin/studio-assistant.mjs`, `auth/studio-bridge.mjs`, `auth/studio-assistant.mjs` |

The page loads several established style layers. Place case-specific changes in `tape-cases.css` and page-density changes in `compact-layout.css`. `stage.css` loads last and only frames and arranges the rooms. Each room is a `.scene` inside `main.stage` whose single child is `.scene-inner`; a new room also needs a link in `.finder-scale`. Rooms that are off stage stay mounted (so audio keeps playing) and are made inert. Do not give `.stage`, `.scene` or `.scene-inner` a resting `transform`, `perspective` or `will-change`: it would break the fixed-position focus views. Preserve the public player iframes when opening or closing cases and focus views; moving a live iframe between parents can restart playback. The shared case moves only after the previous source has been discarded.

## Publish site changes

1. Start from the current remote `main` and a clean, healthy checkout. Preserve work from other machines.
2. Preview the static site, for example with `python3 -m http.server 8082 --bind 127.0.0.1` from the repository root. `/admin/?preview=1` uses public data and disables publishing.
3. For behavior changes, run `node --test tests/*.test.mjs`; use `node --check` on changed JavaScript and `git diff --check`. For documentation-only edits, check the diff and document links; unchanged application code does not need another browser regression run.
4. For UI changes, check desktop and narrow layouts, keyboard operation, and the affected media controls. For cassette changes, verify that opening does not autoplay, closing preserves playback, switching disposes of the old source, and focus opens and closes normally. Preserve reduced-motion behavior.
5. Update the affected asset query versions in `index.html` and module imports. Commit and push without forcing newer remote content away.
6. Confirm **pages build and deployment** succeeds, then check the deployed behavior at [inquiredu.org](https://inquiredu.org/).

The final feature release for November 16 is [`ddbbc0c`](https://github.com/inquiredu/inquiredu.github.io/commit/ddbbc0c5fbad567b95e6679ee15e1213f325a72f). Its [Pages deployment](https://github.com/inquiredu/inquiredu.github.io/actions/runs/44004170788) succeeded. Documentation commits can follow it without changing the feature release.

## Deploy the login and AI Worker

Pushes to GitHub Pages do not deploy Cloudflare. The entry point imports the photo, place, assistant, and bridge modules, so deploy the full current `auth/` directory with the installed Wrangler CLI:

```sh
cd auth
wrangler deploy
```

Use the existing Cloudflare configuration and secrets. `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `OPENAI_API_KEY` belong in Cloudflare’s encrypted secrets. `SITE_ORIGIN` and `OWNER_ID` are public configuration. Never substitute an older exported single-file Worker for the current module tree. See [auth/README.md](../auth/README.md) for rebuilding the service and the exact origin/callback.

After a backend deployment, sign in to the studio, run **Test AI connection**, and try one photo suggestion and one repository-backed project suggestion. The authenticated `/ai/config` response should include `enabled: true`, `places: true`, `studio: true`, `repoContext: true`, and `connection: "same-origin-bridge"`. If the README is read but the editor says the service ignored repository details, redeploy the current Worker and verify the capability flag.

The configured model default is defined in `auth/photo-ai.mjs` and `auth/studio-assistant.mjs`; an `OPENAI_MODEL` runtime override can change it. Keep those modules and the authentication documentation aligned when changing the model. The 20-attempt/minute per-isolate limiter is burst protection, not a durable billing cap.

## Feeds and printed track lists

| Workflow or source | Current behavior |
| --- | --- |
| **Refresh creative feeds** (`refresh-medium.yml`) | Scheduled at minute 43 each hour; updates Medium and the YouTube picker; uses the workflow token and requests a Pages build if content changes |
| **Sync catalog** (`sync-catalog.yml`) | Scheduled at minute 23 each hour; reconciles the `shelf` topic using its separate repository-list and publishing secrets |
| SoundCloud insert | Reads the current widget’s public tracks through `getSounds` when loaded |
| Spotify insert | Uses Studio-written tracks or the exact-source dated entry in `feeds/tape-inserts.json`; no scheduled Spotify synchronization |

Schedules can be delayed by GitHub. Both workflows can be dispatched manually. Feed refresh preserves the last valid cache on failure. Neither a new YouTube feed item nor an AI suggestion automatically publishes a selection.

To refresh a Spotify insert, use the public source to obtain the titles actually available, preserve order and credits, and replace the matching snapshot with a new `captured` date. The `url` must match the canonical source URL without tracking parameters. Keep its scope honest: the current snapshot contains the 100 tracks exposed by the preview, not a guaranteed complete playlist. A Studio track list takes precedence and is the simplest owner-editable option. Spotify’s original player stays available for the current selection.

## Troubleshooting and recovery

| Symptom | Next action |
| --- | --- |
| iPad AI reports Load failed | Preserve the unsaved tab; run Test AI connection. Check the bridge origin, current Worker deployment, owner session, and API billing response. Keep the same-origin iframe bridge in place. |
| README read but ignored by AI | Verify `repoContext: true` and deploy all current `auth/` modules. GitHub Pages alone cannot fix a stale Worker. |
| Repository missing from picker | Refresh the list; check public visibility, the app’s existing access, and the saved private repository index. |
| Save conflict | Preserve unsaved work, load the latest catalog/collection, and reapply the intended edit. Do not force a stale snapshot over new work. |
| Provider player fails or limits playback | Expand its original controls or use the source link; do not claim unrestricted playback through an embed. |
| Spotify insert differs from the source | Refresh the dated snapshot or edit Studio’s Songs field; the source player is current. |
| Place suggestion is wrong | Dismiss it or leave it unaccepted; accept only a reviewed approximate area. Existing locations are preserved by refresh. |

For a presentation regression, revert the specific source commit while preserving newer content edits, then verify Pages. For a Worker regression, deploy a known-good complete backend version while retaining the existing secrets and origin configuration. Avoid a branch reset that would erase subsequent photo or catalog publications.

A public source ZIP contains code and public media, not private drafts, original photos, or Cloudflare secrets. Those remain in their respective services or on the owner’s device.
