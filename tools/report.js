// Builds the DAA mini project report (.docx) in the CIC-311 format.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, HeadingLevel, PageBreak, Footer, PageNumber, NumberFormat, TableOfContents, Bookmark,
  PageReference, PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
  LevelFormat, BorderStyle, VerticalAlign, TableLayoutType, TabStopType, LeaderType,
} = require("docx");

const [, , FACTS, ROOT, OUT] = process.argv;
const F = JSON.parse(fs.readFileSync(FACTS, "utf8"));
const DIAG = path.join(ROOT, "report", "diagrams");
const SHOTS = path.join(ROOT, "report", "screenshots");
const ASSETS = path.join(ROOT, "report", "assets");
const CHARTS = path.join(ROOT, "code", "figures");

const FONT = "Times New Roman";
const MONO = "Courier New";
const TEXT_W = 11906 - 2160 - 1440; // A4 width minus 1.5" left and 1" right margins (DXA)
const DEPT = "Department of Computer Science & Engineering";

// ------------------------------------------------------------------ inline helpers
function runs(text, base = {}) {
  // **bold**, *italic* and `code` inside body text
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith("`")) out.push(new TextRun({ text: t.slice(1, -1), font: MONO, size: 21, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const P = (text, opts = {}) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120 }, ...opts, children: runs(text) });

let listInstance = 0;
const bullets = (items) => items.map((t) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED, numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: runs(t),
}));
const numbered = (items) => {
  listInstance += 1;
  return items.map((t) => new Paragraph({
    alignment: AlignmentType.JUSTIFIED, numbering: { reference: "numbers", level: 0, instance: listInstance },
    spacing: { after: 60 }, children: runs(t),
  }));
};

// ------------------------------------------------------------------ headings and numbering
let chap = 0, sec = 0, sub = 0, figN = 0, tabN = 0;
const figures = [], tables = [], headings = [];

// Headings carry bookmarks; the table of contents points at them with PAGEREF fields.
function heading(level, text, bm, pageBreakBefore = false) {
  headings.push({ level, text, bm });
  return new Paragraph({ heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, pageBreakBefore,
    children: [new Bookmark({ id: bm, children: [new TextRun(text)] })] });
}
function H1(title) {
  chap += 1; sec = 0; figN = 0; tabN = 0;
  return heading(1, `CHAPTER ${chap}: ${title.toUpperCase()}`, `h_${chap}`, true);
}
function H2(title) {
  sec += 1; sub = 0;
  return heading(2, `${chap}.${sec} ${title}`, `h_${chap}_${sec}`);
}
function H3(title) {
  sub += 1;
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(`${chap}.${sec}.${sub} ${title}`)] });
}

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function fig(file, title, maxW = 560, maxH = 640) {
  figN += 1;
  const num = `${chap}.${figN}`;
  const bm = `fig_${chap}_${figN}`;
  figures.push({ num, title, bm });
  const { w, h } = pngSize(file);
  let width = maxW, height = Math.round((h / w) * maxW);
  if (height > maxH) { height = maxH; width = Math.round((w / h) * maxH); }
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60, line: 240 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width, height },
        altText: { title, description: title, name: bm } })] }),
    new Paragraph({ style: "Caption", children: [new Bookmark({ id: bm, children: [new TextRun(`Figure ${num}: ${title}`)] })] }),
  ];
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, width, { header = false, shade, align = AlignmentType.LEFT, mono = false, size = 22, keepNext = false } = {}) {
  const lines = Array.isArray(text) ? text : [text];
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: header ? { fill: "D9E2F3", type: ShadingType.CLEAR, color: "auto" } : shade ? { fill: shade, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: lines.map((t) => new Paragraph({ alignment: align, keepNext, spacing: { after: 0, line: 260 },
      children: header ? [new TextRun({ text: t, bold: true, size })] : mono ? [new TextRun({ text: t, font: MONO, size: 18 })] : runs(t, { size }) })),
  });
}

function tbl(title, header, rows, widths, opts = {}) {
  tabN += 1;
  const num = `${chap}.${tabN}`;
  const bm = `tab_${chap}_${tabN}`;
  tables.push({ num, title, bm });
  const total = widths.reduce((a, b) => a + b, 0);
  const trs = [];
  // Short tables are kept on one page: every row but the last keeps with the next.
  const together = rows.length <= 12 && !opts.split;
  if (header) trs.push(new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => cell(h, widths[i], { header: true, align: AlignmentType.CENTER, keepNext: true })) }));
  rows.forEach((r, ri) => trs.push(new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], {
    shade: opts.firstColShade && i === 0 ? "F2F2F2" : undefined, align: opts.center && i > 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
    size: opts.size || 22, keepNext: together && ri < rows.length - 1 })) })));
  return [
    new Paragraph({ style: "Caption", keepNext: true, spacing: { before: 200, after: 80 }, children: [new Bookmark({ id: bm, children: [new TextRun(`Table ${num}: ${title}`)] })] }),
    new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, alignment: AlignmentType.CENTER, rows: trs }),
    ...(opts.last ? [] : [new Paragraph({ spacing: { after: 120 }, children: [] })]),
  ];
}

