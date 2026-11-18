# Team guide: everything in the project, and how to answer questions on it

For Utpal, Anvita and Atharv (T3 Group 14). Read it once fully. Before the viva, re-read sections 4, 6 and 9.

---

## 1. The project in one paragraph

We built a **Library Book Management System** in Python.
- **Issuing.** Issue requests go into a **queue** (FIFO) and are served in arrival order. If no copy of a book is free, the member joins that book's **waitlist**, which is another queue.
- **Returning.** Returned books are **time-stamped**, fined ₹2 per late day, and pushed onto a **stack** (LIFO). Reshelving pops the top book, and the first member waiting for it gets it immediately.
- **Searching.** The catalogue is kept **sorted by title with merge sort**. Exact titles and prefixes use **binary search**; partial matches (any word, any author) use **linear search**.
- **Two programs, one copy of the code.** All of it lives in one module, `library_core.py`. The **Colab notebook** (tests, simulation, timing) and a **website on localhost** (Flask server + HTML/CSS/JS) both use it.

Our group-specific tasks (Group 14): **borrow/return timestamps** and a **popular-books chart**.

---

## 2. Files: what each one is

| Path | What it is | Who should know it best |
|---|---|---|
| `code/library_core.py` | **The backend.** Stack, Queue, merge sort, the searches, data classes, the `Library` class, sample data and the simulation | Everyone |
| `code/Library_Book_Management_System.ipynb` | The Colab notebook. It has the same code as `library_core.py` cell by cell, plus self-tests, a demo, the 90-day simulation, CSV round-trip, reports, benchmarks and a keyboard menu | Utpal |
| `code/server.py` | Flask web server. Holds one `Library`, exposes each operation as `/api/...` JSON | Atharv |
| `code/web/index.html`, `styles.css`, `app.js` | The website. Draws pages, the queue lane, the stack, the binary search visualiser and the SVG charts. **No algorithm code.** | Atharv |
| `code/library_data/*.csv` | Saved library state: books, members, transactions, waitlists, return stack, benchmark | Anvita |
| `code/figures/*.png` | Charts the notebook draws | n/a |
| `report/DAA_Mini_Project_Report_T3_Group14.docx` (+ `.pdf`) | The 40-page report in the CIC-311 format | Everyone |
| `report/diagrams/` | Context diagram, DFD levels 0/1/2, ER, use case, architecture and flowcharts | Anvita |
| `report/screenshots/` | Website screenshots used in the report and slides | n/a |
| `presentation/SPEECH.md` | Who says what, slide by slide | Everyone |
| `tools/` | Scripts that generate the notebook, diagrams, report, facts and screenshots (not part of the submission) | n/a |

---

## 3. How to run everything

**Website (for the demo):**
```
pip install flask pandas matplotlib seaborn
cd "project DAA/code"
python server.py
```
It opens http://localhost:5000 by itself. **Data ▾ → Reset demo scenario** gives a library with waiting requests, waitlists and a return stack. Stop it with Ctrl+C.

**Notebook:** colab.research.google.com → File → Upload notebook → `Library_Book_Management_System.ipynb` → Runtime → Run all. Nothing to install. To use the keyboard menu, set `RUN_MENU = True` in the last cell.

---

## 4. The backend, piece by piece (`library_core.py`)

### 4.1 Rules (constants)
- `LOAN_DAYS = 14`: due date = issue time + 14 days
- `FINE_PER_DAY = 2`: ₹2 for every late day
- `MAX_BOOKS_PER_MEMBER = 3`

### 4.2 Stack and Queue (on a singly linked list)
- `Node(data, next)`.
- **Stack** keeps `_top`.
  - `push` creates a node pointing at the old top and makes it the new top.
  - `pop` takes `_top.data` and moves `_top` to `_top.next`.
  - Both are O(1).
- **Queue** keeps `_head` and `_tail`.
  - `enqueue` links the new node after `_tail`.
  - `dequeue` removes `_head`; if the queue becomes empty, `_tail` is reset to None.
  - Both are O(1).
- **Why not a Python list?** `list.pop(0)` is O(n), because every element shifts left. Our linked queue never shifts anything.
- `to_list()` is only for display and CSV (front first / top first).

### 4.3 Data model (matches the ER diagram)
- `Book(book_id, title, author, genre, year, total_copies, available_copies)`
- `Member(member_id, name, email, joined)`
- `Transaction(txn_id, book_id, member_id, request_time, issue_time, due_time, return_time=None, fine=0)`; `is_open` = not yet returned.

### 4.4 The `Library` class

