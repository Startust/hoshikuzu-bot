from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import mysql.connector
import numpy as np
import soundfile as sf
from dotenv import dotenv_values, load_dotenv
from pypinyin import Style, pinyin


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent

_ORIGINAL_ENV_KEYS = set(os.environ)
load_dotenv(REPO_ROOT / ".env", override=False)
for _key, _value in dotenv_values(ROOT / ".env").items():
    if _value is not None and _key not in _ORIGINAL_ENV_KEYS:
        os.environ[_key] = _value

DEVICE = os.getenv("LOCAL_TTS_DEVICE", "auto")
MODEL_NAME = os.getenv("LOCAL_TTS_MODEL", "openbmb/VoxCPM2")
MODEL_DIR = os.getenv("LOCAL_TTS_MODEL_DIR", "data/models/VoxCPM2")
AUDIO_DIR = (ROOT / os.getenv("LOCAL_TTS_AUDIO_DIR", "data/audio")).resolve()
REFERENCE_WAV = os.getenv("LOCAL_TTS_REFERENCE_WAV", "data/reference/neutral-reference.wav")
AUTO_REFERENCE = os.getenv("LOCAL_TTS_AUTO_REFERENCE", "1") == "1"
REFERENCE_TEXT = os.getenv(
    "LOCAL_TTS_REFERENCE_TEXT",
    "这是一个用于固定发音音色的参考声音。请用清晰、自然、稳定的语速朗读。",
)
PUBLIC_BASE_URL = os.getenv("LOCAL_TTS_PUBLIC_BASE_URL", "").rstrip("/")
MAX_TEXT_CHARS = int(os.getenv("LOCAL_TTS_MAX_TEXT_CHARS", "160"))
OPTIMIZE = os.getenv("LOCAL_TTS_OPTIMIZE", "0") == "1"
BATCH_LIMIT = int(os.getenv("LOCAL_TTS_BATCH_LIMIT", "20"))
RETRY_FAILED_AFTER_HOURS = int(os.getenv("LOCAL_TTS_RETRY_FAILED_AFTER_HOURS", "72"))
CFG_VALUE = float(os.getenv("LOCAL_TTS_CFG_VALUE", "1.7"))
INFERENCE_TIMESTEPS = int(os.getenv("LOCAL_TTS_INFERENCE_TIMESTEPS", "16"))
TARGET_DBFS = float(os.getenv("LOCAL_TTS_TARGET_DBFS", "-20"))
PEAK_LIMIT = float(os.getenv("LOCAL_TTS_PEAK_LIMIT", "0.95"))
JAPANESE_READING = os.getenv("LOCAL_TTS_JAPANESE_READING", "1") == "1"
JAPANESE_DICT = os.getenv("LOCAL_TTS_JAPANESE_DICT", "core")
AWS_CLI_PATH = os.getenv("LOCAL_TTS_AWS_CLI_PATH", r"C:\Program Files\Amazon\AWSCLIV2\aws.exe")
AWS_PROFILE = os.getenv("LOCAL_TTS_AWS_PROFILE", "default")
S3_BUCKET = os.getenv("LOCAL_TTS_S3_BUCKET", "")
S3_REGION = os.getenv("LOCAL_TTS_S3_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-2"))
S3_PREFIX = os.getenv("LOCAL_TTS_S3_PREFIX", "audio").strip("/")

HAN_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
EDGE_ASCII_RE = re.compile(r"^[A-Za-z0-9]+|[A-Za-z0-9]+$")
SPEAKABLE_RE = re.compile(
    r"[A-Za-z0-9\u00c0-\u024f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff"
    r"\uf900-\ufaff\uac00-\ud7af]"
)
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")
JAPANESE_READING_RE = re.compile(r"[\u3040-\u30ff\u30fc]")
TRANSIENT_RUNTIME_ERROR_MARKERS = (
    "AcceleratorError",
    "CUDA error:",
    "CUDA out of memory",
    "CUBLAS_STATUS",
    "CUDNN_STATUS",
)

AUDIO_DIR.mkdir(parents=True, exist_ok=True)
_JAPANESE_TOKENIZER = None
_JAPANESE_TOKENIZER_FAILED = False


@dataclass(frozen=True)
class Candidate:
    username: str
    tts_text: str
    source_hash: str
    filename: str
    path: Path
    url: str | None


def log(message: str) -> None:
    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    print(f"{now} {message}", flush=True)