// Two figures side by side in a borderless table, each with its own number and caption.
function figPair(a, b, maxW = 265, maxH = 360) {
  const half = Math.floor(TEXT_W / 2);
  const cellFor = ([file, title]) => {
    figN += 1;
    const num = `${chap}.${figN}`, bm = `fig_${chap}_${figN}`;
    figures.push({ num, title, bm });
    const { w, h } = pngSize(file);
    let width = maxW, height = Math.round((h / w) * maxW);
    if (height > maxH) { height = maxH; width = Math.round((w / h) * maxH); }
    return new TableCell({ borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
      width: { size: half, type: WidthType.DXA }, verticalAlign: VerticalAlign.BOTTOM,
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60, line: 240 },
          children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width, height }, altText: { title, description: title, name: bm } })] }),
        new Paragraph({ style: "Caption", spacing: { before: 40, after: 60, line: 240 }, children: [new Bookmark({ id: bm, children: [new TextRun(`Figure ${num}: ${title}`)] })] }),
      ] });
  };
  return [
    new Table({ width: { size: half * 2, type: WidthType.DXA }, columnWidths: [half, half], alignment: AlignmentType.CENTER,
      rows: [new TableRow({ cantSplit: true, children: [cellFor(a), cellFor(b)] })] }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

function code(text) {
  const lines = text.replace(/\t/g, "    ").split("\n");
  return [
    new Table({
      width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W], alignment: AlignmentType.CENTER,
      rows: [new TableRow({ cantSplit: lines.length <= 40, children: [new TableCell({
        borders: { top: border, bottom: border, left: border, right: border }, width: { size: TEXT_W, type: WidthType.DXA },
        shading: { fill: "F5F5F5", type: ShadingType.CLEAR, color: "auto" }, margins: { top: 80, bottom: 80, left: 140, right: 100 },
        children: lines.map((l) => new Paragraph({ spacing: { after: 0, line: 240 }, children: [new TextRun({ text: l || " ", font: MONO, size: 17 })] })),
      })] })],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

const diag = (n) => path.join(DIAG, `${n}.png`);
const chart = (n) => path.join(CHARTS, `${n}.png`);
const shot = (n) => path.join(SHOTS, `${n}.png`);
const fmt = (x) => Number(x).toLocaleString("en-IN");

// ================================================================== CHAPTERS
const body = [];
const add = (...xs) => xs.forEach((x) => (Array.isArray(x) ? body.push(...x) : body.push(x)));

// ------------------------------------------------------------------ 1 Introduction
add(H1("Introduction"));
add(H2("Background"));
add(P("A college library serves hundreds of readers every day. Books are asked for, issued, returned, put back on the shelf and asked for again. When this is done on paper, the same few problems keep coming back: a student cannot tell whether a book is on the shelf, people who asked first are not always served first, returned books pile up on the counter, and late returns are noticed only by chance."));
add(P("Each of these problems is, at heart, a data structure problem. Requests should be served in the order they arrive, which is exactly what a **queue** does. A pile of returned books is handled from the top down, which is exactly what a **stack** does. Finding a book among thousands is a **searching** problem, and searching is far faster when the catalogue is kept **sorted**. This project builds a small but complete library system around these ideas and measures how well each algorithm performs."));
add(H2("Problem Statement"));
add(P("Design and implement a Library Book Management System in Python (Google Colab) that uses a stack, a queue and searching algorithms to manage the issue and return of books, records the time of every borrow and return, and reports which books are most popular."));
add(P("**Inputs.** The book catalogue (title, author, genre, year, number of copies), the list of members, issue requests from members (member, book, time), returned books (member, book, time) and search queries (part of a title or an author name)."));
add(P("**Processes.** Requests are placed in a FIFO queue and served in arrival order. If no copy is free, the member is placed in a waitlist queue for that book. Returned books are time-stamped, any fine is computed, and the book is pushed onto a return stack. Reshelving pops books off the stack and hands each one to the first member waiting for it. The catalogue is sorted with merge sort and searched with linear search (partial matches) and binary search (exact titles)."));
add(P("**Outputs.** Search results, issue slips with due dates, fines for late returns, an overdue list, CSV files that hold the whole library state, and charts of popular books, borrowing patterns and measured algorithm running times."));
add(H2("Objectives"));
add(bullets([
  "Implement a stack and a queue from scratch, on a linked list, with O(1) operations.",
  "Serve issue requests strictly first-come-first-served and keep a per-book waitlist when copies run out.",
  "Handle returned books with a stack and reshelve them in last-in-first-out order.",
  "Record request, issue, due and return timestamps and compute fines from them (group-specific task).",
  "Search the catalogue by title or author with linear search, and by exact title with binary search on a merge-sorted catalogue.",
  "Save and load the complete library state, including queue and stack contents, as CSV files using pandas.",
  "Show the most popular books as a bar chart (group-specific task) and measure the running time of each algorithm.",
]));
add(H2("Scope"));
add(P("The system is a single-user program. The algorithms live in one Python module that runs both inside a Google Colab notebook and behind a website served on localhost. It covers the catalogue, members, issuing, returning, reshelving, fines, searching, reports and CSV storage. It does not cover user login, online payments, barcode scanners or a multi-user database server; these are listed as future work in Chapter 7."));
add(H2("Significance"));
add(P("The project shows that choosing the right data structure is what makes a system fair and fast. The queue guarantees that nobody is skipped. The stack matches how a librarian actually clears a returns trolley. Binary search finds an exact title among 100,000 books in about two microseconds, while a linear scan of the same list takes milliseconds. Measuring these differences on real code turns the complexity analysis taught in Design and Analysis of Algorithms into something that can be seen and checked."));

// ------------------------------------------------------------------ 2 System design
add(H1("System Analysis and Design"));
add(H2("Context Diagram"));
add(P("The context diagram shows the whole system as one process and the four external entities it talks to. The **Librarian** maintains the catalogue and reshelves books. The **Member** searches, requests and returns books. The **CSV files** store the library state between sessions, and the **Reports** entity receives charts and statistics."));
add(fig(diag("context_diagram"), "Context diagram of the Library Book Management System", 470));
add(H2("Data Flow Diagrams"));
add(H3("Level 0 DFD"));
add(P("The Level 0 DFD still treats the system as a single process, but it now shows the data stores the process reads and writes: D1 Books, D2 Members, D3 Transactions and D4 the queues and stack."));
add(fig(diag("dfd_level0"), "Level 0 data flow diagram", 470));
add(H3("Level 1 DFD"));
add(P("Level 1 breaks the system into five processes. **1.0 Manage Catalogue** adds books and members. **2.0 Search Books** reads the sorted catalogue. **3.0 Handle Issue Requests** works with the request queue and waitlists and writes issue records. **4.0 Handle Returns** finds the open issue, pushes the book onto the return stack, reshelves it and serves the waitlist. **5.0 Reports & Charts** reads the transaction history and saves or loads CSV files."));
add(fig(diag("dfd_level1"), "Level 1 data flow diagram", 520));
add(H3("Level 2 DFD: Handle Issue Requests (3.0)"));
add(P("A request is first accepted and enqueued (3.1). Requests are then dequeued in FIFO order (3.2) and validated against the member's current loans and the number of free copies (3.3). If a copy is free the book is issued and the issue and due times are stamped (3.4); otherwise the member joins the waitlist for that book (3.5)."));
add(fig(diag("dfd_level2_issue"), "Level 2 DFD for process 3.0 (Handle Issue Requests)", 500));
add(H3("Level 2 DFD: Handle Returns (4.0)"));
add(P("The open issue record is found (4.1), the return time is stamped and the fine computed (4.2), and the book is pushed onto the return stack (4.3). When the librarian reshelves, books are popped from the top of the stack (4.4) and, if anyone is waiting for that book, the first member in its waitlist receives it at once (4.5)."));
add(fig(diag("dfd_level2_return"), "Level 2 DFD for process 4.0 (Handle Returns)", 500));
add(H2("ER Diagram"));
add(P("The data model has three entities. A **Member** makes many **Transactions**; each transaction covers exactly one **Book**, and a book can appear in many transactions. The many-to-many relationship *waits for* links members and books while a member is in a book's waitlist; its attributes are the position in the queue and the request time."));
add(fig(diag("er_diagram"), "Entity-Relationship diagram (Chen notation)", 520));
add(tbl("Entities and their attributes", ["Entity", "Attributes (primary key underlined in Figure 2.6)", "Stored in"], [
  ["Book", "book_id, title, author, genre, year, total_copies, available_copies", "books.csv"],
  ["Member", "member_id, name, email, joined", "members.csv"],
  ["Transaction", "txn_id, book_id, member_id, request_time, issue_time, due_time, return_time, fine", "transactions.csv"],
  ["Waitlist entry", "book_id, position, member_id, request_time", "waitlists.csv"],
  ["Return stack entry", "position_from_top, book_id, return_time", "return_stack.csv"],
], [1700, 4806, 1800]));
add(H2("Use Case Diagram"));
add(P("Two human actors use the system. The Librarian manages the catalogue and members, processes the request queue, reshelves returned books, views reports and saves or loads data. The Member searches the catalogue, requests books and returns them. *Return book* always includes *Compute fine*, and *Join waitlist* extends *Process request queue* when no copy is free. The file system is a secondary actor that stores the CSV files."));
add(fig(diag("use_case_diagram"), "Use case diagram", 430));
add(H2("System Architecture"));
add(P("The program is organised in layers. The user interface is either the website (HTML, CSS and JavaScript in `web/`, served by the Flask program `server.py`) or the Colab notebook; both reach the same `Library` class in `library_core.py`, which holds the business rules. The Library class uses the Stack, Queue, sorting and searching modules and the Book, Member and Transaction data classes. pandas handles CSV storage and matplotlib/seaborn draw the charts."));
add(fig(diag("architecture"), "Layered architecture of the system", 440));

// ------------------------------------------------------------------ 3 Use cases
add(H1("Use Cases"));
add(P("This chapter describes each use case from Figure 2.7 in the standard format: actors, preconditions, flow of events, postconditions and exceptions."));
const uc = (id, name, actors, pre, flow, post, exc, last = false) => tbl(`Use case ${id}: ${name}`, null, [
  ["Name", name], ["Actors", actors], ["Preconditions", pre], ["Flow of events", flow.map((s, i) => `${i + 1}. ${s}`)],
  ["Postconditions", post], ["Exceptions", exc],
], [2000, TEXT_W - 2000], { firstColShade: true, size: 20, last, split: true });
add(H2("Search Books"));
add(uc("UC-1", "Search Books", "Member, Librarian", "The catalogue is loaded and sorted by title.",
  ["The user chooses search by title, by author, by prefix or by exact title.", "The user types the search text.",
   "For title or author, the system runs a linear search and collects every book whose field contains the text (case-insensitive).",
   "For an exact title, the system runs a binary search on the sorted catalogue; for a prefix, it binary-searches the first match and scans forward.",
   "The system shows each matching book with its free and total copies."],
  "The catalogue is unchanged.", "No match: an empty list (or \"not found\") is shown. Empty search text: every book matches."));
add(H2("Request Issue"));
add(uc("UC-2", "Request Issue", "Member", "The member and the book exist in the system.",
  ["The member gives their member id and the book id.", "The system time-stamps the request.",
   "The request (member, book, time) is enqueued at the rear of the request queue.", "The system shows the new queue length."],
  "The request waits in the queue until the queue is processed.", "Unknown member or book id: the request is rejected with an error."));
add(H2("Process Request Queue"));
add(uc("UC-3", "Process Request Queue", "Librarian", "The request queue is not empty.",
  ["The system dequeues the request at the front of the queue.", "It checks that the member holds fewer than 3 books and does not already hold this book.",
   "If a copy is free, the book is issued: available copies fall by one, issue time is now and due time is 14 days later.",
   "If no copy is free, the member is enqueued in that book's waitlist (extension: Join Waitlist).", "Steps 1 to 4 repeat until the queue is empty."],
  "Every request has been issued, waitlisted or refused, in arrival order.", "Member at the loan limit, already holding the book or already in the waitlist: the request is refused and the reason is logged."));
add(H2("Return Book"));
add(uc("UC-4", "Return Book", "Member", "The member currently holds the book.",
  ["The member hands in the book.", "The system finds the open transaction for (member, book).", "The return time is stamped.",
   "Compute Fine (included): late days = return date - due date; fine = late days x Rs. 2.", "The book is pushed onto the return stack."],
  "The transaction is closed with its return time and fine; the book is on the return stack, not yet on the shelf.", "The member does not hold this book: an error is shown and nothing changes."));
add(H2("Reshelve Returned Books"));
add(uc("UC-5", "Reshelve Returned Books", "Librarian", "The return stack is not empty.",
  ["The system pops the book on top of the stack (the most recently returned).", "Its available copies rise by one.",
   "If the book's waitlist is not empty, the first waiting member is dequeued and the book is issued to them immediately.",
   "Steps 1 to 3 repeat until the stack is empty or the requested number of books is reshelved."],
  "The stack is empty (or smaller) and waiting members have been served in FIFO order.", "A waiting member who has since reached the loan limit is skipped and the next one is served."));
add(H2("Save / Load CSV"));
add(uc("UC-6", "Save / Load CSV", "Librarian, File System", "For loading, the CSV files exist in the data folder.",
  ["Save: books, members and transactions are converted to pandas DataFrames and written to CSV.",
   "The waitlists are written front-to-back with their positions; the return stack is written top-to-bottom.",
   "Load: the files are read, the catalogue is merge-sorted, and the queues and stack are rebuilt in the same order."],
  "The reloaded library is identical to the saved one (checked by assertions in the notebook).", "Missing or malformed file: pandas raises an error and the current library is left unchanged."));
add(H2("View Reports and Charts"));
add(uc("UC-7", "View Reports and Charts", "Librarian", "At least one transaction exists.",
  ["The system reads the transactions with their timestamps.", "It lists overdue books and the fine due so far.",
   "It draws the top-10 popular books, issues by genre, how long books are kept, and weekly issues, returns and fines."],
  "Charts are shown in the notebook and saved as PNG files.", "No transactions: the charts are empty.", true));

// ------------------------------------------------------------------ 4 Algorithm design
add(H1("Algorithm Design"));
add(H2("Choice of Data Structures"));
add(P("Each part of the library maps naturally onto one data structure. Table 4.1 summarises the choices and the reasons for them."));
add(tbl("Data structure chosen for each task", ["Task", "Data structure", "Reason"], [
  ["Issue requests", "Queue (FIFO)", "The member who asked first must be served first."],
  ["Waiting for a book", "Queue per book", "Fair order among members waiting for the same title."],
  ["Returned books", "Stack (LIFO)", "Books are taken off the top of the returns pile; O(1) push and pop."],
  ["Catalogue", "Array sorted by title", "Allows binary search in O(log n)."],
  ["Sorting the catalogue", "Merge sort", "O(n log n) in every case and stable."],
  ["Partial-match search", "Linear search", "A substring can occur anywhere, so every title must be checked."],
  ["Lookup by id", "Hash table (Python dict)", "Books and members are found by id in O(1) on average."],
], [2200, 2300, TEXT_W - 4500]));
add(H2("Stack and Queue"));
add(P("Both structures are built on a singly linked list of nodes. The stack keeps a pointer to the top node; push links a new node in front of it and pop unlinks it. The queue keeps pointers to both the head and the tail, so that enqueue adds at the tail and dequeue removes from the head without walking the list. All operations are therefore O(1) time, and the structures use O(n) space for n items."));
add(code(`PUSH(S, x)                         ENQUEUE(Q, x)
  node <- new Node(x)                node <- new Node(x)
  node.next <- S.top                 if Q.tail = NIL then
  S.top <- node                          Q.head <- node; Q.tail <- node
  S.size <- S.size + 1               else
                                         Q.tail.next <- node; Q.tail <- node
POP(S)                               Q.size <- Q.size + 1
  if S.top = NIL then error
  x <- S.top.data                  DEQUEUE(Q)
  S.top <- S.top.next                if Q.head = NIL then error
  S.size <- S.size - 1               x <- Q.head.data
  return x                           Q.head <- Q.head.next
                                     if Q.head = NIL then Q.tail <- NIL
                                     Q.size <- Q.size - 1
                                     return x`));
add(H2("Processing Issue Requests"));
add(P("The request queue is drained in arrival order. Each request is checked against the loan limit and against books the member already holds. A free copy is issued at once; otherwise the member joins that book's waitlist. If r requests are in the queue and a member holds at most 3 books, the loop costs O(r) queue operations plus the scan for the member's open loans."));
add(code(`PROCESS-REQUESTS(L, now)
  while not EMPTY(L.requestQueue) do
      (m, b, t) <- DEQUEUE(L.requestQueue)
      held <- open transactions of member m
      if |held| >= 3 or b in held then
          refuse request and log reason
      else if L.books[b].available > 0 then
          L.books[b].available <- L.books[b].available - 1
          create Transaction(b, m, t, issue = now, due = now + 14 days)
      else if m not in L.waitlist[b] then
          ENQUEUE(L.waitlist[b], (m, t))`));
add(H2("Returning and Reshelving Books"));
add(P("A return closes the open transaction, stamps the time, computes the fine and pushes the book onto the return stack. Reshelving pops books off the stack, increases the free copies and serves the book's waitlist in FIFO order, so a book that someone is waiting for never goes back on the shelf unnecessarily."));
add(code(`RETURN-BOOK(L, m, b, now)
  T <- open transaction with member m and book b
  if T = NIL then error "book not issued to member"
  T.return <- now
  late <- max(0, date(now) - date(T.due))
  T.fine <- late x 2                      // Rs. 2 per late day
  PUSH(L.returnStack, (b, now))

RESHELVE(L, now)
  while not EMPTY(L.returnStack) do
      (b, t) <- POP(L.returnStack)        // most recent return first
      L.books[b].available <- L.books[b].available + 1
      while not EMPTY(L.waitlist[b]) and L.books[b].available > 0 do
          (m, t0) <- DEQUEUE(L.waitlist[b])
          if member m is under the loan limit and does not hold b then
              issue b to m`));
add(figPair([diag("flow_issue"), "Flowchart for processing the request queue"], [diag("flow_return"), "Flowchart for returning and reshelving books"]));
add(H2("Searching"));
add(H3("Linear search"));
add(P("Linear search compares the query with the title (or author) of every book and keeps every book that contains it. It is the only correct choice for substring matches such as \"orwell\" or \"the\", because a substring can appear anywhere in a title and the sort order gives no help. It always makes n comparisons, so it is O(n) in the best, average and worst case when all matches are wanted."));
add(H3("Binary search"));
add(P("For an exact title, the catalogue sorted by title is searched by repeatedly halving the range [lo, hi]. Each step discards half of the remaining books, so at most floor(log2 n) + 1 comparisons are needed: 17 for 100,000 books. A variant, *lower bound*, returns the first position whose title is not less than a prefix; scanning forward from it gives all k titles with that prefix in O(log n + k)."));
add(code(`BINARY-SEARCH(A, key)                    // A sorted by title
  lo <- 0; hi <- n - 1
  while lo <= hi do
      mid <- floor((lo + hi) / 2)
      if A[mid].title = key then return mid
      else if A[mid].title < key then lo <- mid + 1
      else hi <- mid - 1
  return -1                                // not found`));
add(H2("Sorting with Merge Sort"));
add(P("Binary search needs a sorted catalogue, so the catalogue is merge-sorted by title whenever a book is added or removed. Merge sort divides the list into two halves, sorts each half recursively and merges the two sorted halves. Using <= when comparing keeps equal titles in their original order, so the sort is stable."));
add(code(`MERGE-SORT(A)
  if |A| <= 1 then return A
  mid <- floor(|A| / 2)
  L <- MERGE-SORT(A[0 .. mid-1]);  R <- MERGE-SORT(A[mid .. n-1])
  return MERGE(L, R)

MERGE(L, R)
  i <- 0; j <- 0; out <- empty list
  while i < |L| and j < |R| do
      if key(L[i]) <= key(R[j]) then append L[i] to out; i <- i + 1
      else append R[j] to out; j <- j + 1
  append the remaining items of L and R to out
  return out`));
add(P("The running time satisfies the recurrence **T(n) = 2T(n/2) + cn**, because the two halves are sorted recursively and merging takes linear time. By case 2 of the Master Theorem (a = 2, b = 2, f(n) = Θ(n) = Θ(n^(log_b a))), T(n) = Θ(n log n) in the best, average and worst case. The merge needs O(n) extra space."));
add(figPair([diag("flow_binary_search"), "Flowchart for binary search"], [diag("flow_merge_sort"), "Flowchart for merge sort"], 265, 330));
add(H2("Timestamps and Fine Calculation"));
add(P("Every transaction stores four timestamps: when the book was requested, when it was issued, when it is due (issue time plus 14 days) and when it was returned. The fine is computed on calendar days: **late = max(0, return date - due date)** and **fine = late x Rs. 2**. The waiting time of a request is issue time minus request time. The same timestamps drive the overdue report and the weekly activity chart in Chapter 6."));
add(H2("Complexity Summary"));
add(P("In Table 4.2, n is the number of books, k the number of matches, t the number of transactions scanned to find a member's open loans, and w the number of waiting members served. The O(t) scans could be made O(1) with a dictionary of open loans per member; this is listed as future work."));
add(tbl("Time and space complexity of each operation", ["Operation", "Best", "Average", "Worst", "Extra space"], [
  ["Stack push / pop / peek", "O(1)", "O(1)", "O(1)", "O(1)"],
  ["Queue enqueue / dequeue", "O(1)", "O(1)", "O(1)", "O(1)"],
  ["Linear search (all matches)", "O(n)", "O(n)", "O(n)", "O(k) results"],
  ["Binary search (exact title)", "O(1)", "O(log n)", "O(log n)", "O(1)"],
  ["Prefix search", "O(log n)", "O(log n + k)", "O(log n + k)", "O(k)"],
  ["Merge sort", "O(n log n)", "O(n log n)", "O(n log n)", "O(n)"],
  ["Process r requests", "O(r)", "O(r·t)", "O(r·t)", "O(1)"],
  ["Return a book", "O(1)", "O(t)", "O(t)", "O(1)"],
  ["Reshelve s books", "O(s)", "O(s)", "O(s + w)", "O(1)"],
], [3000, 1150, 1450, 1450, TEXT_W - 7050], { center: true }));

// ------------------------------------------------------------------ 5 Implementation
add(H1("Implementation"));
add(H2("Tools and Environment"));
add(tbl("Tools and libraries used", ["Tool / library", "Use in the project"], [
  ["Python 3", "Programming language for the whole system"],
  ["Google Colab", "Notebook environment where the algorithms are run, tested and measured"],
  ["Flask", "Small web server (server.py) that runs the backend and answers the website's requests as JSON"],
  ["HTML, CSS, JavaScript", "The website: pages, the queue and stack views, the binary search visualiser and SVG charts"],
  ["dataclasses, datetime, random, time", "Data model, timestamps, sample data and timing (Python standard library)"],
  ["pandas", "Reading and writing CSV files, report tables"],
  ["matplotlib, seaborn", "Bar charts, histograms, line charts and benchmark plots"],
], [3200, TEXT_W - 3200]));
add(H2("Project Structure"));
add(P("All data structures and algorithms are in one module, `library_core.py`. Two programs use it. The Colab notebook `Library_Book_Management_System.ipynb` contains the same code, cell by cell, together with self-tests, a step-by-step demo, a 90-day simulation, reports and performance measurements; running it creates `library_data/` with the CSV files and `figures/` with the charts. The Flask program `server.py` imports the module and serves the website in `web/`, through which librarians and members use it (Section 5.5)."));
add(tbl("Modules of the program", ["Module", "Responsibility"], [
  ["Node, Stack, Queue", "Linked-list based stack and queue with O(1) operations and self-tests"],
  ["merge_sort, merge", "Stable merge sort with a key function"],
  ["linear_search, binary_search, lower_bound, prefix_search", "Searching the catalogue"],
  ["Book, Member, Transaction", "Data classes matching the ER diagram"],
  ["Library", "Catalogue, request queue, waitlists, return stack, issue/return/reshelve rules, reports, CSV save and load"],
  ["linear_search_count, binary_search_trace, prefix_search_trace", "The same searches, also reporting comparisons and every lo/mid/hi step for the frontend"],
  ["build_library, simulate", "60 sample books, 25 members and a 90-day simulation of library use"],
  ["server.py (Flask)", "Holds one Library and exposes each operation as a JSON endpoint (/api/request, /api/process, /api/return, /api/reshelve, /api/search …)"],
  ["web/ (HTML, CSS, JS)", "Website: dashboard, search, issue desk, returns desk, members, reports, algorithm lab, activity log"],
], [3600, TEXT_W - 3600]));
add(H2("Key Code"));
add(P("This section shows binary search, the method examiners ask about most. The Stack and Queue classes, merge sort, `process_requests`, `return_book` and `reshelve` follow the pseudocode of Chapter 4 line by line; the complete code is in `library_core.py` and in the notebook."));
add(H3("Binary search"));
add(code(F.snip.binary_search));
add(H2("Sample Run"));
add(P("The demo in section 7 of the notebook creates a fresh library and walks through one scenario: four members ask for *Cosmos*, which has a single copy, and a fifth asks for *1984*. The event log below is the actual output."));
add(code(F.demo_log.trim()));
add(P("The log shows each structure at work. Requests are served in the order M001, M002, M003, M004, M005. Only M001 gets *Cosmos*; the others join its waitlist in the same order. *1984* is returned first and *Cosmos* second, so *Cosmos* is on top of the return stack and is reshelved first. It goes straight to M002, the first member in its waitlist. *Cosmos* came back three days late, so a fine of Rs. 6 was charged."));
add(H2("User Interface"));
add(P("The frontend is a website that runs on the local machine: `python server.py` starts the Flask server and opens http://localhost:5000. The server holds one `Library` object; the website contains no algorithm code of its own. Every button sends a request to an `/api/…` endpoint, the server calls the backend method described in Chapter 4 and replies with JSON, and the page redraws the request queue, the waitlists and the return stack from their new contents. A *Library date* control in the sidebar sets the clock used for timestamps, so late returns and fines can be demonstrated. Table 5.3 maps each screen to the backend operation it calls."));
add(tbl("Frontend screens and the backend operations behind them", ["Screen / action", "Backend call", "Structure / algorithm"], [
  ["Search Catalogue", "`linear_search_count`, `prefix_search_trace`, `binary_search_trace`", "Linear / binary search on the merge-sorted catalogue"],
  ["Issue Desk: Add to request queue", "`request_issue`", "Queue: enqueue"],
  ["Issue Desk: Process request queue", "`process_requests`", "Queue: dequeue; waitlist enqueue"],
  ["Returns Desk: Return book", "`return_book`", "Timestamps, fine; Stack: push"],
  ["Returns Desk: Reshelve", "`reshelve`", "Stack: pop; waitlist dequeue"],
  ["Dashboard, Members, Reports", "`overdue`, `books_held_by`, transaction timestamps", "Reports from timestamps"],
  ["Algorithm Lab", "`merge_sort`, `binary_search`, linear scan", "Running-time measurement"],
  ["Sidebar: Save / Reload", "`save_csv`, `load_csv`", "CSV files via pandas"],
], [2700, 3100, TEXT_W - 5800], { size: 20 }));
add(P("The dashboard (Figure 5.1) summarises the library: copies on the shelf, books issued, overdue loans, and the sizes of the request queue, the waitlists and the return stack, next to the most popular books and the latest events."));
add(fig(shot("ui_dashboard"), "Frontend: dashboard", 470));
add(P("The search screen (Figure 5.2) lets the user choose the algorithm. For an exact title it shows every step of the binary search: the range [lo, hi], the middle title and the half that is thrown away. Finding *Wings of Fire* among 60 books took 5 comparisons, against 60 for a linear scan."));
add(fig(shot("ui_search"), "Frontend: exact-title search with the binary search steps", 450));
add(P("The Issue Desk (Figure 5.3) draws the request queue from front to rear. Pressing *Process request queue* dequeues the requests in arrival order; members who ask for a book with no free copy appear in that book's waitlist queue below."));
add(fig(shot("ui_issue"), "Frontend: Issue Desk with the request queue and per-book waitlists", 450));
add(P("The Returns Desk (Figure 5.4) shows the due date and the fine before a book is returned, and draws the return stack with its top element highlighted. *Reshelve top book* pops one book; if anyone is waiting for it, the first member in its waitlist is issued the book at once."));
add(fig(shot("ui_returns"), "Frontend: Returns Desk with the fine and the return stack", 470));
add(P("The Reports screen lists overdue loans with the fine so far and draws the genre, loan-duration and weekly-activity charts of Chapter 6 from the timestamps. The Algorithm Lab (Figure 5.5) runs the backend's own merge sort, linear search and binary search on random catalogues of growing size and plots them against n, log n and n log n."));
add(fig(shot("ui_lab"), "Frontend: Algorithm Lab measuring the backend's algorithms", 450));
add(H2("Data Persistence"));
add(P("`save_csv` writes five files. Books, members and transactions are converted from data classes to DataFrames with `asdict`. The waitlists and the return stack are written with their positions so that `load_csv` can rebuild them in exactly the same order: waitlists are enqueued front first, and the stack is pushed bottom first so that the top element ends up on top again. The notebook checks after reloading that the books, transactions, sorted catalogue and every waitlist are unchanged."));
add(H2("Challenges Faced and Solutions"));
add(bullets([
  "**O(1) dequeue.** A Python list removes from the front in O(n). The queue was written on a linked list with a tail pointer so that both ends are O(1).",
  "**Duplicate waitlist entries.** In the first version a member who asked for the same unavailable book twice was added to its waitlist twice. The request is now refused if the member is already waiting for that book.",
  "**Issuing a book a member already has.** Reshelving could hand a member a second copy of a book they already held. The waitlist now skips members who hold the book or are at the loan limit.",
  "**Saving a stack and queues to CSV.** CSV has no notion of order beyond row order, so a position column was added and the structures are rebuilt in the right order when loading.",
  "**Stable timing results.** A single binary search takes about a microsecond, which is too short to time reliably. Each search was repeated many times and the average was taken.",
  "**One copy of the code.** The notebook and the website had to run exactly the same algorithms. The code was moved into `library_core.py`; the notebook is generated from it region by region, and the web server imports it.",
]));

// ------------------------------------------------------------------ 6 Results
add(H1("Results and Discussion"));
add(H2("Functional Testing"));
add(P("Each feature was tested with a known input and the output was compared with the expected result. All tests passed; the self-tests for the stack, queue and merge sort and the CSV round-trip check run automatically every time the notebook is executed."));
add(tbl("Functional test cases", ["#", "Test", "Expected result", "Result"], [
  ["1", "Push 1, 2, 3 then pop", "Pop returns 3, peek returns 2", "Pass"],
  ["2", "Enqueue A, B, C then dequeue", "Dequeue returns A, front is B", "Pass"],
  ["3", "Merge sort [5, 2, 9, 1, 5, 6]", "[1, 2, 5, 5, 6, 9]", "Pass"],
  ["4", "Binary search \"Wings of Fire\"", "Book B024 found", "Pass"],
  ["5", "Binary search \"Unknown Book\"", "Not found (None)", "Pass"],
  ["6", "Linear search author \"orwell\"", "1984 and Animal Farm", "Pass"],
  ["7", "Prefix search \"the a\"", "The Alchemist, The Algorithm Design Manual", "Pass"],
  ["8", "4 requests for a 1-copy book", "1 issued, 3 waitlisted in order", "Pass"],
  ["9", "Return 3 days late", "Fine Rs. 6", "Pass"],
  ["10", "Reshelve with a waitlist", "Book issued to first waiting member", "Pass"],
  ["11", "Request a 4th book", "Refused (loan limit 3)", "Pass"],
  ["12", "Save to CSV and load back", "Identical library state", "Pass"],
], [500, 3000, 3806, 1000], { size: 21 }));
add(H2("Simulation of One Semester"));
add(P(`To produce realistic data, the notebook simulates 90 days of library use with a fixed random seed (14, the group number). Each day 3 to 9 requests arrive, with a few books much more popular than others; requests are processed, some books are returned (more often once they are due), and the return stack is cleared. Table 6.2 summarises the outcome.`));
add(tbl("Results of the 90-day simulation", ["Measure", "Value"], [
  ["Books in catalogue / total copies", `${F.n_books} / ${F.n_copies}`],
  ["Members", `${F.n_members}`],
  ["Books issued (transactions)", `${F.n_tx}`],
  ["Returned / still out at the end", `${F.n_returned} / ${F.n_out}`],
  ["Late returns", `${F.n_late} (${Math.round((100 * F.n_late) / F.n_returned)}% of returns)`],
  ["Fines collected", `Rs. ${F.fines}`],
  ["Average days a book was kept", `${F.avg_days} days (loan period 14 days)`],
  ["Members still in a waitlist at the end", `${F.waiting}`],
], [4500, TEXT_W - 4500], { firstColShade: true }));
add(P(`Figure 6.1 shows the ten most popular books, the chart required for this group. *${F.top[0][0]}* was issued ${F.top[0][1]} times, far more than any other title. Popular single-copy books such as *${F.top.find((t) => t[2] === 1)[0]}* build long waitlists, which is a direct signal to the library to buy more copies.`));
add(fig(chart("popular_books"), "Top 10 most popular books (number of times issued)", 520));
add(P(`Figure 6.2 (left) shows that Computer Science (${F.genres[0][1]} issues) and Fiction (${F.genres[1][1]}) are the most borrowed genres. The histogram on the right uses the issue and return timestamps: most books come back within the 14-day loan period, and the bars to the right of the red line are the late returns that earned fines.`));
add(fig(chart("genre_and_duration"), "Issues by genre and how long books were kept", 560));
add(P("Figure 6.3 groups the timestamps by week. Issues and returns move together once the library reaches a steady state, and fines rise after the first two weeks, when the first loans become due."));
add(fig(chart("weekly_activity"), "Weekly issues, returns and fines derived from timestamps", 560));
add(H2("Performance Analysis"));
add(P("Each algorithm was timed on catalogues of 1,000 to 100,000 randomly generated books. Searches were repeated many times and averaged. Absolute times depend on the machine (Colab will give different numbers), but the growth with n is what matters."));
add(tbl("Measured running times", ["n (books)", "Merge sort (ms)", "Linear search (µs)", "Binary search (µs)", "Stack push (µs)", "Queue enqueue (µs)"],
  F.bench.map((r) => [fmt(r[0]), r[1].toFixed(1), r[2].toFixed(1), r[3].toFixed(2), r[4].toFixed(3), r[5].toFixed(3)]),
  [1300, 1350, 1450, 1450, 1350, TEXT_W - 6900], { center: true, size: 21 }));
add(fig(chart("benchmark"), "Linear vs binary search, and measured times against log n and n log n", 580));
add(fig(chart("stack_queue_constant"), "Stack push and queue enqueue take constant time", 420));
add(H2("Discussion"));
const b0 = F.bench[0], bN = F.bench[F.bench.length - 1];
add(bullets([
  `**Binary search vs linear search.** Going from ${fmt(b0[0])} to ${fmt(bN[0])} books (100 times more) made linear search about ${Math.round(bN[2] / b0[2])} times slower (${b0[2].toFixed(1)} µs to ${fmt(bN[2].toFixed(0))} µs). ${bN[2] / b0[2] > 130 ? "That is more than the 100 times that O(n) predicts, because a large list no longer fits in the processor cache and each comparison costs more; the comparison count itself grows exactly linearly." : "That is close to the 100 times that O(n) predicts."} Over the same range binary search only went from ${b0[3].toFixed(2)} µs to ${bN[3].toFixed(2)} µs. At ${fmt(bN[0])} books binary search is about ${fmt(Math.round(bN[2] / bN[3]))} times faster. The middle panel of Figure 6.4 shows the measured binary search times following the c·log2 n curve.`,
  `**Cost of sorting.** Merge sort of ${fmt(bN[0])} books took ${bN[1].toFixed(0)} ms and follows the c·n log2 n curve closely (Figure 6.4, right). Because the catalogue changes far less often than it is searched, paying O(n log n) once per change to make every exact search O(log n) is a good trade.`,
  "**Why linear search is still needed.** Binary search only works for exact titles and prefixes. Finding every title that *contains* a word, or every book by an author, still requires a linear scan; with a few thousand books this takes well under a millisecond, which is fast enough.",
  `**Stack and queue.** Push and enqueue took about ${bN[4].toFixed(2)} µs at every size (Figure 6.5), confirming O(1) behaviour. A queue built on a Python list with pop(0) would have become slower as it grew.`,
  "**Fairness.** In the simulation every waitlisted member was served in exactly the order they joined, and no member was ever issued a book ahead of someone who asked earlier for the same title.",
]));

// ------------------------------------------------------------------ 7 Conclusion
add(H1("Conclusion and Future Work"));
add(H2("Conclusion"));
add(P("This project built a working Library Book Management System in Python around three classic ideas from the course. A linked-list **queue** serves issue requests and per-book waitlists strictly in arrival order. A linked-list **stack** holds returned books and reshelves them from the top. **Searching** is done with linear search for partial matches and binary search, on a catalogue kept sorted by merge sort, for exact titles and prefixes. A website served on localhost lets a librarian and members use these structures directly and watch them change."));
add(P(`The group-specific tasks were completed: every request, issue, due and return is time-stamped, fines and overdue lists are derived from the timestamps, and a popular-books chart is produced. The library state, including the order of the queues and the stack, is saved to and loaded from CSV files with pandas. Measurements on up to ${fmt(bN[0])} books confirmed the theory: O(1) stack and queue operations, O(n) linear search, O(log n) binary search and O(n log n) merge sort.`));
add(H2("Limitations"));
add(bullets([
  "It is a single-user program running on one machine; there is no login and no concurrent access.",
  "Finding a member's open loans scans the transaction list, which is O(t).",
  "The catalogue is re-sorted in full after every addition or removal.",
]));
add(H2("Future Work"));
add(bullets([
  "Keep a dictionary of open loans per member to make loan checks O(1).",
  "Replace the sorted array with a balanced binary search tree or B-tree so that insertion is O(log n) instead of a full re-sort.",
  "Use a priority queue so that faculty members or reserved course books can be given priority.",
  "Move storage from CSV files to a database (for example SQLite) and add member login to the web interface so several users can work at once.",
]));

// ------------------------------------------------------------------ References
add(heading(1, "REFERENCES", "h_refs", true));
[
  "T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, *Introduction to Algorithms*, 3rd ed. Cambridge, MA, USA: MIT Press, 2009.",
  "E. Horowitz, S. Sahni, and S. Rajasekaran, *Fundamentals of Computer Algorithms*, 2nd ed. Hyderabad, India: Universities Press, 2008.",
  "R. Sedgewick and K. Wayne, *Algorithms*, 4th ed. Boston, MA, USA: Addison-Wesley, 2011.",
  "S. S. Skiena, *The Algorithm Design Manual*, 2nd ed. London, U.K.: Springer, 2008.",
  "D. E. Knuth, *The Art of Computer Programming, Vol. 3: Sorting and Searching*, 2nd ed. Reading, MA, USA: Addison-Wesley, 1998.",
  "R. Thareja, *Data Structures Using C*, 2nd ed. New Delhi, India: Oxford University Press, 2014.",
  "W. McKinney, \"Data structures for statistical computing in Python,\" in *Proc. 9th Python in Science Conf.*, Austin, TX, USA, 2010, pp. 56–61.",
  "J. D. Hunter, \"Matplotlib: A 2D graphics environment,\" *Computing in Science & Engineering*, vol. 9, no. 3, pp. 90–95, 2007.",
  "M. L. Waskom, \"seaborn: statistical data visualization,\" *Journal of Open Source Software*, vol. 6, no. 60, p. 3021, 2021.",
  "Python Software Foundation, \"Python 3 documentation.\" [Online]. Available: https://docs.python.org/3/",
  "Google, \"Google Colaboratory.\" [Online]. Available: https://colab.research.google.com/",
].forEach((r, i) => body.push(new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: 567, hanging: 567 }, spacing: { after: 120 },
  children: [new TextRun(`[${i + 1}]\t`), ...runs(r)] })));

// ================================================================== FRONT MATTER
const center = (text, size, { bold = false, italics = false, after = 0, before = 0 } = {}) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before, after, line: 240 }, children: [new TextRun({ text, size: size * 2, bold, italics })] });
const blank = (n = 1) => Array.from({ length: n }, () => new Paragraph({ spacing: { line: 276 }, children: [] }));
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const plainCell = (lines, width, align) => new TableCell({ borders: noBorders, width: { size: width, type: WidthType.DXA },
  children: lines.map(([t, b]) => new Paragraph({ alignment: align, spacing: { line: 276 }, children: [new TextRun({ text: t, size: 26, bold: b })] })) });