| Field | Structure |
|---|---|
| `books`, `members` | dicts (hash tables) by id → O(1) average lookup |
| `transactions` | list in time order |
| `request_queue` | Queue of `(member_id, book_id, request_time)` |
| `waitlists` | dict book_id → Queue of `(member_id, request_time)` |
| `return_stack` | Stack of `(book_id, return_time)` |
| `sorted_catalogue` | list of books sorted by title (rebuilt with merge sort by `_resort()` after add/remove) |
| `log` | `(time, text)` events shown in the Activity Log |

**Issue flow:** `request_issue` → `process_requests` → `_issue`
1. `request_issue(m, b, when)` checks the ids exist and **enqueues** the request.
2. `process_requests(when)` **dequeues until empty**. For each request:
   - member already holds 3 books → **refused**
   - member already holds this title → **refused**
   - a copy is free → `_issue`: copies − 1, new Transaction with `issue_time = when`, `due_time = when + 14 days`
   - member is already in this book's waitlist → **refused** (prevents duplicates)
   - else → **enqueue into the book's waitlist**

**Return flow:** `return_book` → `reshelve`
1. `return_book(m, b, when)` finds the open transaction (linear scan, O(t)), sets `return_time`, computes `late = max(0, return_date − due_date)` in days and `fine = late × 2`, and **pushes** onto the return stack.
2. `reshelve(when, count=None)` **pops** from the stack (top first, all or `count` books) and adds one copy back. Then, while the book's waitlist is not empty and a copy is free, it **dequeues** the first waiting member and issues the book to them. A member who now holds 3 books, or already holds this title, is skipped.

**Reports:** `overdue(now)` = open loans with `due_time < now`.

**CSV:** `save_csv` / `load_csv`
- Books, members and transactions are written with `asdict` and pandas.
- Waitlists are written **with a position column**; the stack is written **top-down with `position_from_top`**.
- On load, waitlists are enqueued in position order, and the stack is pushed **bottom first** so the top ends up on top again.
- The notebook asserts the reloaded library equals the saved one.

### 4.5 Sorting and searching
- **`merge_sort(items, key)`** splits in half, sorts each half recursively and merges. `<=` in `merge` keeps equal keys in order, which makes it **stable**.
- **`linear_search(books, text, field)`** checks every book for a case-insensitive substring. O(n), always n comparisons.
- **`binary_search(sorted_books, title)`** works on `lo`, `hi`, `mid = (lo+hi)//2`:
  - equal → found
  - `mid_title < target` → `lo = mid+1`
  - else → `hi = mid−1`
  - returns −1 if not found.
- **`lower_bound` / `prefix_search`** binary-search the first title ≥ prefix, then scan forward while titles start with it. O(log n + k).
- **`*_count` / `*_trace` versions** do the same work but also return comparisons and every `lo/mid/hi` step. These are for the website's visualiser.

### 4.6 Sample data and simulation
- `build_library(seed=14)`: 60 real book titles (133 copies) and 25 fictional members.
- `simulate(lib, days=90, seed=14)`: each day 3–9 requests (some books much more popular, weighted by 1/(i+1)^0.7), process the queue, return some books (more likely once due), reshelve.
- Seed 14 = our group number, so every run gives the same data.

---

## 5. The website (frontend), and how it maps to the backend

Request path: browser page → `fetch('/api/...')` → `server.py` route → `Library` method in `library_core.py` → JSON → page redraws.

| Page | What you do | API call | Backend |
|---|---|---|---|
| Dashboard | Overview: copies on shelf, issued, overdue, queue/waitlist/stack sizes, popular books, recent events | `GET /api/state` | counts, `overdue`, log |
| Search Catalogue | Choose one of 4 modes; step through binary search (Prev/Next/Play) | `GET /api/search?mode=&q=` | `linear_search_count`, `prefix_search_trace`, `binary_search_trace` |
| Issue Desk | Add request; process queue; see waitlists | `POST /api/request`, `POST /api/process` | `request_issue`, `process_requests` |
| Returns Desk | Pick member + book (fine shown first); return; reshelve top / all | `GET /api/holding/<id>`, `POST /api/return`, `POST /api/reshelve` | `return_book`, `reshelve` |
| Members | A member's loans, due dates, fines, waitlists | `GET /api/member/<id>` | transactions |
| Reports | Overdue list, genre bars, loan-duration histogram (red = late), weekly line chart | `GET /api/reports` | timestamps via pandas |
| Algorithm Lab | Time merge sort / linear / binary on random catalogues; charts vs log n and n log n | `POST /api/bench` | `merge_sort`, `binary_search` |
| Activity Log | Every event, filterable | `GET /api/log?q=` | `log` |
| Top bar | **Library date** (clock for timestamps); **Data ▾** Save / Reload / Reset demo / Fresh library | `POST /api/clock`, `POST /api/admin/<action>` | `save_csv`, `load_csv`, `load_demo` |

