# JyutBoard

A live teaching canvas for learning Cantonese together. Natasha writes naturally in Chinese; Leif sees Jyutping first. Both views share movable phrase cards, dense phrase tables, notes, drawings, pronunciation recordings, and a session tray.

**[Download for Mac](../../releases/latest)** · Windows installers are available in each GitHub Actions build and in tagged releases.

![JyutBoard teaching desk](docs/teaching-desk.png)

## Start a lesson

1. Choose **Natasha** or **Leif** in the left panel. The view is local to each computer. Chinese leads on Natasha’s screen; Jyutping leads on Leif’s. Hide either side panel with its button in the top bar whenever you want more canvas.
2. Choose Chinese, Jyutping, or English in the input and add a phrase. For Chinese, Jyutping and word meanings appear immediately from the bundled offline dictionary. English translation runs in the background while online translation is enabled.
3. Click a card to edit the phrase and its **Piece by piece** word division, record or attach Natasha’s pronunciation, or save it to the session tray. Natasha can choose a simple phrase or speech bubble and switch between **Full**, **Compact**, **Hover**, **Characters**, **Vocabulary**, and **Practice**. Hover shows just the main text and reveals meaning when pointed at; Characters is transparent, plain Chinese text with no filled card; hover reveals Jyutping and meaning. Vocabulary colours words directly inside the phrase: green recorded/known in JyutDeck, amber in the queue, pink new. The authenticated service reads the Supabase-backed vocabulary and recording state every minute; cached states work offline and sync to the lesson partner. Grey means not yet checked. Settings offers Off, Always, First five seconds, On hover (default), and When selected. Verified statuses are read-only in the word editor; change the vocabulary in JyutDeck. Expand a card to see its embedded note and extra details. Practice hides English throughout Leif’s card and details view. The separate **Hide English from Leif** setting applies to every mode, including hover and the saved tray.
4. Star useful phrases and send them to JyutDeck’s Natasha approval queue. JyutDeck analyses the original Cantonese and handles its own word breakdown. Audio stays on the lesson card because the request API does not accept recordings.

Click the table icon to add a compact phrase table. Its neighbouring dropdown offers Phrase list (default), Vocabulary, Patterns, Question/answer and Comparison. Paired tables automatically derive both Cantonese readings. The inspector offers Minimal (default), Ruled and Soft rows. Natasha enters Chinese; Leif sees Jyutping in that column. English is suggested automatically, and translations and notes are editable in each row. Natasha can hide the table’s English column from Leif. Select a row for its word breakdown.

The canvas starts in the middle of a 5600 × 3600 desk. Double-click empty space or select the phrase tool and click a spot to create a card there. Place sticky notes or stickers the same way. Highlight, pen and arrow tools help explain ideas visually. Drag a phrase card anywhere on its body, or drag tables from their top edge. **⌘Z / Ctrl+Z** undoes your own changes; **⇧⌘Z / Ctrl+Shift+Z** redoes them, preserving your partner’s edits. Select an item and press **Delete** or **Backspace** to remove it; text fields keep their normal editing keys. Pinch the trackpad or hold **Option** while scrolling to zoom in or out around the pointer. Normal two-finger scrolling pans the canvas. The zoom buttons work too. Lessons and audio are saved on the device. Export a lesson backup before changing computers; importing makes a separate copy. The learner can click **Say that again** to send Natasha a quick in-room signal. Selecting a card temporarily opens a hidden details panel; clicking empty space closes it again. A details panel you opened yourself stays open.

## Canvas tools

The sticker library contains 36 original illustrations in seven categories, with search. Stickers respond to clicks on the artwork, and their selection border follows the silhouette. Choose a sticker, then click the canvas to place it; no emoji fonts are needed.

Drag across empty canvas to select several elements, or Shift-click to add/remove individual elements. Move the selection together; the right panel offers shared card modes, shapes, backgrounds, text sizing, alignment, duplication and deletion where applicable. **⌘A / Ctrl+A** selects the whole canvas; **Escape** clears selection. Text fields retain normal selection shortcuts.

