# Tutorial videos

Material for short "how to use the app" videos, made in **Clipchamp**, in English, Russian and Hebrew.

The story is a fictional couple, **Daniel and Noa Bar-Lev** (both in their forties, two children). The video follows
the main flow of the app:

1. Welcome and privacy
2. Import the Pension Clearing House report of each partner
3. Add the missing personal data (tax credit points and so on)
4. Load stock investments from a CSV file
5. Add bank deposits
6. Define expenses (from suggestions and by hand)
7. Projections: funded-to-age, net worth, retirement scenarios, income and tax, spending, risk, retirement age
8. Back up the plan and wrap up

Every number in the narration comes from the demo data below and was checked against what the app shows. Nothing
here is real personal data.

## What you get

| Folder | Contents |
|--------|----------|
| `output/<lang>/` | The screen captures, one clip per scene (`01-intro.mp4` …) plus `full-<lang>.mp4` (the same, as one piece) and `timeline.json`. 1920×1080, H.264, no sound. Not committed: run the recorder to create it. |
| `scripts/` | `prompt-<lang>.txt` (for Clipchamp's Copilot, route A), `script-<lang>.md` (the narration clip by clip, for text-to-speech, route B), `subtitles-<lang>.srt` (timed captions for other tools; Clipchamp cannot import them). |
| `demo-data/` | The two Clearing House reports (zip) and the CSV of stock purchases that the recording uploads. You can use them yourself to try the flow. |
| `tools/` | The recorder and the generators. |

## Making the videos in Clipchamp

The picture is already done: the clips in `output/<lang>/` show the app, with a visible cursor and no sound. What
Clipchamp adds is the **voice-over** (the narration text), **captions** and, if you like, titles and music.

There are two routes to the same result. **Pick one, not both**, or you will get two voice-overs.

| | Route A: ask Copilot | Route B: build it yourself |
|---|---|---|
| Uses | `scripts/prompt-<lang>.txt` | `scripts/script-<lang>.md` |
| Effort | One paste, then check and fix | About 15 minutes per language |
| Risk | Copilot's "Generate a video" is documented to write its own script and pick **stock footage**. Whether it will use your uploaded clips is not documented, so try it and look at the result. | None: you control every step. |

Do this first, whichever route you take:

1. Create a new video in Clipchamp and open **Your media**.
2. Import all 9 clips of one language from `output/<lang>/` (`01-intro.mp4` … `09-outro.mp4`). Do **not** import
   `full-<lang>.mp4` as well: it is the same video as one piece, for when you would rather not handle 9 clips.
3. Work on one language per project. Hebrew, Russian and English are three separate videos.

### Route A: ask Copilot

1. In the new project, open the **Generate a video** panel (work accounts with Microsoft 365 and Copilot Chat; it
   also exists in the Copilot **Create** hub).
2. Open `scripts/prompt-<lang>.txt`, copy **all** of it and paste it into the prompt box. Send it and wait about a
   minute. The prompt lists the clips in order, gives the narration with the moment each line starts, and asks for
   voice-over, captions, a title card and music.
3. Play the result and check it:
   - Does the timeline contain **your** clips, in order, and not stock footage?
   - Does the voice read your narration, in the right language?
   - Is it in sync with the screen?
4. If it used stock footage or its own script, use **Undo** (or start a new project) and switch to Route B. You can
   also keep what is good and replace the stock clips by dragging yours onto them.
5. If the prompt box refuses the full text, paste the first part (up to `NARRATION`) first, and then the narration
   of each clip in a follow-up message.

### Route B: build it yourself (predictable)

1. **Clips.** Drag the 9 clips onto the timeline, one after another, in order. Leave them at normal speed for now.
2. **Voice-over.** Open **Record & create → Text to speech**. Choose the language (Hebrew, Russian or English),
   pick a voice (use the preview button to listen) and the pace. Open `scripts/script-<lang>.md`: every clip has a
   block "for text-to-speech". Paste the block of clip 1, then **Save to timeline**. Move the playhead to the start
   of clip 2 and do the same, and so on for all 9. If a voice is a little too fast or too slow for a clip, change
   the voice pace, not the clip.
3. **Captions.** Select the clips, open the **Captions** tab in the property panel, choose the spoken language and
   **Transcribe media**. Clipchamp reads the voice-over and writes the captions, which is accurate because the
   voice is synthetic. If your language is not in the list, see the note below.
4. **Titles and music (optional).** Add a title card from **Text**, and a soft track from **Content library →
   Audio**, well below the voice.
5. **Export** as 1080p.

### Notes

- **Clipchamp cannot import an SRT file** into the editor. `scripts/subtitles-<lang>.srt` is therefore not a
  Clipchamp input. It is the same narration with timings measured from the recording, for other tools: upload it with
  the finished video to YouTube or Vimeo, or to a subtitle editor. It is also the quickest way to see where each line
  falls in the video.
- **Which order?** Always: import the clips first, then either the Copilot prompt (Route A) or the text-to-speech
  blocks (Route B). The `.md` blocks are not a step before the prompt, and the prompt already contains the same
  narration.
- **Sync.** The clips were recorded so that each step lasts about as long as a voice needs to read its line, so a
  whole-clip voice-over stays within a few seconds of the picture. For a tighter match in Route B, paste the lines
  one by one (the `.md` lists each line with the time it starts inside the clip) and put each one at that time.

The clips are paced to the narration: each step stays on screen for as long as a text-to-speech voice needs to read
its line (about 14 characters per second in English and Russian, 12 in Hebrew). If a voice is a little faster or
slower, let Clipchamp adjust the voice, not the picture.

Each language is about 7½ minutes (Hebrew 7:21, Russian 7:42, English 7:43). To make it shorter, drop whole clips
(for example Bank savings and Expenses), or speed a clip up in Clipchamp (up to about 1.25× stays comfortable). The
clips have no sound, so only the voice-over needs to keep up: use a faster voice pace in Route B. In Route A, remove
"do not change their speed" from the prompt and say the speed instead, because its timecodes assume 1×.

## Re-creating everything

Requirements: Node.js 20 or newer. From this folder:

```powershell
npm install
npx playwright install chromium

# In another terminal, serve the app (from the repository's app folder):
#   npm install
#   npm run dev -- --host 127.0.0.1 --port 5180 --strictPort

npm run demo-data                       # rebuilds demo-data/ (only needed if you change tools/couple.mjs)
npm run record -- --fast                # quick dry run of all three languages, no video
npm run record -- --lang en             # real recording: about 10 minutes to make a video of about 7½ minutes
npm run scripts                         # prompts, scripts and subtitles (uses the measured timings)
```

`npm run record -- --lang en,ru,he` records all three one after the other. Use `--base <url>` (or the `APP_URL`
environment variable) to record a different address, and `--shots` to also keep a PNG of every key moment in
`output/<lang>/shots/`.

Do not touch the mouse or keyboard while a recording runs: the browser is driven by the script and shown with a
visible cursor, but it is a real browser window.

## How it works

- `tools/couple.mjs` holds the couple, their accounts, stock lots, deposits and expenses.
- `tools/generate-demo-data.mjs` writes the two Clearing House reports and the stock CSV from that data.
- `tools/scenario.mjs` is the single source of truth: scenes, steps, the on-screen actions and the narration in all
  three languages. Edit narration or flow here only.
- `tools/record.mjs` plays the scenario in a real browser per language (the app's own language switch, so Hebrew is
  right-to-left and dates follow the language), draws a cursor, records the screen and cuts one clip per scene.
- `tools/build-scripts.mjs` turns the same text and the measured timings into the Clipchamp files.

If you change the narration, record again before building the scripts so that the timings match.
