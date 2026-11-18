"""Builds Library_Book_Management_System.ipynb from the cell sources below."""
import os
import re
import sys
import nbformat as nbf

OUT = sys.argv[1]
CORE = open(os.path.join(os.path.dirname(os.path.abspath(OUT)), "library_core.py")).read()
cells = []


def region(name):
    """The code between `# region <name>` and `# endregion` in library_core.py."""
    return re.search(rf"# region {name}\n(.*?)\n# endregion", CORE, re.S).group(1)


def md(src):
    cells.append(nbf.v4.new_markdown_cell(src.strip()))


def code(src):
    cells.append(nbf.v4.new_code_cell(src.strip()))


md("""
# Library Book Management System
**DAA Mini Project (CIC-311), Project 2, T3 Group 14**

| Roll Number | Name |
|---|---|
| 15015602724 | Utpal Raj |
| 15115602724 | Anvita Sharma |
| 15215602724 | Atharv Tiwari |

Supervisor: Prof. (Dr.) Pinki Nayak

The same code is in `library_core.py`, which the website's server (`server.py`) imports.

**Data structures and algorithms used**
- **Stack (LIFO)**: books that come back are pushed onto a return stack and reshelved from the top.
- **Queue (FIFO)**: every issue request joins a request queue; if a book has no free copy the member joins that book's waitlist queue.
- **Searching**: linear search (partial match on title / author) and binary search (exact title on a sorted catalogue).
- **Sorting**: merge sort, written by hand, keeps the catalogue sorted for binary search.
- **Timestamps**: every issue and return is time-stamped; due dates, overdue books and fines are derived from them.
- **CSV + pandas**: the library state is saved to and loaded from CSV files.
- **Charts**: popular books, borrowing patterns, and measured running time of the algorithms.
""")

md("## 1. Setup")
code(region("setup") + """

# notebook only: charts, output folders and a fixed seed for the benchmarks
import matplotlib.pyplot as plt
import seaborn as sns

sns.set_theme(style="whitegrid")
random.seed(14)
FIG_DIR = "figures"
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FIG_DIR, exist_ok=True)""")

md("""
## 2. Stack and Queue
Both are written from scratch on top of a singly linked list, so every operation is O(1).
- `Stack`: push and pop at the head.
- `Queue`: enqueue at the tail, dequeue at the head (a `tail` pointer avoids walking the list).
""")
code(region("stack_queue") + """


# quick self-test
s = Stack()
for x in [1, 2, 3]:
    s.push(x)
assert s.pop() == 3 and s.peek() == 2 and len(s) == 2

q = Queue()
for x in "ABC":
    q.enqueue(x)
assert q.dequeue() == "A" and q.front() == "B" and len(q) == 2
print("Stack and Queue self-tests passed")
""")

md("""
## 3. Sorting and searching
- `merge_sort(items, key)`: stable, O(n log n) in every case.
- `linear_search(books, text, field)`: scans every book and returns all partial matches, O(n).
- `binary_search(sorted_books, title)`: exact title lookup on the sorted catalogue, O(log n).
- `prefix_search(sorted_books, prefix)`: binary search for the first title with the prefix, then walks forward, O(log n + k).
- `linear_search_count` and `binary_search_trace`: the same searches, but they also report the comparisons made and every lo / mid / hi step. The frontend uses them to show the algorithm working.
""")
code(region("sort_search") + """


assert merge_sort([5, 2, 9, 1, 5, 6]) == [1, 2, 5, 5, 6, 9]
print("merge_sort self-test passed")
""")

md("""
## 4. Data model
Three entities, which match the ER diagram in the report:
**Book**, **Member** and **Transaction** (one row per issue, completed when the book is returned).
""")
code(region("model"))

md("""
## 5. The Library
`Library` ties everything together.

| Operation | What happens | Structure | Cost |
|---|---|---|---|
| `request_issue` | request joins the end of the request queue | Queue | O(1) |
| `process_requests` | requests are served first-come-first-served; if no copy is free the member joins that book's waitlist | Queue | O(r) for r requests |
| `return_book` | timestamp, fine, book pushed onto the return stack | Stack | O(1) + O(t) to find the open transaction |
| `reshelve` | top of the return stack goes back on the shelf; the first waiting member gets it | Stack + Queue | O(1) per book |
| `search_*` | linear / binary / prefix search | Searching | O(n) / O(log n) |
""")
code(region("library"))

md("## 6. Sample data\n60 books and 25 members.")
code(region("sample_data") + """

library = build_library()
print(f"{len(library.books)} books, {sum(b.total_copies for b in library.books.values())} copies, "
      f"{len(library.members)} members")
pd.DataFrame([asdict(b) for b in library.sorted_catalogue]).head(10)""")

