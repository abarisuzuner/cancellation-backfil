import importlib.util
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path


APP_PATH = Path(__file__).resolve().parent / "app.py"
SPEC = importlib.util.spec_from_file_location("backfill_app", APP_PATH)
app = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(app)


class BackfillTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        app.DB_PATH = Path(self.directory.name) / "demo.sqlite3"
        app.init_db()

    def tearDown(self):
        self.directory.cleanup()

    def test_ranking_filters_availability_and_breaks_ties_by_distance(self):
        with app.transaction() as conn:
            state = app.state_payload(conn, app.utc_now())
            ranked = state["ranked_waitlist"]
        self.assertEqual([row["patient_name"] for row in ranked], [
            "Maya Chen", "Nina Alvarez", "Sam Patel", "Jordan Lee", "Taylor Brooks"
        ])
        self.assertEqual([row["rank"] for row in ranked], [1, 2, 3, 4, None])
        self.assertFalse(ranked[-1]["eligible"])

    def test_cancel_accept_is_atomic_and_repeated_accept_is_idempotent(self):
        with app.transaction() as conn:
            state = app.cancel_appointment(conn, app.utc_now())
            self.assertEqual(state["active_offer"]["patient_name"], "Maya Chen")
            token = state["active_offer"]["patient_link"].split("/")[-1]

        with app.transaction() as conn:
            first, status = app.accept_offer(conn, token, app.utc_now())
        with app.transaction() as conn:
            second, repeated_status = app.accept_offer(conn, token, app.utc_now())
            state = app.state_payload(conn, app.utc_now())
            booked = conn.execute("SELECT COUNT(*) FROM appointments WHERE status = 'booked'").fetchone()[0]
            original = conn.execute("SELECT status FROM appointments WHERE id = 1").fetchone()[0]

        self.assertEqual((status, repeated_status), (200, 200))
        self.assertEqual(first["booking"]["id"], second["booking"]["id"])
        self.assertEqual(booked, 1)
        self.assertEqual(original, "cancelled")
        self.assertEqual(state["slot"]["status"], "filled")
        self.assertGreaterEqual(state["slot"]["filled_in_seconds"], 0)

    def test_decline_then_expire_issues_next_two_candidates(self):
        with app.transaction() as conn:
            first = app.cancel_appointment(conn, app.utc_now())["active_offer"]
            token = first["patient_link"].split("/")[-1]
            result, status = app.decline_offer(conn, token, app.utc_now())
            second = app.state_payload(conn, app.utc_now())["active_offer"]
            self.assertEqual(second["patient_name"], "Nina Alvarez")
            conn.execute(
                "UPDATE offers SET expires_at = ? WHERE id = ?",
                (app.iso(app.utc_now() - timedelta(seconds=1)), second["id"]),
            )
            app.expire_offers(conn, app.utc_now())
            third = app.state_payload(conn, app.utc_now())["active_offer"]
        self.assertEqual((result["status"], status), ("declined", 200))
        self.assertEqual(third["patient_name"], "Sam Patel")

    def test_no_matching_candidate_keeps_slot_open(self):
        with app.transaction() as conn:
            conn.execute("UPDATE waitlist SET availability = 'morning'")
            state = app.cancel_appointment(conn, app.utc_now())
        self.assertEqual(state["slot"]["status"], "open")
        self.assertIsNone(state["active_offer"])

    def test_new_waitlist_entry_can_become_top_match(self):
        with app.transaction() as conn:
            app.add_waitlist(conn, {
                "patient_name": "Alex Rivera", "urgency": "urgent",
                "availability": "afternoon", "distance_km": 0.3
            }, app.utc_now())
            state = app.cancel_appointment(conn, app.utc_now())
        self.assertEqual(state["active_offer"]["patient_name"], "Alex Rivera")

    def test_two_accepts_from_separate_connections_create_one_booking(self):
        with app.transaction() as conn:
            token = app.cancel_appointment(conn, app.utc_now())["active_offer"]["patient_link"].split("/")[-1]

        def accept():
            with app.transaction() as conn:
                return app.accept_offer(conn, token, app.utc_now())[0]["booking"]["id"]

        with ThreadPoolExecutor(max_workers=2) as pool:
            ids = list(pool.map(lambda _: accept(), range(2)))
        with app.transaction() as conn:
            count = conn.execute("SELECT COUNT(*) FROM appointments WHERE status = 'booked'").fetchone()[0]
        self.assertEqual(ids[0], ids[1])
        self.assertEqual(count, 1)

    def test_invalid_waitlist_input_is_rejected(self):
        with app.transaction() as conn:
            with self.assertRaises(app.APIError) as error:
                app.add_waitlist(conn, {
                    "patient_name": "Alex Rivera", "urgency": "urgent",
                    "availability": "afternoon", "distance_km": -1
                }, app.utc_now())
        self.assertEqual(error.exception.status, 400)

    def test_declined_offer_cannot_be_accepted(self):
        with app.transaction() as conn:
            token = app.cancel_appointment(conn, app.utc_now())["active_offer"]["patient_link"].split("/")[-1]
            app.decline_offer(conn, token, app.utc_now())
            result, status = app.accept_offer(conn, token, app.utc_now())
            booked = conn.execute("SELECT COUNT(*) FROM appointments WHERE status = 'booked'").fetchone()[0]
        self.assertEqual((result["error"], status), ("offer_declined", 409))
        self.assertEqual(booked, 0)


if __name__ == "__main__":
    unittest.main()
