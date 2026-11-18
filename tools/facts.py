"""Collects the numbers, outputs and code excerpts the report quotes, from the executed notebook.

Usage (from code/): python ../tools/facts.py <out.json>
"""
import json
import re
import sys

import nbformat
import pandas as pd

nb = nbformat.read("Library_Book_Management_System.ipynb", 4)
src = "\n".join(c.source for c in nb.cells if c.cell_type == "code")
out = {}
tx = pd.read_csv("library_data/transactions.csv", parse_dates=["request_time", "issue_time", "due_time", "return_time"])
books = pd.read_csv("library_data/books.csv")
tx = tx.merge(books[["book_id", "title", "genre", "total_copies"]], on="book_id")
done = tx.dropna(subset=["return_time"])
out["n_books"] = len(books)
out["n_copies"] = int(books.total_copies.sum())
out["n_members"] = len(pd.read_csv("library_data/members.csv"))
out["n_tx"] = len(tx)
out["n_returned"] = len(done)
out["n_out"] = len(tx) - len(done)
out["n_late"] = int((done.fine > 0).sum())
out["fines"] = int(done.fine.sum())
out["avg_days"] = round(float((done.return_time - done.issue_time).dt.total_seconds().mean() / 86400), 1)
out["waiting"] = len(pd.read_csv("library_data/waitlists.csv"))
out["top"] = [[t, int(c), int(books.set_index("title").total_copies[t])] for t, c in tx.title.value_counts().head(8).items()]
out["genres"] = [[g, int(c)] for g, c in tx.genre.value_counts().items()]
out["bench"] = pd.read_csv("library_data/benchmark.csv").round(3).values.tolist()


def output_of(marker):
    """Printed output of the first code cell whose source contains `marker`."""
    cell = next(c for c in nb.cells if c.cell_type == "code" and marker in c.source)
    return "".join(o.get("text", "") for o in cell.outputs if o.output_type == "stream")


out["demo_log"] = output_of("demo = build_library()")
out["search_out"] = output_of('library.search_title("the")')
out["sim_out"] = output_of("NOW = simulate(")


def grab(name, indent=""):
    m = re.search(rf"^{indent}(def|class) {name}\b.*?(?=^{indent}(def |class |# ---)|^\S|\Z)", src, re.S | re.M)
    return m.group(0).rstrip()


snip = {"stack": grab("Stack"), "queue": grab("Queue"), "binary_search": grab("binary_search"),
        "merge_sort": grab("merge_sort") + "\n\n\n" + grab("merge"), "linear_search": grab("linear_search")}
for m in ("request_issue", "process_requests", "_issue", "return_book", "reshelve", "save_csv"):
    snip[m] = grab(m, "    ")
out["snip"] = snip
json.dump(out, open(sys.argv[1], "w"), indent=1)
print({k: v for k, v in out.items() if k not in ("snip", "demo_log", "search_out", "sim_out", "genres")})
