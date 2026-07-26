/**
 * Bergium × Webamp demo entry.
 *
 * Thin orchestrator: load the Archive.org Trancemaster playlist, hand it to Webamp
 * (our vendored fork), and render. The fork's `webamp/butterchurn` entry injects
 * bergium-core as Webamp's visualizer, so the milkdrop window renders via bergium
 * and clicks on it toggle Geiss/Milkdrop (with 30s mode/preset cycling and Geiss
 * chasers on by default) — all configured inside the fork, not here.
 */
import Webamp from "webamp/butterchurn";
import { fetchArchiveTracks } from "./archive";

async function main(): Promise<void> {
  const container = document.getElementById("webamp");
  if (container === null) {
    throw new Error("#webamp container not found");
  }

  let initialTracks;
  try {
    initialTracks = await fetchArchiveTracks();
  } catch (err) {
    console.error("[webamp-demo] Failed to load Archive.org playlist:", err);
    container.textContent = "Failed to load the Archive.org playlist. See the console for details.";
    return;
  }

  if (initialTracks.length === 0) {
    container.textContent = "No tracks found for the Archive.org item.";
    return;
  }

  const webamp = new Webamp({
    zIndex: 999,
    initialTracks,
    enableMediaSession: true,
  });

  await webamp.renderWhenReady(container);
  console.log(
    `[webamp-demo] Webamp ready with ${initialTracks.length} tracks. ` +
      "Click the visualizer window to toggle Geiss / Milkdrop.",
  );
}

void main();
