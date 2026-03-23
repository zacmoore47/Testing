"""
Minimalist Habit Tracker & To-Do List — April 2026
Black / white / grey colour scheme.
Type X (or anything) in a cell to mark it done — turns green.
Habit tracker and To-Do list are separate sections.
"""

import calendar
import datetime
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule
from openpyxl.utils import get_column_letter

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

# ── Colours ───────────────────────────────────────────────────────────────────
C_BLACK      = "1A1A1A"
C_DARK_GREY  = "3D3D3D"
C_MID_GREY   = "6B6B6B"
C_LIGHT_GREY = "F0F0F0"
C_WHITE      = "FFFFFF"
C_WEEKEND    = "E2E2E2"
C_PROG       = "EBEBEB"
C_GREEN      = "5FAD41"   # done fill
C_GREEN_FG   = "FFFFFF"

# ── Helpers ───────────────────────────────────────────────────────────────────
def solid(hex_color):
    return PatternFill("solid", fgColor=hex_color)

def border(color="CCCCCC"):
    s = Side(style="thin", color=color)
    return Border(left=s, right=s, top=s, bottom=s)

def align(h="center", v="center", wrap=False, indent=0):
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap, indent=indent)

def font(color=C_BLACK, size=10, bold=False, italic=False):
    return Font(color=color, size=size, bold=bold, italic=italic)

# ── Layout constants ──────────────────────────────────────────────────────────
NAME_COL      = 2                                    # B  — habit / task name
FIRST_DAY_COL = 3                                    # C  — day 1
LAST_DAY_COL  = FIRST_DAY_COL + DAYS_IN_MONTH - 1   # AF — day 30
PROG_COL      = LAST_DAY_COL + 1                     # AG — progress %
TOTAL_COLS    = PROG_COL

HABIT_HDR_ROW  = 3
FIRST_HAB_ROW  = 4
LAST_HAB_ROW   = FIRST_HAB_ROW + len(HABITS) - 1

GAP_ROW        = LAST_HAB_ROW + 1                   # blank separator
TODO_SEP_ROW   = GAP_ROW + 1                        # "TO-DO LIST" banner
TODO_HDR_ROW   = TODO_SEP_ROW + 1
FIRST_TODO_ROW = TODO_HDR_ROW + 1
LAST_TODO_ROW  = FIRST_TODO_ROW + len(TODOS) - 1

# To-do columns (reuse same B column; Done? = C; Notes merged D→PROG_COL)
TODO_DONE_COL  = FIRST_DAY_COL      # C
TODO_NOTE_COL  = FIRST_DAY_COL + 1  # D (merged to PROG_COL)

# ── Workbook ──────────────────────────────────────────────────────────────────
wb = Workbook()
ws = wb.active
ws.title = f"{MONTH_NAME} {YEAR}"

# ── Row 1: Title ──────────────────────────────────────────────────────────────
ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=TOTAL_COLS)
t = ws.cell(row=1, column=1,
            value=f"{MONTH_NAME.upper()} {YEAR}  ·  HABIT TRACKER")
t.font      = font(C_WHITE, 14, bold=True)
t.fill      = solid(C_BLACK)
t.alignment = align()
ws.row_dimensions[1].height = 34

# ── Row 2: Instruction ────────────────────────────────────────────────────────
ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=TOTAL_COLS)
i = ws.cell(row=2, column=1,
            value="Type  X  in any day cell to mark it complete  —  the cell turns green")
i.font      = font(C_MID_GREY, 9, italic=True)
i.fill      = solid(C_LIGHT_GREY)
i.alignment = align()
ws.row_dimensions[2].height = 18

# ── Row 3: Habit section column headers ───────────────────────────────────────
ws.cell(row=HABIT_HDR_ROW, column=1).fill = solid(C_DARK_GREY)   # spacer

h = ws.cell(row=HABIT_HDR_ROW, column=NAME_COL, value="Habit")
h.font = font(C_WHITE, 10, bold=True)
h.fill = solid(C_DARK_GREY)
h.alignment = align(h="left", indent=1)

for d in range(1, DAYS_IN_MONTH + 1):
    col     = FIRST_DAY_COL + d - 1
    weekday = datetime.date(YEAR, MONTH, d).strftime("%a")
    c = ws.cell(row=HABIT_HDR_ROW, column=col, value=f"{d}\n{weekday}")
    c.font      = font(C_WHITE, 8, bold=True)
    c.fill      = solid(C_DARK_GREY)
    c.alignment = align(wrap=True)

p = ws.cell(row=HABIT_HDR_ROW, column=PROG_COL, value="%")
p.font      = font(C_WHITE, 10, bold=True)
p.fill      = solid(C_DARK_GREY)
p.alignment = align()
ws.row_dimensions[HABIT_HDR_ROW].height = 30

