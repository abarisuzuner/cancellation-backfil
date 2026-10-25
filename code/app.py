#!/usr/bin/env python3
"""Local cancellation-backfill prototype. Uses synthetic data only."""

import argparse
import json
import math
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, time, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("BACKFILL_DB", ROOT.parent / "work" / "backfill.sqlite3"))
CLINIC_TZ = ZoneInfo("America/Los_Angeles")
CLINIC_ID = "harbor-physio"
PRACTITIONER_ID = "jamie-park"
SERVICE_ID = "follow-up-45"
URGENCY_ORDER = {"routine": 1, "soon": 2, "urgent": 3}
AVAILABILITY = {"morning", "afternoon", "anytime"}
OFFER_LIFETIME = timedelta(minutes=10)

SCHEMA = """
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinic_id TEXT NOT NULL,
    practitioner_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('booked', 'cancelled')),
    source_appointment_id INTEGER REFERENCES appointments(id),
    cancelled_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_booking_per_start
    ON appointments(practitioner_id, starts_at) WHERE status = 'booked';
CREATE UNIQUE INDEX IF NOT EXISTS one_backfill_per_source
    ON appointments(source_appointment_id) WHERE source_appointment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_name TEXT NOT NULL,
    service_id TEXT NOT NULL,
    slot_date TEXT NOT NULL,
    urgency TEXT NOT NULL CHECK (urgency IN ('routine', 'soon', 'urgent')),
    availability TEXT NOT NULL CHECK (availability IN ('morning', 'afternoon', 'anytime')),
    distance_km REAL NOT NULL CHECK (distance_km >= 0),
    status TEXT NOT NULL CHECK (status IN ('waiting', 'booked')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_appointment_id INTEGER NOT NULL REFERENCES appointments(id),
    waitlist_id INTEGER NOT NULL REFERENCES waitlist(id),
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    sent_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    UNIQUE(source_appointment_id, waitlist_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_live_offer_per_source
    ON offers(source_appointment_id) WHERE status IN ('pending', 'accepted');
"""


class APIError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def utc_now():
    return datetime.now(timezone.utc)


def iso(value):
    return value.isoformat(timespec="seconds")


def next_tuesday():
    today = datetime.now(CLINIC_TZ).date()
    days = (1 - today.weekday()) % 7
    return today + timedelta(days=days or 7)


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def transaction():
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM appointments").fetchone()[0] == 0:
            seed_data(conn)
        conn.commit()
    finally:
        conn.close()


def seed_data(conn):
    conn.execute("DELETE FROM offers")
    conn.execute("DELETE FROM waitlist")
    conn.execute("DELETE FROM appointments")
    conn.execute("DELETE FROM sqlite_sequence WHERE name IN ('appointments', 'waitlist', 'offers')")

    slot_date = next_tuesday()
    start = datetime.combine(slot_date, time(15, 0), CLINIC_TZ)
    end = start + timedelta(minutes=45)
    conn.execute(
        """INSERT INTO appointments
           (clinic_id, practitioner_id, service_id, starts_at, ends_at, patient_name, status)
           VALUES (?, ?, ?, ?, ?, ?, 'booked')""",
        (CLINIC_ID, PRACTITIONER_ID, SERVICE_ID, iso(start), iso(end), "Avery Morgan"),
    )

    entries = [
        ("Maya Chen", "urgent", "afternoon", 2.4),
        ("Nina Alvarez", "urgent", "afternoon", 5.8),
        ("Sam Patel", "urgent", "anytime", 1.1),
        ("Jordan Lee", "soon", "afternoon", 0.9),
        ("Taylor Brooks", "urgent", "morning", 0.4),
    ]
    base_time = utc_now() - timedelta(minutes=5)
    for index, (name, urgency, availability, distance) in enumerate(entries):
        conn.execute(
            """INSERT INTO waitlist
               (patient_name, service_id, slot_date, urgency, availability,
                distance_km, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)""",
            (name, SERVICE_ID, slot_date.isoformat(), urgency, availability,
             distance, iso(base_time + timedelta(seconds=index))),
        )