def db_config() -> dict[str, object]:
    database_url = os.getenv("DATABASE_URL")
    parsed = urlparse(database_url) if database_url else None

    return {
        "host": os.getenv("DATABASE_HOST") or (parsed.hostname if parsed else "localhost"),
        "port": int(os.getenv("DATABASE_PORT") or (parsed.port if parsed and parsed.port else 3306)),
        "user": os.getenv("DATABASE_USER")
        or (unquote(parsed.username) if parsed and parsed.username else "postgres"),
        "password": os.getenv("DATABASE_PASSWORD")
        or (unquote(parsed.password) if parsed and parsed.password else "postgres"),
        "database": os.getenv("DATABASE_NAME")
        or ((parsed.path or "").lstrip("/") if parsed else "hoshikuzu"),
        "charset": "utf8mb4",
        "collation": "utf8mb4_unicode_ci",
    }


def connect():
    cfg = db_config()
    return mysql.connector.connect(**cfg)


def ensure_table(conn) -> None:
    sql = """
    CREATE TABLE IF NOT EXISTS `player_name_pronunciation` (
        `username` VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        `audio_url` VARCHAR(768) NULL,
        `audio_format` VARCHAR(16) NULL DEFAULT 'wav',
        `tts_text` VARCHAR(256) NULL,
        `source_hash` VARCHAR(64) NULL,
        `generated_at` DATETIME(3) NULL,
        `last_error` TEXT NULL,
        `failed_at` DATETIME(3) NULL,
        `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX `idx_pronunciation_generated_at` (`generated_at`),
        INDEX `idx_pronunciation_failed_at` (`failed_at`),
        PRIMARY KEY (`username`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    """
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()


def existing_columns(conn) -> dict[str, set[str]]:
    sql = """
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name IN ('ranking_snapshot', 'guild_member_snapshot', 'ranking_event')
    """
    cur = conn.cursor()
    cur.execute(sql)
    columns: dict[str, set[str]] = {}
    for table_name, column_name in cur.fetchall():
        columns.setdefault(str(table_name), set()).add(str(column_name))
    cur.close()
    return columns


def is_speakable(text: str) -> bool:
    return bool(SPEAKABLE_RE.search(text))


def contains_kana(text: str) -> bool:
    return any("\u3040" <= ch <= "\u30ff" for ch in text)


def contains_hangul(text: str) -> bool:
    return any("\uac00" <= ch <= "\ud7af" for ch in text)


def get_japanese_tokenizer():
    global _JAPANESE_TOKENIZER, _JAPANESE_TOKENIZER_FAILED

    if not JAPANESE_READING or _JAPANESE_TOKENIZER_FAILED:
        return None
    if _JAPANESE_TOKENIZER is not None:
        return _JAPANESE_TOKENIZER

    try:
        from sudachipy import Dictionary, SplitMode

        _JAPANESE_TOKENIZER = Dictionary(dict=JAPANESE_DICT).create(SplitMode.C)
        return _JAPANESE_TOKENIZER
    except Exception as exc:
        _JAPANESE_TOKENIZER_FAILED = True
        log(f"warning: Japanese reading disabled: {exc!r}")
        return None


def is_japanese_name_token(pos: tuple[str, ...]) -> bool:
    return len(pos) >= 4 and pos[1] == "固有名詞" and pos[2] == "人名"


def is_japanese_surname_token(token) -> bool:
    pos = token.part_of_speech()
    return is_japanese_name_token(pos) and pos[3] == "姓"


def is_japanese_number_token(token) -> bool:
    pos = token.part_of_speech()
    return token.surface().isdigit() or (len(pos) >= 2 and pos[0] == "名詞" and pos[1] == "数詞")


def has_reliable_japanese_reading(token) -> bool:
    reading = token.reading_form()
    surface = token.surface()
    if token.is_oov():
        return False
    if not reading or reading == "*":
        return False
    if HAN_RE.search(surface) and reading == surface:
        return False
    return True


def should_use_japanese_reading(text: str, tokens: list[object]) -> bool:
    if contains_kana(text):
        return True

    han_count = len(HAN_RE.findall(text))
    if han_count > 6:
        return False

    content_tokens = [token for token in tokens if not is_japanese_number_token(token)]
    if not content_tokens:
        return False

    if (
        len(content_tokens) == 1
        and content_tokens[0].surface() == text
        and han_count >= 2
        and is_japanese_name_token(content_tokens[0].part_of_speech())
    ):
        return True

    first = content_tokens[0]
    surname_surface = first.surface()
    if (
        is_japanese_surname_token(first)
        and len(surname_surface) >= 2
        and all(HAN_RE.search(token.surface()) for token in content_tokens)
    ):
        return True

    return False


