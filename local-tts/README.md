# Local TTS Batch Job

Local VoxCPM batch job for player name pronunciation. It periodically scans
the production database for player names, generates missing audio files on this
computer, and writes the public audio URL to `player_name_pronunciation`.

The bot can later show a play option only when a row already has `audio_url`.
Japanese names that Sudachi can read are converted to katakana readings first;
other Chinese characters are converted to pinyin phonemes for better accuracy.
Remaining readable names are sent to VoxCPM as text.

## First-Time Setup

From this folder:

```powershell
.\scripts\setup.ps1
```

This creates `.venv` and installs PyTorch CUDA 12.8 plus VoxCPM dependencies.
The first run may download model weights and can take a while.
Model files are stored under `data\models\VoxCPM2` to avoid Windows symlink
issues in the default Hugging Face cache.

The default reference voice is `data\reference\neutral-reference.wav`, generated
locally once and reused for future names so the generated audio keeps a more
consistent timbre.

Japanese name detection uses SudachiPy with `sudachidict_core`. Names containing
kana can use dictionary readings when available. Pure CJK names are handled more
conservatively: the job accepts whole proper-name matches, or names beginning
with a multi-kanji Japanese surname such as `小鳥遊` or `坂井`. Ordinary Chinese
names fall back to pinyin phoneme input.

Copy `.env.example` to `.env` if setup did not already do it. Configure S3
settings for your deployment:

```dotenv
LOCAL_TTS_AWS_PROFILE=default
LOCAL_TTS_S3_BUCKET=your-pronunciation-audio-bucket
LOCAL_TTS_S3_REGION=us-east-2
LOCAL_TTS_S3_PREFIX=audio
```

If `LOCAL_TTS_PUBLIC_BASE_URL` is empty, the job writes the public S3 object URL
with a `?v=<source_hash>` version query. The query avoids stale browser or
Discord playback when a name is regenerated. Set `LOCAL_TTS_PUBLIC_BASE_URL`
later if you put CloudFront or a custom domain in front of the bucket.

## Run Once

```powershell
.\scripts\run-once.ps1
```

## Run On A Schedule

Install the Windows scheduled task:

```powershell
.\scripts\install-scheduled-task.ps1
```

By default it runs at logon and repeats every 30 minutes. Logs go to `logs\`.

Remove the scheduled task:

```powershell
.\scripts\uninstall-scheduled-task.ps1
```

## Notes

- Audio cache lives in `data\audio`.
- Model cache lives in `data\models`.
- Reference voice lives in `data\reference`.
- Generated audio is uploaded to `s3://<LOCAL_TTS_S3_BUCKET>/<LOCAL_TTS_S3_PREFIX>/`.
- Public URLs include `?v=<source_hash>` to avoid long-lived cached audio after
  regeneration.
- Output is RMS-normalized before upload for more consistent playback volume.
- Decorative punctuation and short ASCII edge decorations around Chinese names
  are removed from TTS input, so names like `0o泡泡糖o0` are pronounced as
  `{pao4}{pao4}{tang2}`.
- Set `LOCAL_TTS_JAPANESE_READING=0` to disable Sudachi reading lookup. Set
  `LOCAL_TTS_JAPANESE_DICT=core` unless a larger Sudachi dictionary is installed.
- Set `LOCAL_TTS_DEVICE=cpu` if CUDA has problems, but GPU is strongly
  recommended.
- Set `LOCAL_TTS_OPTIMIZE=1` after the basic path is stable if you want to try
  faster generation.
- It generates names that contain readable letters, numbers, Chinese/Japanese
  kana, CJK ideographs, or Hangul.
- It converts recognized Japanese names like `小鳥遊五花2` to katakana readings
  like `タカナシ イツカ ニ`.
- It converts remaining CJK ideographs to pinyin phoneme input like
  `{zhang1}{wei3}` and leaves other text readable for VoxCPM.
