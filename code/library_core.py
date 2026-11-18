"""Library Book Management System: the data structures, algorithms and rules.

Used by the Colab notebook (tools/build_notebook.py copies each region into a cell)
and by the website (server.py imports it and serves web/).
DAA Mini Project (CIC-311), Project 2, T3 Group 14.
"""

# region setup
import os
import random
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta

import pandas as pd

DATA_DIR = "library_data"
LOAN_DAYS = 14           # a book is due 14 days after it is issued
FINE_PER_DAY = 2         # Rs. 2 for every day late
MAX_BOOKS_PER_MEMBER = 3
# endregion


# region stack_queue
class Node:
    __slots__ = ("data", "next")

    def __init__(self, data, next=None):
        self.data = data
        self.next = next


class Stack:
    """LIFO stack. push / pop / peek are O(1)."""

    def __init__(self):
        self._top = None
        self._size = 0

    def push(self, item):
        self._top = Node(item, self._top)
        self._size += 1

    def pop(self):
        if self.is_empty():
            raise IndexError("pop from empty stack")
        item = self._top.data
        self._top = self._top.next
        self._size -= 1
        return item

    def peek(self):
        if self.is_empty():
            raise IndexError("peek at empty stack")
        return self._top.data

    def is_empty(self):
        return self._top is None

    def __len__(self):
        return self._size

    def to_list(self):
        """Top first."""
        out, cur = [], self._top
        while cur:
            out.append(cur.data)
            cur = cur.next
        return out


class Queue:
    """FIFO queue. enqueue / dequeue / front are O(1)."""

    def __init__(self):
        self._head = None
        self._tail = None
        self._size = 0

    def enqueue(self, item):
        node = Node(item)
        if self._tail is None:
            self._head = self._tail = node
        else:
            self._tail.next = node
            self._tail = node
        self._size += 1

    def dequeue(self):
        if self.is_empty():
            raise IndexError("dequeue from empty queue")
        item = self._head.data
        self._head = self._head.next
        if self._head is None:
            self._tail = None
        self._size -= 1
        return item

    def front(self):
        if self.is_empty():
            raise IndexError("front of empty queue")
        return self._head.data

    def is_empty(self):
        return self._head is None

    def __len__(self):
        return self._size

    def to_list(self):
        """Front first."""
        out, cur = [], self._head
        while cur:
            out.append(cur.data)
            cur = cur.next
        return out
# endregion


# region sort_search
def merge_sort(items, key=lambda x: x):
    if len(items) <= 1:
        return list(items)
    mid = len(items) // 2
    left = merge_sort(items[:mid], key)
    right = merge_sort(items[mid:], key)
    return merge(left, right, key)


def merge(left, right, key):
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if key(left[i]) <= key(right[j]):     # <= keeps the sort stable
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    out.extend(left[i:])
    out.extend(right[j:])
    return out


def linear_search(books, text, field="title"):
    text = text.lower()
    return [b for b in books if text in getattr(b, field).lower()]


def binary_search(sorted_books, title):
    """Index of the book whose title equals `title` (case-insensitive), or -1."""
    target = title.lower()
    lo, hi = 0, len(sorted_books) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        mid_title = sorted_books[mid].title.lower()
        if mid_title == target:
            return mid
        if mid_title < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


def lower_bound(sorted_books, prefix):
    """First index whose title is >= prefix."""
    lo, hi = 0, len(sorted_books)
    while lo < hi:
        mid = (lo + hi) // 2
        if sorted_books[mid].title.lower() < prefix:
            lo = mid + 1
        else:
            hi = mid
    return lo


def prefix_search(sorted_books, prefix):
    prefix = prefix.lower()
    i = lower_bound(sorted_books, prefix)
    out = []
    while i < len(sorted_books) and sorted_books[i].title.lower().startswith(prefix):
        out.append(sorted_books[i])
        i += 1
    return out

def linear_search_count(books, text, field="title"):
    """Linear search that also reports how many books it compared."""
    text = text.lower()
    found = [b for b in books if text in getattr(b, field).lower()]
    return found, len(books)


def binary_search_trace(sorted_books, title):
    """Binary search that records every step (lo, mid, hi and the decision) for display."""
    target = title.lower()
    lo, hi, steps = 0, len(sorted_books) - 1, []
    while lo <= hi:
        mid = (lo + hi) // 2
        mid_title = sorted_books[mid].title.lower()
        if mid_title == target:
            steps.append({"lo": lo, "mid": mid, "hi": hi, "title at mid": sorted_books[mid].title, "decision": "found"})
            return mid, steps
        decision = "go right (lo = mid + 1)" if mid_title < target else "go left (hi = mid - 1)"
        steps.append({"lo": lo, "mid": mid, "hi": hi, "title at mid": sorted_books[mid].title, "decision": decision})
        if mid_title < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1, steps