def source_appointment(conn):
    source = conn.execute("SELECT * FROM appointments WHERE id = 1").fetchone()
    if source is None:
        raise APIError(404, "appointment_not_found", "The demo appointment was not found.")
    return source


def replacement_appointment(conn, source_id):
    return conn.execute(
        "SELECT * FROM appointments WHERE source_appointment_id = ? AND status = 'booked'",
        (source_id,),
    ).fetchone()


def slot_daypart(source):
    hour = datetime.fromisoformat(source["starts_at"]).hour
    return "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"


def is_available(entry, source):
    return (entry["service_id"] == source["service_id"]
            and entry["slot_date"] == source["starts_at"][:10]
            and entry["availability"] in (slot_daypart(source), "anytime"))


def ranking_key(entry, source):
    return (
        -URGENCY_ORDER[entry["urgency"]],
        -(entry["availability"] == slot_daypart(source)),
        entry["distance_km"],
        entry["created_at"],
        entry["id"],
    )


def issue_next_offer(conn, source, now):
    if source["status"] != "cancelled" or replacement_appointment(conn, source["id"]):
        return None
    if conn.execute(
        "SELECT 1 FROM offers WHERE source_appointment_id = ? AND status IN ('pending', 'accepted')",
        (source["id"],),
    ).fetchone():
        return None

    entries = conn.execute(
        """SELECT w.* FROM waitlist w
           WHERE w.status = 'waiting' AND w.service_id = ? AND w.slot_date = ?
             AND NOT EXISTS (
               SELECT 1 FROM offers o
               WHERE o.source_appointment_id = ? AND o.waitlist_id = w.id
             )""",
        (source["service_id"], source["starts_at"][:10], source["id"]),
    ).fetchall()
    eligible = sorted((entry for entry in entries if is_available(entry, source)),
                      key=lambda entry: ranking_key(entry, source))
    if not eligible:
        return None

    entry = eligible[0]
    token = secrets.token_urlsafe(24)
    conn.execute(
        """INSERT INTO offers
           (source_appointment_id, waitlist_id, token, status, sent_at, expires_at)
           VALUES (?, ?, ?, 'pending', ?, ?)""",
        (source["id"], entry["id"], token, iso(now), iso(now + OFFER_LIFETIME)),
    )
    return token


def expire_offers(conn, now):
    expired = conn.execute(
        "SELECT id, source_appointment_id FROM offers WHERE status = 'pending' AND expires_at <= ?",
        (iso(now),),
    ).fetchall()
    for offer in expired:
        conn.execute("UPDATE offers SET status = 'expired' WHERE id = ?", (offer["id"],))
        source = conn.execute("SELECT * FROM appointments WHERE id = ?",
                              (offer["source_appointment_id"],)).fetchone()
        issue_next_offer(conn, source, now)


def ranked_waitlist(conn, source):
    entries = conn.execute(
        "SELECT * FROM waitlist WHERE service_id = ? AND slot_date = ?",
        (source["service_id"], source["starts_at"][:10]),
    ).fetchall()
    offer_status = {
        row["waitlist_id"]: row["status"]
        for row in conn.execute(
            "SELECT waitlist_id, status FROM offers WHERE source_appointment_id = ?",
            (source["id"],),
        )
    }
    entries = sorted(entries, key=lambda entry: (
        not is_available(entry, source), *ranking_key(entry, source)
    ))
    rank = 0
    result = []
    for entry in entries:
        matches = is_available(entry, source)
        if matches:
            rank += 1
        status = offer_status.get(entry["id"])
        if entry["status"] == "booked":
            reason = "Booked in this slot"
        elif status == "pending":
            reason = "Offer sent"
        elif status == "declined":
            reason = "Declined this slot"
        elif status == "expired":
            reason = "Offer expired"
        elif not matches:
            reason = "Unavailable at 3:00 PM"
        else:
            reason = "Matches 3:00 PM"
        result.append({
            "id": entry["id"],
            "patient_name": entry["patient_name"],
            "rank": rank if matches else None,
            "urgency": entry["urgency"],
            "availability": entry["availability"],
            "distance_km": entry["distance_km"],
            "eligible": matches and entry["status"] == "waiting"
                        and status not in ("declined", "expired"),
            "reason": reason,
            "status": entry["status"],
            "offer_status": status,
        })
    return result


