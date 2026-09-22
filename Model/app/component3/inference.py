"""
inference.py
============
Audio Analysis API — Inference Engine
Smart Recruiter — Component 3

Full prediction pipeline from raw audio bytes to JSON result:

    Audio bytes (WAV, MP3, FLAC, OGG …)
        ↓
    soundfile / scipy fallback
        ↓
    Stereo → Mono  +  Resample → 16 kHz  +  Trim to 6 s
        ↓
    Wav2Vec2ForSequenceClassification  (fine-tuned, full model)
        ↓
    Softmax over 4 labels: anxiety | confident | hesitant | nervous
        ↓
    {anxiety_pct, confident_pct, hesitant_pct, nervous_pct,
     predicted_label, verdict, audio_info}
"""

import io
import logging
import os
import re

import numpy as np
import torch
import torchaudio.transforms as T

from app.component3.loader import ModelBundle

logger = logging.getLogger(__name__)

TARGET_SR = 16000   # Wav2Vec2 requires 16 kHz input

# Hesitation filler words — counted from transcript if provided
HESITATION_WORDS = [
    "uh", "um", "er", "ah",
    "like", "you know", "i mean",
    "sort of", "kind of",
]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def predict(
    audio_bytes:   bytes,
    bundle:        ModelBundle,
    transcription: str = "",
    filename:      str = "audio.wav",
) -> dict:
    """
    Run the full inference pipeline on raw audio bytes.

    Parameters
    ----------
    audio_bytes   : bytes       Raw audio file content (any soundfile-supported format)
    bundle        : ModelBundle Loaded models from loader.py
    transcription : str         Optional transcript for hesitation word counting
    filename      : str         Original filename — used for format hint

    Returns
    -------
    dict with keys:
        anxiety_pct           float   0–100
        confident_pct         float   0–100
        hesitant_pct          float   0–100
        nervous_pct           float   0–100
        predicted_label       str     Highest-scoring label
        hesitation_word_count int     Count of filler words in transcript
        verdict               dict    {label: str, is_anxious, is_confident,
                                       is_hesitant, is_nervous}  bool each
        audio_info            dict    {duration_sec, sample_rate, channels}
        error                 str     Only present if something went wrong
    """
    # ── Step 1: Load audio ───────────────────────────────────────────────
    try:
        waveform, sample_rate = _load_audio(audio_bytes, filename)
    except Exception as e:
        logger.error("[Inference] Audio load failed: %s", e)
        return {"error": f"Could not load audio: {str(e)}"}

    duration_sec = waveform.shape[-1] / sample_rate
    channels     = waveform.shape[0]

    logger.info(
        "[Inference] Audio loaded: %.2fs, %dHz, %d ch",
        duration_sec, sample_rate, channels,
    )

    if duration_sec < 1.0:
        return {"error": "Audio too short — need at least 1 second."}

    # ── Step 2: Preprocess (mono + 16 kHz) ───────────────────────────────
    # Full-length audio for transcription; a 6 s trim for emotion (matches training).
    audio_full    = _to_mono_16k(waveform, sample_rate)
    audio_emotion = audio_full[: bundle.max_samples]

    # ── Step 3: Feature extraction + classification ──────────────────────
    try:
        probs = _classify(audio_emotion, bundle)   # np.ndarray shape (4,)
    except Exception as e:
        logger.error("[Inference] Classification failed: %s", e)
        return {"error": f"Classification failed: {str(e)}"}

    # ── Step 3b: Transcription (optional — whole answer, not just 6 s) ────
    transcript = _transcribe(audio_full, bundle)

    # ── Step 4: Build result ─────────────────────────────────────────────
    labels        = bundle.labels          # ['anxiety', 'confident', 'hesitant', 'nervous']
    pred_idx      = int(np.argmax(probs))
    pred_label    = labels[pred_idx]

    # Map label name → probability (robust to label ordering)
    label_probs   = {label: float(probs[i]) for i, label in enumerate(labels)}

    # Count filler words from the generated transcript (or a caller-supplied one)
    hes_word_count = _count_hesitations(transcript or transcription)

    return {
        "anxiety_pct":           round(label_probs.get("anxiety",   0.0) * 100, 1),
        "confident_pct":         round(label_probs.get("confident", 0.0) * 100, 1),
        "hesitant_pct":          round(label_probs.get("hesitant",  0.0) * 100, 1),
        "nervous_pct":           round(label_probs.get("nervous",   0.0) * 100, 1),
        "predicted_label":       pred_label,
        "transcript":            transcript,
        "hesitation_word_count": hes_word_count,
        "verdict": {
            "label":        pred_label,
            "is_anxious":   pred_label == "anxiety",
            "is_confident": pred_label == "confident",
            "is_hesitant":  pred_label == "hesitant",
            "is_nervous":   pred_label == "nervous",
        },
        "audio_info": {
            "duration_sec": round(duration_sec, 2),
            "sample_rate":  sample_rate,
            "channels":     channels,
        },
    }


