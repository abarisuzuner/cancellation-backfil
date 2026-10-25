# Runnable workflow prototype

This is the smallest end-to-end cancellation backfill demo described in [SPEC.md](SPEC.md). It uses synthetic patient names, one fictional physio clinic, one 3:00 PM appointment, and a local SQLite database. It is separate from the planned Oracle/TypeScript architecture in the repository README.

Requires Python 3.9 or newer; no packages need to be installed.

From the repository root:

```sh
python3 code/app.py
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/). On the staff view, cancel the appointment, then open the displayed patient offer and accept it. **Reset demo** restores the seed. The local database is created at `work/backfill.sqlite3` and is ignored by Git. Set `BACKFILL_DB` to use another database path.

Run the automated checks with:

```sh
python3 -m unittest discover -s code -p 'test_*.py'
```

This is a local prototype, not a clinic deployment: there is no authentication, real messaging, calendar integration, AI extraction, or Oracle persistence. Do not enter real patient data.