def fill_seconds(conn, source):
    accepted = conn.execute(
        """SELECT accepted_at FROM offers
           WHERE source_appointment_id = ? AND status = 'accepted'""",
        (source["id"],),
    ).fetchone()
    if not accepted or not source["cancelled_at"]:
        return None
    delta = (datetime.fromisoformat(accepted["accepted_at"])
             - datetime.fromisoformat(source["cancelled_at"]))
    return max(0, int(delta.total_seconds()))


def state_payload(conn, now):
    source = source_appointment(conn)
    replacement = replacement_appointment(conn, source["id"])
    active = conn.execute(
        """SELECT o.*, w.patient_name FROM offers o
           JOIN waitlist w ON w.id = o.waitlist_id
           WHERE o.source_appointment_id = ? AND o.status = 'pending'""",
        (source["id"],),
    ).fetchone()
    if source["status"] == "booked":
        slot_status, patient_name = "booked", source["patient_name"]
    elif replacement:
        slot_status, patient_name = "filled", replacement["patient_name"]
    elif active:
        slot_status, patient_name = "offered", None
    else:
        slot_status, patient_name = "open", None

    history = conn.execute(
        """SELECT o.status, o.sent_at, o.accepted_at, w.patient_name
           FROM offers o JOIN waitlist w ON w.id = o.waitlist_id
           WHERE o.source_appointment_id = ? ORDER BY o.id DESC""",
        (source["id"],),
    ).fetchall()
    return {
        "clinic": {"name": "Harbor Physio", "timezone": "America/Los_Angeles"},
        "practitioner": "Jamie Park, PT",
        "service": "Physiotherapy follow-up",
        "slot": {
            "source_appointment_id": source["id"],
            "booking_id": replacement["id"] if replacement else None,
            "status": slot_status,
            "starts_at": source["starts_at"],
            "ends_at": source["ends_at"],
            "patient_name": patient_name,
            "original_patient_name": source["patient_name"],
            "cancelled_at": source["cancelled_at"],
            "filled_in_seconds": fill_seconds(conn, source),
        },
        "ranked_waitlist": ranked_waitlist(conn, source),
        "active_offer": ({
            "id": active["id"],
            "patient_name": active["patient_name"],
            "status": active["status"],
            "sent_at": active["sent_at"],
            "expires_at": active["expires_at"],
            "patient_link": "/offer/" + active["token"],
        } if active else None),
        "offer_history": [dict(row) for row in history],
        "server_now": iso(now),
    }


def add_waitlist(conn, data, now):
    if not isinstance(data, dict):
        raise APIError(400, "invalid_input", "Enter a valid waitlist request.")
    name = data.get("patient_name")
    urgency = data.get("urgency")
    availability = data.get("availability")
    distance = data.get("distance_km")
    if not isinstance(name, str) or not 2 <= len(name.strip()) <= 60:
        raise APIError(400, "invalid_name", "Enter a name between 2 and 60 characters.")
    if urgency not in URGENCY_ORDER or availability not in AVAILABILITY:
        raise APIError(400, "invalid_priority", "Choose a valid priority and availability.")
    if (isinstance(distance, bool) or not isinstance(distance, (int, float))
            or not math.isfinite(distance) or not 0 <= distance <= 100):
        raise APIError(400, "invalid_distance", "Enter a distance from 0 to 100 km.")

    source = source_appointment(conn)
    if replacement_appointment(conn, source["id"]):
        raise APIError(409, "slot_filled", "This slot has already been filled.")
    cursor = conn.execute(
        """INSERT INTO waitlist
           (patient_name, service_id, slot_date, urgency, availability,
            distance_km, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)""",
        (name.strip(), source["service_id"], source["starts_at"][:10], urgency,
         availability, float(distance), iso(now)),
    )
    row = conn.execute("SELECT * FROM waitlist WHERE id = ?", (cursor.lastrowid,)).fetchone()
    if source["status"] == "cancelled":
        issue_next_offer(conn, source, now)
    return {"waitlist_entry": dict(row)}