md("""
## 7. Step-by-step demo
A small scenario that shows the queue and stack working:
1. Four members ask for *Cosmos* (only 1 copy) and one asks for *1984*.
2. Requests are served in FIFO order; the rest wait in the *Cosmos* waitlist.
3. *Cosmos* comes back late, so a fine is charged and it is pushed on the return stack.
4. Reshelving pops it off the stack and hands it straight to the next member in the waitlist.
""")
code("""
demo = build_library()
t0 = datetime(2025, 8, 1, 10, 0)
cosmos = demo.find_exact_title("Cosmos").book_id
nineteen = demo.find_exact_title("1984").book_id

for k, m in enumerate(["M001", "M002", "M003", "M004"]):
    demo.request_issue(m, cosmos, t0 + timedelta(minutes=k))
demo.request_issue("M005", nineteen, t0 + timedelta(minutes=5))

print("Request queue (front first):", [(m, demo.books[b].title) for m, b, _ in demo.request_queue.to_list()])
demo.process_requests(t0 + timedelta(minutes=10))
print("Cosmos waitlist (front first):", [m for m, _ in demo.waitlists[cosmos].to_list()])

demo.return_book("M005", nineteen, t0 + timedelta(days=3))
demo.return_book("M001", cosmos, t0 + timedelta(days=17))          # 3 days late
print("Return stack (top first):", [demo.books[b].title for b, _ in demo.return_stack.to_list()])

demo.reshelve(t0 + timedelta(days=17, hours=1))
print("Cosmos waitlist after reshelving:", [m for m, _ in demo.waitlists[cosmos].to_list()])

print("\\nEvent log")
for when, text in demo.log:
    print(f"  {when:%d %b %H:%M}  {text}")
""")

md("## 8. Searching the catalogue")
code("""
print("Linear search, title contains 'the':")
for b in library.search_title("the")[:6]:
    print("   ", b.title)

print("\\nLinear search, author contains 'orwell':")
for b in library.search_author("orwell"):
    print("   ", b.title, "-", b.author)

print("\\nPrefix search (binary search + scan), titles starting with 'the a':")
for b in library.search_prefix("the a"):
    print("   ", b.title)

print("\\nBinary search, exact title 'Wings of Fire':", library.find_exact_title("Wings of Fire"))
print("Binary search, exact title 'Unknown Book':", library.find_exact_title("Unknown Book"))
""")

md("""
## 9. Simulating one semester (90 days)
Each day a few members request books (popular books are picked more often), requests are served,
some books come back (a few of them late) and the return stack is cleared at closing time.
""")
code(region("simulation") + """

NOW = simulate(library, days=90)
done = [t for t in library.transactions if not t.is_open]
print(f"Transactions: {len(library.transactions)}  returned: {len(done)}  still out: {len(library.transactions) - len(done)}")
print(f"Late returns: {sum(t.fine > 0 for t in done)}  fines collected: Rs.{sum(t.fine for t in done)}")
print(f"Overdue right now: {len(library.overdue(NOW))}")
print(f"Members still waiting: {sum(len(q) for q in library.waitlists.values())}")""")

md("## 10. Save to CSV and load back")
code("""
library.save_csv()
print(sorted(os.listdir(DATA_DIR)))

reloaded = Library.load_csv()
assert len(reloaded.books) == len(library.books)
assert len(reloaded.transactions) == len(library.transactions)
assert [b.title for b in reloaded.sorted_catalogue] == [b.title for b in library.sorted_catalogue]
assert reloaded.waitlists.keys() == library.waitlists.keys()
assert all(len(reloaded.waitlists[k]) == len(library.waitlists[k]) for k in library.waitlists)
print("Reloaded library matches the saved one")

tx = pd.read_csv(f"{DATA_DIR}/transactions.csv", parse_dates=["request_time", "issue_time", "due_time", "return_time"])
tx.head(8)
""")

