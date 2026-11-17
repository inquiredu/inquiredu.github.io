/* Printed inserts use public titles only. Spotify's embed has no track-list getter,
   so its dated insert is a saved preview, not a claim to live synchronization. */
export function soundCloudTracks(sounds) {
  if (!Array.isArray(sounds)) return [];
  return sounds.filter(sound => typeof sound?.title === 'string' && sound.title.trim()).map(sound => {
    const seconds = Math.floor(Math.max(0, Number(sound.duration) || 0) / 1000);
    return {
      title: sound.title.trim().slice(0, 300),
      artist: typeof sound.user?.username === 'string' ? sound.user.username.slice(0, 120) : '',
      duration: Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : ''
    };
  });
}

let saved;
export async function savedTapeInsert(url) {
  saved ||= fetch(new URL('../feeds/tape-inserts.json', import.meta.url), {credentials: 'omit'})
    .then(response => response.ok ? response.json() : [])
    .catch(() => []);
  const inserts = await saved;
  const insert = Array.isArray(inserts) && inserts.find(item => item.url === url);
  if (!insert || !Array.isArray(insert.tracks) || !/^\d{4}-\d{2}-\d{2}$/.test(insert.captured)) return null;
  return {...insert, tracks: insert.tracks.filter(track => typeof track?.title === 'string' && track.title.trim())};
}