def cancel_appointment(conn, now):
    source = source_appointment(conn)
    if source["status"] != "booked":
        raise APIError(409, "already_cancelled", "This appointment is already cancelled.")
    conn.execute(
        "UPDATE appointments SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
        (iso(now), source["id"]),
    )
    source = source_appointment(conn)
    issue_next_offer(conn, source, now)
    return state_payload(conn, now)


def offer_row(conn, token):
    return conn.execute(
        """SELECT o.*, w.patient_name FROM offers o
           JOIN waitlist w ON w.id = o.waitlist_id WHERE o.token = ?""",
        (token,),
    ).fetchone()


def patient_payload(conn, token, now):
    offer = offer_row(conn, token)
    if not offer:
        raise APIError(404, "offer_not_found", "This offer link was not found.")
    source = conn.execute("SELECT * FROM appointments WHERE id = ?",
                          (offer["source_appointment_id"],)).fetchone()
    return {
        "clinic": "Harbor Physio",
        "practitioner": "Jamie Park, PT",
        "service": "Physiotherapy follow-up",
        "slot": {"starts_at": source["starts_at"], "ends_at": source["ends_at"]},
        "offer": {
            "patient_name": offer["patient_name"],
            "status": offer["status"],
            "expires_at": offer["expires_at"],
            "filled_in_seconds": fill_seconds(conn, source) if offer["status"] == "accepted" else None,
        },
        "server_now": iso(now),
    }


def offer_conflict(offer):
    if offer["status"] == "expired":
        return {"error": "offer_expired", "message": "This offer has expired."}, 409
    if offer["status"] == "declined":
        return {"error": "offer_declined", "message": "This offer was declined."}, 409
    return {"error": "slot_filled", "message": "This slot is no longer available."}, 409


def accept_offer(conn, token, now):
    offer = offer_row(conn, token)
    if not offer:
        raise APIError(404, "offer_not_found", "This offer link was not found.")
    source = conn.execute("SELECT * FROM appointments WHERE id = ?",
                          (offer["source_appointment_id"],)).fetchone()
    if offer["status"] == "accepted":
        booking = replacement_appointment(conn, source["id"])
        return {"status": "booked", "booking": dict(booking),
                "filled_in_seconds": fill_seconds(conn, source)}, 200
    if offer["status"] != "pending":
        return offer_conflict(offer)
    if offer["expires_at"] <= iso(now):
        conn.execute("UPDATE offers SET status = 'expired' WHERE id = ?", (offer["id"],))
        issue_next_offer(conn, source, now)
        return {"error": "offer_expired", "message": "This offer has expired."}, 409
    if source["status"] != "cancelled" or replacement_appointment(conn, source["id"]):
        return {"error": "slot_filled", "message": "This slot is no longer available."}, 409

    cursor = conn.execute(
        """INSERT INTO appointments
           (clinic_id, practitioner_id, service_id, starts_at, ends_at,
            patient_name, status, source_appointment_id)
           VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)""",
        (source["clinic_id"], source["practitioner_id"], source["service_id"],
         source["starts_at"], source["ends_at"], offer["patient_name"], source["id"]),
    )
    conn.execute("UPDATE offers SET status = 'accepted', accepted_at = ? WHERE id = ?",
                 (iso(now), offer["id"]))
    conn.execute("UPDATE waitlist SET status = 'booked' WHERE id = ?", (offer["waitlist_id"],))
    booking = conn.execute("SELECT * FROM appointments WHERE id = ?",
                           (cursor.lastrowid,)).fetchone()
    return {"status": "booked", "booking": dict(booking),
            "filled_in_seconds": fill_seconds(conn, source)}, 200


