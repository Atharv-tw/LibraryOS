"""Website backend for the Library Book Management System.

Run:  python server.py      then open http://localhost:5000
Host: gunicorn server:app  (one worker: the library lives in this process's memory)
The website (web/) only displays things. Every action is a call to this server, which runs the
data structures and algorithms in library_core.py: the request queue, the waitlists, the return
stack, merge sort and linear / binary search.
"""
import math
import random
import sys
import time
import webbrowser
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path
from threading import Timer

import pandas as pd
from flask import Flask, jsonify, request, send_from_directory

import library_core as lc

HERE = Path(__file__).parent
DATA = HERE / "library_data"
app = Flask(__name__, static_folder=None)
state = {}


# ------------------------------------------------------------------ library state
def load_saved():
    lib = lc.Library.load_csv(str(DATA))
    times = [t.return_time or t.issue_time for t in lib.transactions]
    end = max(times).replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=1) if times else lc.START
    return lib, end


def set_library(lib, now):
    state["lib"] = lib
    state["clock"] = now


def tick():
    """The library clock: every action happens one minute after the previous one."""
    state["clock"] += timedelta(minutes=1)
    return state["clock"]


def load_demo():
    """Saved semester plus a few fresh actions, so every structure has something in it."""
    lib, now = load_saved()
    set_library(lib, now)
    out = sorted((b for b in lib.books.values() if b.available_copies == 0), key=lambda b: b.title)[:2]
    free = [m for m in lib.members if not lib.books_held_by(m)] or list(lib.members)
    for book in out:
        for m in free[:3]:
            lib.request_issue(m, book.book_id, tick())
    lib.process_requests(tick())
    for m, title in zip(free[3:7], ["Atomic Habits", "1984", "Wings of Fire", "Clean Code"]):
        lib.request_issue(m, lib.find_exact_title(title).book_id, tick())
    for t in [t for t in lib.transactions if t.is_open][-3:]:      # recent loans, so the overdue ones stay out
        lib.return_book(t.member_id, t.book_id, tick())


def run(action, *args):
    """Call a backend operation and return the events it logged."""
    lib = state["lib"]
    n0 = len(lib.log)
    try:
        result = action(*args)
    except (KeyError, ValueError) as e:
        return {"ok": False, "error": str(e).strip("'"), "events": []}, None
    return {"ok": True, "events": [event(w, t) for w, t in lib.log[n0:]]}, result


# ------------------------------------------------------------------ JSON helpers
def event(when, text):
    return {"time": when.strftime("%d %b %H:%M"), "text": text}


def book_json(b):
    return {"id": b.book_id, "title": b.title, "author": b.author, "genre": b.genre, "year": b.year,
            "free": b.available_copies, "total": b.total_copies}


def tx_json(t):
    lib = state["lib"]
    return {"id": t.txn_id, "book_id": t.book_id, "title": lib.books[t.book_id].title, "member_id": t.member_id,
            "requested": t.request_time.strftime("%d %b %Y %H:%M"), "issued": t.issue_time.strftime("%d %b %Y"),
            "due": t.due_time.strftime("%d %b %Y"), "returned": t.return_time.strftime("%d %b %Y") if t.return_time else None,
            "fine": t.fine}


def snapshot():
    """Everything the pages draw: counts, the queue, the waitlists and the stack."""
    lib, now = state["lib"], state["clock"]
    open_tx = [t for t in lib.transactions if t.is_open]
    counts = pd.Series([t.book_id for t in lib.transactions]).value_counts().head(10) if lib.transactions else pd.Series(dtype=int)
    return {
        "clock": now.strftime("%d %b %Y, %H:%M"),
        "date": now.strftime("%Y-%m-%d"),
        "rules": {"loan_days": lc.LOAN_DAYS, "fine_per_day": lc.FINE_PER_DAY, "max_books": lc.MAX_BOOKS_PER_MEMBER},
        "stats": {
            "titles": len(lib.books),
            "copies": sum(b.total_copies for b in lib.books.values()),
            "on_shelf": sum(b.available_copies for b in lib.books.values()),
            "issued": len(open_tx),
            "overdue": len(lib.overdue(now)),
            "members": len(lib.members),
            "queue": len(lib.request_queue),
            "waiting": sum(len(q) for q in lib.waitlists.values()),
            "stack": len(lib.return_stack),
            "fines": sum(t.fine for t in lib.transactions),
        },
        "queue": [{"member_id": m, "member": lib.members[m].name, "book_id": b, "title": lib.books[b].title,
                   "time": r.strftime("%d %b %H:%M")} for m, b, r in lib.request_queue.to_list()],
        "waitlists": sorted([{"book_id": bid, "title": lib.books[bid].title, "free": lib.books[bid].available_copies,
                              "total": lib.books[bid].total_copies,
                              "members": [{"member_id": m, "since": r.strftime("%d %b")} for m, r in q.to_list()]}
                             for bid, q in lib.waitlists.items() if not q.is_empty()], key=lambda w: -len(w["members"])),
        "stack": [{"book_id": b, "title": lib.books[b].title, "time": r.strftime("%d %b %H:%M")}
                  for b, r in lib.return_stack.to_list()],
        "popular": [{"title": lib.books[b].title, "count": int(c)} for b, c in counts.items()],
        "recent": [event(w, t) for w, t in lib.log[-12:][::-1]],
    }


