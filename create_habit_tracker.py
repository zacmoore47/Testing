"""
Minimalist Habit Tracker & To-Do List — April 2026
Black / white / grey colour scheme.
Click a cell to get a dropdown: select ☑ to mark done (turns green), ☐ to unmark.
Habit tracker and To-Do list are separate sections.
"""

import calendar
import datetime
import xlsxwriter
from xlsxwriter.utility import xl_rowcol_to_cell

# ── Config ────────────────────────────────────────────────────────────────────
YEAR          = 2026
MONTH         = 4
MONTH_NAME    = calendar.month_name[MONTH]
DAYS_IN_MONTH = calendar.monthrange(YEAR, MONTH)[1]

HABITS = [
    "Morning Routine",
    "Exercise / Workout",
    "Drink 8 Glasses of Water",
    "Read for 30 Minutes",
    "Meditate",
    "Healthy Eating",
    "Journal / Gratitude",
    "Work / Study Goals",
    "No Social Media Before 9am",
    "Sleep by 11pm",
]

TODOS = [
    "To-Do 1",
    "To-Do 2",
    "To-Do 3",
    "To-Do 4",
    "To-Do 5",
    "To-Do 6",
    "To-Do 7",
    "To-Do 8",
]

CHECK   = "☑"
UNCHECK = "☐"

# ── Colours ───────────────────────────────────────────────────────────────────
C_BLACK      = "#1A1A1A"
C_DARK_GREY  = "#3D3D3D"
C_MID_GREY   = "#6B6B6B"
C_LIGHT_GREY = "#F0F0F0"
C_WHITE      = "#FFFFFF"
C_WEEKEND    = "#E2E2E2"
C_PROG       = "#EBEBEB"
C_GREEN      = "#5FAD41"

# ── Layout (0-indexed rows/cols for xlsxwriter) ───────────────────────────────
COL_SPACER    = 0
COL_NAME      = 1
COL_DAY_FIRST = 2
COL_DAY_LAST  = COL_DAY_FIRST + DAYS_IN_MONTH - 1
COL_PROG      = COL_DAY_LAST + 1

ROW_TITLE     = 0
ROW_HAB_HDR   = 1
ROW_HAB_FIRST = 2
ROW_HAB_LAST  = ROW_HAB_FIRST + len(HABITS) - 1
ROW_GAP       = ROW_HAB_LAST + 1
ROW_TODO_SEP  = ROW_GAP + 1
ROW_TODO_HDR  = ROW_TODO_SEP + 1
ROW_TODO_FIRST = ROW_TODO_HDR + 1
ROW_TODO_LAST  = ROW_TODO_FIRST + len(TODOS) - 1

COL_TODO_DONE = COL_DAY_FIRST
COL_TODO_NOTE = COL_DAY_FIRST + 1

# ── Workbook ──────────────────────────────────────────────────────────────────
wb = xlsxwriter.Workbook(f"Habit_Tracker_{MONTH_NAME}_{YEAR}.xlsx")
ws = wb.add_worksheet(f"{MONTH_NAME} {YEAR}")
ws.set_zoom(85)

# ── Formats ───────────────────────────────────────────────────────────────────
def fmt(**kw):
    return wb.add_format(kw)

thin = {"border": 1, "border_color": "#CCCCCC"}

f_title    = fmt(bold=True, font_color=C_WHITE, bg_color=C_BLACK,
                 font_size=14, align="center", valign="vcenter")
f_hdr      = fmt(bold=True, font_color=C_WHITE, bg_color=C_DARK_GREY,
                 align="center", valign="vcenter", text_wrap=True, font_size=8)
f_hdr_name = fmt(bold=True, font_color=C_WHITE, bg_color=C_DARK_GREY,
                 align="left", valign="vcenter", indent=1, font_size=10)
f_hdr_pct  = fmt(bold=True, font_color=C_WHITE, bg_color=C_DARK_GREY,
                 align="center", valign="vcenter", font_size=10)

f_name_w   = fmt(**thin, bg_color=C_WHITE,      align="left",   valign="vcenter", indent=1, font_size=10)
f_name_g   = fmt(**thin, bg_color=C_LIGHT_GREY, align="left",   valign="vcenter", indent=1, font_size=10)
f_day_w    = fmt(**thin, bg_color=C_WHITE,      align="center", valign="vcenter", font_size=11)
f_day_g    = fmt(**thin, bg_color=C_LIGHT_GREY, align="center", valign="vcenter", font_size=11)
f_day_wknd = fmt(**thin, bg_color=C_WEEKEND,    align="center", valign="vcenter", font_size=11)
f_prog     = fmt(**thin, bg_color=C_PROG, bold=True, font_color=C_DARK_GREY,
                 font_size=9, align="center", valign="vcenter", num_format="0%")

f_sep          = fmt(bold=True, font_color=C_WHITE, bg_color=C_DARK_GREY,
                     font_size=12, align="left", valign="vcenter", indent=2)
f_todo_hdr     = fmt(bold=True, font_color=C_WHITE, bg_color=C_MID_GREY,
                     align="left", valign="vcenter", indent=1, font_size=10)
f_todo_done_hdr= fmt(bold=True, font_color=C_WHITE, bg_color=C_MID_GREY,
                     align="center", valign="vcenter", font_size=10)