def japanese_reading_text(text: str) -> str | None:
    tokenizer = get_japanese_tokenizer()
    if not tokenizer:
        return None

    tokens = list(tokenizer.tokenize(text))
    if not tokens or not all(has_reliable_japanese_reading(token) for token in tokens):
        return None

    if not should_use_japanese_reading(text, tokens):
        return None

    reading = " ".join(token.reading_form() for token in tokens)
    if not JAPANESE_READING_RE.search(reading):
        return None
    return reading


def han_to_pinyin_tokens(text: str) -> str:
    syllables = [
        item[0]
        for item in pinyin(
            text,
            style=Style.TONE3,
            heteronym=False,
            neutral_tone_with_five=True,
            errors="ignore",
        )
        if item and item[0]
    ]
    if not syllables:
        return ""
    return "".join(f"{{{syllable}}}" for syllable in syllables)


def is_pronounceable_char(ch: str) -> bool:
    if ch.isspace():
        return True
    if ch == "\u30fc":
        return True
    category = unicodedata.category(ch)
    return category[0] in {"L", "N", "M"}


def strip_decorative_edges(text: str) -> str:
    if not HAN_RE.search(text):
        return text

    def replace_edge(match: re.Match[str]) -> str:
        token = match.group(0)
        if token.isdigit() or len(token) > 3:
            return token
        return ""

    return EDGE_ASCII_RE.sub(replace_edge, text).strip()


