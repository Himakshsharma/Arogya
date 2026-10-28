"""Extract normalised keypoints from INCLUDE videos.

Dataset: https://zenodo.org/records/4010759

    python ml/extract_keypoints.py --data INCLUDE --out ml/data/keypoints.npz [--include50]
"""
import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.services.features import assign_hands, normalize_raw  # noqa: E402

MODELS = {
    "hand_landmarker.task": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    "pose_landmarker_lite.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
}
VIDEO_EXT = {".mov", ".mp4", ".avi", ".mkv", ".webm"}

# The 50 classes of INCLUDE-50 as listed in the paper's release
INCLUDE50 = {
    "dog", "mouse", "bird", "cow", "fish", "hat", "dress", "suit", "skirt", "shoes", "t-shirt", "pant",
    "black", "white", "red", "brown", "grey", "monday", "today", "time", "year", "week", "hello",
    "thank you", "good morning", "alright", "how are you", "loud", "quiet", "happy", "sad", "beautiful",
    "ugly", "deaf", "blind", "nice", "train ticket", "car", "bus", "bicycle", "truck", "aeroplane",
    "bank", "court", "train station", "teacher", "student", "i", "you", "he", "she",
}


def ensure_models(folder: Path) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, url in MODELS.items():
        p = folder / name
        if not p.exists():
            print(f"Downloading {name} ...")
            urllib.request.urlretrieve(url, p)
        paths[name] = str(p)
    return paths


def label_from_folder(name: str) -> str:
    """'48. Hello' -> 'HELLO', 'how are you' -> 'HOW-ARE-YOU'"""
    name = re.sub(r"^\s*\d+\s*[.)-]?\s*", "", name).strip()
    return re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").upper()


def find_videos(data_dir: Path, include50: bool):
    for path in sorted(data_dir.rglob("*")):
        if path.suffix.lower() in VIDEO_EXT:
            label = label_from_folder(path.parent.name)
            if include50 and label.replace("-", " ").lower() not in INCLUDE50:
                continue
            yield path, label


def extract_video(path: Path, hand_lm, pose_lm, every: int = 2, max_frames: int = 120) -> list[dict]:
    import cv2
    import mediapipe as mp

    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    frames, i = [], 0
    while len(frames) < max_frames:
        ok, img = cap.read()
        if not ok:
            break
        i += 1
        if i % every:
            continue
        h, w = img.shape[:2]
        if max(h, w) > 720:  # INCLUDE videos are 1080p; downscale for speed
            scale = 720 / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)))
            h, w = img.shape[:2]
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts = int(i * 1000 / fps)
        pose_res = pose_lm.detect_for_video(image, ts)
        hand_res = hand_lm.detect_for_video(image, ts)
        if not pose_res.pose_landmarks:
            continue
        pose = [[p.x, p.y, p.z] for p in pose_res.pose_landmarks[0]]
        hands = [[[p.x, p.y, p.z] for p in hl] for hl in hand_res.hand_landmarks]
        left, right = assign_hands(pose, hands)
        frames.append(normalize_raw(pose, left, right, w, h))
    cap.release()
    # Trim idle frames at the start and end (hands down / not visible)
    def active(f):
        return any(hand and hand[0][1] > -1.15 for hand in (f["l"], f["r"]))
    idx = [k for k, f in enumerate(frames) if active(f)]
    if idx:
        frames = frames[max(0, idx[0] - 1): idx[-1] + 2]
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, type=Path, help="Folder with INCLUDE videos")
    ap.add_argument("--out", default=ROOT / "ml" / "data" / "keypoints.npz", type=Path)
    ap.add_argument("--include50", action="store_true", help="Only the 50-word INCLUDE-50 subset")
    ap.add_argument("--every", type=int, default=2, help="Use every Nth video frame")
    ap.add_argument("--limit", type=int, default=0, help="Stop after N videos (quick test)")
    args = ap.parse_args()

    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python import vision

    models = ensure_models(ROOT / "ml" / "models")
    videos = list(find_videos(args.data, args.include50))
    if args.limit:
        videos = videos[: args.limit]
    if not videos:
        sys.exit(f"No videos found under {args.data}")
    print(f"Found {len(videos)} videos, {len({l for _, l in videos})} classes")

    samples, labels, failed = [], [], 0
    for n, (path, label) in enumerate(videos, 1):
        # Fresh landmarkers per video: VIDEO mode needs increasing timestamps
        hand_lm = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=models["hand_landmarker.task"]),
            running_mode=vision.RunningMode.VIDEO, num_hands=2))
        pose_lm = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=models["pose_landmarker_lite.task"]),
            running_mode=vision.RunningMode.VIDEO))
        try:
            frames = extract_video(path, hand_lm, pose_lm, every=args.every)
        finally:
            hand_lm.close()
            pose_lm.close()
        if len(frames) < 6:
            failed += 1
            continue
        samples.append(json.dumps(frames, separators=(",", ":")))
        labels.append(label)
        if n % 25 == 0:
            print(f"  {n}/{len(videos)} done ({failed} skipped)")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.out, samples=np.array(samples), labels=np.array(labels))
    print(f"Saved {len(samples)} samples to {args.out} ({failed} videos had no usable frames)")


if __name__ == "__main__":
    main()