def prefix_search_trace(sorted_books, prefix):
    """Prefix search that records the lower-bound binary search steps for display."""
    prefix = prefix.lower()
    lo, hi, steps = 0, len(sorted_books), []
    while lo < hi:
        mid = (lo + hi) // 2
        go_right = sorted_books[mid].title.lower() < prefix
        steps.append({"lo": lo, "mid": mid, "hi": hi, "title at mid": sorted_books[mid].title,
                      "decision": "go right (lo = mid + 1)" if go_right else "go left (hi = mid)"})
        if go_right:
            lo = mid + 1
        else:
            hi = mid
    out, i = [], lo
    while i < len(sorted_books) and sorted_books[i].title.lower().startswith(prefix):
        out.append(sorted_books[i])
        i += 1
    return out, steps
# endregion


# region model
@dataclass
class Book:
    book_id: str
    title: str
    author: str
    genre: str
    year: int
    total_copies: int
    available_copies: int


@dataclass
class Member:
    member_id: str
    name: str
    email: str
    joined: str


@dataclass
class Transaction:
    txn_id: str
    book_id: str
    member_id: str
    request_time: datetime
    issue_time: datetime
    due_time: datetime
    return_time: datetime = None
    fine: int = 0

    @property
    def is_open(self):
        return self.return_time is None
# endregion


