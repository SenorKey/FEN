#!/usr/bin/env python3
"""
jobs-api.py — Tiny JSON-backed REST service for the /jobs page on FEN.

Stores everything in a single JSON file. Designed to be run as a systemd
service on the Fedora box, behind Apache's reverse-proxy (just like Ollama).

Endpoints (mounted under /api/jobs-data via Apache):
  GET    /                       — full data blob { resumes, applications }
  PUT    /resumes/<category>     — body { text }
  POST   /applications           — body is the new app record; returns it w/ id
  PATCH  /applications/<id>      — body is a partial record; merges
  DELETE /applications/<id>      — removes

No auth here — auth is handled at the Apache layer (basic auth on /jobs/
and /api/jobs-data/, plus the firewall keeping this port bound to localhost).
"""

import json
import os
import sys
import tempfile
import threading
import uuid
from datetime import datetime

from flask import Flask, request, jsonify, abort

# ── Config ──
DATA_PATH = os.environ.get("FEN_JOBS_DATA", "/var/lib/fen-jobs/data.json")
BIND_HOST = os.environ.get("FEN_JOBS_HOST", "127.0.0.1")
BIND_PORT = int(os.environ.get("FEN_JOBS_PORT", "8765"))

VALID_CATEGORIES = {"software", "seo", "it"}
VALID_STATUSES = {"saved", "applied", "interview", "closed"}

# Fields we accept on application create/update. Anything else is ignored.
APP_FIELDS = {
    "company", "url", "jd", "category", "suggestionReason",
    "resume", "cover", "status", "appliedAt", "notes",
}

app = Flask(__name__)
_lock = threading.Lock()


# ── Storage helpers ──

def _empty_data():
    return {
        "resumes": {"software": "", "seo": "", "it": ""},
        "applications": [],
    }


def _read_data():
    if not os.path.exists(DATA_PATH):
        return _empty_data()
    try:
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        # Corrupted or unreadable — start fresh but don't clobber on disk
        # until next successful write.
        return _empty_data()

    # Normalise shape
    data.setdefault("resumes", {})
    for c in VALID_CATEGORIES:
        data["resumes"].setdefault(c, "")
    data.setdefault("applications", [])
    return data


def _write_data(data):
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    # Atomic write: write to temp file in same dir, then os.replace
    dirname = os.path.dirname(DATA_PATH)
    fd, tmp = tempfile.mkstemp(prefix=".jobs-", suffix=".tmp", dir=dirname)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, DATA_PATH)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _filter_app_fields(payload):
    return {k: v for k, v in (payload or {}).items() if k in APP_FIELDS}


# ── Routes ──

@app.route("/", methods=["GET"])
def get_all():
    with _lock:
        return jsonify(_read_data())


@app.route("/resumes/<category>", methods=["PUT"])
def put_resume(category):
    if category not in VALID_CATEGORIES:
        abort(400, description="invalid category")
    body = request.get_json(silent=True) or {}
    text = body.get("text", "")
    if not isinstance(text, str):
        abort(400, description="text must be a string")
    if len(text) > 200_000:
        abort(413, description="resume too long")

    with _lock:
        data = _read_data()
        data["resumes"][category] = text
        _write_data(data)
        return jsonify({"ok": True, "category": category, "length": len(text)})


@app.route("/applications", methods=["POST"])
def create_application():
    payload = _filter_app_fields(request.get_json(silent=True))
    if not payload.get("jd"):
        abort(400, description="jd is required")
    if payload.get("category") not in VALID_CATEGORIES:
        abort(400, description="invalid category")

    payload.setdefault("status", "saved")
    if payload["status"] not in VALID_STATUSES:
        abort(400, description="invalid status")
    payload.setdefault("createdAt", datetime.utcnow().isoformat() + "Z")
    payload["id"] = uuid.uuid4().hex[:12]

    # Reasonable size cap on stored fields (the JD can be long; resume + cover can too)
    for k in ("jd", "resume", "cover"):
        v = payload.get(k)
        if isinstance(v, str) and len(v) > 200_000:
            abort(413, description=f"{k} too long")

    with _lock:
        data = _read_data()
        data["applications"].append(payload)
        _write_data(data)
        return jsonify(payload), 201


@app.route("/applications/<app_id>", methods=["PATCH"])
def update_app(app_id):
    patch = _filter_app_fields(request.get_json(silent=True))
    if not patch:
        abort(400, description="empty patch")
    if "status" in patch and patch["status"] not in VALID_STATUSES:
        abort(400, description="invalid status")
    if "category" in patch and patch["category"] not in VALID_CATEGORIES:
        abort(400, description="invalid category")

    with _lock:
        data = _read_data()
        for rec in data["applications"]:
            if rec.get("id") == app_id:
                rec.update(patch)
                _write_data(data)
                return jsonify(rec)
        abort(404, description="application not found")


@app.route("/applications/<app_id>", methods=["DELETE"])
def delete_app(app_id):
    with _lock:
        data = _read_data()
        before = len(data["applications"])
        data["applications"] = [a for a in data["applications"] if a.get("id") != app_id]
        if len(data["applications"]) == before:
            abort(404, description="application not found")
        _write_data(data)
        return ("", 204)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "data_path": DATA_PATH})


# ── Error handlers ──

@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(413)
def handle_err(e):
    return jsonify({"error": e.description}), e.code


if __name__ == "__main__":
    print(f"jobs-api listening on {BIND_HOST}:{BIND_PORT}", file=sys.stderr)
    print(f"data file: {DATA_PATH}", file=sys.stderr)
    app.run(host=BIND_HOST, port=BIND_PORT, debug=False, threaded=True)
