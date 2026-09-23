# CorpShift demo video

The [70-second narrated demo](demo-video.mp4) shows the split scenario with the owner's VoiceTake personal voice profile. [English captions](demo-video.srt) are also embedded as an optional subtitle track in the MP4.

The on-screen Protocol Lab panels come from the reviewed local scenario captures in `docs/visual-review/stages/`. The video is an edited explanation of those captured states; its narration describes the actual contract and API behavior documented in [`demo-script.md`](demo-script.md). It does not represent a continuous live browser recording.

To rebuild, export the narration and captions from the VoiceTake project to local files. Keep the VoiceTake source recording, generated WAV, and export manifest under ignored `data/`; never commit those personal voice assets.

```powershell
$env:DEMO_VOICE_WAV = 'D:\path\to\narration.wav'
$env:DEMO_CAPTIONS_SRT = 'D:\path\to\captions.srt'
$env:DEMO_CUTS = '0,8.35,22.38,25.8,29.93,37.32,42.79,55,63,69.81'
node scripts/render-demo-video.mjs
```

The renderer needs Python with Pillow and FFmpeg/FFprobe on `PATH`. It writes working files under ignored `data/demo-video-render/` and the final MP4 to `submission/demo-video.mp4`. Set `DEMO_DRY_RUN=1` to inspect the cards before encoding.
