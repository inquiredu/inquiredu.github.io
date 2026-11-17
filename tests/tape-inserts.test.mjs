import test from 'node:test';
import assert from 'node:assert/strict';
import {soundCloudTracks, savedTapeInsert} from '../assets/tape-inserts.mjs';

test('public SoundCloud metadata becomes ordered printable credits without invalid durations', () => {
  assert.deepEqual(soundCloudTracks([
    null, {title: '  '}, {title: ' First ', duration: 293999, user: {username: 'Sean'}},
    {title: 'Second', duration: -10}, {title: 'Third', duration: Infinity}
  ]), [
    {title: 'First', artist: 'Sean', duration: '4:53'},
    {title: 'Second', artist: '', duration: ''},
    {title: 'Third', artist: '', duration: ''}
  ]);
  assert.deepEqual(soundCloudTracks({error: 'unavailable'}), []);
});

test('dated Spotify inserts match only their source and reject malformed entries', async t => {
  const url = 'https://open.spotify.com/playlist/example';
  t.mock.method(globalThis, 'fetch', async () => ({ok: true, json: async () => [
    {url, captured: '2026-11-16', tracks: [null, {title: 'First', artist: 'Artist'}, {title: ''}]},
    {url: 'bad-date', captured: 'yesterday', tracks: []}
  ]}));
  assert.deepEqual((await savedTapeInsert(url)).tracks, [{title: 'First', artist: 'Artist'}]);
  assert.equal(await savedTapeInsert(url + '-different'), null);
  assert.equal(await savedTapeInsert('bad-date'), null);
});
