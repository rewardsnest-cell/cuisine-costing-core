/**
 * Recipe video helpers — parse YouTube URLs and produce embed URLs.
 */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  // youtu.be/<id>
  let m = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  // youtube.com/watch?v=<id>
  m = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  // youtube.com/embed/<id> or /shorts/<id>
  m = u.match(/youtube\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  // bare id
  if (/^[A-Za-z0-9_-]{11}$/.test(u)) return u;
  return null;
}

export function youtubeEmbedUrl(url: string | null | undefined): string | null {
  const id = parseYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

export function youtubeThumbnail(url: string | null | undefined): string | null {
  const id = parseYouTubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