def clean_raw_text(text: str) -> str:
    text = CONTROL_RE.sub(" ", text)
    text = "".join(ch if is_pronounceable_char(ch) else " " for ch in text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def to_tts_text(username: str) -> str:
    username = strip_decorative_edges(username)

    if contains_hangul(username):
        return clean_raw_text(username)

    if HAN_RE.search(username):
        japanese_text = japanese_reading_text(username)
        if japanese_text:
            return japanese_text

    if contains_kana(username):
        return clean_raw_text(username)

    parts: list[str] = []
    index = 0

    for match in HAN_RE.finditer(username):
        raw = clean_raw_text(username[index : match.start()])
        if raw:
            parts.append(raw)

        pinyin_text = han_to_pinyin_tokens(match.group(0))
        if pinyin_text:
            parts.append(pinyin_text)

        index = match.end()

    tail = clean_raw_text(username[index:])
    if tail:
        parts.append(tail)

    return " ".join(parts).strip()


def safe_filename(username: str, source_hash: str) -> str:
    readable = SAFE_NAME_RE.sub("-", username).strip(".-_")
    readable = readable[:40] or "name"
    return f"{readable}-{source_hash[:12]}.wav"


def build_candidate(username: str) -> Candidate | None:
    username = username.strip()
    if not username or not is_speakable(username):
        return None

    tts_text = to_tts_text(username)
    if not tts_text or len(tts_text) > MAX_TEXT_CHARS:
        return None

    reference_id = reference_fingerprint()
    source_hash = hashlib.sha256(
        (
            f"{username}|{tts_text}|wav|"
            f"cfg={CFG_VALUE}|steps={INFERENCE_TIMESTEPS}|"
            f"target_dbfs={TARGET_DBFS}|ref={reference_id}"
        ).encode("utf-8")
    ).hexdigest()
    filename = safe_filename(username, source_hash)
    url = public_url(filename, source_hash)
    return Candidate(
        username=username,
        tts_text=tts_text,
        source_hash=source_hash,
        filename=filename,
        path=AUDIO_DIR / filename,
        url=url,
    )


def public_url(filename: str, version: str | None = None) -> str | None:
    if PUBLIC_BASE_URL:
        url = f"{PUBLIC_BASE_URL}/{quote(filename)}"
        return f"{url}?v={version[:12]}" if version else url
    if S3_BUCKET:
        prefix = f"{S3_PREFIX}/" if S3_PREFIX else ""
        url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{prefix}{quote(filename)}"
        return f"{url}?v={version[:12]}" if version else url
    return None


def reference_path() -> Path | None:
    if not REFERENCE_WAV.strip():
        return None
    path = Path(REFERENCE_WAV)
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def reference_fingerprint() -> str:
    path = reference_path()
    if not path or not path.exists():
        return "none"
    stat = path.stat()
    return f"{path.name}:{stat.st_size}:{int(stat.st_mtime)}"


def fetch_names(conn) -> list[str]:
    retry_hours = max(RETRY_FAILED_AFTER_HOURS, 1)
    playable_filter = "p.audio_url IS NULL"
    if not PUBLIC_BASE_URL and not S3_BUCKET:
        playable_filter = "p.generated_at IS NULL"

    columns = existing_columns(conn)
    selects: list[str] = []

    if "username" in columns.get("ranking_snapshot", set()):
        selects.append(
            "SELECT DISTINCT username FROM ranking_snapshot "
            "WHERE username IS NOT NULL AND TRIM(username) <> ''"
        )

    if "username" in columns.get("guild_member_snapshot", set()):
        selects.append(
            "SELECT DISTINCT username FROM guild_member_snapshot "
            "WHERE username IS NOT NULL AND TRIM(username) <> ''"
        )

    event_columns = columns.get("ranking_event", set())
    if "username" in event_columns:
        selects.append(
            "SELECT DISTINCT username FROM ranking_event "
            "WHERE username IS NOT NULL AND TRIM(username) <> ''"
        )
    if "before_name" in event_columns:
        selects.append(
            "SELECT DISTINCT before_name AS username FROM ranking_event "
            "WHERE before_name IS NOT NULL AND TRIM(before_name) <> ''"
        )
    if "after_name" in event_columns:
        selects.append(
            "SELECT DISTINCT after_name AS username FROM ranking_event "
            "WHERE after_name IS NOT NULL AND TRIM(after_name) <> ''"
        )

    if not selects:
        log("warning: no known player-name source tables exist")
        return []

    sql = """
    SELECT candidate.username
    FROM (
        {candidate_selects}
    ) AS candidate
    LEFT JOIN player_name_pronunciation AS p
        ON p.username = candidate.username
    WHERE
        {playable_filter}
        AND (
            p.failed_at IS NULL
            OR p.failed_at < (UTC_TIMESTAMP(3) - INTERVAL %s HOUR)
            OR p.last_error LIKE '%AcceleratorError%'
            OR p.last_error LIKE '%CUDA error:%'
        )
    ORDER BY candidate.username ASC
    LIMIT %s
    """.format(
        candidate_selects="\n        UNION\n        ".join(selects),
        playable_filter=playable_filter,
    )
    cur = conn.cursor()
    cur.execute(sql, (retry_hours, max(BATCH_LIMIT * 500, 1000)))
    rows = [str(row[0]) for row in cur.fetchall()]
    cur.close()
    return rows


def upsert_success(conn, item: Candidate) -> None:
    sql = """
    INSERT INTO player_name_pronunciation
        (username, audio_url, audio_format, tts_text, source_hash, generated_at, last_error, failed_at)
    VALUES
        (%s, %s, 'wav', %s, %s, UTC_TIMESTAMP(3), NULL, NULL)
    ON DUPLICATE KEY UPDATE
        audio_url = VALUES(audio_url),
        audio_format = VALUES(audio_format),
        tts_text = VALUES(tts_text),
        source_hash = VALUES(source_hash),
        generated_at = VALUES(generated_at),
        last_error = NULL,
        failed_at = NULL
    """
    cur = conn.cursor()
    cur.execute(sql, (item.username, item.url, item.tts_text, item.source_hash))
    conn.commit()
    cur.close()


def upsert_failure(conn, username: str, error: str) -> None:
    sql = """
    INSERT INTO player_name_pronunciation
        (username, last_error, failed_at)
    VALUES
        (%s, %s, UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
        last_error = VALUES(last_error),
        failed_at = VALUES(failed_at)
    """
    cur = conn.cursor()
    cur.execute(sql, (username, error[:4096]))
    conn.commit()
    cur.close()


def is_transient_runtime_error(error: str) -> bool:
    return any(marker in error for marker in TRANSIENT_RUNTIME_ERROR_MARKERS)


def load_model():
    from huggingface_hub import snapshot_download
    from voxcpm import VoxCPM

    model_source = MODEL_NAME
    model_dir = (ROOT / MODEL_DIR).resolve()
    if not Path(MODEL_NAME).is_dir():
        model_dir.mkdir(parents=True, exist_ok=True)
        log(f"downloading model snapshot repo={MODEL_NAME} dir={model_dir}")
        snapshot_download(
            repo_id=MODEL_NAME,
            local_dir=model_dir,
            max_workers=2,
        )
        model_source = str(model_dir)

    return VoxCPM.from_pretrained(
        model_source,
        device=DEVICE,
        load_denoiser=False,
        optimize=OPTIMIZE,
    )


def normalize_audio(wav) -> np.ndarray:
    audio = np.asarray(wav, dtype=np.float32)
    if audio.size == 0:
        return audio

    rms = float(np.sqrt(np.mean(np.square(audio))) + 1e-9)
    target_rms = 10 ** (TARGET_DBFS / 20)
    audio = audio * (target_rms / rms)

    peak = float(np.max(np.abs(audio)) + 1e-9)
    if peak > PEAK_LIMIT:
        audio = audio * (PEAK_LIMIT / peak)

    return audio


def ensure_reference_audio(model) -> Path | None:
    path = reference_path()
    if not path:
        return None

    if path.exists() and path.stat().st_size > 0:
        return path

    if not AUTO_REFERENCE:
        return None

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp.wav")
    log(f"creating reference voice at {path}")
    wav = model.generate(
        text=f"(清晰、自然、稳定的语速){REFERENCE_TEXT}",
        cfg_value=2.0,
        inference_timesteps=max(INFERENCE_TIMESTEPS, 16),
        normalize=True,
        retry_badcase=True,
    )
    sample_rate = getattr(getattr(model, "tts_model", None), "sample_rate", 48000)
    sf.write(tmp_path, normalize_audio(wav), sample_rate, format="WAV")
    tmp_path.replace(path)
    return path


def generate_audio(model, item: Candidate) -> None:
    if item.path.exists() and item.path.stat().st_size > 0:
        return

    tmp_path = item.path.with_suffix(".tmp.wav")
    ref_path = ensure_reference_audio(model)
    kwargs = {}
    if ref_path and ref_path.exists():
        kwargs["reference_wav_path"] = str(ref_path)

    wav = model.generate(
        text=item.tts_text,
        cfg_value=CFG_VALUE,
        inference_timesteps=INFERENCE_TIMESTEPS,
        normalize=False,
        retry_badcase=True,
        **kwargs,
    )

    sample_rate = getattr(getattr(model, "tts_model", None), "sample_rate", 48000)
    audio = normalize_audio(wav)
    sf.write(tmp_path, audio, sample_rate, format="WAV")
    tmp_path.replace(item.path)


def upload_audio(item: Candidate) -> None:
    if not S3_BUCKET:
        return

    aws_path = AWS_CLI_PATH
    if not Path(aws_path).exists():
        aws_path = "aws"

    key = f"{S3_PREFIX}/{item.filename}" if S3_PREFIX else item.filename
    args = [
        aws_path,
        "s3",
        "cp",
        str(item.path),
        f"s3://{S3_BUCKET}/{key}",
        "--content-type",
        "audio/wav",
        "--cache-control",
        "public, max-age=31536000, immutable",
        "--profile",
        AWS_PROFILE,
    ]

    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        stderr = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"aws s3 cp failed: {stderr}")