f_note_w       = fmt(**thin, bg_color=C_WHITE,      align="left", valign="vcenter", indent=1)
f_note_g       = fmt(**thin, bg_color=C_LIGHT_GREY, align="left", valign="vcenter", indent=1)

f_green = fmt(**thin, bg_color=C_GREEN, bold=True,
              font_color=C_WHITE, font_size=11, align="center", valign="vcenter")

# ── Column / row sizes ────────────────────────────────────────────────────────
ws.set_column(COL_SPACER, COL_SPACER, 1.5)
ws.set_column(COL_NAME,   COL_NAME,   26)
ws.set_column(COL_DAY_FIRST, COL_DAY_LAST, 4.2)
ws.set_column(COL_PROG,   COL_PROG,   7)

ws.set_row(ROW_TITLE,    34)
ws.set_row(ROW_HAB_HDR,  30)
for r in range(ROW_HAB_FIRST, ROW_HAB_LAST + 1):
    ws.set_row(r, 22)
ws.set_row(ROW_GAP,       10)
ws.set_row(ROW_TODO_SEP,  28)
ws.set_row(ROW_TODO_HDR,  22)
for r in range(ROW_TODO_FIRST, ROW_TODO_LAST + 1):
    ws.set_row(r, 24)

ws.freeze_panes(ROW_HAB_FIRST, COL_DAY_FIRST)

# ── Title ─────────────────────────────────────────────────────────────────────
ws.merge_range(ROW_TITLE, 0, ROW_TITLE, COL_PROG,
               f"{MONTH_NAME.upper()} {YEAR}  ·  HABIT TRACKER", f_title)

# ── Habit section header ──────────────────────────────────────────────────────
ws.write_blank(ROW_HAB_HDR, COL_SPACER, f_hdr)
ws.write(ROW_HAB_HDR, COL_NAME, "Habit", f_hdr_name)
for d in range(1, DAYS_IN_MONTH + 1):
    col     = COL_DAY_FIRST + d - 1
    weekday = datetime.date(YEAR, MONTH, d).strftime("%a")
    ws.write(ROW_HAB_HDR, col, f"{d}\n{weekday}", f_hdr)
ws.write(ROW_HAB_HDR, COL_PROG, "%", f_hdr_pct)

# ── Habit rows ────────────────────────────────────────────────────────────────
for idx, habit in enumerate(HABITS):
    row  = ROW_HAB_FIRST + idx
    alt  = idx % 2 == 1
    nfmt = f_name_g if alt else f_name_w
    dfmt = f_day_g  if alt else f_day_w

    ws.write(row, COL_NAME, habit, nfmt)

    for d in range(1, DAYS_IN_MONTH + 1):
        col        = COL_DAY_FIRST + d - 1
        is_weekend = datetime.date(YEAR, MONTH, d).weekday() >= 5
        ws.write(row, col, UNCHECK, f_day_wknd if is_weekend else dfmt)

    fl = xl_rowcol_to_cell(row, COL_DAY_FIRST)
    ll = xl_rowcol_to_cell(row, COL_DAY_LAST)
    ws.write_formula(row, COL_PROG,
                     f'=COUNTIF({fl}:{ll},"☑")/{DAYS_IN_MONTH}', f_prog)

# ── Data validation: habits grid ──────────────────────────────────────────────
ws.data_validation(ROW_HAB_FIRST, COL_DAY_FIRST,
                   ROW_HAB_LAST,  COL_DAY_LAST,
                   {"validate": "list", "source": [CHECK, UNCHECK]})


# ── Gap row ───────────────────────────────────────────────────────────────────
ws.merge_range(ROW_GAP, 0, ROW_GAP, COL_PROG, "",
               fmt(bg_color=C_WHITE))

# ── To-Do banner ──────────────────────────────────────────────────────────────
ws.merge_range(ROW_TODO_SEP, 0, ROW_TODO_SEP, COL_PROG,
               "TO-DO LIST", f_sep)

# ── To-Do header ─────────────────────────────────────────────────────────────
ws.merge_range(ROW_TODO_HDR, 0, ROW_TODO_HDR, COL_PROG, "",
               fmt(bg_color=C_MID_GREY))
ws.write(ROW_TODO_HDR, COL_NAME,       "Task",  f_todo_hdr)
ws.write(ROW_TODO_HDR, COL_TODO_DONE,  "Done?", f_todo_done_hdr)
ws.write(ROW_TODO_HDR, COL_TODO_NOTE,  "Notes", f_todo_hdr)

# ── To-Do rows ────────────────────────────────────────────────────────────────
for idx, task in enumerate(TODOS):
    row  = ROW_TODO_FIRST + idx
    alt  = idx % 2 == 1
    dfmt = f_day_g  if alt else f_day_w
    note = f_note_g if alt else f_note_w

    ws.write(row, COL_NAME,      task,    f_name_g if alt else f_name_w)
    ws.write(row, COL_TODO_DONE, UNCHECK, dfmt)
    ws.merge_range(row, COL_TODO_NOTE, row, COL_PROG, "", note)

# ── Data validation: to-do Done? column ──────────────────────────────────────
ws.data_validation(ROW_TODO_FIRST, COL_TODO_DONE,
                   ROW_TODO_LAST,  COL_TODO_DONE,
                   {"validate": "list", "source": [CHECK, UNCHECK]})


# ── Save ──────────────────────────────────────────────────────────────────────
wb.close()
print(f"Saved: Habit_Tracker_{MONTH_NAME}_{YEAR}.xlsx")