# region library
class Library:
    def __init__(self):
        self.books = {}              # book_id -> Book
        self.members = {}            # member_id -> Member
        self.transactions = []       # all issues, in time order
        self.request_queue = Queue() # (member_id, book_id, request_time)
        self.waitlists = {}          # book_id -> Queue of (member_id, request_time)
        self.return_stack = Stack()  # (book_id, return_time) waiting to be reshelved
        self.sorted_catalogue = []   # books sorted by title, for binary search
        self.log = []                # human-readable event log
        self._txn_counter = 0

    # ---------- catalogue ----------
    def add_book(self, book):
        self.books[book.book_id] = book
        self.waitlists.setdefault(book.book_id, Queue())
        self._resort()

    def remove_book(self, book_id):
        book = self.books.get(book_id)
        if book is None:
            raise KeyError(f"No book {book_id}")
        if book.available_copies < book.total_copies:
            raise ValueError("Cannot remove a book that is issued")
        del self.books[book_id]
        del self.waitlists[book_id]
        self._resort()

    def add_member(self, member):
        self.members[member.member_id] = member

    def _resort(self):
        self.sorted_catalogue = merge_sort(list(self.books.values()), key=lambda b: b.title.lower())

    # ---------- searching ----------
    def search_title(self, text):
        return linear_search(self.sorted_catalogue, text, "title")

    def search_author(self, text):
        return linear_search(self.sorted_catalogue, text, "author")

    def find_exact_title(self, title):
        i = binary_search(self.sorted_catalogue, title)
        return self.sorted_catalogue[i] if i >= 0 else None

    def search_prefix(self, prefix):
        return prefix_search(self.sorted_catalogue, prefix)

    # ---------- issuing ----------
    def books_held_by(self, member_id):
        return [t for t in self.transactions if t.member_id == member_id and t.is_open]

    def request_issue(self, member_id, book_id, when):
        if member_id not in self.members:
            raise KeyError(f"No member {member_id}")
        if book_id not in self.books:
            raise KeyError(f"No book {book_id}")
        self.request_queue.enqueue((member_id, book_id, when))
        self._log(when, f"{member_id} requested {self.books[book_id].title!r} (queue size {len(self.request_queue)})")

    def process_requests(self, when):
        """Serve the whole request queue in FIFO order. Returns how many books were issued."""
        issued = 0
        while not self.request_queue.is_empty():
            member_id, book_id, requested = self.request_queue.dequeue()
            book = self.books[book_id]
            if len(self.books_held_by(member_id)) >= MAX_BOOKS_PER_MEMBER:
                self._log(when, f"refused {member_id}: already holds {MAX_BOOKS_PER_MEMBER} books")
            elif any(t.book_id == book_id for t in self.books_held_by(member_id)):
                self._log(when, f"refused {member_id}: already holds {book.title!r}")
            elif book.available_copies > 0:
                self._issue(member_id, book_id, requested, when)
                issued += 1
            elif any(m == member_id for m, _ in self.waitlists[book_id].to_list()):
                self._log(when, f"refused {member_id}: already waiting for {book.title!r}")
            else:
                self.waitlists[book_id].enqueue((member_id, requested))
                self._log(when, f"{member_id} added to waitlist for {book.title!r} (position {len(self.waitlists[book_id])})")
        return issued

    def _issue(self, member_id, book_id, requested, when):
        self._txn_counter += 1
        txn = Transaction(f"T{self._txn_counter:05d}", book_id, member_id,
                          requested, when, when + timedelta(days=LOAN_DAYS))
        self.transactions.append(txn)
        self.books[book_id].available_copies -= 1
        self._log(when, f"issued {self.books[book_id].title!r} to {member_id}, due {txn.due_time:%d %b %Y}")
        return txn

    # ---------- returning ----------
    def return_book(self, member_id, book_id, when):
        txn = next((t for t in self.transactions
                    if t.member_id == member_id and t.book_id == book_id and t.is_open), None)
        if txn is None:
            raise ValueError(f"{member_id} does not hold {book_id}")
        txn.return_time = when
        late_days = max(0, (when.date() - txn.due_time.date()).days)
        txn.fine = late_days * FINE_PER_DAY
        self.return_stack.push((book_id, when))
        msg = f"{member_id} returned {self.books[book_id].title!r}"
        if txn.fine:
            msg += f", {late_days} days late, fine Rs.{txn.fine}"
        self._log(when, msg + f" (return stack size {len(self.return_stack)})")
        return txn

    def reshelve(self, when, count=None):
        """Pop books off the return stack (top first) and put them back on the shelf.
        If someone is waiting for that book, the first one in its waitlist gets it."""
        done = 0
        while not self.return_stack.is_empty() and (count is None or done < count):
            book_id, _ = self.return_stack.pop()
            book = self.books[book_id]
            book.available_copies += 1
            done += 1
            self._log(when, f"reshelved {book.title!r}")
            wl = self.waitlists[book_id]
            while not wl.is_empty() and book.available_copies > 0:
                member_id, requested = wl.dequeue()
                held = self.books_held_by(member_id)
                if len(held) < MAX_BOOKS_PER_MEMBER and all(t.book_id != book_id for t in held):
                    self._issue(member_id, book_id, requested, when)
                else:
                    self._log(when, f"skipped {member_id} in waitlist for {book.title!r}: limit reached")
        return done

    # ---------- reports ----------
    def overdue(self, now):
        return [t for t in self.transactions if t.is_open and t.due_time < now]

    def _log(self, when, text):
        self.log.append((when, text))

    # ---------- CSV ----------
    def save_csv(self, folder=DATA_DIR):
        pd.DataFrame([asdict(b) for b in self.books.values()]).to_csv(f"{folder}/books.csv", index=False)
        pd.DataFrame([asdict(m) for m in self.members.values()]).to_csv(f"{folder}/members.csv", index=False)
        pd.DataFrame([asdict(t) for t in self.transactions]).to_csv(f"{folder}/transactions.csv", index=False)
        waiting = [{"book_id": b, "position": i + 1, "member_id": m, "request_time": r}
                   for b, q in self.waitlists.items() for i, (m, r) in enumerate(q.to_list())]
        pd.DataFrame(waiting, columns=["book_id", "position", "member_id", "request_time"]) \
            .to_csv(f"{folder}/waitlists.csv", index=False)
        stack = [{"position_from_top": i + 1, "book_id": b, "return_time": r}
                 for i, (b, r) in enumerate(self.return_stack.to_list())]
        pd.DataFrame(stack, columns=["position_from_top", "book_id", "return_time"]) \
            .to_csv(f"{folder}/return_stack.csv", index=False)

    @classmethod
    def load_csv(cls, folder=DATA_DIR):
        lib = cls()
        for r in pd.read_csv(f"{folder}/books.csv").to_dict("records"):
            lib.books[r["book_id"]] = Book(**r)
            lib.waitlists[r["book_id"]] = Queue()
        lib._resort()
        for r in pd.read_csv(f"{folder}/members.csv").to_dict("records"):
            lib.add_member(Member(**r))
        tx = pd.read_csv(f"{folder}/transactions.csv",
                         parse_dates=["request_time", "issue_time", "due_time", "return_time"])
        for r in tx.to_dict("records"):
            r["return_time"] = None if pd.isna(r["return_time"]) else r["return_time"].to_pydatetime()
            for k in ("request_time", "issue_time", "due_time"):
                r[k] = r[k].to_pydatetime()
            lib.transactions.append(Transaction(**r))
        lib._txn_counter = len(lib.transactions)
        wl = pd.read_csv(f"{folder}/waitlists.csv", parse_dates=["request_time"]).sort_values(["book_id", "position"])
        for r in wl.to_dict("records"):
            lib.waitlists[r["book_id"]].enqueue((r["member_id"], r["request_time"].to_pydatetime()))
        st = pd.read_csv(f"{folder}/return_stack.csv", parse_dates=["return_time"])
        for r in reversed(st.sort_values("position_from_top").to_dict("records")):   # push bottom first
            lib.return_stack.push((r["book_id"], r["return_time"].to_pydatetime()))
        return lib