# ---------------------------------------------------------------------------
# Audio loading
# ---------------------------------------------------------------------------

def _load_audio(audio_bytes: bytes, filename: str):
    """
    Load audio bytes into a (channels, samples) float32 tensor.
    Uses soundfile for WAV/FLAC/OGG; falls back to scipy for MP3.
    No FFmpeg required.
    """
    import soundfile as sf

    suffix = os.path.splitext(filename)[-1].lower() or ".wav"

    try:
        audio_np, sample_rate = sf.read(
            io.BytesIO(audio_bytes), dtype="float32", always_2d=True
        )
        # soundfile → (samples, channels); transpose to (channels, samples)
        audio_np = audio_np.T
        return torch.from_numpy(audio_np), sample_rate

    except Exception:
        # Fallback: write to temp file and use scipy (handles some MP3/WAV variants)
        from scipy.io import wavfile
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            sample_rate, audio_np = wavfile.read(tmp_path)
            if audio_np.ndim == 1:
                audio_np = audio_np[np.newaxis, :]
            else:
                audio_np = audio_np.T
            return torch.from_numpy(audio_np.astype(np.float32)), sample_rate
        finally:
            os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def _to_mono_16k(waveform: torch.Tensor, sample_rate: int) -> np.ndarray:
    """
    Convert a waveform to a mono, 16 kHz, 1-D float32 NumPy array.

    No trimming — the caller decides how much to keep (emotion uses the first 6 s,
    transcription uses the whole answer).
    """
    # Stereo → mono
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    # Resample if needed
    if sample_rate != TARGET_SR:
        resampler = T.Resample(orig_freq=sample_rate, new_freq=TARGET_SR)
        waveform  = resampler(waveform)

    return waveform.squeeze(0).numpy().astype(np.float32)


def _transcribe(audio: np.ndarray, bundle: ModelBundle) -> str:
    """
    Transcribe mono 16 kHz audio using the bundle's faster-whisper model.

    Returns an empty string if no transcriber is loaded or transcription fails —
    transcription is a best-effort enhancement, never a hard failure.
    """
    if getattr(bundle, "transcriber", None) is None:
        return ""

    try:
        segments, _info = bundle.transcriber.transcribe(
            audio,
            language="en",
            beam_size=5,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        # Collapse any repeated whitespace introduced by joining segments
        text = re.sub(r"\s+", " ", text)
        logger.info("[Inference] Transcribed %d chars.", len(text))
        return text
    except Exception as e:
        logger.error("[Inference] Transcription failed: %s", e)
        return ""


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def _classify(audio: np.ndarray, bundle: ModelBundle) -> np.ndarray:
    """
    Run the fine-tuned Wav2Vec2ForSequenceClassification on preprocessed audio.

    Returns
    -------
    np.ndarray shape (num_labels,)  — softmax probabilities
    """
    inputs = bundle.feature_extractor(
        audio,
        sampling_rate=TARGET_SR,
        return_tensors="pt",
        padding=True,
    )

    input_values = inputs["input_values"].to(bundle.device)

    # attention_mask is optional but improves accuracy on padded inputs
    attention_mask = inputs.get("attention_mask")
    if attention_mask is not None:
        attention_mask = attention_mask.to(bundle.device)

    with torch.no_grad():
        outputs = bundle.model(
            input_values=input_values,
            attention_mask=attention_mask,
        )
        probs = torch.softmax(outputs.logits, dim=-1).cpu().numpy()[0]

    return probs


# ---------------------------------------------------------------------------
# Hesitation word counting
# ---------------------------------------------------------------------------

def _count_hesitations(text: str) -> int:
    """Count hesitation filler words in an optional transcript."""
    if not text:
        return 0
    text = text.lower()
    return sum(
        len(re.findall(r"\b" + re.escape(w) + r"\b", text))
        for w in HESITATION_WORDS
    )