def main() -> int:
    start = time.time()
    log("local pronunciation batch started")
    if not PUBLIC_BASE_URL and not S3_BUCKET:
        log("warning: no public URL source configured; rows will not get playable URLs")
    if S3_BUCKET:
        log(f"s3 upload enabled bucket={S3_BUCKET} prefix={S3_PREFIX or '(root)'}")

    conn = connect()
    try:
        ensure_table(conn)
        raw_names = fetch_names(conn)
        candidates: list[Candidate] = []
        skipped = 0

        for name in raw_names:
            item = build_candidate(name)
            if item is None:
                skipped += 1
                continue
            candidates.append(item)
            if len(candidates) >= BATCH_LIMIT:
                break

        if not candidates:
            log(f"no candidate names found; skipped={skipped}")
            return 0

        log(f"processing {len(candidates)} names; skipped={skipped}")
        model = load_model()

        ok = 0
        failed = 0
        for item in candidates:
            try:
                log(f"generating username={item.username!r} text={item.tts_text}")
                generate_audio(model, item)
                upload_audio(item)
                upsert_success(conn, item)
                ok += 1
            except Exception as exc:
                error = repr(exc)
                if is_transient_runtime_error(error):
                    log(
                        f"fatal runtime error username={item.username!r}; "
                        "aborting batch so remaining names can retry later: "
                        f"{error}"
                    )
                    elapsed = time.time() - start
                    log(f"done ok={ok} failed={failed} aborted=1 elapsed={elapsed:.1f}s")
                    return 3
                failed += 1
                log(f"failed username={item.username!r}: {error}")
                upsert_failure(conn, item.username, error)

        elapsed = time.time() - start
        log(f"done ok={ok} failed={failed} elapsed={elapsed:.1f}s")
        return 0 if failed == 0 else 2
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
