"""Landmark normalisation and feature vectors.

Mirrored in frontend/src/lib/landmarks.js; keep both in sync.

Frame format:
    p: 6 x [x, y, z]   L/R shoulder, L/R elbow, L/R wrist
    l: 21 x [x, y, z]  signer's left hand, or None
    r: 21 x [x, y, z]  signer's right hand, or None

Origin is the shoulder midpoint, unit is shoulder width, +y up, +z toward camera.
"""
import math

import numpy as np

POSE_IDS = (11, 12, 13, 14, 15, 16)
FEATURE_DIM = 6 * 3 + 21 * 3 * 2      # 144, input size of the LSTM
SEQ_LEN = 30                           # frames per sample for the LSTM
DTW_LEN = 24                           # frames per sample for template matching
TIPS = (4, 8, 12, 16, 20)


def normalize_raw(pose: list, left: list | None, right: list | None, width: float, height: float) -> dict:
    """pose: 33 MediaPipe pose landmarks [x,y,z] in image-normalized units.
    left/right: 21 hand landmarks [x,y,z] (z relative to the wrist) or None.
    """
    def px(pt):
        return (pt[0] * width, pt[1] * height, pt[2] * width)

    ls, rs = px(pose[11]), px(pose[12])
    cx, cy, cz = (ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2, (ls[2] + rs[2]) / 2
    sw = math.hypot(ls[0] - rs[0], ls[1] - rs[1]) or 1.0

    def n(X, Y, Z):
        return [round((X - cx) / sw, 4), round(-(Y - cy) / sw, 4), round(-(Z - cz) / sw, 4)]

    p = [n(*px(pose[i])) for i in POSE_IDS]

    def hand(points, wrist_pose_idx):
        if not points:
            return None
        wz = px(pose[wrist_pose_idx])[2]
        return [n(pt[0] * width, pt[1] * height, wz + pt[2] * width) for pt in points]

    return {"p": p, "l": hand(left, 15), "r": hand(right, 16)}


def assign_hands(pose: list, hands: list[list]) -> tuple[list | None, list | None]:
    """Match detected hands to pose wrists (handedness labels flip when mirrored)."""
    left = right = None
    lw, rw = pose[15], pose[16]
    scored = []
    for h in hands:
        w = h[0]
        dl = (w[0] - lw[0]) ** 2 + (w[1] - lw[1]) ** 2
        dr = (w[0] - rw[0]) ** 2 + (w[1] - rw[1]) ** 2
        scored.append((h, dl, dr))
    if len(scored) == 1:
        h, dl, dr = scored[0]
        return (h, None) if dl < dr else (None, h)
    if len(scored) >= 2:
        (a, al, ar), (b, bl, br) = scored[:2]
        if al + br <= ar + bl:
            left, right = a, b
        else:
            left, right = b, a
    return left, right


def frame_vector(frame: dict) -> np.ndarray:
    """144-d vector used by the LSTM. Missing hands are zeros."""
    p = np.asarray(frame["p"], dtype=np.float32).reshape(-1)
    zeros = np.zeros(63, dtype=np.float32)
    l = np.asarray(frame["l"], dtype=np.float32).reshape(-1) if frame.get("l") else zeros
    r = np.asarray(frame["r"], dtype=np.float32).reshape(-1) if frame.get("r") else zeros
    return np.concatenate([p, l, r])


def _hand_compact(hand, wrist_fallback):
    if hand:
        h = np.asarray(hand, dtype=np.float32)
        wrist = h[0]
        palm = float(np.linalg.norm(h[9] - h[0])) or 1.0
        tips = ((h[list(TIPS)] - wrist) / palm).reshape(-1)
        return np.concatenate([wrist, tips * 0.35, [0.6]])
    return np.concatenate([np.asarray(wrist_fallback, dtype=np.float32), np.zeros(15, dtype=np.float32), [0.0]])


def compact_vector(frame: dict) -> np.ndarray:
    """38-d description for template matching: where each hand is and its shape."""
    p = frame["p"]
    return np.concatenate([_hand_compact(frame.get("r"), p[5]), _hand_compact(frame.get("l"), p[4])])


def mirror_frame(frame: dict) -> dict:
    """Left-handed signers: flip x and swap sides."""
    def flip(points):
        return [[-x, y, z] for x, y, z in points] if points else None
    p = flip(frame["p"])
    p = [p[1], p[0], p[3], p[2], p[5], p[4]]
    return {"p": p, "l": flip(frame.get("r")), "r": flip(frame.get("l"))}


def resample(seq: np.ndarray, n: int) -> np.ndarray:
    """Linear time-resampling of a (T, D) sequence to (n, D)."""
    seq = np.asarray(seq, dtype=np.float32)
    if len(seq) == 0:
        return np.zeros((n, seq.shape[1] if seq.ndim == 2 else 1), dtype=np.float32)
    if len(seq) == 1:
        return np.repeat(seq, n, axis=0)
    src = np.linspace(0, len(seq) - 1, n)
    lo = np.floor(src).astype(int)
    hi = np.minimum(lo + 1, len(seq) - 1)
    t = (src - lo)[:, None]
    return seq[lo] * (1 - t) + seq[hi] * t


def sequence_for_model(frames: list[dict]) -> np.ndarray:
    return resample(np.stack([frame_vector(f) for f in frames]), SEQ_LEN)


def sequence_for_dtw(frames: list[dict]) -> np.ndarray:
    return resample(np.stack([compact_vector(f) for f in frames]), DTW_LEN)


def dtw_distance(a: np.ndarray, b: np.ndarray, band: float = 0.3) -> float:
    """Dynamic Time Warping with a Sakoe-Chiba band.

    Lets the same sign performed faster or slower still match.
    """
    n, m = len(a), len(b)
    cost = np.linalg.norm(a[:, None, :] - b[None, :, :], axis=2)
    w = max(int(band * max(n, m)), abs(n - m))
    acc = np.full((n + 1, m + 1), np.inf)
    acc[0, 0] = 0.0
    for i in range(1, n + 1):
        j0, j1 = max(1, i - w), min(m, i + w)
        for j in range(j0, j1 + 1):
            acc[i, j] = cost[i - 1, j - 1] + min(acc[i - 1, j], acc[i, j - 1], acc[i - 1, j - 1])
    return float(acc[n, m] / (n + m))


def has_motion(frames: list[dict]) -> bool:
    """A sample with no visible hands at all is rejected before matching."""
    return any(f.get("l") or f.get("r") for f in frames)