const logo = (name, width) => {
  const file = path.join(ASSETS, `${name}.png`);
  const { w, h } = pngSize(file);
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 240 }, children: [new ImageRun({ type: "png", data: fs.readFileSync(file),
    transformation: { width, height: Math.round((h / w) * width) }, altText: { title: name, description: name, name } })] });
};

const STUDENTS = [["Utpal Raj", "15015602724"], ["Anvita Sharma", "15115602724"], ["Atharv Tiwari", "15215602724"]];

const cover = [
  center("DAA Mini Project REPORT", 18, { bold: true, italics: true, after: 200 }),
  center("Library Book Management System", 20, { bold: true, italics: true }),
  center("using Stack, Queue and Searching", 16, { italics: true, after: 240 }),
  center("Submitted in partial fulfillment of the requirements", 16, { italics: true }),
  center("for the award of the degree of", 16, { italics: true, after: 200 }),
  center("Bachelor of Technology", 20, { bold: true }),
  center("in", 16),
  center("Computer Science & Engineering", 20, { bold: true, after: 280 }),
  new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W / 2, TEXT_W / 2], borders: noBorders, rows: [new TableRow({ children: [
    plainCell([["Supervisor:", true], ["Prof. (Dr.) Pinki Nayak", false]], TEXT_W / 2, AlignmentType.LEFT),
    plainCell([["Submitted by:", true], ...STUDENTS.map(([n, r]) => [`${n} (${r})`, false]), ["T3, Group 14", false]], TEXT_W / 2, AlignmentType.RIGHT),
  ] })] }),
  center("Department of Computer Science & Engineering", 20, { bold: true, before: 280, after: 60 }),
  logo("adg_logo", 130),
  center("Dr. Akhilesh Das Gupta Institute of Professional Studies", 20, { bold: true, before: 80 }),
  center("(Formerly ADGITM)", 20, { bold: true }),
  center("FC-26, SHASTRI PARK, NEW DELHI", 16, { bold: true, after: 100 }),
  center("Affiliated to", 16, { after: 60 }),
  logo("ggsipu_logo", 66),
  center("GURU GOBIND SINGH INDRAPRASTHA UNIVERSITY", 20, { bold: true, before: 80 }),
  center("Sector - 16C Dwarka, Delhi - 110075, India", 16, { after: 120 }),
  center("2024-28", 16, { bold: true }),
];

