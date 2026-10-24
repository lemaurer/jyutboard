# Teaching together

## First connection

1. On either Mac/Windows desktop, save the JyutDeck **external request token** in Settings once. This is the deployment's `NATASHA_REQUEST_API_TOKEN`, not the JyutDeck website login code. **Check lesson services** verifies authorization; it does not record audio or change vocabulary.
2. Open **Share / Sync → Start internet lesson**. Send the private invitation (or iPad link) once. The other person joins that lesson. Keep the host desktop open, awake and online.
3. Thereafter the host opens **Our room**, and the guest chooses **Join Leif / Join Natasha** in Share / Sync. The saved pairing finds the host's current address. Guests never need the host's token.

Both desktop guests and the iPad now refresh the remembered room address on returning to the app, regaining network access and every 30 seconds while visible. If the host restarts its Internet connection, guests recover its new address without pasting a new invitation. A transient socket interruption retries automatically. Recovery is not instantaneous while an iPad is suspended.

## What synchronizes

Cards, conversation turns, avatar expressions, tables, favorites, recordings, drawings, arrows, reveal flags and object positions share the same Yjs document. Each device keeps a local copy in its browser/app storage. Offline changes merge on reconnect to the same room. Export backups of important lessons; clearing app/browser storage can remove local copies.

Persistent document changes are batched about every 16 ms. Cursor, live ink, dragging previews and viewport-follow updates use latest-value presence messages rather than queuing stale animation frames. Final positions and strokes are saved in the shared document. These intervals are scheduling targets, not Internet latency guarantees. Roles provide Chinese or Jyutping views; favorites use one shared tray.

Teacher-only notes remain on Natasha's device and never enter the shared document. Reveal/hide and the teacher/learner view are presentation features, not access controls: someone holding the invitation can access the room document. Do not put secrets in hidden cards.

## How the connection works

The hosting desktop runs the WebSocket relay. For Internet lessons, a temporary Cloudflare tunnel exposes that relay over WSS. JyutDeck stores a hash of the random room capability and the current relay address in its pairing registry. The saved room capability lets invited devices resolve that address and request speech, analysis and vocabulary without receiving a host API token. Desktop settings encrypt saved credentials using the operating system; the web/PWA keeps its pairing in device storage/a secure installation cookie.

The relay keeps its document in memory; persistent copies are on the clients. It is not an always-on cloud lesson server. The host being closed, asleep or offline interrupts the live connection. The temporary tunnel is convenient for this MVP, but it can expire or fail. The underlying tunnel service's testing-oriented availability limits are linked in the README.

## Fixing authorization or speech

**Settings → Check lesson services** uses the same authorization route as speech and analysis. If it fails:

- On the host, save the external request token used by the JyutDeck deployment. Open/refresh the Internet lesson so that its room is registered.
- On the guest, rejoin that paired lesson. No token should be copied to the iPad.
- If checks succeed but recording fails, allow microphone access in the device's settings. Safari requires HTTPS (the published PWA provides this). A transcription-provider failure can still occur even with valid lesson authorization; retry the saved recording or keep it and type.

Desktop analysis, vocabulary and speech now send the paired-room capability alongside any saved token, so an obsolete saved token does not suppress the server's existing registered-room fallback. The server still verifies authorization; no authentication bypass was added. Failed input and recordings are retained.

## Recommended next improvements

These are proposals, not features shipped in this update:

1. Replace temporary tunnels and desktop hosting with a stable hosted relay and durable lesson snapshots. Either person could join even while the other desktop is closed.
2. Add real teacher/learner identities, revocable invitations and access permissions. The current private-link capability model is convenient for two trusted partners, but lacks per-person revocation.
3. Show connection health (host asleep, room lookup, socket connecting, synced) in one small status panel, and provide a single repair action. Add round-trip acknowledgments and measured latency before promising a particular live delay.
4. Add encrypted cross-device backups, resumable audio transfers and bounded document compaction for long lessons, then test on actual iPad/Pencil hardware and unreliable networks.