Drag the selected element’s corner to resize, or open **Size & style** for exact dimensions. Stickers keep their proportions; hold Shift to preserve proportions when resizing other elements. Drag the small blue connection dot on the edge of any element to another element. The arrow stays attached as either element moves or resizes. Connectors can be selected and deleted like drawings, and are included in lesson backups and live sync.

Pen, marker and free arrows have simple colour and thickness controls. Select a drawn line to move, recolour or delete it. The eraser removes complete strokes as you brush over them, and undo restores them.

![Illustrated sticker library](docs/illustrated-stickers.png)

## Conversations and speaking

Choose the conversation icon for a lightweight dialogue on the canvas. Add turns repeatedly, write Cantonese in each bubble, and edit translations or notes directly. Natasha and Leif are the default speakers; choose Friend, Teacher or a custom name. Leif sees Jyutping in the same bubbles. Person stickers and speech-bubble phrase cards let you arrange freeform conversations too. Double-click a phrase to edit it in place; new blank cards open their editor automatically. A small star appears beside the card on hover; there is no hover header or mode label.

Natasha can hold **Hold to speak** beside the bottom input, say a Cantonese phrase, then release. The exact recording is transcribed by JyutDeck’s existing Cantonese transcription provider and attached to the new card. If transcription fails, retry the saved clip or keep it and type the phrase. The microphone is limited to 60 seconds / 2 MB. Only this explicitly recorded audio is sent for transcription.

The laser tool draws a temporary live trail for both partners that fades after 1.8 seconds and is never saved. The eraser removes saved strokes and supports undo.

![Conversation on the canvas](docs/conversation.png)

## Live sharing

- **Same Wi-Fi:** open the lesson on the host computer, choose **Share / Sync**, and create an invitation. The app hosts a small relay on port **47831** and shows a private `jyutboard://` invite containing the high-entropy room code. Send the invite to the other person. Keep JyutBoard open on the host computer. If the network blocks Wi-Fi device traffic, allow JyutBoard through the local firewall.
- **Different Wi-Fi networks:** choose **Share / Sync → Start internet lesson** on either desktop. Copy the private invitation to your partner, who pastes it into **Lesson invitation → Join lesson**. No account, router settings or relay address needed. Internet hosting also remembers a pairing through JyutDeck. The host’s request token is required once; the guest only pastes the first invitation. Keep the host app open. The bundled, checksum-verified cloudflared binary starts a temporary WSS connection to the host’s relay. After the first invitation, choose **Open our room** on the host and **Join Leif / Join Natasha** on the guest. The pairing privately resolves the new relay address after host restarts. The host must have opened the room before the guest joins. The room capability is kept in OS-encrypted settings and can be removed with Forget pairing. Paired guests can fetch vocabulary and transcribe without an API token; queue submission still uses the existing external request token. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) are intended for testing and have no uptime guarantee. This is the MVP’s remote hosting option; use your own stable WSS relay below for a permanent room.

Natasha’s cursor is a bear 🐻, Leif’s a raccoon 🦝. Click the partner’s name to find their cursor and jump there. **Look here** brings the partner to your spot with a visible highlight. **Follow** follows the partner’s view; Natasha’s **Guide Leif** starts a presenter view that follows her panning and zoom. Leif can stop following at any time. The app sends small document changes, batches rapid edits within 16 milliseconds, and interpolates remote cursors. Encrypted DNS with a system fallback avoids fresh-room address lookup delays.

The included relay keeps active lesson data in memory and forgets idle rooms after an hour. It supports up to 8 people per room, 20 MB per room and 100 active rooms per relay.

Anyone holding the invite can edit the room. The relay operator can read the lesson. Plain `ws://` traffic is unencrypted: use it only on a trusted local network or private VPN. For internet access, use WSS. The app bounds recordings to 2 MB per phrase and rooms to 20 MB.

## JyutDeck setup