# ------------------------------------------------------------------ routes: pages
@app.get("/")
def index():
    return send_from_directory(HERE / "web", "index.html")


@app.get("/<path:name>")
def static_files(name):
    return send_from_directory(HERE / "web", name)


# ------------------------------------------------------------------ routes: API
@app.get("/api/state")
def api_state():
    return jsonify(snapshot())


@app.get("/api/catalogue")
def api_catalogue():
    lib = state["lib"]
    return jsonify({"books": [book_json(b) for b in lib.sorted_catalogue],
                    "members": [{"id": m.member_id, "name": m.name, "held": len(lib.books_held_by(m.member_id))}
                                for m in lib.members.values()]})


@app.get("/api/search")
def api_search():
    lib = state["lib"]
    mode, q = request.args.get("mode", "title"), request.args.get("q", "")
    books = lib.sorted_catalogue
    steps = None
    start = time.perf_counter()
    if mode in ("title", "author"):
        found, comparisons = lc.linear_search_count(books, q, mode)
    elif mode == "prefix":
        found, steps = lc.prefix_search_trace(books, q)
        comparisons = len(steps) + len(found) + 1
    else:
        i, steps = lc.binary_search_trace(books, q)
        found, comparisons = ([books[i]] if i >= 0 else []), len(steps)
    micros = (time.perf_counter() - start) * 1e6
    return jsonify({"results": [book_json(b) for b in found], "comparisons": comparisons, "micros": round(micros, 1),
                    "n": len(books), "max_binary": math.floor(math.log2(len(books))) + 1 if books else 0,
                    "steps": steps, "titles": [b.title for b in books]})


@app.post("/api/request")
def api_request():
    lib, body = state["lib"], request.get_json()
    out, _ = run(lib.request_issue, body["member_id"], body["book_id"], tick())
    return jsonify(out)


@app.post("/api/process")
def api_process():
    lib = state["lib"]
    out, issued = run(lib.process_requests, tick())
    out["issued"] = issued
    return jsonify(out)


@app.get("/api/holding/<member_id>")
def api_holding(member_id):
    lib, now = state["lib"], state["clock"]
    rows = []
    for t in lib.books_held_by(member_id):
        late = max(0, (now.date() - t.due_time.date()).days)
        rows.append({**tx_json(t), "late_days": late, "fine_now": late * lc.FINE_PER_DAY})
    return jsonify(rows)


@app.post("/api/return")
def api_return():
    lib, body = state["lib"], request.get_json()
    out, txn = run(lib.return_book, body["member_id"], body["book_id"], tick())
    if txn:
        out["fine"] = txn.fine
    return jsonify(out)


@app.post("/api/reshelve")
def api_reshelve():
    lib, body = state["lib"], request.get_json(silent=True) or {}
    out, done = run(lib.reshelve, tick(), body.get("count"))
    out["reshelved"] = done
    return jsonify(out)


@app.get("/api/member/<member_id>")
def api_member(member_id):
    lib = state["lib"]
    m = lib.members[member_id]
    mine = [t for t in lib.transactions if t.member_id == member_id]
    waiting = [lib.books[b].title for b, q in lib.waitlists.items() if any(x == member_id for x, _ in q.to_list())]
    return jsonify({"id": m.member_id, "name": m.name, "email": m.email, "joined": m.joined,
                    "holding": sum(t.is_open for t in mine), "borrowed": len(mine), "late": sum(t.fine > 0 for t in mine),
                    "fines": sum(t.fine for t in mine), "waiting": waiting, "history": [tx_json(t) for t in reversed(mine)]})


