#!/usr/bin/env python3
"""Build a local CLIP image index for the Karatnik catalog."""
from __future__ import annotations

import base64
import hashlib
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "outputs/karatnik-catalog/site"
WORK = ROOT / "work"
MODEL_DIR = WORK / "visual-search-models"
MODEL_FILE = MODEL_DIR / "vision_model_quantized.onnx"
REVISION = "6b7c523703ae26e39be4b03774966f8571c7f523"
EXPECTED_SHA256 = "583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299"
PREPROCESS = "white-contain-224-v2"
INDEX_PATH = WORK / "visual-index.json"
CACHE_PATH = WORK / "visual-index-cache.json"

if (WORK / "visual-search-deps").is_dir():
    sys.path.insert(0, str(WORK / "visual-search-deps"))
import numpy as np  # noqa: E402
import onnxruntime as ort  # noqa: E402
from PIL import Image, ImageOps  # noqa: E402


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def image_tensor(image: Image.Image) -> np.ndarray:
    image = ImageOps.exif_transpose(image).convert("RGBA")
    background = Image.new("RGBA", image.size, (255, 255, 255, 255))
    image = Image.alpha_composite(background, image).convert("RGB")
    image = ImageOps.contain(image, (224, 224), method=Image.Resampling.BICUBIC)
    canvas = Image.new("RGB", (224, 224), "white")
    canvas.paste(image, ((224 - image.width) // 2, (224 - image.height) // 2))
    arr = np.asarray(canvas, dtype=np.float32) / 255.0
    mean = np.asarray([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
    std = np.asarray([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)
    return np.transpose((arr - mean) / std, (2, 0, 1))[None, ...]


def encode_image(session, image: Image.Image) -> list[int]:
    inputs = {x.name: x for x in session.get_inputs()}
    outputs = {x.name: x for x in session.get_outputs()}
    input_name = "pixel_values" if "pixel_values" in inputs else next(iter(inputs))
    output_name = "image_embeds" if "image_embeds" in outputs else next(iter(outputs))
    emb = np.asarray(session.run([output_name], {input_name: image_tensor(image)})[0], dtype=np.float32).reshape(-1)
    if emb.size != 512:
        raise ValueError(f"Expected 512 dimensional image embedding, got {emb.size}")
    norm = float(np.linalg.norm(emb))
    if not np.isfinite(norm) or norm == 0:
        raise ValueError("Model returned an invalid zero/nonfinite embedding")
    emb = emb / norm
    return np.clip(np.rint(emb * 127), -127, 127).astype(np.int8).tolist()


def catalog_rows(site: Path):
    catalog = json.loads((site / "data.json").read_text(encoding="utf-8"))
    promotions = json.loads((site / "promotions.json").read_text(encoding="utf-8"))
    rows = []
    catalog_photo_count = 0
    for item in catalog.get("items", []):
        photo = item.get("photo", "")
        if photo:
            catalog_photo_count += 1
            rows.append({"art": str(item.get("art", "")), "brand": str(item.get("marka", "")), "photo": photo, "_catalog": True})
    # Upcoming promotion rows may be separate from catalog rows. Include only explicit local photos.
    upcoming = promotions.get("upcoming", [])
    if isinstance(upcoming, dict):
        upcoming = list(upcoming.values())
    for row in upcoming if isinstance(upcoming, list) else []:
        if not isinstance(row, dict) or not row.get("photo"):
            continue
        photo = str(row["photo"])
        if photo.startswith("photos/"):
            rows.append({"art": str(row.get("art", "")), "brand": str(row.get("marka", row.get("brand", ""))), "photo": photo, "_catalog": False})
    return rows, len(catalog.get("items", [])), catalog_photo_count


def ensure_model(model_file: Path):
    if model_file.is_file():
        return
    model_file.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/{REVISION}/onnx/vision_model_quantized.onnx"
    temp = model_file.with_suffix(model_file.suffix + ".download")
    with urlopen(url, timeout=90) as response, temp.open("wb") as out:
        while chunk := response.read(1024 * 1024):
            out.write(chunk)
    temp.replace(model_file)


def main(argv=None):
    global SITE, WORK, MODEL_DIR, MODEL_FILE, INDEX_PATH, CACHE_PATH
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=SITE)
    parser.add_argument("--work", type=Path, default=WORK)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args(argv)
    SITE, WORK = args.site.resolve(), args.work.resolve()
    MODEL_DIR = WORK / "visual-search-models"
    MODEL_FILE = MODEL_DIR / "vision_model_quantized.onnx"
    INDEX_PATH = args.output.resolve() if args.output else WORK / "visual-index.json"
    CACHE_PATH = WORK / "visual-index-cache.json"
    if (WORK / "visual-search-deps").is_dir():
        sys.path.insert(0, str(WORK / "visual-search-deps"))
    started = time.monotonic()
    ensure_model(MODEL_FILE)
    actual_hash = sha256_file(MODEL_FILE)
    if actual_hash != EXPECTED_SHA256:
        raise ValueError(f"Model SHA-256 mismatch: {actual_hash}")
    rows, product_count, catalog_photo_count = catalog_rows(SITE)
    eligible = []
    missing = []
    for row in rows:
        photo = unquote(urlparse(row["photo"]).path)
        path = (SITE / photo).resolve()
        if path.is_file() and (SITE / "photos").resolve() in path.parents:
            eligible.append((row, path))
        elif row.get("_catalog"):
            missing.append(row["photo"])
    cache = {}
    if CACHE_PATH.exists():
        try:
            cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            cache = {}
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    session = ort.InferenceSession(str(MODEL_FILE), sess_options=opts, providers=["CPUExecutionProvider"])
    records = {}
    pending = []
    queued = set()
    for row, path in eligible:
        digest = sha256_file(path)
        record = records.setdefault(digest, {"hash": digest, "vector": None, "refs": []})
        ref = {"art": row["art"], "brand": row["brand"], "photo": row["photo"]}
        if ref not in record["refs"]:
            record["refs"].append(ref)
        if record["vector"] is None:
            cached = cache.get(digest, {})
            if cached.get("model") == EXPECTED_SHA256 and cached.get("preprocess") == PREPROCESS and len(cached.get("vector", [])) == 512:
                record["vector"] = cached["vector"]
            else:
                if digest not in queued:
                    pending.append((digest, path, record))
                    queued.add(digest)
    for digest, path, record in pending:
        with Image.open(path) as im:
            vector = encode_image(session, im)
        record["vector"] = vector
        cache[digest] = {"model": EXPECTED_SHA256, "preprocess": PREPROCESS, "vector": vector}
    serialized = []
    for record in sorted(records.values(), key=lambda r: r["hash"]):
        serialized.append({"hash": record["hash"], "vector": base64.b64encode(np.asarray(record["vector"], dtype=np.int8).tobytes()).decode("ascii"), "refs": record["refs"]})
    index = {
        "version": 1,
        "model": "Xenova/clip-vit-base-patch32",
        "revision": REVISION,
        "model_sha256": EXPECTED_SHA256,
        "preprocess": PREPROCESS,
        "dimensions": 512,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "coverage": {"products": product_count, "with_photo": catalog_photo_count, "indexed_products": len({(row["art"], row["brand"]) for row, _ in eligible if row.get("_catalog")}), "unique_photos": len(serialized)},
        "records": serialized,
    }
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    CACHE_PATH.write_text(json.dumps(cache, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"coverage": index["coverage"], "unresolved_catalog_photo_paths": len(missing), "missing_photo_paths": missing, "new_embeddings": len(pending), "elapsed_seconds": round(time.monotonic() - started, 2), "index": str(INDEX_PATH)}))


if __name__ == "__main__":
    main()