md("## 11. Reports")
code("""
books_df = pd.read_csv(f"{DATA_DIR}/books.csv")
tx = tx.merge(books_df[["book_id", "title", "genre"]], on="book_id")
tx["days_kept"] = (tx["return_time"] - tx["issue_time"]).dt.days
tx["wait_hours"] = (tx["issue_time"] - tx["request_time"]).dt.total_seconds() / 3600

print("Overdue books on", f"{NOW:%d %b %Y}")
overdue = pd.DataFrame([{"member": t.member_id, "title": library.books[t.book_id].title,
                         "due": f"{t.due_time:%d %b}", "days late": (NOW - t.due_time).days,
                         "fine so far (Rs.)": (NOW - t.due_time).days * FINE_PER_DAY}
                        for t in library.overdue(NOW)]).sort_values("days late", ascending=False)
overdue.head(10)
""")
code("""
popular = tx["title"].value_counts().head(10).sort_values()
fig, ax = plt.subplots(figsize=(9, 5))
popular.plot.barh(ax=ax, color=sns.color_palette("crest", len(popular)))
ax.set_xlabel("Number of times issued")
ax.set_ylabel("")
ax.set_title("Top 10 most popular books")
for i, v in enumerate(popular.values):
    ax.text(v + 0.2, i, str(v), va="center")
plt.tight_layout()
plt.savefig(f"{FIG_DIR}/popular_books.png", dpi=200)
plt.show()
""")
code("""
fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))

genre = tx["genre"].value_counts()
axes[0].bar(genre.index, genre.values, color=sns.color_palette("crest", len(genre)))
axes[0].set_title("Issues by genre")
axes[0].tick_params(axis="x", rotation=45)

kept = tx["days_kept"].dropna()
axes[1].hist(kept, bins=range(0, int(kept.max()) + 2), color="#3b7ea1", edgecolor="white")
axes[1].axvline(LOAN_DAYS, color="crimson", linestyle="--", label=f"due after {LOAN_DAYS} days")
axes[1].set_title("How long books were kept")
axes[1].set_xlabel("Days")
axes[1].set_ylabel("Returns")
axes[1].legend()

plt.tight_layout()
plt.savefig(f"{FIG_DIR}/genre_and_duration.png", dpi=200)
plt.show()
""")
code("""
daily = tx.set_index("issue_time").resample("W")["txn_id"].count()
returns = tx.dropna(subset=["return_time"]).set_index("return_time").resample("W")["txn_id"].count()
fines = tx.dropna(subset=["return_time"]).set_index("return_time").resample("W")["fine"].sum()

fig, ax = plt.subplots(figsize=(10, 4.5))
ax.plot(daily.index, daily.values, marker="o", label="Books issued")
ax.plot(returns.index, returns.values, marker="s", label="Books returned")
ax.set_ylabel("Books per week")
ax2 = ax.twinx()
ax2.bar(fines.index, fines.values, width=4, alpha=0.25, color="crimson", label="Fines (Rs.)")
ax2.set_ylabel("Fines per week (Rs.)")
ax2.grid(False)
ax.set_zorder(ax2.get_zorder() + 1)   # keep the lines in front of the bars
ax.patch.set_visible(False)
ax.set_title("Weekly issues, returns and fines (from timestamps)")
lines = ax.get_legend_handles_labels()
bars = ax2.get_legend_handles_labels()
ax.legend(lines[0] + bars[0], lines[1] + bars[1], loc="upper left")
plt.tight_layout()
plt.savefig(f"{FIG_DIR}/weekly_activity.png", dpi=200)
plt.show()
""")