@app.get("/api/reports")
def api_reports():
    lib, now = state["lib"], state["clock"]
    overdue = sorted([{**tx_json(t), "days_late": (now - t.due_time).days, "fine_so_far": max(0, (now - t.due_time).days) * lc.FINE_PER_DAY}
                      for t in lib.overdue(now)], key=lambda r: -r["days_late"])
    if not lib.transactions:
        return jsonify({"overdue": [], "genres": [], "kept": [], "weekly": []})
    df = pd.DataFrame([asdict(t) for t in lib.transactions])
    df = df.merge(pd.DataFrame([asdict(b) for b in lib.books.values()])[["book_id", "genre"]], on="book_id")
    kept = (df["return_time"] - df["issue_time"]).dt.days.dropna().astype(int).value_counts().sort_index()
    weekly = pd.DataFrame({
        "issued": df.set_index("issue_time").resample("W")["txn_id"].count(),
        "returned": df.dropna(subset=["return_time"]).set_index("return_time").resample("W")["txn_id"].count(),
        "fines": df.dropna(subset=["return_time"]).set_index("return_time").resample("W")["fine"].sum(),
    }).fillna(0)
    return jsonify({
        "overdue": overdue,
        "genres": [{"label": g, "value": int(c)} for g, c in df["genre"].value_counts().items()],
        "kept": [{"label": int(d), "value": int(c)} for d, c in kept.items()],
        "weekly": [{"label": w.strftime("%d %b"), "issued": int(r.issued), "returned": int(r.returned), "fines": int(r.fines)}
                   for w, r in weekly.iterrows()],
        "loan_days": lc.LOAN_DAYS,
    })


@app.post("/api/bench")
def api_bench():
    sizes = sorted((request.get_json(silent=True) or {}).get("sizes", [1_000, 5_000, 10_000, 20_000, 50_000]))
    rng = random.Random(14)
    rows = []
    for n in sizes[:6]:
        n = min(int(n), 100_000)
        data = [lc.Book(f"X{i:06d}", f"Title {rng.random():.12f}", "A", "Test", 2000, 1, 1) for i in range(n)]
        t0 = time.perf_counter()
        srt = lc.merge_sort(data, key=lambda b: b.title)
        t_sort = time.perf_counter() - t0
        targets = [rng.choice(srt).title for _ in range(30)]
        t0 = time.perf_counter()
        for t in targets:
            next(b for b in srt if b.title == t)
        t_lin = (time.perf_counter() - t0) / len(targets)
        t0 = time.perf_counter()
        for _ in range(300):
            for t in targets:
                lc.binary_search(srt, t)
        t_bin = (time.perf_counter() - t0) / (300 * len(targets))
        rows.append({"n": n, "sort_ms": round(t_sort * 1e3, 2), "linear_us": round(t_lin * 1e6, 2),
                     "binary_us": round(t_bin * 1e6, 3), "binary_steps": math.floor(math.log2(n)) + 1})
    return jsonify(rows)


@app.get("/api/log")
def api_log():
    q = request.args.get("q", "").lower()
    return jsonify([event(w, t) for w, t in reversed(state["lib"].log) if q in t.lower()][:400])


@app.post("/api/clock")
def api_clock():
    day = datetime.strptime(request.get_json()["date"], "%Y-%m-%d")
    state["clock"] = day.replace(hour=10)
    return jsonify(snapshot())


@app.post("/api/admin/<action>")
def api_admin(action):
    if action == "save":
        state["lib"].save_csv(str(DATA))
    elif action == "reload":
        set_library(*load_saved())
    elif action == "demo":
        load_demo()
    elif action == "fresh":
        set_library(lc.build_library(), lc.START)
    return jsonify(snapshot())


load_demo()     # runs on import too, so a host's server (gunicorn server:app) starts with the demo library

if __name__ == "__main__":
    port = next((int(a) for a in sys.argv[1:] if a.isdigit()), 5000)
    if "--no-browser" not in sys.argv:
        Timer(1.0, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    print(f"\n  Library Book Management System running at http://localhost:{port}\n")
    app.run(host="127.0.0.1", port=port, debug=False)