Open **Settings** and enter the one-time `NATASHA_REQUEST_API_TOKEN` made for the existing JyutDeck request API. The app stores it with the computer’s OS encryption; it is sent only from the desktop main process to the HTTPS API. Never place it in an invite, a lesson note, or the repository. Configure the token on each computer from your own secret store. Leave the endpoint set to `https://jyutdeck-live-jul08f.vercel.app/api/v1/requests` unless you intentionally run another endpoint.

The app sends the chosen Chinese, English, or Jyutping source, a note with the session title and card note, stable retry keys and small source metadata. The API analyses each request and saves it for Natasha to review. Results stay on each card, including duplicates and individual failures; retrying an unchanged phrase is safe. No API token means local lessons continue to work, but queue sending is disabled.

## Translation and language data

Jyutping and the 231,000-entry Chinese/Jyutping dictionary work offline. The included `to-jyutping` package supplies character-level readings when an exact word reading is missing. Some characters have more than one Cantonese reading; edit a phrase’s Jyutping and word breakdown whenever the dictionary needs help. The frequent conversational phrases have a small curated translation layer.

Online English translation is enabled by default and uses Google’s free translation endpoint from the desktop process. In Settings, disable it to keep new lesson text local, or enter a Google Cloud Translation API key for the supported authenticated service. Online English translations are machine suggestions and can be corrected. No lesson audio is sent for English translation. Push-to-talk deliberately sends the captured clip for Cantonese transcription.

## Run from source

You need Node.js 22+ and npm.

```sh
npm install
npm run prepare:remote # once, for internet hosting from the development app
npm run dev
```

### Build locally

```sh
npm run check
npm run pack
```

`npm run pack` creates a packaged, unpacked test build in `release/`.

On macOS:

```sh
npm run dist:mac
```

Builds a `.dmg` and `.zip` for the Mac computer doing the build. Open `release/` and move JyutBoard into Applications. These community test builds are not Apple notarized. macOS may ask you to confirm the first launch in **System Settings → Privacy & Security**.

On Windows PowerShell:

```powershell
npm install
npm run check
npm run dist:win
```

The Windows installer and portable build appear in `release/`. GitHub Actions builds Mac and Windows packages separately. Create a version tag such as `v0.5.0` to publish downloadable installers on the GitHub Releases page. CI builds are not code signed. Windows SmartScreen may require **More info → Run anyway**.

## Relay on a small Linux host

The relay requires Node.js 22. Build the app first, then run the public `relay` script on a host you control:

```sh
npm install
npm run build
PORT=47831 npm run relay
```

Only expose the relay through a reverse proxy with TLS. Example Caddy site:

```caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:47831
}
```

Use `wss://relay.example.com` when creating invitations. The relay does not write room text or audio to disk. Put it behind your operating-system service manager and firewall; keep the listening port private from the public network.

## Tests and security

```sh
npm test
npm run build
npm run test:e2e
# Optional: starts a temporary public tunnel with synthetic test data
npm run test:remote
# Optional: test two packaged desktop apps across the internet
node scripts/test-desktop.mjs /path/to/JyutBoard/executable
```

Electron uses an isolated, sandboxed renderer with a narrow validated IPC bridge. Queue credentials use macOS Keychain / Windows DPAPI via Electron `safeStorage`. Link navigation, new windows and unexpected permissions are blocked. The room code is a 192-bit capability; share an invitation only with someone who should be able to edit that lesson.

Report bugs through GitHub Issues. Please do not post API tokens or private lesson recordings.

## Contributing

Issues and small focused pull requests are welcome. Please do not attach private lesson data or secrets to issues. `npm run check` runs the offline language, request-shaping, local undo, reconnect, and relay-isolation tests followed by the production build. `npm run test:e2e` checks two-screen teaching, hover/hidden meanings, split/merge word pieces, tables, temporary panels, cursor attention, camera following, silhouette sticker selection, transparent cards, attached connectors, group edits, resizing, drawing selection and erasing.