md("""
## 12. Measuring the algorithms
To back up the complexity analysis, every algorithm is timed on catalogues of growing size.
Each search is repeated many times and the average is taken, so the numbers are stable.
""")
code("""
def make_books(n):
    return [Book(f"X{i:06d}", f"Title {random.random():.12f}", f"Author {i % 997}", "Test", 2000, 1, 1)
            for i in range(n)]


def avg_time(fn, repeats):
    start = time.perf_counter()
    for _ in range(repeats):
        fn()
    return (time.perf_counter() - start) / repeats


SIZES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000]
rows = []
for n in SIZES:
    data = make_books(n)
    t_sort = avg_time(lambda: merge_sort(data, key=lambda b: b.title), 1)
    srt = merge_sort(data, key=lambda b: b.title)
    targets = [random.choice(srt).title for _ in range(50)]
    t_lin = avg_time(lambda: [next(b for b in srt if b.title == t) for t in targets], 3) / len(targets)
    t_bin = avg_time(lambda: [binary_search(srt, t) for t in targets], 400) / len(targets)
    st, qu = Stack(), Queue()
    for i in range(n):                       # fill both structures with n items first
        st.push(i)
        qu.enqueue(i)
    # best of 20 runs of 1000 operations: the minimum filters out pauses caused by other programs
    t_push = min(avg_time(lambda: [st.push(1) for _ in range(1000)], 1) for _ in range(20)) / 1000
    t_enq = min(avg_time(lambda: [qu.enqueue(1) for _ in range(1000)], 1) for _ in range(20)) / 1000
    rows.append({"n": n, "merge sort (ms)": t_sort * 1e3, "linear search (us)": t_lin * 1e6,
                 "binary search (us)": t_bin * 1e6, "stack push (us)": t_push * 1e6,
                 "queue enqueue (us)": t_enq * 1e6})

bench = pd.DataFrame(rows)
bench.to_csv(f"{DATA_DIR}/benchmark.csv", index=False)
bench.round(3)
""")
code("""
import math

fig, axes = plt.subplots(1, 3, figsize=(15, 4.5))

axes[0].plot(bench["n"], bench["linear search (us)"], marker="o", label="Linear search O(n)")
axes[0].plot(bench["n"], bench["binary search (us)"], marker="s", label="Binary search O(log n)")
axes[0].set_xlabel("Number of books (n)")
axes[0].set_ylabel("Time per search (microseconds)")
axes[0].set_title("Linear vs binary search")
axes[0].legend()

axes[1].plot(bench["n"], bench["binary search (us)"], marker="s", color="C1", label="Binary search (measured)")
c = bench["binary search (us)"].iloc[-1] / math.log2(bench["n"].iloc[-1])
axes[1].plot(bench["n"], [c * math.log2(n) for n in bench["n"]], "--", color="gray", label="c * log2 n")
axes[1].set_xlabel("Number of books (n)")
axes[1].set_title("Binary search follows log n")
axes[1].legend()

axes[2].plot(bench["n"], bench["merge sort (ms)"], marker="o", color="C2", label="Merge sort (measured)")
c = bench["merge sort (ms)"].iloc[-1] / (bench["n"].iloc[-1] * math.log2(bench["n"].iloc[-1]))
axes[2].plot(bench["n"], [c * n * math.log2(n) for n in bench["n"]], "--", color="gray", label="c * n log2 n")
axes[2].set_xlabel("Number of books (n)")
axes[2].set_ylabel("Time (milliseconds)")
axes[2].set_title("Merge sort follows n log n")
axes[2].legend()

plt.tight_layout()
plt.savefig(f"{FIG_DIR}/benchmark.png", dpi=200)
plt.show()

fig, ax = plt.subplots(figsize=(7, 4))
ax.plot(bench["n"], bench["stack push (us)"], marker="o", label="Stack push")
ax.plot(bench["n"], bench["queue enqueue (us)"], marker="s", label="Queue enqueue")
ax.set_ylim(0, max(bench["stack push (us)"].max(), bench["queue enqueue (us)"].max()) * 2)
ax.set_xlabel("Items already in the stack / queue (n)")
ax.set_ylabel("Time per operation (microseconds)")
ax.set_title("Stack and queue operations take constant time")
ax.legend()
plt.tight_layout()
plt.savefig(f"{FIG_DIR}/stack_queue_constant.png", dpi=200)
plt.show()
""")

md("""
## 13. Interactive menu
Set `RUN_MENU = True` and run the cell to use the library from the keyboard.
""")
code("""
RUN_MENU = False


def menu(lib):
    actions = {
        "1": "Search by title", "2": "Search by author", "3": "Request a book",
        "4": "Process request queue", "5": "Return a book", "6": "Reshelve returned books",
        "7": "Show overdue books", "8": "Save to CSV", "0": "Exit",
    }
    while True:
        print()
        for k, v in actions.items():
            print(f"  {k}. {v}")
        choice = input("Choice: ").strip()
        now = datetime.now()
        try:
            if choice == "1":
                for b in lib.search_title(input("Title contains: ")):
                    print(f"  {b.book_id}  {b.title}  ({b.available_copies}/{b.total_copies} free)")
            elif choice == "2":
                for b in lib.search_author(input("Author contains: ")):
                    print(f"  {b.book_id}  {b.title} - {b.author}")
            elif choice == "3":
                lib.request_issue(input("Member id: ").strip(), input("Book id: ").strip(), now)
                print("  Added to request queue")
            elif choice == "4":
                print(f"  {lib.process_requests(now)} books issued")
            elif choice == "5":
                t = lib.return_book(input("Member id: ").strip(), input("Book id: ").strip(), now)
                print(f"  Returned. Fine: Rs.{t.fine}")
            elif choice == "6":
                print(f"  {lib.reshelve(now)} books reshelved")
            elif choice == "7":
                for t in lib.overdue(now):
                    print(f"  {t.member_id}  {lib.books[t.book_id].title}  due {t.due_time:%d %b}")
            elif choice == "8":
                lib.save_csv()
                print("  Saved")
            elif choice == "0":
                break
        except (KeyError, ValueError) as e:
            print("  Error:", e)


if RUN_MENU:
    menu(library)
""")

nb = nbf.v4.new_notebook()
nb["cells"] = cells
nb["metadata"] = {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                  "language_info": {"name": "python"}, "colab": {"provenance": []}}
nbf.write(nb, OUT)
print("wrote", OUT)
