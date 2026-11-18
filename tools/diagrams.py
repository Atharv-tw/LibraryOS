"""Draws every report diagram with matplotlib and saves them as PNG."""
import math
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import (Circle, Ellipse, FancyBboxPatch, Polygon, Rectangle,
                                FancyArrowPatch)

OUT = sys.argv[1]
FONT = "DejaVu Sans"
plt.rcParams["font.family"] = FONT

FILL = {"entity": "#dbe9f6", "process": "#fde9c9", "store": "#e3f1df", "decision": "#f9dcdc",
        "term": "#e6e0f3", "io": "#fff6c7", "attr": "#ffffff", "rel": "#f9dcdc", "usecase": "#fde9c9"}
EDGE = "#2b2b2b"


class D:
    def __init__(self, w, h, title=None):
        self.fig, self.ax = plt.subplots(figsize=(w, h))
        self.ax.set_xlim(0, w * 10)
        self.ax.set_ylim(0, h * 10)
        self.ax.set_aspect("equal")
        self.ax.axis("off")
        self.n = {}
        if title:
            self.ax.text(w * 5, h * 10 - 2, title, ha="center", va="top", fontsize=13, weight="bold")

    # ---- nodes: (kind, cx, cy, half-width, half-height) ----
    def node(self, key, kind, x, y, text, w=8, h=4, fs=9.5, weight="normal", lw=1.4):
        ax = self.ax
        if kind in ("entity", "process_rect"):
            ax.add_patch(Rectangle((x - w, y - h), 2 * w, 2 * h, fc=FILL["entity" if kind == "entity" else "process"], ec=EDGE, lw=lw, zorder=4))
            shape = "rect"
        elif kind == "weak":
            ax.add_patch(Rectangle((x - w, y - h), 2 * w, 2 * h, fc=FILL["entity"], ec=EDGE, lw=lw, zorder=4))
            ax.add_patch(Rectangle((x - w + 0.7, y - h + 0.7), 2 * w - 1.4, 2 * h - 1.4, fc="none", ec=EDGE, lw=lw, zorder=4))
            shape = "rect"
        elif kind == "process":
            ax.add_patch(Ellipse((x, y), 2 * w, 2 * h, fc=FILL["process"], ec=EDGE, lw=lw, zorder=4))
            shape = "ellipse"
        elif kind in ("attr", "usecase"):
            ax.add_patch(Ellipse((x, y), 2 * w, 2 * h, fc=FILL[kind], ec=EDGE, lw=lw, zorder=4))
            shape = "ellipse"
        elif kind == "store":
            ax.plot([x - w, x + w], [y + h, y + h], color=EDGE, lw=lw, zorder=4.5)
            ax.plot([x - w, x + w], [y - h, y - h], color=EDGE, lw=lw, zorder=4.5)
            ax.plot([x - w, x - w], [y - h, y + h], color=EDGE, lw=lw, zorder=4.5)
            ax.add_patch(Rectangle((x - w, y - h), 2 * w, 2 * h, fc=FILL["store"], ec="none", zorder=4))
            shape = "rect"
        elif kind in ("decision", "rel"):
            ax.add_patch(Polygon([(x - w, y), (x, y + h), (x + w, y), (x, y - h)], fc=FILL[kind], ec=EDGE, lw=lw, zorder=4))
            shape = "diamond"
        elif kind == "term":
            ax.add_patch(FancyBboxPatch((x - w, y - h), 2 * w, 2 * h, boxstyle=f"round,pad=0,rounding_size={h}",
                                        fc=FILL["term"], ec=EDGE, lw=lw, zorder=4))
            shape = "rect"
        elif kind == "io":
            s = h * 0.6
            ax.add_patch(Polygon([(x - w + s, y + h), (x + w + s, y + h), (x + w - s, y - h), (x - w - s, y - h)],
                                 fc=FILL["io"], ec=EDGE, lw=lw, zorder=4))
            shape = "rect"
        elif kind == "actor":
            r = 1.3
            ax.add_patch(Circle((x, y + 3.2), r, fc="white", ec=EDGE, lw=lw, zorder=4))
            ax.plot([x, x], [y + 1.9, y - 1.2], color=EDGE, lw=lw)
            ax.plot([x - 2, x + 2], [y + 0.9, y + 0.9], color=EDGE, lw=lw)
            ax.plot([x, x - 1.7], [y - 1.2, y - 4], color=EDGE, lw=lw)
            ax.plot([x, x + 1.7], [y - 1.2, y - 4], color=EDGE, lw=lw)
            ax.text(x, y - 5.2, text, ha="center", va="top", fontsize=fs, weight="bold")
            self.n[key] = ("rect", x, y, 2.5, 4.6)
            return
        else:
            raise ValueError(kind)
        ax.text(x, y, text, ha="center", va="center", fontsize=fs, weight=weight, zorder=5,
                linespacing=1.25)
        self.n[key] = (shape, x, y, w, h)

    def _edge(self, key, dx, dy):
        shape, x, y, w, h = self.n[key]
        if dx == 0 and dy == 0:
            return x, y
        if shape == "rect":
            t = min(w / abs(dx) if dx else 1e9, h / abs(dy) if dy else 1e9)
        elif shape == "ellipse":
            t = 1 / math.sqrt((dx / w) ** 2 + (dy / h) ** 2)
        else:
            t = 1 / (abs(dx) / w + abs(dy) / h)
        return x + dx * t, y + dy * t

    def arrow(self, a, b, label=None, off=0.0, rad=0.0, both=False, head=True, fs=8.5, lpos=0.5, ldx=0, ldy=0,
              style="-|>", dashed=False):
        _, ax_, ay, _, _ = self.n[a]
        _, bx, by, _, _ = self.n[b]
        dx, dy = bx - ax_, by - ay
        L = math.hypot(dx, dy)
        px, py = -dy / L * off, dx / L * off
        sx, sy = self._edge(a, dx + 0, dy + 0)
        ex, ey = self._edge(b, -dx, -dy)
        sx, sy, ex, ey = sx + px, sy + py, ex + px, ey + py
        st = "<|-|>" if both else (style if head else "-")
        self.ax.add_patch(FancyArrowPatch((sx, sy), (ex, ey), arrowstyle=st, mutation_scale=13, color=EDGE,
                                          lw=1.2, connectionstyle=f"arc3,rad={rad}",
                                          linestyle="--" if dashed else "-", zorder=3))
        if label:
            mx, my = sx + (ex - sx) * lpos, sy + (ey - sy) * lpos
            if rad:
                mx += -(ey - sy) * rad * 0.5
                my += (ex - sx) * rad * 0.5
            self.ax.text(mx + ldx, my + ldy, label, ha="center", va="center", fontsize=fs, zorder=6,
                         bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.95))

    def line(self, a, b, label=None, fs=8.5, lpos=0.5):
        self.arrow(a, b, label=label, head=False, fs=fs, lpos=lpos)

    def path(self, pts, label=None, lpt=None, fs=8.5, head=True):
        xs, ys = zip(*pts)
        self.ax.plot(xs[:-1], ys[:-1], color=EDGE, lw=1.2, zorder=3)
        self.ax.add_patch(FancyArrowPatch(pts[-2], pts[-1], arrowstyle="-|>" if head else "-",
                                          mutation_scale=13, color=EDGE, lw=1.2, zorder=3))
        if label:
            x, y = lpt
            self.ax.text(x, y, label, ha="center", va="center", fontsize=fs, zorder=6,
                         bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none"))

    def pt(self, key, side):
        _, x, y, w, h = self.n[key]
        return {"t": (x, y + h), "b": (x, y - h), "l": (x - w, y), "r": (x + w, y)}[side]

    def save(self, name):
        self.fig.savefig(f"{OUT}/{name}.png", dpi=220, bbox_inches="tight", pad_inches=0.15, facecolor="white")
        plt.close(self.fig)


# ------------------------------------------------------------------ context diagram
d = D(13, 8)
d.node("sys", "process", 65, 40, "0\nLibrary Book\nManagement\nSystem", 15, 12, fs=11, weight="bold")
d.node("lib", "entity", 15, 62, "Librarian", 10, 5, fs=11)
d.node("mem", "entity", 15, 18, "Member", 10, 5, fs=11)
d.node("csv", "entity", 115, 62, "CSV Files\n(pandas)", 10, 5, fs=11)
d.node("rep", "entity", 115, 18, "Reports &\nCharts", 10, 5, fs=11)
d.arrow("lib", "sys", "book details, member details,\nreshelve command", off=3, lpos=0.62, ldy=4)
d.arrow("sys", "lib", "catalogue, overdue list,\nreturn stack status", off=3, lpos=0.62, ldy=-4)
d.arrow("mem", "sys", "search query, issue request,\nreturned book", off=-3, lpos=0.62, ldy=-4)
d.arrow("sys", "mem", "search results, issue slip,\ndue date, fine", off=-3, lpos=0.62, ldy=4)
d.arrow("sys", "csv", "save books, members,\ntransactions", off=3, lpos=0.5, ldy=4)
d.arrow("csv", "sys", "load saved data", off=3, lpos=0.5, ldy=-3)
d.arrow("sys", "rep", "popular books, borrowing\npatterns, running times", lpos=0.5)
d.save("context_diagram")

# ------------------------------------------------------------------ DFD level 0
d = D(14, 9)
d.node("sys", "process", 70, 45, "0.0\nLibrary Book\nManagement System", 16, 11, fs=11, weight="bold")
d.node("lib", "entity", 14, 76, "Librarian", 10, 5, fs=10.5)
d.node("mem", "entity", 14, 14, "Member", 10, 5, fs=10.5)
d.node("rep", "entity", 126, 76, "Reports /\nCharts", 10, 5, fs=10.5)
d.node("d1", "store", 126, 52, "D1  Books", 11, 3.5, fs=10)
d.node("d2", "store", 126, 38, "D2  Members", 11, 3.5, fs=10)
d.node("d3", "store", 126, 24, "D3  Transactions", 11, 3.5, fs=10)
d.node("d4", "store", 126, 10, "D4  Queues & Stack", 11, 3.5, fs=10)
d.arrow("lib", "sys", "add / remove book,\nregister member, reshelve", off=2.5)
d.arrow("sys", "lib", "catalogue, overdue list", off=2.5, lpos=0.6)
d.arrow("mem", "sys", "search, request, return", off=-2.5, lpos=0.4)
d.arrow("sys", "mem", "results, issue slip, fine", off=-2.5, lpos=0.6)
d.arrow("sys", "rep", "statistics", lpos=0.5)
for s in ("d1", "d2", "d3", "d4"):
    d.arrow("sys", s, both=True)
d.save("dfd_level0")

# ------------------------------------------------------------------ DFD level 1
d = D(16, 11)
d.node("lib", "entity", 12, 96, "Librarian", 9, 4.5, fs=10)
d.node("p1", "process", 45, 96, "1.0\nManage\nCatalogue", 10, 7)
d.node("d2", "store", 14, 74, "D2  Members", 10, 3.2, fs=9.5)
d.node("d1", "store", 102, 82, "D1  Books", 9, 3.2, fs=9.5)
d.node("p2", "process", 45, 55, "2.0\nSearch\nBooks", 10, 7)
d.node("mem", "entity", 12, 30, "Member", 9, 4.5, fs=10)
d.node("p3", "process", 72, 30, "3.0\nHandle Issue\nRequests", 10.5, 7)
d.node("d3", "store", 102, 50, "D3  Transactions", 11, 3.2, fs=9.5)
d.node("p4", "process", 132, 30, "4.0\nHandle\nReturns", 10, 7)
d.node("d4", "store", 102, 12, "D4  Request queue\n& waitlists", 12, 3.8, fs=9)
d.node("d5", "store", 148, 55, "D5  Return\nstack", 9, 3.8, fs=9)
d.node("p5", "process", 128, 96, "5.0\nReports &\nCharts", 10, 7)
d.node("rep", "entity", 150, 78, "Reports", 7, 4, fs=10)
d.node("d6", "store", 92, 102, "D6  CSV files", 9, 3.2, fs=9.5)
d.arrow("lib", "p1", "details")
d.arrow("p1", "d2", "new member", lpos=0.5)
d.arrow("p1", "d1", "new book", lpos=0.5)
d.arrow("d1", "p2", "sorted catalogue", lpos=0.45)
d.arrow("mem", "p2", "title / author", off=2, lpos=0.4, ldx=-7)
d.arrow("p2", "mem", "matches", off=2, lpos=0.5, ldx=7)
d.arrow("mem", "p3", "issue request", lpos=0.5)
d.arrow("p3", "d1", "copies - 1", lpos=0.42)
d.arrow("p3", "d3", "issue record", lpos=0.5, ldx=-3)
d.arrow("d3", "p3", "books held", off=3, lpos=0.5, ldx=5, ldy=-2)
d.arrow("p3", "d4", "enqueue / dequeue", both=True, lpos=0.5)
d.arrow("d3", "p4", "open issue", lpos=0.5)
d.arrow("p4", "d1", "copies + 1", lpos=0.45)
d.arrow("p4", "d4", "serve waitlist", lpos=0.5)
d.arrow("p4", "d5", "push / pop", both=True, lpos=0.5)
d.arrow("d3", "p5", "history", lpos=0.62)
d.arrow("p5", "rep", "charts", lpos=0.5)
d.arrow("p5", "d6", "save / load", both=True, lpos=0.5)
d.path([(12, 25.5), (12, 2), (132, 2), (132, 23)], label="returned book", lpt=(60, 2))
d.save("dfd_level1")

# ------------------------------------------------------------------ DFD level 2 (3.0)
d = D(15, 9)
d.node("mem", "entity", 12, 72, "Member", 9, 4.5, fs=10)
d.node("p31", "process", 42, 72, "3.1\nAccept request\n(enqueue)", 11, 7)
d.node("p32", "process", 78, 72, "3.2\nDequeue next\nrequest (FIFO)", 11, 7)
d.node("p33", "process", 118, 72, "3.3\nValidate member\n& copy count", 12, 7)
d.node("p34", "process", 112, 30, "3.4\nIssue book &\nstamp time", 11, 7)
d.node("p35", "process", 66, 36, "3.5\nAdd to book's\nwaitlist", 11, 7)
d.node("d4", "store", 60, 54, "D4a  Request queue", 12, 3.2, fs=9)
d.node("d4b", "store", 26, 36, "D4b  Waitlists", 10, 3.2, fs=9)
d.node("d1", "store", 140, 52, "D1  Books", 8, 3.2, fs=9)
d.node("d2", "store", 140, 85, "D2  Members", 9, 3.2, fs=9)
d.node("d3", "store", 140, 14, "D3  Transactions", 10, 3.2, fs=9)
d.arrow("mem", "p31", "member id,\nbook id")
d.arrow("p31", "d4", "(member, book,\nrequest time)", lpos=0.5, ldx=-8)
d.arrow("d4", "p32", "front request", lpos=0.5, ldx=7)
d.arrow("p32", "p33", "request")
d.arrow("d2", "p33", "books held", lpos=0.5, ldx=-5)
d.arrow("d1", "p33", "available copies", lpos=0.5, ldx=6)
d.arrow("p33", "p34", "copy free", lpos=0.5, ldx=-6)
d.arrow("p33", "p35", "no copy free", lpos=0.45)
d.arrow("p35", "d4b", "enqueue member", lpos=0.5)
d.arrow("p34", "d3", "issue_time,\ndue = +14 days", lpos=0.5, ldx=-10)
d.arrow("p34", "d1", "copies - 1", lpos=0.5, ldx=6)
d.path([(112, 23), (112, 6), (5, 6), (5, 72), (3, 72)], head=False)
d.path([(5, 72), (3, 72), (3, 72)], head=False)
d.path([(5, 6), (5, 67.5), (6, 67.5)], head=False)
d.save("dfd_level2_issue")

# ------------------------------------------------------------------ DFD level 2 (4.0)
d = D(15, 9)
d.node("mem", "entity", 12, 72, "Member", 9, 4.5, fs=10)
d.node("lib", "entity", 12, 20, "Librarian", 9, 4.5, fs=10)
d.node("p41", "process", 44, 72, "4.1\nFind open\nissue record", 11, 7)
d.node("p42", "process", 84, 72, "4.2\nStamp return &\ncompute fine", 11, 7)
d.node("p43", "process", 124, 72, "4.3\nPush onto\nreturn stack", 11, 7)
d.node("p44", "process", 84, 20, "4.4\nPop & reshelve\n(LIFO)", 11, 7)
d.node("p45", "process", 124, 20, "4.5\nServe first\nwaiting member", 11, 7)
d.node("d3", "store", 64, 86, "D3  Transactions", 11, 3.2, fs=9)
d.node("d5", "store", 124, 46, "D5  Return stack", 11, 3.2, fs=9)
d.node("d1", "store", 50, 40, "D1  Books", 8, 3.2, fs=9)
d.node("d4", "store", 140, 4, "D4b  Waitlists", 10, 3.2, fs=9)
d.arrow("mem", "p41", "returned book")
d.arrow("d3", "p41", "open record", lpos=0.5, ldx=-6)
d.arrow("p41", "p42", "transaction")
d.arrow("p42", "d3", "return_time, fine", lpos=0.5, ldx=8)
d.arrow("p42", "p43", "book id")
d.arrow("p43", "d5", "push", lpos=0.5)
d.arrow("lib", "p44", "reshelve command")
d.arrow("d5", "p44", "pop top book", lpos=0.5, ldx=-6)
d.arrow("p44", "d1", "copies + 1", lpos=0.5)
d.arrow("p44", "p45", "book on shelf")
d.arrow("d4", "p45", "front member", lpos=0.4, ldx=-7)
d.path([(84, 65), (84, 56), (12, 56), (12, 67.5)], label="fine (Rs. 2 per late day)", lpt=(40, 56))
d.save("dfd_level2_return")

# ------------------------------------------------------------------ ER diagram (Chen)
d = D(16, 9)
d.node("m", "entity", 22, 45, "MEMBER", 9, 4.5, fs=11, weight="bold")
d.node("t", "entity", 75, 45, "TRANSACTION", 11, 4.5, fs=11, weight="bold")
d.node("b", "entity", 128, 45, "BOOK", 9, 4.5, fs=11, weight="bold")
d.node("r1", "rel", 48, 45, "makes", 7, 5, fs=9.5)
d.node("r2", "rel", 102, 45, "covers", 7, 5, fs=9.5)
d.node("r3", "rel", 102, 14, "waits for", 8, 5, fs=9.5)
d.line("m", "r1", "1", lpos=0.4)
d.line("r1", "t", "N", lpos=0.6)
d.line("t", "r2", "N", lpos=0.4)
d.line("r2", "b", "1", lpos=0.6)
d.path([(22, 40.5), (22, 14), (94, 14)], head=False, label="M", lpt=(60, 14))
d.path([(110, 14), (128, 14), (128, 40.5)], head=False, label="N", lpt=(128, 26))
attrs_m = [("member_id", 7, 64, True), ("name", 22, 72, False), ("email", 38, 64, False), ("joined", 7, 28, False)]
attrs_t = [("txn_id", 52, 68, True), ("request_time", 58, 80, False), ("issue_time", 76, 86, False),
           ("due_time", 93, 80, False), ("return_time", 100, 67, False), ("fine", 75, 26, False)]
attrs_b = [("book_id", 120, 66, True), ("title", 132, 77, False), ("author", 146, 68, False),
           ("genre", 152, 54, False), ("year", 152, 38, False), ("total_copies", 148, 26, False),
           ("available_copies", 118, 28, False)]
attrs_r3 = [("position", 84, 4, False), ("request_time", 122, 4, False)]
for owner, attrs in (("m", attrs_m), ("t", attrs_t), ("b", attrs_b), ("r3", attrs_r3)):
    for name, x, y, key in attrs:
        k = f"{owner}_{name}"
        w = max(4.5, len(name) * 0.62 + 1.2)
        d.node(k, "attr", x, y, name, w, 3, fs=8.5)
        if key:
            d.ax.plot([x - len(name) * 0.48, x + len(name) * 0.48], [y - 1.1, y - 1.1], color=EDGE, lw=0.9, zorder=6)
        d.line(owner, k)
d.save("er_diagram")

# ------------------------------------------------------------------ use case diagram
d = D(16, 12)
d.ax.add_patch(Rectangle((34, 2), 88, 114, fc="#fafafa", ec=EDGE, lw=1.4, zorder=1))
d.ax.text(78, 114, "Library Book Management System", ha="center", va="top", fontsize=11, weight="bold")
d.node("lib", "actor", 12, 56, "Librarian")
d.node("mem", "actor", 146, 60, "Member")
d.node("fs", "actor", 146, 16, "File System\n(CSV files)")
left = [("add", "Add / remove book", 88), ("reg", "Register member", 75), ("proc", "Process request queue", 62),
        ("resh", "Reshelve returned books", 49), ("rep", "View reports & charts", 36)]
for k, t, y in left:
    d.node(k, "usecase", 58, y, t, 14, 4, fs=9)
right = [("req", "Request issue", 78), ("wait", "Join waitlist", 62), ("ret", "Return book", 46), ("fine", "Compute fine", 30)]
for k, t, y in right:
    d.node(k, "usecase", 100, y, t, 11, 4, fs=9)
d.node("srch", "usecase", 78, 104, "Search books", 13, 4, fs=9)
d.node("save", "usecase", 78, 9, "Save / load CSV", 13, 4, fs=9)
for k in ("add", "reg", "proc", "resh", "rep", "save"):
    d.line("lib", k)
for k in ("srch", "req", "ret"):
    d.line("mem", k)
d.line("fs", "save")
d.arrow("ret", "fine", "«include»", dashed=True, fs=8, ldx=6)
d.arrow("wait", "proc", "«extend»", dashed=True, fs=8, ldy=2.5)
d.save("use_case_diagram")

# ------------------------------------------------------------------ architecture
d = D(14, 8)
d.node("ui", "process_rect", 70, 72, "Website (HTML / CSS / JS)  ⇄  Flask server.py   |   Colab notebook", 58, 4, fs=10.5)
d.node("lib", "process_rect", 70, 52, "Library class in library_core.py  (issue, return, reshelve, search, reports)", 58, 4.5, fs=10.5)
d.node("st", "process_rect", 18, 28, "Stack\n(return pile)", 11, 6)
d.node("q", "process_rect", 48, 28, "Queue\n(requests, waitlists)", 13, 6)
d.node("srt", "process_rect", 80, 28, "Merge sort &\nlinear / binary search", 15, 6)
d.node("dm", "process_rect", 118, 28, "Book, Member,\nTransaction", 13, 6)
d.node("pd", "process_rect", 48, 6, "pandas  (CSV load / save)", 22, 3.5)
d.node("mpl", "process_rect", 104, 6, "matplotlib / seaborn  (charts)", 24, 3.5)
d.arrow("ui", "lib", both=True)
for k in ("st", "q", "srt", "dm"):
    d.arrow("lib", k)
d.arrow("q", "pd", lpos=0.5)
d.arrow("dm", "mpl")
d.arrow("dm", "pd")
d.save("architecture")


# ------------------------------------------------------------------ flowcharts
def flow(nodes, edges, size, name, paths=()):
    d = D(*size)
    for n in nodes:
        d.node(*n)
    for e in edges:
        a, b, *rest = e
        vertical = abs(d.n[a][1] - d.n[b][1]) < 1
        d.arrow(a, b, rest[0] if rest else None, fs=9, ldx=4 if vertical else 0)
    for p in paths:
        d.path(*p)
    d.save(name)


flow([("s", "term", 40, 128, "Start", 9, 3.5),
      ("q", "decision", 40, 114, "Request queue\nempty?", 13, 7, 9),
      ("e", "term", 85, 114, "End", 9, 3.5),
      ("dq", "process_rect", 40, 98, "(member, book, time) =\nqueue.dequeue()", 15, 4.5),
      ("lim", "decision", 40, 82, "Member holds\n< 3 books?", 13, 7, 9),
      ("ref", "process_rect", 85, 82, "Refuse request,\nlog reason", 12, 4.5),
      ("av", "decision", 40, 64, "available_copies\n> 0 ?", 13, 7, 9),
      ("iss", "process_rect", 40, 46, "copies -= 1\nissue_time = now\ndue_time = now + 14 days", 17, 6),
      ("tx", "process_rect", 40, 30, "Append Transaction,\nlog event", 14, 4.5),
      ("wl", "process_rect", 85, 64, "waitlist[book]\n.enqueue(member)", 13, 4.5)],
     [("s", "q"), ("q", "e", "Yes"), ("q", "dq", "No"), ("dq", "lim"), ("lim", "ref", "No"), ("lim", "av", "Yes"),
      ("av", "wl", "No"), ("av", "iss", "Yes"), ("iss", "tx")],
     (11, 14), "flow_issue",
     [([(40, 25.5), (40, 19), (6, 19), (6, 114), (27, 114)],),
      ([(97, 82), (104, 82), (104, 19), (40, 19)], None, None, 8.5, False),
      ([(98, 64), (104, 64)], None, None, 8.5, False)])

flow([("s", "term", 40, 140, "Start: member returns book", 16, 3.5),
      ("f", "process_rect", 40, 126, "Find open Transaction\nfor (member, book)", 15, 4.5),
      ("ok", "decision", 40, 110, "Found?", 9, 6, 9.5),
      ("err", "term", 84, 110, "Error: not issued", 12, 3.5),
      ("st", "process_rect", 40, 95, "return_time = now\nlate = return date - due date", 18, 4.5),
      ("fine", "process_rect", 40, 81, "fine = max(0, late) x Rs.2", 17, 3.5),
      ("push", "process_rect", 40, 68, "return_stack.push(book)", 15, 3.5),
      ("emp", "decision", 40, 52, "Return stack\nempty?", 12, 7, 9),
      ("end", "term", 84, 52, "End", 8, 3.5),
      ("pop", "process_rect", 40, 36, "book = return_stack.pop()\ncopies += 1", 16, 4.5),
      ("wl", "decision", 40, 19, "Waitlist for\nbook empty?", 12, 7, 9),
      ("give", "process_rect", 84, 19, "member = waitlist.dequeue()\nissue book to member", 17, 4.5)],
     [("s", "f"), ("f", "ok"), ("ok", "err", "No"), ("ok", "st", "Yes"), ("st", "fine"), ("fine", "push"),
      ("push", "emp", "reshelve"), ("emp", "end", "Yes"), ("emp", "pop", "No"), ("pop", "wl"), ("wl", "give", "No")],
     (11, 15), "flow_return",
     [([(40, 12), (40, 6), (8, 6), (8, 52), (28, 52)], "Yes", (24, 6)),
      ([(84, 14.5), (84, 6), (40, 6)], None, None, 8.5, False)])

flow([("s", "term", 40, 118, "Start: sorted list A[0..n-1], key", 20, 3.5),
      ("i", "process_rect", 40, 104, "lo = 0,  hi = n - 1", 13, 3.5),
      ("c", "decision", 40, 90, "lo <= hi ?", 10, 6, 9.5),
      ("nf", "term", 86, 90, "Return -1\n(not found)", 11, 4),
      ("m", "process_rect", 40, 76, "mid = (lo + hi) // 2", 13, 3.5),
      ("eq", "decision", 40, 61, "A[mid] == key ?", 13, 6, 9.5),
      ("f", "term", 86, 61, "Return mid", 10, 3.5),
      ("lt", "decision", 40, 44, "A[mid] < key ?", 12, 6, 9.5),
      ("l", "process_rect", 18, 26, "lo = mid + 1", 10, 3.5),
      ("h", "process_rect", 62, 26, "hi = mid - 1", 10, 3.5)],
     [("s", "i"), ("i", "c"), ("c", "nf", "No"), ("c", "m", "Yes"), ("m", "eq"), ("eq", "f", "Yes"),
      ("eq", "lt", "No"), ("lt", "l", "Yes"), ("lt", "h", "No")],
     (10, 12.5), "flow_binary_search",
     [([(18, 22.5), (18, 14), (4, 14), (4, 90), (30, 90)],),
      ([(62, 22.5), (62, 14), (18, 14)], None, None, 8.5, False)])

flow([("s", "term", 40, 118, "MergeSort(A, key)", 13, 3.5),
      ("c", "decision", 40, 103, "len(A) <= 1 ?", 12, 6, 9.5),
      ("r", "term", 86, 103, "Return A", 9, 3.5),
      ("m", "process_rect", 40, 88, "mid = len(A) // 2", 12, 3.5),
      ("L", "process_rect", 20, 73, "left =\nMergeSort(A[:mid])", 14, 4.5),
      ("R", "process_rect", 60, 73, "right =\nMergeSort(A[mid:])", 14, 4.5),
      ("mg", "process_rect", 40, 56, "i = j = 0;  out = [ ]", 14, 3.5),
      ("w", "decision", 40, 42, "i < len(left) and\nj < len(right) ?", 15, 7, 9),
      ("cmp", "decision", 40, 24, "key(left[i]) <=\nkey(right[j]) ?", 15, 7, 9),
      ("a", "process_rect", 14, 8, "append left[i]; i++", 12, 3.5),
      ("b", "process_rect", 66, 8, "append right[j]; j++", 12, 3.5),
      ("t", "process_rect", 88, 42, "append leftovers\nreturn out", 11, 4.5)],
     [("s", "c"), ("c", "r", "Yes"), ("c", "m", "No"), ("m", "L"), ("m", "R"), ("L", "mg"), ("R", "mg"), ("mg", "w"),
      ("w", "cmp", "Yes"), ("w", "t", "No"), ("cmp", "a", "Yes"), ("cmp", "b", "No")],
     (10.5, 12.5), "flow_merge_sort",
     [([(2, 8), (0, 8), (0, 42), (25, 42)],),
      ([(66, 4.5), (66, 1), (0, 1), (0, 8)], None, None, 8.5, False)])
print("done")