# ── Habit rows ────────────────────────────────────────────────────────────────
for idx, habit in enumerate(HABITS):
    row    = FIRST_HAB_ROW + idx
    row_bg = C_LIGHT_GREY if idx % 2 else C_WHITE
    ws.row_dimensions[row].height = 20

    hc = ws.cell(row=row, column=NAME_COL, value=habit)
    hc.font      = font(C_BLACK, 10)
    hc.fill      = solid(row_bg)
    hc.alignment = align(h="left", indent=1)
    hc.border    = border()

    for d in range(1, DAYS_IN_MONTH + 1):
        col        = FIRST_DAY_COL + d - 1
        is_weekend = datetime.date(YEAR, MONTH, d).weekday() >= 5
        dc = ws.cell(row=row, column=col)   # intentionally left blank (None)
        dc.fill      = solid(C_WEEKEND if is_weekend else row_bg)
        dc.alignment = align()
        dc.border    = border()

    fl = get_column_letter(FIRST_DAY_COL)
    ll = get_column_letter(LAST_DAY_COL)
    pc = ws.cell(
        row=row, column=PROG_COL,
        value=f'=COUNTIF({fl}{row}:{ll}{row},"<>")/{DAYS_IN_MONTH}',
    )
    pc.number_format = "0%"
    pc.font      = font(C_DARK_GREY, 9, bold=True)
    pc.fill      = solid(C_PROG)
    pc.alignment = align()
    pc.border    = border()

# ── Conditional formatting: habit day grid ────────────────────────────────────
hab_cf = (
    f"{get_column_letter(FIRST_DAY_COL)}{FIRST_HAB_ROW}:"
    f"{get_column_letter(LAST_DAY_COL)}{LAST_HAB_ROW}"
)
ws.conditional_formatting.add(
    hab_cf,
    CellIsRule(
        operator="notEqual",
        formula=['""'],
        fill=solid(C_GREEN),
        font=Font(bold=True, color=C_GREEN_FG, size=10),
    ),
)

# ── Gap row ───────────────────────────────────────────────────────────────────
ws.row_dimensions[GAP_ROW].height = 10

# ── To-Do banner ──────────────────────────────────────────────────────────────
ws.merge_cells(start_row=TODO_SEP_ROW, start_column=1,
               end_row=TODO_SEP_ROW, end_column=TOTAL_COLS)
sb = ws.cell(row=TODO_SEP_ROW, column=1, value="TO-DO LIST")
sb.font      = font(C_WHITE, 12, bold=True)
sb.fill      = solid(C_DARK_GREY)
sb.alignment = align(h="left", indent=2)
ws.row_dimensions[TODO_SEP_ROW].height = 28

# ── To-Do section instruction ─────────────────────────────────────────────────
ws.merge_cells(start_row=TODO_HDR_ROW, start_column=1,
               end_row=TODO_HDR_ROW, end_column=TOTAL_COLS)
ti = ws.cell(row=TODO_HDR_ROW, column=1,
             value="     Task                                                    "
                   "Done?    Notes")
ti.font      = font(C_WHITE, 10, bold=True)
ti.fill      = solid(C_MID_GREY)
ti.alignment = align(h="left")
ws.row_dimensions[TODO_HDR_ROW].height = 22

# ── To-Do rows ────────────────────────────────────────────────────────────────
for idx, task in enumerate(TODOS):
    row    = FIRST_TODO_ROW + idx
    row_bg = C_LIGHT_GREY if idx % 2 else C_WHITE
    ws.row_dimensions[row].height = 22

    tc = ws.cell(row=row, column=NAME_COL, value=task)
    tc.font      = font(C_BLACK, 10)
    tc.fill      = solid(row_bg)
    tc.alignment = align(h="left", indent=1)
    tc.border    = border()

    dc = ws.cell(row=row, column=TODO_DONE_COL)   # blank — type X here
    dc.fill      = solid(row_bg)
    dc.alignment = align()
    dc.border    = border()

    # Merge remaining columns into one Notes cell
    ws.merge_cells(start_row=row, start_column=TODO_NOTE_COL,
                   end_row=row, end_column=TOTAL_COLS)
    nc = ws.cell(row=row, column=TODO_NOTE_COL)
    nc.fill      = solid(row_bg)
    nc.alignment = align(h="left", indent=1)
    nc.border    = border()

# ── Conditional formatting: to-do Done? column ───────────────────────────────
todo_cf = (
    f"{get_column_letter(TODO_DONE_COL)}{FIRST_TODO_ROW}:"
    f"{get_column_letter(TODO_DONE_COL)}{LAST_TODO_ROW}"
)
ws.conditional_formatting.add(
    todo_cf,
    CellIsRule(
        operator="notEqual",
        formula=['""'],
        fill=solid(C_GREEN),
        font=Font(bold=True, color=C_GREEN_FG, size=10),
    ),
)

# ── Column widths ─────────────────────────────────────────────────────────────
ws.column_dimensions[get_column_letter(1)].width          = 1.5
ws.column_dimensions[get_column_letter(NAME_COL)].width   = 26
for d in range(DAYS_IN_MONTH):
    ws.column_dimensions[get_column_letter(FIRST_DAY_COL + d)].width = 4.2
ws.column_dimensions[get_column_letter(PROG_COL)].width   = 7

# Freeze panes so habit names stay visible when scrolling right
ws.freeze_panes = ws.cell(row=FIRST_HAB_ROW, column=FIRST_DAY_COL)

# ── Save ──────────────────────────────────────────────────────────────────────
filename = f"Habit_Tracker_{MONTH_NAME}_{YEAR}.xlsx"
wb.save(filename)
print(f"Saved: {filename}")