- **The clock.** The server keeps a library clock. Each action moves it one minute forward. Changing the library date sets it to 10:00 on that day. That's how we demo late fines.
- **No libraries.** The website uses no JS libraries or CDNs. Charts are hand-made SVG, so it works offline in class.

---

## 6. Complexity: the table and the reasoning

| Operation | Time | Why |
|---|---|---|
| push / pop / peek | O(1) | only the top pointer changes |
| enqueue / dequeue | O(1) | head and tail pointers; no shifting |
| linear search (all matches) | O(n) | must look at every book |
| binary search | O(log n) | range halves each step → at most ⌊log₂ n⌋ + 1 comparisons (60 books → 6; 1,00,000 → 17) |
| prefix search | O(log n + k) | binary search for the start, then k matches |
| merge sort | Θ(n log n) all cases, O(n) extra space | T(n) = 2T(n/2) + cn → Master theorem case 2 (a = 2, b = 2, f(n) = Θ(n) = Θ(n^log_b a)) |
| process r requests | O(r · t) | each request scans open loans (t transactions); O(r) with a per-member dict |
| return a book | O(t) | finds the open transaction by scanning |
| reshelve s books | O(s + w) | s pops + w waiting members served |
| lookup by id | O(1) average | Python dict = hash table |

**Measured** (`code/library_data/benchmark.csv`, the report's Table 6.3):

| n | merge sort | linear search | binary search | push / enqueue |
|---|---|---|---|---|
| 1,000 | 2.3 ms | 10.7 µs | 1.49 µs | 0.20 µs |
| 1,00,000 | 380 ms | 9,969 µs | 2.44 µs | 0.20 µs |

- Binary search is about **4,091× faster** at 1,00,000.
- Linear search grew **932×** for 100× more data, which is more than linear. The *comparison count* is exactly linear, but at large n the list no longer fits in the CPU cache, so each comparison is slower. **Say exactly this if asked.**
- Push and enqueue are flat. That is O(1) seen in practice.

---

## 7. Simulation results (Chapter 6)

- 60 books / 133 copies, 25 members, **337 issues** in 90 days.
- 304 returned, 33 still out.
- **66 late returns (22%)**, **₹396 fines**.
- Average loan 9.5 days.
- 29 members still waiting at the end.
- Most popular: *Database System Concepts* (26 issues), *Wings of Fire* and *Steve Jobs* (19 each).
- Single-copy popular books (Cosmos, Guns Germs and Steel, Design Patterns…) build the longest waitlists.

---

## 8. Report map (40 pages)

- **Front matter:** cover (both logos, Prof. (Dr.) Pinki Nayak), declaration (sign it), acknowledgement, abstract, TOC, list of figures and tables.
- **Ch 1 Introduction:** background, problem statement (inputs/processes/outputs), objectives, scope, significance.
- **Ch 2 System Analysis & Design:** context diagram, DFD level 0, 1, 2 (issue 3.0 and return 4.0), ER (Member–Transaction–Book, *waits for*), use case diagram, architecture.
- **Ch 3 Use Cases:** UC-1…UC-7, each with actors, preconditions, flow, postconditions and exceptions.
- **Ch 4 Algorithm Design:** DS choice table, stack/queue pseudocode, process requests, return/reshelve, linear/binary search, merge sort + recurrence, fines, complexity table, 4 flowcharts.
- **Ch 5 Implementation:** tools, structure, binary search code, sample run log, **5.5 User Interface** (website + screenshots + screen → API → method table), CSV persistence, challenges.
- **Ch 6 Results:** 12 functional tests, simulation, popular books, genre/duration, weekly chart, benchmark table + charts, discussion.
- **Ch 7:** conclusion, limitations, future work. Then 11 IEEE references.

**Before printing:**
- Open the .docx in Word and click **Yes** to update fields, which refreshes the TOC and page numbers. The PDF already has them.
- Sign the declaration.
- A4, single-sided, spiral bound.

---

## 9. Likely viva questions, with short answers

**Data structures**
1. *Why a queue for requests?* Fairness: FIFO serves the earliest request first. Enqueue and dequeue are O(1).
2. *Why a stack for returns?* It models a returns trolley: the last book placed is on top and handled first. Push and pop are O(1).
3. *Why did you build them on a linked list instead of using a Python list?* `list.pop(0)` is O(n) because elements shift. A linked list with head and tail pointers gives O(1) at both ends. (`collections.deque` would also work. We wrote our own to show the structure.)
4. *What is the space complexity of your stack/queue?* O(n) for n items, plus one pointer per node.
5. *Why is there a waitlist per book instead of one big waiting queue?* When a copy of book X comes back, we need the first person waiting for **X**. A single queue would force scanning past people waiting for other books.
6. *What if the stack is empty and you pop?* We raise `IndexError`. The website disables the button when the stack is empty.
7. *Where is hashing used?* `books` and `members` are Python dicts (hash tables), so lookup by id is O(1) on average.

**Searching and sorting**

8. *Precondition for binary search?* The data must be sorted by the key being searched (title). That's why we merge-sort the catalogue.
9. *Why not binary search for author names?* The catalogue is sorted by title, not author, and we match substrings ("orwell" inside "George Orwell"). Neither has an order to exploit, so linear search it is.
10. *Maximum comparisons for binary search?* ⌊log₂ n⌋ + 1: 6 for 60 books, 17 for 1,00,000.
11. *Best case of binary search?* O(1): the first middle element is the target.
12. *Derive merge sort's complexity.* T(n) = 2T(n/2) + cn. There are log₂ n levels, each doing cn work → n log n. Or Master theorem case 2.
13. *Why merge sort and not quick sort?* Merge sort is Θ(n log n) in **every** case and stable. Quick sort is O(n²) in the worst case (for example already-sorted input with a bad pivot). Its advantage is in-place sorting, which we didn't need for 60–1,00,000 records.
14. *Is your merge sort stable? Why does it matter?* Yes, because of `<=` in merge. Equal titles keep their original order.
15. *Merge sort's extra space?* O(n) for the merged lists.
16. *Re-sorting after every insert is wasteful. Better?* Insert into the sorted list with binary search: O(log n) to find the place, but O(n) to shift. A **balanced BST or B-tree** gives O(log n) insert and search. That's in our future work.
17. *How does prefix search work?* `lower_bound` binary-searches the first title ≥ prefix, then we walk forward while titles start with it. O(log n + k).

**Results**

18. *Linear search grew 932× for 100× more books. Isn't that wrong for O(n)?* The number of comparisons grows exactly 100×. The extra time is hardware: a 1,00,000-item list doesn't fit in the CPU cache, so each comparison costs more. Big-O counts operations, not cache misses.
19. *Why are your times different from the slides when you run it?* Timing depends on the machine and load. The **trend** (flat, log, linear, n log n) is what matters. We repeated searches many times and averaged; push/enqueue use the best of 20 runs to remove noise.
20. *How did you measure?* `time.perf_counter()` around many repetitions, divided by the count, on random catalogues of 1,000–1,00,000 books.

**Timestamps and fines (our group task)**

21. *How is the fine computed?* late = max(0, return date − due date) in calendar days; fine = late × ₹2. Due = issue + 14 days.
22. *What timestamps do you store?* request_time, issue_time, due_time, return_time on every transaction. Waiting time = issue − request.
23. *How is "overdue" found?* Open transactions whose due_time is before the library clock.
24. *How do you demo a late return?* Move the **Library date** forward on the website, then return a book. The fine shows before and after.

**Design and implementation**

25. *Why Flask? Why a server at all?* The algorithms are in Python. The browser can't run Python, so a small Flask server runs `library_core.py` and answers the page's requests as JSON. The page itself has no algorithm code.
26. *How do the notebook and the website use the same code?* All code is in `library_core.py`. The notebook is generated from it region by region (`tools/build_notebook.py`), and `server.py` imports it.
27. *How do you save a queue and a stack to CSV without losing order?* We write a position column (waitlists front-first, stack top-first). On load we enqueue in position order and push the stack bottom-first, so the order is exactly restored. The notebook asserts it.
28. *What bugs did you hit?* (1) A member could enter the same waitlist twice. Now refused. (2) Reshelving could give someone a second copy of a book they already had. Now skipped. (3) Timing noise. Fixed with averaging and best-of-20.
29. *What does the ER relationship "waits for" mean?* Member–Book, many-to-many, with attributes position and request_time. It exists while a member is in a book's waitlist.
30. *Difference between DFD level 0, 1 and 2?*
    - Level 0: the whole system as one process, with its data stores.
    - Level 1: five processes (manage catalogue, search, issue, return, reports).
    - Level 2: issue (3.1–3.5) and return (4.1–4.5) broken into steps.
31. *Limitations?* Single user, no login. O(t) scans for open loans. Full re-sort on insert. Synthetic data.
32. *How would you add priority (for example faculty first)?* Replace the request queue with a **priority queue (binary heap)**. Enqueue and dequeue become O(log n), ordered by (priority, request_time).

---

## 10. Things to remember on the day

- Start the website **before** the class: `python server.py` → **Data ▾ → Reset demo scenario**.
- Keep the slide link open in another tab, and the notebook uploaded in Colab as a backup.
- If the website fails, show the screenshots on slide 7 and the notebook's demo cell instead.
- Know these numbers:
  - 60 books / 133 copies / 25 members
  - 337 issues, 66 late, ₹396
  - 5 vs 60 comparisons
  - ≈ 4,091× faster at 1,00,000
  - 0.2 µs push
  - 380 ms merge sort
