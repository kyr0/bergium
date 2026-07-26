/**
 * Pure helpers for building a Webamp playlist from Archive.org metadata.
 *
 * Extracted from the bootstrap so the encoding/mapping logic is fully unit-testable
 * with no network access. Mirrors Archive.org's own Webamp integration: RFC 3986
 * path encoding, `/download/...` URLs with `?tunnel=1` for CORS/byte-range audio,
 * per-file artist (falling back to the item creator, then "somebody").
 */

/** Archive.org item identifier used for the demo playlist. */
export const ARCHIVE_IDENTIFIER = "Trancemaster";

/**
 * RFC 3986 path encoding matching Archive.org: nested "/" -> "%2F" (via
 * encodeURIComponent) and punctuation such as "'" -> "%27", "(" -> "%28" fully
 * percent-encoded (encodeURIComponent leaves `!'()*` unescaped).
 */
export function encodeArchivePath(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Derive a track title from a file name when the metadata lacks `title`. */
export function fallbackTitle(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1);
  return base.replace(/\.mp3$/i, "");
}

/** A Webamp-compatible initial track. */
export interface ArchiveTrack {
  url: string;
  metaData: { artist: string; title: string };
  duration: number;
}

/** Minimal view of an Archive.org item's file entry that we consume. */
interface ArchiveFile {
  name: string;
  format?: string;
  title?: string;
  artist?: string;
  creator?: string;
  length?: string | number;
}

/** Minimal view of an Archive.org metadata response. */
export interface ArchiveMetadata {
  files?: ArchiveFile[];
}

/**
 * Build the Webamp initial track list from Archive.org metadata: every VBR MP3,
 * preserving the metadata order (which equals the live playlist order). Each URL
 * uses the `/download/...` form with `?tunnel=1` so cross-origin requests get a
 * CORS-enabled, byte-range-capable response instead of a redirect to a node.
 */
export function buildInitialTracks(metadata: ArchiveMetadata): ArchiveTrack[] {
  const files = metadata.files ?? [];
  return files
    .filter((file) => file.format === "VBR MP3")
    .map((file) => ({
      url:
        `https://archive.org/download/${encodeURIComponent(ARCHIVE_IDENTIFIER)}/` +
        `${encodeArchivePath(file.name)}?tunnel=1`,
      metaData: {
        artist: file.artist ?? file.creator ?? "somebody",
        title: file.title ?? fallbackTitle(file.name),
      },
      duration: Number(file.length ?? 0),
    }));
}

/**
 * Fetch and parse Archive.org metadata for {@link ARCHIVE_IDENTIFIER} and return
 * the Webamp track list. Throws on a non-2xx response.
 */
export async function fetchArchiveTracks(): Promise<ArchiveTrack[]> {
  const response = await fetch(
    `https://archive.org/metadata/${encodeURIComponent(ARCHIVE_IDENTIFIER)}`,
    { credentials: "omit" },
  );
  if (!response.ok) {
    throw new Error(`Archive.org: HTTP ${response.status}`);
  }
  const metadata = (await response.json()) as ArchiveMetadata;
  return buildInitialTracks(metadata);
}