const frontTitle = (t) => new Paragraph({ style: "FrontTitle", pageBreakBefore: true, children: [new TextRun(t)] });

const declaration = [
  new Paragraph({ style: "FrontTitle", children: [new TextRun("DECLARATION")] }),
  P("This is to certify that the material embodied in this mini project titled “Library Book Management System using Stack, Queue and Searching” being submitted in the partial fulfillment of the requirements for the award of the degree of Bachelor of Technology in CSE is based on our original work. It is further certified that this work has not been submitted in full or in part to this university or any other university for the award of any other degree or diploma. Our indebtedness to other works has been duly acknowledged at the relevant places."),
  ...blank(2),
  new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W / 3, TEXT_W / 3, TEXT_W - 2 * Math.floor(TEXT_W / 3)].map(Math.floor), borders: noBorders,
    rows: [new TableRow({ children: STUDENTS.map(([n, r]) => plainCell([["", false], ["", false], ["(Signature)", false], [n, true], [`Enrollment No. ${r}`, false]], Math.floor(TEXT_W / 3), AlignmentType.CENTER)) })] }),
];

const ack = [
  frontTitle("ACKNOWLEDGEMENT"),
  P("We are grateful to our supervisor, Prof. (Dr.) Pinki Nayak, for assigning this project and for her guidance on the analysis of algorithms that shaped it. We thank the Department of Computer Science & Engineering, Dr. Akhilesh Das Gupta Institute of Professional Studies, for the facilities provided, and our classmates for their discussions and feedback."),
  ...blank(2),
  ...STUDENTS.map(([n, r]) => new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [new TextRun({ text: `${n} (${r})`, bold: true })] })),
];