# endregion


# region sample_data
BOOKS = [
    ("Introduction to Algorithms", "Thomas H. Cormen", "Computer Science", 2009, 5),
    ("The Algorithm Design Manual", "Steven S. Skiena", "Computer Science", 2008, 3),
    ("Algorithms", "Robert Sedgewick", "Computer Science", 2011, 3),
    ("Data Structures Using C", "Reema Thareja", "Computer Science", 2014, 4),
    ("Fundamentals of Computer Algorithms", "Ellis Horowitz", "Computer Science", 2008, 4),
    ("Let Us C", "Yashavant Kanetkar", "Computer Science", 2017, 4),
    ("Clean Code", "Robert C. Martin", "Computer Science", 2008, 2),
    ("The Pragmatic Programmer", "Andrew Hunt", "Computer Science", 1999, 2),
    ("Computer Networks", "Andrew S. Tanenbaum", "Computer Science", 2010, 3),
    ("Operating System Concepts", "Abraham Silberschatz", "Computer Science", 2018, 3),
    ("Database System Concepts", "Abraham Silberschatz", "Computer Science", 2019, 3),
    ("Artificial Intelligence: A Modern Approach", "Stuart Russell", "Computer Science", 2020, 2),
    ("Discrete Mathematics and Its Applications", "Kenneth H. Rosen", "Mathematics", 2018, 3),
    ("Higher Engineering Mathematics", "B. S. Grewal", "Mathematics", 2017, 5),
    ("Linear Algebra Done Right", "Sheldon Axler", "Mathematics", 2015, 2),
    ("Concepts of Physics", "H. C. Verma", "Science", 2017, 4),
    ("A Brief History of Time", "Stephen Hawking", "Science", 1988, 2),
    ("The Selfish Gene", "Richard Dawkins", "Science", 1976, 2),
    ("Cosmos", "Carl Sagan", "Science", 1980, 1),
    ("Sapiens", "Yuval Noah Harari", "History", 2011, 3),
    ("The Discovery of India", "Jawaharlal Nehru", "History", 1946, 2),
    ("India After Gandhi", "Ramachandra Guha", "History", 2007, 2),
    ("Guns, Germs, and Steel", "Jared Diamond", "History", 1997, 1),
    ("Wings of Fire", "A. P. J. Abdul Kalam", "Biography", 1999, 3),
    ("The Story of My Experiments with Truth", "M. K. Gandhi", "Biography", 1927, 2),
    ("Steve Jobs", "Walter Isaacson", "Biography", 2011, 2),
    ("Long Walk to Freedom", "Nelson Mandela", "Biography", 1994, 1),
    ("Atomic Habits", "James Clear", "Self-Help", 2018, 3),
    ("Deep Work", "Cal Newport", "Self-Help", 2016, 2),
    ("Thinking, Fast and Slow", "Daniel Kahneman", "Self-Help", 2011, 2),
    ("The Psychology of Money", "Morgan Housel", "Self-Help", 2020, 2),
    ("Ikigai", "Hector Garcia", "Self-Help", 2016, 2),
    ("Pride and Prejudice", "Jane Austen", "Fiction", 1813, 2),
    ("1984", "George Orwell", "Fiction", 1949, 3),
    ("Animal Farm", "George Orwell", "Fiction", 1945, 2),
    ("To Kill a Mockingbird", "Harper Lee", "Fiction", 1960, 2),
    ("The Great Gatsby", "F. Scott Fitzgerald", "Fiction", 1925, 2),
    ("The Alchemist", "Paulo Coelho", "Fiction", 1988, 3),
    ("The Guide", "R. K. Narayan", "Fiction", 1958, 2),
    ("Malgudi Days", "R. K. Narayan", "Fiction", 1943, 2),
    ("Godan", "Munshi Premchand", "Fiction", 1936, 2),
    ("The God of Small Things", "Arundhati Roy", "Fiction", 1997, 1),
    ("Midnight's Children", "Salman Rushdie", "Fiction", 1981, 1),
    ("The White Tiger", "Aravind Adiga", "Fiction", 2008, 2),
    ("Gitanjali", "Rabindranath Tagore", "Poetry", 1910, 1),
    ("Brave New World", "Aldous Huxley", "Fiction", 1932, 1),
    ("The Hobbit", "J. R. R. Tolkien", "Fiction", 1937, 2),
    ("Harry Potter and the Philosopher's Stone", "J. K. Rowling", "Fiction", 1997, 3),
    ("The Little Prince", "Antoine de Saint-Exupery", "Fiction", 1943, 1),
    ("Crime and Punishment", "Fyodor Dostoevsky", "Fiction", 1866, 1),
    ("War and Peace", "Leo Tolstoy", "Fiction", 1869, 1),
    ("The Old Man and the Sea", "Ernest Hemingway", "Fiction", 1952, 1),
    ("Rich Dad Poor Dad", "Robert Kiyosaki", "Finance", 1997, 2),
    ("The Intelligent Investor", "Benjamin Graham", "Finance", 1949, 1),
    ("Zero to One", "Peter Thiel", "Business", 2014, 2),
    ("The Lean Startup", "Eric Ries", "Business", 2011, 1),
    ("Head First Java", "Kathy Sierra", "Computer Science", 2005, 2),
    ("Python Crash Course", "Eric Matthes", "Computer Science", 2019, 3),
    ("Hands-On Machine Learning", "Aurelien Geron", "Computer Science", 2019, 2),
    ("Design Patterns", "Erich Gamma", "Computer Science", 1994, 1),
]

