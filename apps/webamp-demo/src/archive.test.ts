import { test, expect, describe, afterEach, vi } from "vitest";
import {
  encodeArchivePath,
  fallbackTitle,
  buildInitialTracks,
  fetchArchiveTracks,
} from "./archive";

describe("encodeArchivePath", () => {
  test("encodes nested slashes and punctuation per RFC 3986 (Archive.org parity)", () => {
    const input = "Vol. 21-30/Vol. 24/CD2/05 - Mario Piu - Unicorn (Remix '99).mp3";
    expect(encodeArchivePath(input)).toBe(
      "Vol.%2021-30%2FVol.%2024%2FCD2%2F05%20-%20Mario%20Piu%20-%20Unicorn%20%28Remix%20%2799%29.mp3",
    );
  });

  test("fully percent-encodes every reserved punctuation in !'()*", () => {
    for (const ch of ["!", "'", "(", ")", "*"]) {
      const hex = ch.charCodeAt(0).toString(16).toUpperCase();
      expect(encodeArchivePath(ch)).toBe(`%${hex}`);
    }
  });
});

describe("fallbackTitle", () => {
  test("strips the directory and the .mp3 extension (case-insensitive)", () => {
    expect(fallbackTitle("Vol. 24/CD2/05 - Unicorn.mp3")).toBe("05 - Unicorn");
    expect(fallbackTitle("plain.MP3")).toBe("plain");
  });
});

describe("buildInitialTracks", () => {
  const tracks = buildInitialTracks({
    files: [
      { name: "a.mp3", format: "VBR MP3", title: "A", artist: "AA", length: "10" },
      { name: "b/foo.mp3", format: "VBR MP3", creator: "CC", length: 20 },
      { name: "c.mp3", format: "VBR MP3" },
      { name: "ignore.txt", format: "Text" },
    ],
  });

  test("keeps only VBR MP3 files, in metadata order", () => {
    expect(tracks).toHaveLength(3);
    expect(tracks[0]?.metaData.title).toBe("A");
  });

  test("encodes nested slashes and appends ?tunnel=1", () => {
    expect(tracks[1]?.url).toBe(
      "https://archive.org/download/Trancemaster/b%2Ffoo.mp3?tunnel=1",
    );
    expect(tracks[0]?.url).toBe("https://archive.org/download/Trancemaster/a.mp3?tunnel=1");
  });

  test("artist falls back to creator, then 'somebody'", () => {
    expect(tracks[0]?.metaData.artist).toBe("AA");
    expect(tracks[1]?.metaData.artist).toBe("CC");
    expect(tracks[2]?.metaData.artist).toBe("somebody");
  });

  test("title falls back to the file name and duration is coerced (0 when missing)", () => {
    expect(tracks[2]?.metaData.title).toBe("c");
    expect(tracks[2]?.duration).toBe(0);
    expect(tracks[1]?.duration).toBe(20);
    expect(tracks[0]?.duration).toBe(10);
  });

  test("returns an empty list when there are no files", () => {
    expect(buildInitialTracks({})).toEqual([]);
    expect(buildInitialTracks({ files: [] })).toEqual([]);
  });
});

describe("fetchArchiveTracks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("maps tracks from a 2xx metadata response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          files: [{ name: "x.mp3", format: "VBR MP3", title: "X", length: "5" }],
        }),
      }),
    );
    const tracks = await fetchArchiveTracks();
    expect(tracks[0]?.metaData.title).toBe("X");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining("archive.org/metadata/Trancemaster"),
      { credentials: "omit" },
    );
  });

  test("throws on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchArchiveTracks()).rejects.toThrow("HTTP 503");
  });
});