const abstract = [
  frontTitle("ABSTRACT"),
  P("This report presents a Library Book Management System built in Python on Google Colab as a mini project for Design and Analysis of Algorithms (CIC-311). Issue requests are held in a first-in-first-out queue and served in arrival order; when no copy of a book is free the member joins a waitlist queue for that book. Returned books are pushed onto a stack and reshelved from the top, and each reshelved book goes straight to the first waiting member. The catalogue is kept sorted with merge sort so that exact titles and prefixes can be found by binary search, while partial matches on titles and authors use linear search. Both the stack and the queue are implemented from scratch on a linked list with O(1) operations. The algorithms are in a single Python module that runs both in a Google Colab notebook and behind a website served on localhost, where the queues, waitlists, return stack and binary search steps can be watched as they change."),
  P(`Every request, issue, due date and return is time-stamped, and fines and overdue lists are derived from these timestamps. The full library state, including the order of the queues and the stack, is saved to and restored from CSV files using pandas. A 90-day simulation with ${F.n_books} books and ${F.n_members} members produced ${F.n_tx} issues, from which charts of the most popular books, borrowing by genre, loan durations and weekly activity were drawn. Timing the algorithms on catalogues of up to ${fmt(bN[0])} books confirmed the theoretical complexities: binary search stayed near ${bN[3].toFixed(1)} µs while linear search grew to about ${fmt(bN[2].toFixed(0))} µs, and merge sort followed n log n.`),
  P("**Keywords:** stack, queue, linear search, binary search, merge sort, library management, time complexity, Python."),
];

