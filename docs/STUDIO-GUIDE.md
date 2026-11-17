# Editing the creative portfolio

Updated 2026-11-16. Open [the studio](https://inquiredu.org/admin/) and choose **Sign in with GitHub** as inquiredu. Visitors see [the public collection](https://inquiredu.org/) without signing in.

## Save and publish

Work in one section at a time. Review its visibility choices, then use **Save & publish this section**. Writing, music, and video entries marked as drafts stay in the private catalog. AI suggestions change nothing publicly until you apply them and publish.

Keep a tab with unsaved edits or photo uploads open. Edits held only in that tab can be lost on reload. If the studio reports that the collection changed on GitHub, preserve your unsaved text before reloading; review the newer collection and reapply your changes. A successful save should be followed by a check of the public page after Pages finishes deploying.

## Projects and Studio help

**Add a project** opens a searchable GitHub repository picker. Choose a repository, review the generated card, and set whether to show it. **Add without a repository** creates a manual card. Move up and Move down control shelf order.

For a repository-backed project, keep **Read the linked repository first** selected in Studio help. The editor reads its README and GitHub details and reports what it read. Review and apply each suggested field. The assistant does not browse the linked website. Private repositories require access through the GitHub App; otherwise the saved repository index can supply limited context.

## Photographs and places

1. Use **Choose photos** for the device photo chooser, or **Choose original files** for exported originals. Apple Photos exports with location information are the most useful for the heatmap. HEIC conversion depends on browser support; JPEG is the fallback.
2. Review the caption and image description. **Suggest words & place** drafts them; a known public landmark or city in the optional context field can improve recognition. Existing words are preserved for review. Descriptions are optional for publishing.
3. Under place sharing, choose private, approximate, or exact location. Approximate sharing is the default for newly imported GPS data. **Read place & notes from original** can restore metadata for a photo already in the collection.
4. **Refresh location suggestions** checks included photographs that have no location. **Review area** shows evidence and an approximate position. **Preview suggested heatmap** is private. **Use approximate area** accepts a suggestion into the local draft; publication still requires Save & publish.
5. Set the sequence or daily shuffle, decide which photographs are included, and publish the batch.

Original files stay on your device. The site receives resized, re-encoded images; only selected metadata and locations are published. Hiding a previously published image removes it from the presentation but does not erase its public URL or Git history.

On the public page, clicking the photo opens the contact sheet. **Hide controls** tucks the controls and thumbnail strip away together. The image and caption remain. **Places** opens the Afterimage artwork; visitors can filter by year, select photographs, show labels, and save the artwork. **Frame notes** and **Kaleidoscope** remain optional views.

## Music and printed cassette inserts

In Listening, create or edit a song list and add a supported Spotify playlist, album, or track, or a SoundCloud profile, set, or track. A Spotify profile link alone is not a playable tape. Mark the entry for publication and save.

Use the **Songs** field to write a custom insert, one track per line:

```text
Song title | Artist | https://example.com/optional-track-link
Another song | Another artist
```

Studio-written tracks take precedence over automatic or saved inserts. SoundCloud supplies live public track titles when the case opens. The featured Spotify selection has a dated 100-track preview snapshot; that printed insert does not automatically change when Spotify changes. Update the Songs field or have a maintainer refresh the saved snapshot. The original source player always remains available for its current playlist.

The public shelf starts with tape spines. Select one to reveal the case, then **Open case · Tracks** to hinge the lid open. Scroll within the printed insert. The source-player disclosure below it exposes the original controls. Opening a case does not autoplay; closing it preserves playback. Selecting another tape replaces the current source. SoundCloud originals use handwritten labels, Spotify playlists use mixtape labels, and albums use a release treatment.

Music focus dims the surrounding page. Its bars/wave visualizer is ambient animation tied to playback state, not a measurement of the audio.

## Videos

Use **Choose videos** to select from the cached YouTube channel feed. Review the numbered table of contents, reorder selections, edit notes, and publish. **Add a video** or Quick add accepts an older video by URL. Feed refreshes never add videos to the public lineup automatically.

The public television has matching channel choices and a focus view. Its power switch starts or removes the official player; YouTube’s own playback controls stay unobstructed. Private assistant context is not published.

## Writing and connected sources

Create a local piece in Writing or add a Medium link through the Inbox. Connected shelves holds the Medium, Spotify, SoundCloud, and YouTube source links. The creative-feeds workflow refreshes public Medium stories and the YouTube picker on an hourly schedule; it retains the last good feed if a request fails. Empty public sections stay out of the landing page.

## When something needs attention

- **Load failed or no AI response:** keep the unsaved tab open and run **Test AI connection**. For service problems, use the [maintenance guide](MAINTENANCE.md).
- **Repository details ignored:** the browser code and Worker may be out of step. The current Worker must report `repoContext: true`.
- **Music will not play:** expand the original player or open the source link; provider and account restrictions still apply.
- **Nothing new on the public page:** check that the section was published and the latest Pages deployment finished, then refresh the public page.

See [the authentication guide](../auth/README.md) for login and AI configuration.
