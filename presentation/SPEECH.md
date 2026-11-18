# Presentation speech (about 4 minutes)

Library Book Management System · DAA Mini Project (CIC-311) · T3 Group 14

| Part | Speaker | Slides | Time |
|---|---|---|---|
| Introduction and design | Utpal | 1–3 | about 1 min 25 s |
| How the structures work | Anvita | 4–6 | about 1 min 45 s |
| Demo, results, conclusion | Atharv | 7–10 | about 1 min 55 s |

Speak at a normal pace (about 140 words a minute). The same text is in each slide's speaker notes.
If time is short, drop the lines marked *(optional)*.

---

## Utpal

**Slide 1 · Title** *(20 s)*

Good morning, ma'am. We are Group 14 from T3. I am Utpal, and with me are Anvita and Atharv. Our project is a Library Book Management System, built around three ideas from Design and Analysis of Algorithms: a stack, a queue, and searching.

**Slide 2 · The problem** *(35 s)*

A real library has four everyday problems. Who asked for a book first? Where do returned books go? How do you find one book among thousands? And who is late?

Each one is a data-structure question. Requests are a queue: first come, first served. The returns trolley is a stack: last in, first out. Finding a book is a search, and it is fast only if the catalogue is kept sorted. And timestamps on every issue and return give us due dates and fines.

**Slide 3 · How it is built** *(30 s)*

All the algorithms live in one Python module, `library_core.py`. Two programs use it: the Colab notebook, where we test and time everything, and a website that runs on localhost.

The website has no algorithm code of its own. Every button calls our Flask server, which runs the backend and replies in JSON. The data is saved as CSV files with pandas.

> *Handover:* Anvita will now take you through the main flows.

---

## Anvita

**Slide 4 · Issuing a book** *(35 s)*

When a member asks for a book, the request is enqueued at the rear of the request queue. That is O(1), because our queue is a linked list with a tail pointer.

Processing dequeues from the front. If a copy is free, the book is issued, and we stamp the issue time and a due date fourteen days later. If no copy is free, the member joins that book's own waitlist, which is another queue. Each member can hold at most three books.

**Slide 5 · Returning a book** *(35 s)*

Returns work the other way round. We find the open loan, stamp the return time, and charge two rupees for every late day. Here, *Godan* came back 27 days late, so the fine is 54 rupees.

The book is then pushed onto the return stack. When the librarian reshelves, the top book is popped first, and if anyone is waiting for it, the first member in its waitlist gets it straight away.

**Slide 6 · Searching and sorting** *(35 s)*

For searching, we keep the catalogue sorted by title using merge sort, which is Θ(n log n) in every case, from the recurrence T(n) = 2T(n/2) + n.

An exact title then uses binary search: each step halves the range. *Wings of Fire* is found in five comparisons out of sixty books, where linear search would check all sixty. *(optional)* For partial matches, like an author's name, we still use linear search, because the sort order doesn't help there.

> *Handover:* Atharv will now show it running.

---

## Atharv

**Slide 7 · The website** *(40 s; switch to the live site at localhost:5000 if you can)*

This is our website, running locally with `python server.py`. The dashboard shows the live sizes of the queue, the waitlists and the return stack.

On the search page you can step through binary search and watch lo, mid and hi move. The issue desk draws the request queue from front to rear, and the returns desk shows the stack, with the next book to be popped highlighted. Every action is time-stamped on the library date, so we can show a late fine on demand.

**Slide 8 · Results** *(30 s)*

We also measured the algorithms on catalogues of up to one lakh books. Linear search grew from about 11 microseconds to almost 10 milliseconds, while binary search stayed near two microseconds: about four thousand times faster.

Merge sort followed the n log n curve, and stack push and queue enqueue took about 0.2 microseconds at every size, which is exactly what O(1) means.

**Slide 9 · Our group's tasks** *(25 s)*

Our group's extra tasks were timestamps and a popular-books chart. A 90-day simulation gave 337 issues. 66 returns were late, and they earned 396 rupees in fines. *Database System Concepts* was the most borrowed book, and popular single-copy books built the longest waitlists, which is a clear signal for the library to buy more copies.

**Slide 10 · Conclusion** *(20 s)*

To conclude: choosing the right data structure made the system both fair and fast, and our measurements matched the theory. Next, we would add a balanced search tree for faster inserts, a priority queue for reserved books, and a database with member logins.

Thank you. We are happy to take your questions.

---

## Live demo checklist (Atharv, if switching to the website)

1. Before class: `cd code`, then `python server.py`. The browser opens at http://localhost:5000. In **Data ▾**, choose **Reset demo scenario**.
2. **Search Catalogue:** keep *Exact title · Wings of Fire*, press **Play** to animate the 5 binary search steps.
3. **Issue Desk:** press **Process request queue**. The three waiting requests are issued in FIFO order.
4. **Returns Desk:** set the **Library date** to a later date (for example 20 Nov 2025), return a book, and show the fine. Then press **Reshelve top book (pop)**.
5. Go back to the slides.