const toc = [
  frontTitle("TABLE OF CONTENTS"),
  ...headings.map((h) => new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W, leader: LeaderType.DOT }],
    indent: { left: h.level === 1 ? 0 : 360 },
    spacing: { before: h.level === 1 ? 140 : 0, after: 20, line: 300 },
    children: [new TextRun({ text: h.text, bold: h.level === 1 }), new TextRun({ text: "\t", bold: h.level === 1 }),
      new PageReference(h.bm, { hyperlink: true })],
  })),
];

function listTable(title, label, items) {
  const w = [1500, TEXT_W - 2700, 1200];
  const rows = [new TableRow({ tableHeader: true, children: [`${label} No.`, `${label} Title`, "Page No."].map((h, i) => cell(h, w[i], { header: true, align: AlignmentType.CENTER })) })];
  items.forEach((it) => rows.push(new TableRow({ cantSplit: true, children: [
    cell(it.num, w[0], { align: AlignmentType.CENTER }),
    cell(it.title, w[1]),
    new TableCell({ borders, width: { size: w[2], type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0, line: 260 }, children: [new PageReference(it.bm)] })] }),
  ] })));
  return [frontTitle(title), new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: w, alignment: AlignmentType.CENTER, rows })];
}

// ================================================================== DOCUMENT
const footer = new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }], children: [
  new TextRun({ text: DEPT, size: 20 }),
  new TextRun({ size: 20, children: ["\t", PageNumber.CURRENT] }),
] })] });
const emptyFooter = new Footer({ children: [new Paragraph({ children: [] })] });
const page = (fmtType) => ({
  size: { width: 11906, height: 16838 },
  margin: { top: 1440, right: 1440, bottom: 1440, left: 2160, footer: 600 },
  ...(fmtType ? { pageNumbers: { start: 1, formatType: fmtType } } : {}),
});

