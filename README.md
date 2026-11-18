# Library Book Management System

DAA Mini Project (CIC-311), Project 2, T3 Group 14:
Utpal Raj (15015602724), Anvita Sharma (15115602724), Atharv Tiwari (15215602724).
Supervisor: Prof. (Dr.) Pinki Nayak.

## Contents

| Path | What it is |
|---|---|
| `code/library_core.py` | The backend: stack, queue, merge sort, linear and binary search, and the library's issue, return and reshelve rules |
| `code/server.py` + `code/web/` | The website: a Flask server on localhost and an HTML/CSS/JS frontend that calls it |
| `code/Library_Book_Management_System.ipynb` | The Colab notebook: the same code cell by cell, with tests, a 90-day simulation, reports and timing. It is already run, with outputs |
| `code/library_data/` | Saved library state as CSV files |
| `code/figures/` | Charts the notebook draws |
| `report/DAA_Mini_Project_Report_T3_Group14.docx` / `.pdf` | The 40-page report in the CIC-311 format |
| `report/diagrams/`, `report/screenshots/`, `report/assets/` | Diagrams, website screenshots and college logos used in the report |
| `presentation/SPEECH.md` | The 4-minute speech, split across the three of us |
| `presentation/TEAM_GUIDE.md` | Everything about the system, plus likely viva questions with answers |
| `tools/` | Scripts that generated the notebook, diagrams, report and screenshots (not part of the submission) |

## Running the website

```
pip install -r code/requirements.txt
cd code
python server.py
```

It opens http://localhost:5000. Use **Data ▾ → Reset demo scenario** to get a library with waiting requests, waitlists and a return stack. Stop it with Ctrl+C.

## Deploying the website (Render, free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Atharv-tw/LibraryOS)

`render.yaml` sets everything up: Python, `pip install -r code/requirements.txt`, and `gunicorn server:app` with one worker, because the library lives in the server's memory. Things to know about the free plan:
- **It sleeps when idle.** After about 15 minutes without visits, the first visit takes up to a minute to wake it.
- **Changes don't last.** Every restart goes back to the demo library.
- **One shared library.** Everyone who opens the link sees and changes the same library.

## Running the notebook in Google Colab

1. Open https://colab.research.google.com and choose **File > Upload notebook**.
2. Upload `code/Library_Book_Management_System.ipynb`.
3. Choose **Runtime > Run all**. Nothing needs installing.

Timing numbers depend on the machine, so Colab will differ slightly from the report. The trends stay the same.

## Opening the report

Open the .docx in Microsoft Word and click **Yes** when it asks to update fields. The PDF copy already has every page number filled in.