def decline_offer(conn, token, now):
    offer = offer_row(conn, token)
    if not offer:
        raise APIError(404, "offer_not_found", "This offer link was not found.")
    source = conn.execute("SELECT * FROM appointments WHERE id = ?",
                          (offer["source_appointment_id"],)).fetchone()
    if offer["status"] != "pending":
        return offer_conflict(offer)
    if offer["expires_at"] <= iso(now):
        conn.execute("UPDATE offers SET status = 'expired' WHERE id = ?", (offer["id"],))
        issue_next_offer(conn, source, now)
        return {"error": "offer_expired", "message": "This offer has expired."}, 409
    conn.execute("UPDATE offers SET status = 'declined' WHERE id = ?", (offer["id"],))
    issue_next_offer(conn, source, now)
    return {"status": "declined"}, 200


class Handler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path, content_type):
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise APIError(400, "invalid_json", "The request body must be JSON.")
        if length < 0 or length > 8192:
            raise APIError(413, "body_too_large", "The request body is too large.")
        try:
            return json.loads(self.rfile.read(length)) if length else {}
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise APIError(400, "invalid_json", "The request body must be JSON.")

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/state":
                with transaction() as conn:
                    now = utc_now()
                    expire_offers(conn, now)
                    payload = state_payload(conn, now)
                self.send_json(payload)
                return
            match = re.fullmatch(r"/api/offers/([A-Za-z0-9_-]+)", path)
            if match:
                with transaction() as conn:
                    now = utc_now()
                    expire_offers(conn, now)
                    payload = patient_payload(conn, match.group(1), now)
                self.send_json(payload)
                return
            if path in ("/", "/index.html") or re.fullmatch(r"/offer/[A-Za-z0-9_-]+", path):
                self.send_file(ROOT / "index.html", "text/html; charset=utf-8")
                return
            if path == "/app.js":
                self.send_file(ROOT / "app.js", "text/javascript; charset=utf-8")
                return
            if path == "/styles.css":
                self.send_file(ROOT / "styles.css", "text/css; charset=utf-8")
                return
            self.send_json({"error": "not_found", "message": "Page not found."}, 404)
        except APIError as error:
            self.send_json({"error": error.code, "message": error.message}, error.status)
        except Exception as error:
            self.log_error("GET %s failed: %s", path, error)
            self.send_json({"error": "server_error", "message": "Something went wrong."}, 500)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = self.read_json()
            with transaction() as conn:
                now = utc_now()
                expire_offers(conn, now)
                if path == "/api/waitlist":
                    payload, status = add_waitlist(conn, data, now), 201
                elif path == "/api/appointments/1/cancel":
                    payload, status = cancel_appointment(conn, now), 200
                elif path == "/api/demo/reset":
                    seed_data(conn)
                    payload, status = state_payload(conn, now), 200
                else:
                    match = re.fullmatch(r"/api/offers/([A-Za-z0-9_-]+)/(accept|decline)", path)
                    if not match:
                        raise APIError(404, "not_found", "Endpoint not found.")
                    if match.group(2) == "accept":
                        payload, status = accept_offer(conn, match.group(1), now)
                    else:
                        payload, status = decline_offer(conn, match.group(1), now)
            self.send_json(payload, status)
        except APIError as error:
            self.send_json({"error": error.code, "message": error.message}, error.status)
        except sqlite3.IntegrityError:
            self.send_json({"error": "slot_filled", "message": "This slot is no longer available."}, 409)
        except Exception as error:
            self.log_error("POST %s failed: %s", path, error)
            self.send_json({"error": "server_error", "message": "Something went wrong."}, 500)

    def log_message(self, format_string, *args):
        if not self.path.startswith("/api/state"):
            super().log_message(format_string, *args)


def main():
    parser = argparse.ArgumentParser(description="Run the local cancellation-backfill demo")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    init_db()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print("Backfill demo: http://{}:{}/".format(args.host, args.port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