const doc = new Document({
  creator: "T3 Group 14",
  title: "Library Book Management System - DAA Mini Project Report",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: 360 } } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 32, bold: true, color: "000000" }, paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 0, after: 360 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 28, bold: true, color: "000000" }, paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 24, italics: true, bold: false, color: "000000" }, paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 2 } },
      { id: "Caption", name: "Caption", basedOn: "Normal", next: "Normal",
        run: { font: FONT, size: 20, bold: false, italics: false, color: "000000" }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240, line: 240 } } },
      { id: "FrontTitle", name: "Front Title", basedOn: "Normal", next: "Normal",
        run: { font: FONT, size: 32, bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 480 } } },
    ],
  },
  numbering: { config: [
    { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 283 } } } }] },
    { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 340 } } } }] },
  ] },
  sections: [
    { properties: { page: page() }, footers: { default: emptyFooter }, children: cover },
    { properties: { page: page(NumberFormat.LOWER_ROMAN) }, footers: { default: footer },
      children: [...declaration, ...ack, ...abstract, ...toc, ...listTable("LIST OF FIGURES", "Figure", figures), ...listTable("LIST OF TABLES", "Table", tables)] },
    { properties: { page: page(NumberFormat.DECIMAL) }, footers: { default: footer }, children: body },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT}: ${figures.length} figures, ${tables.length} tables`);
});