FIRST = ["Aarav", "Vivaan", "Aditya", "Ishaan", "Kabir", "Riya", "Ananya", "Diya", "Saanvi", "Meera",
         "Rohan", "Karan", "Arjun", "Neha", "Pooja", "Tanvi", "Yash", "Manav", "Sneha", "Kavya",
         "Dev", "Nikhil", "Priya", "Aisha", "Harsh"]
LAST = ["Sharma", "Verma", "Gupta", "Singh", "Mehta", "Jain", "Kapoor", "Reddy", "Nair", "Bansal"]


def build_library(seed=14):
    rng = random.Random(seed)
    lib = Library()
    for i, (title, author, genre, year, copies) in enumerate(BOOKS, start=1):
        lib.add_book(Book(f"B{i:03d}", title, author, genre, year, copies, copies))
    for i, first in enumerate(FIRST, start=1):
        last = rng.choice(LAST)
        lib.add_member(Member(f"M{i:03d}", f"{first} {last}",
                              f"{first.lower()}.{last.lower()}@example.com", "2025-07-01"))
    return lib
# endregion


# region simulation
START = datetime(2025, 8, 1, 9, 0)


def simulate(lib, days=90, start=START, seed=14):
    """Simulate `days` days of library use. Returns the time at the end of the simulation.
    Each day a few members request books (popular books are picked more often), requests are
    served, some books come back (a few of them late) and the return stack is cleared."""
    rng = random.Random(seed)
    book_ids = list(lib.books)
    members = list(lib.members)
    weights = [1 / (i + 1) ** 0.7 for i in range(len(book_ids))]    # a few books are much more popular
    rng.shuffle(weights)
    for day in range(days):
        today = start + timedelta(days=day)
        for _ in range(rng.randint(3, 9)):
            m = rng.choice(members)
            b = rng.choices(book_ids, weights)[0]
            lib.request_issue(m, b, today + timedelta(minutes=rng.randint(0, 480)))
        lib.process_requests(today + timedelta(hours=9))

        for t in [t for t in lib.transactions if t.is_open]:
            held = (today - t.issue_time).days
            if held >= 3 and rng.random() < (0.12 if held < LOAN_DAYS else 0.30):
                lib.return_book(t.member_id, t.book_id, today + timedelta(hours=rng.randint(1, 8)))
        lib.reshelve(today + timedelta(hours=10))
    return start + timedelta(days=days)
# endregion
