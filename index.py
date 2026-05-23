"""
Wong Family Telegram Bot — index.py
Flask + python-telegram-bot (v13.x) on Railway
"""

import os
import logging
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from requests.adapters import HTTPAdapter, Retry
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Update,
)
from telegram.ext import (
    CallbackContext,
    CallbackQueryHandler,
    CommandHandler,
    Filters,
    MessageHandler,
    Updater,
)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
log = logging.getLogger(__name__)

# ── Environment ──────────────────────────────────────────────────────────────
TOKEN             = os.environ["TELEGRAM_BOT_TOKEN"]
GAS_URL           = os.environ["GAS_URL"]
RAILWAY_URL       = os.environ.get("RAILWAY_URL", "https://familylog-production.up.railway.app")
DASHBOARD_PASSWORD = os.environ.get("DASHBOARD_PASSWORD", "familyisLOVE")
SECRET_KEY        = os.environ.get("SECRET_KEY", "wongfamily2024secret")

# ── Constants ────────────────────────────────────────────────────────────────
FAMILY_MEMBERS  = ["Mikaela", "Meaghan", "Eleanor", "Marcus", "Everyone"]
BIRTHDAY_TYPES  = ["Birthday", "Wedding Anniversary"]
MEMORY_TYPES    = ["🏆 Milestone", "💬 Quote", "💛 Moment"]
MEAL_TYPES      = ["Breakfast", "Lunch", "Dinner"]
MEAL_EMOJI      = {"Breakfast": "🌅", "Lunch": "☀️", "Dinner": "🌙"}
NOTIFY_CHAT_IDS = [486455062]

EXPENSE_GROUPS = {
    "👶 Children":     ["Children - Baby", "Children - Childcare", "Children - Education (Child)", "Children - Misc"],
    "👕 Clothing":     ["Clothing - Adult", "Clothing - Children"],
    "🍽 Eating Out":   ["Eating Out - Beverages", "Eating Out - Breakfast", "Eating Out - Dinner", "Eating Out - Lunch", "Eating Out - Snacks"],
    "📚 Education":    ["Education - Books", "Education - Courses", "Education - Tuition"],
    "🎭 Entertainment":["Entertainment - Events", "Entertainment - Hobbies", "Entertainment - Subscriptions"],
    "🎁 Gifts/Giving": ["Gifts/Giving - Charity", "Gifts/Giving - Gifts"],
    "🏥 Health":       ["Health - Dental", "Health - Medical", "Health - Pharmacy", "Health - Supplements"],
    "🏠 Household":    ["Household - Furnishings", "Household - Maintenance", "Household - Rent", "Household - Utilities"],
    "🐾 Pets":         ["Pets - Food", "Pets - Vet"],
    "💆 Self Care":    ["Self Care - Beauty", "Self Care - Fitness", "Self Care - Personal"],
    "✈️ Travel":       ["Travel - Accommodation", "Travel - Activities", "Travel - Flights", "Travel - Transport"],
    "🚗 Transport":    ["Transport - Car", "Transport - Public", "Transport - Taxi"],
    "📈 Finance":      ["Finance - Insurance", "Finance - Investment", "Finance - Savings"],
    "🌍 Others":       ["Others - Misc"],
}
GROUP_NAMES = list(EXPENSE_GROUPS.keys())

FERTILITY_TYPES = ["Period Start", "Period End", "Ovulation", "Symptom", "Note"]

# ── Persistent HTTP session (connection pooling + retries) ───────────────────
_http = requests.Session()
_http.mount("https://", HTTPAdapter(
    pool_connections=10, pool_maxsize=20,
    max_retries=Retry(total=2, backoff_factor=0.3, status_forcelist=[502, 503, 504])
))
_http.mount("http://", HTTPAdapter(pool_connections=4, pool_maxsize=8))


def gas(payload: dict, timeout: int = 12) -> dict:
    """POST to Google Apps Script and return parsed JSON."""
    try:
        r = _http.post(GAS_URL, json=payload, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        log.error("GAS error (%s): %s", payload.get("note"), exc)
        return {"status": "error", "message": str(exc)}


# ── Helpers ──────────────────────────────────────────────────────────────────
def fmt_money(val) -> str:
    try:
        return f"${float(val):,.2f}"
    except Exception:
        return str(val)


def progress_bar(spent: float, limit: float, width: int = 10) -> str:
    pct = min((spent / limit) if limit > 0 else 0, 1.0)
    filled = round(pct * width)
    return "█" * filled + "░" * (width - filled)


def sender_name(update: Update) -> str:
    u = update.effective_user
    raw = (u.first_name or u.username or "Bot").lower()
    return {"eleanor": "Eleanor", "marcus": "Marcus",
            "mikaela": "Mikaela", "meaghan": "Meaghan"}.get(raw, u.first_name or "Bot")


def ack(query, text="", alert=False):
    try:
        query.answer(text, show_alert=alert)
    except Exception:
        pass


# ── Keyboards ────────────────────────────────────────────────────────────────
HOME_KB = InlineKeyboardMarkup([
    [InlineKeyboardButton("📊 Budgets",        callback_data="h:budgets"),
     InlineKeyboardButton("💰 Expenses",       callback_data="h:expenses")],
    [InlineKeyboardButton("🛒 Grocery List",   callback_data="h:grocery"),
     InlineKeyboardButton("🛍 Shopping Mode",  callback_data="h:shopping")],
    [InlineKeyboardButton("🍎 Check Fridge",   callback_data="h:fridge"),
     InlineKeyboardButton("🍽 Log Eating",     callback_data="h:eat")],
    [InlineKeyboardButton("🗓 Meal Planner",   callback_data="h:meal"),
     InlineKeyboardButton("📅 Calendar",       callback_data="h:calendar")],
    [InlineKeyboardButton("✅ To-Do List",     callback_data="h:todo"),
     InlineKeyboardButton("🌸 Fertility",      callback_data="h:fertility")],
    [InlineKeyboardButton("💛 Memories",       callback_data="h:memories"),
     InlineKeyboardButton("🎂 Birthdays",      callback_data="h:birthdays")],
    [InlineKeyboardButton("📊 View Dashboard", callback_data="h:dashboard")],
])

CANCEL_KB = InlineKeyboardMarkup([[InlineKeyboardButton("❌ Cancel", callback_data="cancel")]])


def member_kb(prefix: str) -> InlineKeyboardMarkup:
    rows = []
    for i in range(0, len(FAMILY_MEMBERS), 2):
        row = [InlineKeyboardButton(FAMILY_MEMBERS[i], callback_data=f"{prefix}:{i}")]
        if i + 1 < len(FAMILY_MEMBERS):
            row.append(InlineKeyboardButton(FAMILY_MEMBERS[i + 1], callback_data=f"{prefix}:{i + 1}"))
        rows.append(row)
    return InlineKeyboardMarkup(rows)


def edit(query, text, kb=None, md=True):
    try:
        query.edit_message_text(text, parse_mode="Markdown" if md else None, reply_markup=kb)
    except Exception:
        pass


def reply(update, text, kb=None, md=True):
    update.message.reply_text(text, parse_mode="Markdown" if md else None, reply_markup=kb)


# ─────────────────────────────────────────────────────────────────────────────
# /start  /help  /home
# ─────────────────────────────────────────────────────────────────────────────
def cmd_start(update: Update, context: CallbackContext):
    name = sender_name(update)
    reply(update, f"👋 Hello *{name}*! Welcome to the Wong Family Bot 🏠\n\nWhat would you like to do?", HOME_KB)


def cmd_help(update: Update, context: CallbackContext):
    reply(update,
        "📋 *Wong Family Bot — Features*\n\n"
        "🛒 *Grocery* — View, add items, shopping mode\n"
        "🍎 *Fridge* — Track fruit stock, log eating\n"
        "📅 *Calendar* — View 14 days, add/delete events\n"
        "✅ *To-Do* — View, add, complete, delete tasks\n"
        "💰 *Expenses* — View monthly summary (add via Google Form)\n"
        "📊 *Budgets* — Group budgets with progress bars\n"
        "🌸 *Fertility* — Log period, ovulation, symptoms\n"
        "🎂 *Birthdays* — Upcoming birthdays & anniversaries\n"
        "💛 *Memories* — Log & browse family memories\n"
        "🗓 *Meal Planner* — Plan & view upcoming meals\n"
        "📊 *Dashboard* — Web dashboard at /dashboard",
        HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# HOME ROUTER
# ─────────────────────────────────────────────────────────────────────────────
def cb_home(update: Update, context: CallbackContext):
    q = update.callback_query
    ack(q)
    action = q.data.split(":", 1)[1]
    _HOME_MAP = {
        "budgets":   _budgets_show,
        "expenses":  _expenses_show,
        "grocery":   _grocery_show,
        "shopping":  _shopping_start,
        "fridge":    _fridge_show,
        "eat":       _eat_start,
        "meal":      _meal_menu,
        "calendar":  _calendar_show,
        "todo":      _todo_show,
        "fertility": _fertility_menu,
        "memories":  _memories_menu,
        "birthdays": _birthdays_show,
        "dashboard": _dashboard_link,
        "home":      lambda q, ctx: edit(q, "What would you like to do?", HOME_KB),
    }
    fn = _HOME_MAP.get(action)
    if fn:
        fn(q, context)
    else:
        edit(q, "🤷 Unknown action.", HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# EXPENSES
# ─────────────────────────────────────────────────────────────────────────────
def _expenses_show(q, context):
    edit(q, "⏳ Fetching expenses…")
    data = gas({"note": "get_expenses"})
    if data.get("status") == "error":
        edit(q, "❌ Could not fetch expenses.", HOME_KB); return

    summary    = data.get("summary", {})
    categories = data.get("by_category", [])
    recent     = data.get("recent", [])
    total      = summary.get("total", 0)
    by_account = summary.get("by_account", {})

    lines = [f"💰 *This Month's Expenses*\n", f"*Total:* {fmt_money(total)}\n"]
    if by_account:
        lines.append("*By Account:*")
        for acct, amt in by_account.items():
            lines.append(f"  {acct}: {fmt_money(amt)}")
        lines.append("")
    if categories:
        lines.append("*By Category (top 10):*")
        for cat in categories[:10]:
            lines.append(f"  {cat['category']}: {fmt_money(cat['amount'])}")
        lines.append("")
    if recent:
        lines.append("*Recent 5:*")
        for e in recent[:5]:
            lines.append(f"  {e['date']} | {e['category']} | {fmt_money(e['amount'])}")

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("🗑 Delete Expense", callback_data="exp:delete")],
        [InlineKeyboardButton("🏠 Home",            callback_data="h:home")],
    ])
    edit(q, "\n".join(lines), kb)


def cb_expense(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "delete":
        edit(q, "⏳ Fetching recent expenses…")
        data = gas({"note": "get_expenses"})
        recent = data.get("recent", [])
        if not recent:
            edit(q, "No expenses to delete.", HOME_KB); return
        context.user_data["del_expenses"] = recent
        rows = [[InlineKeyboardButton(
            f"{e['date']} | {e['category']} | {fmt_money(e['amount'])}",
            callback_data=f"exp:dc:{i}")] for i, e in enumerate(recent[:10])]
        rows.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel")])
        edit(q, "Select expense to delete:", InlineKeyboardMarkup(rows))

    elif parts[1] == "dc":                               # del_confirm
        idx = int(parts[2])
        expense = context.user_data.get("del_expenses", [])[idx]
        context.user_data["del_exp_row"] = expense.get("row")
        label = f"{expense['date']} | {expense['category']} | {fmt_money(expense['amount'])}"
        edit(q, f"Delete this expense?\n_{label}_", InlineKeyboardMarkup([
            [InlineKeyboardButton("✅ Confirm", callback_data="exp:do"),
             InlineKeyboardButton("❌ Cancel",  callback_data="cancel")],
        ]))

    elif parts[1] == "do":
        data = gas({"note": "delete_expense", "row": context.user_data.get("del_exp_row")})
        edit(q, "✅ Expense deleted." if data.get("status") == "ok" else "❌ Could not delete.", HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# BUDGETS
# ─────────────────────────────────────────────────────────────────────────────
def _budgets_show(q, context):
    edit(q, "⏳ Fetching budgets…")
    data = gas({"note": "get_budgets"})
    budgets = data.get("budgets", [])
    if not budgets:
        edit(q, "No budgets set.", HOME_KB); return

    lines = ["📊 *Budget Tracker — This Month*\n"]
    for b in sorted(budgets, key=lambda x: x.get("group", "")):
        grp   = b.get("group", "")
        limit = float(b.get("budget", 0) or 0)
        spent = float(b.get("spent",  0) or 0)
        pct   = (spent / limit * 100) if limit > 0 else 0
        flag  = " 🔴" if pct >= 100 else (" 🟡" if pct >= 80 else "")
        bar   = progress_bar(spent, limit)
        lines.append(f"{grp}{flag}")
        lines.append(f"{bar} {fmt_money(spent)} / {fmt_money(limit)} ({pct:.0f}%)\n")

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("⚙️ Set Budget", callback_data="bgt:set:0")],
        [InlineKeyboardButton("🏠 Home",        callback_data="h:home")],
    ])
    edit(q, "\n".join(lines), kb)


def cb_budget(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "set":
        page = int(parts[2]) if len(parts) > 2 else 0
        per  = 7; start = page * per; chunk = GROUP_NAMES[start:start + per]
        rows = [[InlineKeyboardButton(g, callback_data=f"bgt:grp:{start + i}")] for i, g in enumerate(chunk)]
        nav  = []
        if page > 0:           nav.append(InlineKeyboardButton("⬅️", callback_data=f"bgt:set:{page - 1}"))
        if start + per < len(GROUP_NAMES): nav.append(InlineKeyboardButton("➡️", callback_data=f"bgt:set:{page + 1}"))
        if nav: rows.append(nav)
        rows.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel")])
        edit(q, "Select a budget group to set:", InlineKeyboardMarkup(rows))

    elif parts[1] == "grp":
        idx = int(parts[2])
        context.user_data.update({"bgt_group": GROUP_NAMES[idx], "awaiting": "budget_amount"})
        edit(q, f"Setting budget for *{GROUP_NAMES[idx]}*\n\nEnter monthly budget amount (e.g. 500):", CANCEL_KB)


# ─────────────────────────────────────────────────────────────────────────────
# GROCERY
# ─────────────────────────────────────────────────────────────────────────────
def _grocery_show(q, context):
    edit(q, "⏳ Fetching grocery list…")
    data  = gas({"note": "get_grocery"})
    items = data.get("items", [])
    pending = [i for i in items if i.get("status", "").lower() != "bought"]
    bought  = [i for i in items if i.get("status", "").lower() == "bought"]

    lines = ["🛒 *Grocery List*\n"]
    if pending:
        lines.append("*To Buy:*")
        for it in pending[:20]:
            by = f" _{it['added_by']}_" if it.get("added_by") else ""
            lines.append(f"  ☐ {it['item']}{by}")
    else:
        lines.append("_All done! Nothing left to buy 🎉_")
    if bought:
        lines.append(f"\n_✅ Bought: {len(bought)} items_")

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ Add Item",    callback_data="gro:add"),
         InlineKeyboardButton("✅ Mark Bought", callback_data="gro:mark")],
        [InlineKeyboardButton("🗑 Clear Bought", callback_data="gro:clear")],
        [InlineKeyboardButton("🏠 Home",         callback_data="h:home")],
    ])
    edit(q, "\n".join(lines), kb)


def _shopping_start(q, context):
    edit(q, "⏳ Loading shopping mode…")
    data  = gas({"note": "get_grocery"})
    items = [i for i in data.get("items", []) if i.get("status", "").lower() != "bought"]
    if not items:
        edit(q, "🎉 Nothing left to buy!", HOME_KB); return
    context.user_data.update({"shop_items": items, "shop_checked": set()})
    _shopping_render(q, context)


def _shopping_render(q, context):
    items   = context.user_data.get("shop_items", [])
    checked = context.user_data.get("shop_checked", set())
    rows = [[InlineKeyboardButton(
        f"{'✅' if i in checked else '☐'} {it['item']}",
        callback_data=f"shop:t:{i}")] for i, it in enumerate(items)]
    rows.append([InlineKeyboardButton("✅ Mark Checked as Bought", callback_data="shop:done")])
    rows.append([InlineKeyboardButton("🏠 Home", callback_data="h:home")])
    try:
        q.edit_message_text("🛍 *Shopping Mode* — tap to check off:", parse_mode="Markdown",
                            reply_markup=InlineKeyboardMarkup(rows))
    except Exception:
        pass


def cb_grocery(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "add":
        context.user_data["awaiting"] = "gro_item"
        edit(q, "Enter item to add to grocery list:", CANCEL_KB)

    elif parts[1] == "mark":
        data  = gas({"note": "get_grocery"})
        items = [i for i in data.get("items", []) if i.get("status", "").lower() != "bought"]
        if not items:
            edit(q, "Nothing to mark!", HOME_KB); return
        context.user_data["mark_items"] = items
        rows = [[InlineKeyboardButton(it["item"], callback_data=f"gro:md:{i}")]
                for i, it in enumerate(items[:15])]
        rows.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel")])
        edit(q, "Select item to mark as bought:", InlineKeyboardMarkup(rows))

    elif parts[1] == "md":
        idx   = int(parts[2])
        items = context.user_data.get("mark_items", [])
        if idx < len(items):
            gas({"note": "mark_grocery_bought", "item": items[idx]["item"]})
            edit(q, f"✅ *{items[idx]['item']}* marked as bought!", HOME_KB)

    elif parts[1] == "clear":
        gas({"note": "clear_grocery_bought"})
        edit(q, "🗑 Cleared bought items.", HOME_KB)


def cb_shopping(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "t":                                  # toggle
        idx     = int(parts[2])
        checked = context.user_data.get("shop_checked", set())
        checked.discard(idx) if idx in checked else checked.add(idx)
        context.user_data["shop_checked"] = checked
        _shopping_render(q, context)

    elif parts[1] == "done":
        items   = context.user_data.get("shop_items", [])
        checked = context.user_data.get("shop_checked", set())
        if not checked:
            ack(q, "No items checked!", alert=True); return
        names = [items[i]["item"] for i in checked if i < len(items)]
        gas({"note": "mark_grocery_bought_bulk", "items": names})
        edit(q, f"✅ {len(names)} item(s) marked as bought!", HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# FRIDGE / FRUIT
# ─────────────────────────────────────────────────────────────────────────────
def _fridge_show(q, context):
    edit(q, "⏳ Checking fridge…")
    data   = gas({"note": "get_fruits"})
    fruits = data.get("fruits", [])
    if not fruits:
        edit(q, "Fridge is empty!", HOME_KB); return

    lines = ["🍎 *Fridge Stock*\n"]
    for f in fruits:
        stock = int(f.get("stock", 0))
        eaten = int(f.get("eaten", 0))
        bar   = progress_bar(min(stock, 10), 10, 6)
        lines.append(f"{f['name']}: {bar} *{stock}* left  _(eaten: {eaten})_")

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ Add Stock", callback_data="fridge:add")],
        [InlineKeyboardButton("🏠 Home",      callback_data="h:home")],
    ])
    edit(q, "\n".join(lines), kb)


def _eat_start(q, context):
    edit(q, "⏳ Loading…")
    data   = gas({"note": "get_fruits"})
    fruits = data.get("fruits", [])
    avail  = [f for f in fruits if int(f.get("stock", 0)) > 0]
    if not avail:
        edit(q, "No fruits in stock!", HOME_KB); return
    context.user_data["eat_fruits"] = avail
    rows = [[InlineKeyboardButton(f"{f['name']} ({f['stock']} left)", callback_data=f"fridge:eat:{i}")]
            for i, f in enumerate(avail)]
    rows.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel")])
    edit(q, "🍽 Which fruit did you eat?", InlineKeyboardMarkup(rows))


def cb_fridge(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "add":
        context.user_data["awaiting"] = "fridge_add"
        edit(q, "Enter fruit name and quantity (e.g. `Banana 5`):", CANCEL_KB)

    elif parts[1] == "eat":
        idx    = int(parts[2])
        fruits = context.user_data.get("eat_fruits", [])
        if idx < len(fruits):
            context.user_data["eating"] = fruits[idx]["name"]
            edit(q, f"How many *{fruits[idx]['name']}* did you eat?", InlineKeyboardMarkup([
                [[InlineKeyboardButton(str(n), callback_data=f"fridge:qty:{n}") for n in range(1, 6)]],
                [InlineKeyboardButton("❌ Cancel", callback_data="cancel")],
            ]))

    elif parts[1] == "qty":
        qty   = int(parts[2])
        fruit = context.user_data.get("eating", "")
        data  = gas({"note": "log_eat_fruit", "fruit": fruit, "qty": qty,
                     "by": sender_name(update)})
        edit(q, f"✅ Logged eating {qty}× *{fruit}*!" if data.get("status") == "ok"
             else "❌ Error logging.", HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# CALENDAR
# ─────────────────────────────────────────────────────────────────────────────
def _calendar_show(q, context):
    edit(q, "⏳ Fetching calendar…")
    data   = gas({"note": "get_calendar"})
    events = data.get("events", [])

    if not events:
        msg = "📅 *Family Calendar*\n\n_No events in the next 14 days._"
    else:
        lines = ["📅 *Family Calendar — Next 14 Days*\n"]
        last_date = ""
        for ev in events:
            if ev.get("date") != last_date:
                lines.append(f"\n*{ev['date']}*")
                last_date = ev["date"]
            t = f" — {ev['time']}" if ev.get("time") else ""
            lines.append(f"  • {ev['title']}{t}")
        msg = "\n".join(lines)

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ Add Event",    callback_data="cal:add"),
         InlineKeyboardButton("🗑 Delete Event", callback_data="cal:delete")],
        [InlineKeyboardButton("🏠 Home",          callback_data="h:home")],
    ])
    edit(q, msg, kb)


def cb_calendar(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "add":
        context.user_data["awaiting"] = "cal_title"
        edit(q, "📅 Enter event title:", CANCEL_KB)

    elif parts[1] == "delete":
        edit(q, "⏳ Loading events…")
        data   = gas({"note": "get_calendar"})
        events = data.get("events", [])
        if not events:
            edit(q, "No events to delete.", HOME_KB); return
        context.user_data["cal_events"] = events
        rows = [[InlineKeyboardButton(f"{ev['date']} — {ev['title']}", callback_data=f"cal:dc:{i}")]
                for i, ev in enumerate(events[:15])]
        rows.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel")])
        edit(q, "Select event to delete:", InlineKeyboardMarkup(rows))

    elif parts[1] == "dc":
        idx = int(parts[2])
        ev  = context.user_data.get("cal_events", [])[idx]
        context.user_data["del_event"] = ev
        edit(q, f"Delete this event?\n*{ev['date']}* — {ev['title']}", InlineKeyboardMarkup([
            [InlineKeyboardButton("✅ Confirm", callback_data="cal:do"),
             InlineKeyboardButton("❌ Cancel",  callback_data="cancel")],
        ]))

    elif parts[1] == "do":
        ev   = context.user_data.get("del_event", {})
        data = gas({"note": "delete_calendar_event",
                    "event_id": ev.get("event_id"), "row": ev.get("row")})
        edit(q, "✅ Event deleted." if data.get("status") == "ok" else "❌ Could not delete.", HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# TO-DO
# ─────────────────────────────────────────────────────────────────────────────
def _todo_show(q, context):
    edit(q, "⏳ Fetching to-do list…")
    data    = gas({"note": "get_todo"})
    pending = [t for t in data.get("tasks", []) if t.get("status", "").lower() != "done"]

    if not pending:
        msg = "✅ *To-Do List*\n\n_All done! 🎉_"
    else:
        grouped = {}
        for t in pending:
            grouped.setdefault(t.get("assignee", "Unassigned"), []).append(t)
        lines = ["✅ *To-Do List*\n"]
        for assignee in sorted(grouped):
            lines.append(f"*{assignee}:*")
            for t in grouped[assignee]:
                due = f" _(due: {t['due_date']})_" if t.get("due_date") else ""
                lines.append(f"  • {t['task']}{due}")
            lines.append("")
        msg = "\n".join(lines)

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ Add Task",  callback_data="todo:add"),
         InlineKeyboardButton("✅ Complete",  callback_data="todo:complete")],
        [InlineKeyboardButton("🗑 Delete",    callback_data="todo:delete")],
        [InlineKeyboardButton("🏠 Home",      callback_data="h:home")],
    ])
    edit(q, msg, kb)


def cb_todo(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "add":
        context.user_data["awaiting"] = "todo_task"
        edit(q, "✅ Enter task description:", CANCEL_KB)

    elif parts[1] == "assignee":
        idx = int(parts[2])
        context.user_data.update({"todo_assignee": FAMILY_MEMBERS[idx], "awaiting": "todo_due"})
        edit(q, "📅 Enter due date (e.g. 25 May) or type `skip`:", CANCEL_KB)

    elif parts[1] == "complete":
        data  = gas({"note": "get_todo"})
        tasks = [t for t in data.get("tasks", []) if t.get("status", "").lower() != "done"]
        if not tasks:
            edit(q, "No pending tasks!", HOME_KB); return
        context.user_data["comp_tasks"] = tasks
        rows = [[InlineKeyboardButton(t["task"][:45], callback_data=f"todo:cdo:{i}")]
                for i, t in enumerate(tasks[:15])]
        rows.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel")])
        edit(q, "Select task to mark complete:", InlineKeyboardMarkup(rows))

    elif parts[1] == "cdo":
        idx   = int(parts[2])
        tasks = context.user_data.get("comp_tasks", [])
        if idx < len(tasks):
            t = tasks[idx]
            gas({"note": "complete_todo", "row": t.get("row")})
            edit(q, f"✅ *{t['task']}* marked as done!", HOME_KB)

    elif parts[1] == "delete":
        data  = gas({"note": "get_todo"})
        tasks = [t for t in data.get("tasks", []) if t.get("status", "").lower() != "done"]
        if not tasks:
            edit(q, "No tasks to delete!", HOME_KB); return
        context.user_data["del_tasks"] = tasks
        rows = [[InlineKeyboardButton(t["task"][:45], callback_data=f"todo:dc:{i}")]
                for i, t in enumerate(tasks[:15])]
        rows.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel")])
        edit(q, "Select task to delete:", InlineKeyboardMarkup(rows))

    elif parts[1] == "dc":
        idx   = int(parts[2])
        tasks = context.user_data.get("del_tasks", [])
        t     = tasks[idx]
        context.user_data["del_task"] = t
        edit(q, f"Delete task?\n*{t['task']}*", InlineKeyboardMarkup([
            [InlineKeyboardButton("✅ Confirm", callback_data="todo:do"),
             InlineKeyboardButton("❌ Cancel",  callback_data="cancel")],
        ]))

    elif parts[1] == "do":
        t = context.user_data.get("del_task", {})
        gas({"note": "delete_todo", "row": t.get("row")})
        edit(q, "🗑 Task deleted.", HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# FERTILITY
# ─────────────────────────────────────────────────────────────────────────────
def _fertility_menu(q, context):
    data   = gas({"note": "get_fertility"})
    recent = data.get("recent", [])
    lines  = ["🌸 *Fertility Tracker*\n"]
    for r in recent[:5]:
        lines.append(f"  {r.get('date','')} — {r.get('type','')}  {str(r.get('notes',''))[:30]}")
    rows = [[InlineKeyboardButton(t, callback_data=f"fert:{i}")]
            for i, t in enumerate(FERTILITY_TYPES)]
    rows.append([InlineKeyboardButton("🏠 Home", callback_data="h:home")])
    edit(q, "\n".join(lines) + "\n\nWhat would you like to log?", InlineKeyboardMarkup(rows))


def cb_fertility(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    idx = int(q.data.split(":")[1])
    context.user_data.update({"fert_type": FERTILITY_TYPES[idx], "awaiting": "fert_notes"})
    edit(q, f"🌸 Logging: *{FERTILITY_TYPES[idx]}*\n\nAdd notes (or `skip`):", CANCEL_KB)


# ─────────────────────────────────────────────────────────────────────────────
# BIRTHDAYS
# ─────────────────────────────────────────────────────────────────────────────
def _birthdays_show(q, context):
    edit(q, "⏳ Fetching birthdays…")
    data    = gas({"note": "get_birthdays"})
    entries = data.get("entries", [])

    if not entries:
        msg = "🎂 *Birthdays & Anniversaries*\n\n_None added yet._"
    else:
        lines = ["🎂 *Upcoming Birthdays & Anniversaries*\n"]
        for e in entries[:15]:
            icon    = "🎂" if e.get("type") == "Birthday" else "💍"
            age_str = f" _({e['age']})_" if e.get("age") else ""
            days    = e.get("days_away", "?")
            lines.append(f"{icon} *{e['name']}*{age_str} — {e['date']}  _{days} days_")
        msg = "\n".join(lines)

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ Add Entry", callback_data="bd:add")],
        [InlineKeyboardButton("🏠 Home",      callback_data="h:home")],
    ])
    edit(q, msg, kb)


def cb_birthday(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "add":
        context.user_data["awaiting"] = "bd_name"
        edit(q, "🎂 Enter name:", CANCEL_KB)

    elif parts[1] == "type":
        idx = int(parts[2])
        context.user_data.update({"bd_type": BIRTHDAY_TYPES[idx], "awaiting": "bd_date"})
        edit(q, "📅 Enter date (MM-DD, e.g. `03-15`):", CANCEL_KB)


# ─────────────────────────────────────────────────────────────────────────────
# MEMORIES
# ─────────────────────────────────────────────────────────────────────────────
def _memories_menu(q, context):
    data   = gas({"note": "get_memories"})
    recent = data.get("memories", [])[:5]
    lines  = ["💛 *Family Memories*\n"]
    for m in recent:
        emoji = m.get("type", "💛").split(" ")[0]
        lines.append(f"{emoji} *{m.get('person','')}*: {str(m.get('memory',''))[:60]}")
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ Add Memory",  callback_data="mem:add"),
         InlineKeyboardButton("👀 Browse",      callback_data="mem:browse")],
        [InlineKeyboardButton("🏠 Home",        callback_data="h:home")],
    ])
    edit(q, "\n".join(lines) or "💛 *Family Memories*", kb)


def cb_memory(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "add":
        rows = [[InlineKeyboardButton(t, callback_data=f"mem:mtype:{i}")] for i, t in enumerate(MEMORY_TYPES)]
        rows.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel")])
        edit(q, "💛 What type of memory?", InlineKeyboardMarkup(rows))

    elif parts[1] == "mtype":
        idx = int(parts[2])
        context.user_data["mem_type"] = MEMORY_TYPES[idx]
        edit(q, "Who is this memory about?", member_kb("mem:person"))

    elif parts[1] == "person":
        idx = int(parts[2])
        context.user_data.update({"mem_person": FAMILY_MEMBERS[idx], "awaiting": "mem_text"})
        edit(q, "💛 Write the memory:", CANCEL_KB)

    elif parts[1] == "browse":
        rows = [[InlineKeyboardButton(m, callback_data=f"mem:vp:{i}")] for i, m in enumerate(FAMILY_MEMBERS)]
        rows.append([InlineKeyboardButton("📋 All Recent", callback_data="mem:all")])
        rows.append([InlineKeyboardButton("🏠 Home",       callback_data="h:home")])
        edit(q, "Browse memories by person:", InlineKeyboardMarkup(rows))

    elif parts[1] == "vp":
        idx    = int(parts[2])
        person = FAMILY_MEMBERS[idx]
        data   = gas({"note": "get_memories", "person": person})
        mems   = data.get("memories", [])[:10]
        lines  = [f"💛 *Memories — {person}*\n"]
        for m in mems:
            emoji = m.get("type", "💛").split(" ")[0]
            lines.append(f"{emoji} {m.get('date','')}: {str(m.get('memory',''))[:80]}")
        edit(q, "\n".join(lines) or f"_No memories for {person}._", HOME_KB)

    elif parts[1] == "all":
        data  = gas({"note": "get_memories"})
        mems  = data.get("memories", [])[:10]
        lines = ["💛 *Recent Memories*\n"]
        for m in mems:
            emoji = m.get("type", "💛").split(" ")[0]
            lines.append(f"{emoji} *{m.get('person','')}* ({m.get('date','')}): {str(m.get('memory',''))[:60]}")
        edit(q, "\n".join(lines), HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# MEAL PLANNER
# ─────────────────────────────────────────────────────────────────────────────
def _meal_menu(q, context):
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("📝 Plan Meals", callback_data="meal:plan"),
         InlineKeyboardButton("👀 View Plan",  callback_data="meal:view")],
        [InlineKeyboardButton("🏠 Home",       callback_data="h:home")],
    ])
    edit(q, "🗓 *Meal Planner*\nWhat would you like to do?", kb)


def _meal_selector_kb(context) -> InlineKeyboardMarkup:
    selected = context.user_data.get("meal_selected", set())
    rows = [[InlineKeyboardButton(
        f"{'✅' if m in selected else '☐'} {MEAL_EMOJI[m]} {m}",
        callback_data=f"meal:wm:{i}")] for i, m in enumerate(MEAL_TYPES)]
    rows.append([InlineKeyboardButton("✅ Done selecting", callback_data="meal:mdone")])
    rows.append([InlineKeyboardButton("❌ Cancel",         callback_data="cancel")])
    return InlineKeyboardMarkup(rows)


def cb_meal(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    parts = q.data.split(":")

    if parts[1] == "plan":
        context.user_data["awaiting"] = "meal_days"
        edit(q, "📅 How many days to plan? (1–14):", CANCEL_KB)

    elif parts[1] == "view":
        context.user_data["awaiting"] = "meal_view_days"
        edit(q, "👀 View how many days ahead? (1–30):", CANCEL_KB)

    elif parts[1] == "wm":                               # toggle meal
        m        = MEAL_TYPES[int(parts[2])]
        selected = context.user_data.get("meal_selected", set())
        selected.discard(m) if m in selected else selected.add(m)
        context.user_data["meal_selected"] = selected
        day = context.user_data.get("meal_cur_day", 0) + 1
        tot = context.user_data.get("meal_total",   0)
        try:
            q.edit_message_text(f"Day {day} of {tot}: Select meals to plan:",
                                reply_markup=_meal_selector_kb(context))
        except Exception:
            pass

    elif parts[1] == "mdone":
        selected = context.user_data.get("meal_selected", set())
        if not selected:
            ack(q, "Select at least one meal!", alert=True); return
        context.user_data.update({
            "meal_slots":    list(selected),
            "meal_slot_idx": 0,
        })
        _ask_slot_cb(q, context)


def _ask_slot_cb(q, context):
    """Ask for a dish via inline (called from callback handler)."""
    slots    = context.user_data.get("meal_slots", [])
    slot_idx = context.user_data.get("meal_slot_idx", 0)
    if slot_idx >= len(slots):
        _next_meal_day_cb(q, context); return
    meal = slots[slot_idx]
    context.user_data.update({"meal_cur_slot": meal, "awaiting": "meal_dish"})
    day = context.user_data.get("meal_cur_day", 0) + 1
    tot = context.user_data.get("meal_total",   0)
    edit(q, f"Day {day}/{tot} — {MEAL_EMOJI[meal]} *{meal}*\nEnter dish name:", CANCEL_KB)


def _next_meal_day_cb(q, context):
    context.user_data["meal_cur_day"] = context.user_data.get("meal_cur_day", 0) + 1
    total = context.user_data.get("meal_total", 0)
    if context.user_data["meal_cur_day"] >= total:
        _save_meal_plan_cb(q, context)
    else:
        context.user_data.update({"meal_selected": set(), "meal_slot_idx": 0, "meal_slots": []})
        day = context.user_data["meal_cur_day"] + 1
        try:
            q.edit_message_text(f"Day {day} of {total}: Select meals to plan:",
                                reply_markup=_meal_selector_kb(context))
        except Exception:
            pass


def _save_meal_plan_cb(q, context):
    plan = context.user_data.get("meal_plan", [])
    data = gas({"note": "save_meal_plan", "plan": plan,
                "by": context.user_data.get("meal_by", "Bot")})
    edit(q, "✅ Meal plan saved! 🗓" if data.get("status") == "ok"
         else "❌ Error saving meal plan.", HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────
def _dashboard_link(q, context):
    edit(q,
        f"📊 *Family Dashboard*\n\n"
        f"[Open Dashboard]({RAILWAY_URL}/dashboard)\n\n"
        f"Password: `familyisLOVE`",
        HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# CANCEL
# ─────────────────────────────────────────────────────────────────────────────
def cb_cancel(update: Update, context: CallbackContext):
    q = update.callback_query; ack(q)
    context.user_data.clear()
    edit(q, "❌ Cancelled.", HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# UNIVERSAL TEXT HANDLER  (state machine via user_data["awaiting"])
# ─────────────────────────────────────────────────────────────────────────────
def handle_text(update: Update, context: CallbackContext):
    text     = update.message.text.strip()
    awaiting = context.user_data.pop("awaiting", None)

    if not awaiting:
        reply(update, "What would you like to do?", HOME_KB); return

    # ── Budget amount ─────────────────────────────────────────────────────────
    if awaiting == "budget_amount":
        try:
            amount = float(text.replace("$", "").replace(",", ""))
        except ValueError:
            reply(update, "❌ Please enter a valid number.", HOME_KB); return
        group = context.user_data.get("bgt_group", "")
        data  = gas({"note": "set_budget", "group": group,
                     "amount": amount, "by": sender_name(update)})
        reply(update,
              f"✅ Budget for *{group}* set to {fmt_money(amount)}/month" if data.get("status") == "ok"
              else "❌ Error setting budget.", HOME_KB)

    # ── Grocery ───────────────────────────────────────────────────────────────
    elif awaiting == "gro_item":
        data = gas({"note": "add_grocery", "item": text, "by": sender_name(update)})
        reply(update, f"✅ *{text}* added to grocery list!" if data.get("status") == "ok"
              else "❌ Error adding item.", HOME_KB)

    # ── Fridge add ────────────────────────────────────────────────────────────
    elif awaiting == "fridge_add":
        parts = text.rsplit(" ", 1)
        if len(parts) == 2 and parts[1].isdigit():
            fruit, qty = parts[0], int(parts[1])
        else:
            fruit, qty = text, 1
        data = gas({"note": "add_fruit_stock", "fruit": fruit, "qty": qty, "by": sender_name(update)})
        reply(update, f"✅ Added {qty}× {fruit} to fridge!" if data.get("status") == "ok"
              else "❌ Error adding stock.", HOME_KB)

    # ── Calendar ──────────────────────────────────────────────────────────────
    elif awaiting == "cal_title":
        context.user_data.update({"cal_title": text, "awaiting": "cal_date"})
        reply(update, "📅 Enter date (e.g. `25 May 2025`):")
    elif awaiting == "cal_date":
        context.user_data.update({"cal_date": text, "awaiting": "cal_time"})
        reply(update, "🕐 Enter time (e.g. `3pm` or `10.30am to 11.15am`) or `skip`:")
    elif awaiting == "cal_time":
        context.user_data.update({"cal_time": "" if text.lower() == "skip" else text,
                                   "awaiting": "cal_notes"})
        reply(update, "📝 Any notes? (or `skip`):")
    elif awaiting == "cal_notes":
        data = gas({
            "note":  "add_calendar_event",
            "title": context.user_data.get("cal_title", ""),
            "date":  context.user_data.get("cal_date",  ""),
            "time":  context.user_data.get("cal_time",  ""),
            "notes": "" if text.lower() == "skip" else text,
            "by":    sender_name(update),
        })
        reply(update, "✅ Event added to calendar!" if data.get("status") == "ok"
              else "❌ Error adding event.", HOME_KB)

    # ── To-Do ─────────────────────────────────────────────────────────────────
    elif awaiting == "todo_task":
        context.user_data["todo_task"] = text
        rows = [[InlineKeyboardButton(m, callback_data=f"todo:assignee:{i}")]
                for i, m in enumerate(FAMILY_MEMBERS)]
        rows.append([InlineKeyboardButton("❌ Cancel", callback_data="cancel")])
        reply(update, "👤 Assign to:", InlineKeyboardMarkup(rows))
    elif awaiting == "todo_due":
        data = gas({
            "note":      "add_todo",
            "task":      context.user_data.get("todo_task",     ""),
            "assignee":  context.user_data.get("todo_assignee", ""),
            "due_date":  "" if text.lower() == "skip" else text,
            "by":        sender_name(update),
        })
        reply(update, "✅ Task added!" if data.get("status") == "ok"
              else "❌ Error adding task.", HOME_KB)

    # ── Fertility ─────────────────────────────────────────────────────────────
    elif awaiting == "fert_notes":
        ftype = context.user_data.get("fert_type", "")
        data  = gas({"note": "log_fertility", "type": ftype,
                     "notes": "" if text.lower() == "skip" else text,
                     "by": sender_name(update)})
        reply(update, f"✅ *{ftype}* logged!" if data.get("status") == "ok"
              else "❌ Error logging.", HOME_KB)

    # ── Birthday ──────────────────────────────────────────────────────────────
    elif awaiting == "bd_name":
        context.user_data["bd_name"] = text
        rows = [[InlineKeyboardButton(t, callback_data=f"bd:type:{i}")] for i, t in enumerate(BIRTHDAY_TYPES)]
        reply(update, "What type?", InlineKeyboardMarkup(rows))
    elif awaiting == "bd_date":
        context.user_data.update({"bd_date": text, "awaiting": "bd_year"})
        reply(update, "Enter year (e.g. `1990`) or `skip`:")
    elif awaiting == "bd_year":
        context.user_data.update({"bd_year": "" if text.lower() == "skip" else text,
                                   "awaiting": "bd_notes"})
        reply(update, "📝 Any notes? (or `skip`):")
    elif awaiting == "bd_notes":
        data = gas({
            "note":  "add_birthday",
            "name":  context.user_data.get("bd_name", ""),
            "type":  context.user_data.get("bd_type", ""),
            "date":  context.user_data.get("bd_date", ""),
            "year":  context.user_data.get("bd_year", ""),
            "notes": "" if text.lower() == "skip" else text,
            "by":    sender_name(update),
        })
        reply(update, "✅ Entry added!" if data.get("status") == "ok"
              else "❌ Error adding.", HOME_KB)

    # ── Memories ──────────────────────────────────────────────────────────────
    elif awaiting == "mem_text":
        context.user_data.update({"mem_text": text, "awaiting": "mem_date"})
        reply(update, "📅 Enter date (e.g. `23 May 2025`) or `today`:")
    elif awaiting == "mem_date":
        data = gas({
            "note":   "add_memory",
            "type":   context.user_data.get("mem_type",   ""),
            "person": context.user_data.get("mem_person", ""),
            "memory": context.user_data.get("mem_text",   ""),
            "date":   text,
            "by":     sender_name(update),
        })
        reply(update, "✅ Memory saved! 💛" if data.get("status") == "ok"
              else "❌ Error saving.", HOME_KB)

    # ── Meal planner ──────────────────────────────────────────────────────────
    elif awaiting == "meal_days":
        try:
            days = int(text)
            assert 1 <= days <= 14
        except Exception:
            reply(update, "❌ Enter a number between 1 and 14.")
            context.user_data["awaiting"] = "meal_days"; return
        context.user_data.update({
            "meal_total":    days,
            "meal_cur_day":  0,
            "meal_plan":     [],
            "meal_selected": set(),
            "meal_slots":    [],
            "meal_slot_idx": 0,
            "meal_by":       sender_name(update),
        })
        reply(update, f"Day 1 of {days}: Select meals to plan:", _meal_selector_kb(context))

    elif awaiting == "meal_view_days":
        try:
            days = int(text)
            assert 1 <= days <= 30
        except Exception:
            reply(update, "❌ Enter a number between 1 and 30.")
            context.user_data["awaiting"] = "meal_view_days"; return
        data = gas({"note": "get_meal_plan", "days": days})
        plan = data.get("plan", [])
        if not plan:
            reply(update, f"_No meal plan for the next {days} days._", HOME_KB); return
        lines = [f"🗓 *Meal Plan — Next {days} Days*\n"]
        for entry in plan:
            lines.append(f"\n*{entry['date']}*")
            for slot in entry.get("meals", []):
                e = MEAL_EMOJI.get(slot["meal"], "🍽")
                lines.append(f"  {e} {slot['meal']}: {slot['dish']}")
                if slot.get("ingredients"):
                    lines.append(f"    _Ingredients: {slot['ingredients']}_")
        reply(update, "\n".join(lines), HOME_KB)

    elif awaiting == "meal_dish":
        context.user_data.update({"meal_dish": text, "awaiting": "meal_ingredients"})
        reply(update, "🥕 Enter ingredients (comma-separated) or `skip`:")

    elif awaiting == "meal_ingredients":
        dish  = context.user_data.get("meal_dish", "")
        meal  = context.user_data.get("meal_cur_slot", "")
        day   = context.user_data.get("meal_cur_day", 0)
        ingr  = "" if text.lower() == "skip" else text
        plan  = context.user_data.get("meal_plan", [])
        while len(plan) <= day:
            plan.append({"day_offset": len(plan), "meals": []})
        plan[day]["meals"].append({"meal": meal, "dish": dish, "ingredients": ingr})
        context.user_data["meal_plan"] = plan

        # Advance slot
        context.user_data["meal_slot_idx"] += 1
        slots    = context.user_data.get("meal_slots", [])
        slot_idx = context.user_data.get("meal_slot_idx", 0)

        if slot_idx >= len(slots):
            # Advance day
            context.user_data["meal_cur_day"] = day + 1
            total = context.user_data.get("meal_total", 0)
            if context.user_data["meal_cur_day"] >= total:
                data = gas({"note": "save_meal_plan", "plan": plan,
                            "by": context.user_data.get("meal_by", "Bot")})
                reply(update, "✅ Meal plan saved! 🗓" if data.get("status") == "ok"
                      else "❌ Error saving.", HOME_KB)
            else:
                context.user_data.update({"meal_selected": set(), "meal_slot_idx": 0, "meal_slots": []})
                next_day = context.user_data["meal_cur_day"] + 1
                reply(update, f"Day {next_day} of {total}: Select meals:",
                      _meal_selector_kb(context))
        else:
            # Next dish in same day
            next_meal = slots[slot_idx]
            context.user_data.update({"meal_cur_slot": next_meal, "awaiting": "meal_dish"})
            day_n = context.user_data.get("meal_cur_day", 0) + 1
            total = context.user_data.get("meal_total", 0)
            reply(update, f"Day {day_n}/{total} — {MEAL_EMOJI[next_meal]} *{next_meal}*\nEnter dish name:")

    else:
        reply(update, "🤔 Not sure what you meant. Here's the menu:", HOME_KB)


# ─────────────────────────────────────────────────────────────────────────────
# FLASK APP
# ─────────────────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = SECRET_KEY

GAS_DASHBOARD_KEYS = [
    "get_calendar", "get_todo", "get_grocery", "get_expenses",
    "get_fertility", "get_birthdays", "get_budgets", "get_memories",
    "get_meal_plan", "get_fruits",
]


@app.route("/")
def index():
    return "Wong Family Bot is running! 🏠", 200


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if request.form.get("password") == DASHBOARD_PASSWORD:
            session["logged_in"] = True
            return redirect(url_for("dashboard"))
        return render_template("login.html", error="Wrong password")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.pop("logged_in", None)
    return redirect(url_for("login"))


@app.route("/dashboard")
def dashboard():
    if not session.get("logged_in"):
        return redirect(url_for("login"))
    return render_template("dashboard.html")


@app.route("/dashboard-data")
def dashboard_data():
    if not session.get("logged_in"):
        return jsonify({"error": "Unauthorized"}), 401

    results = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(gas, {"note": k}): k for k in GAS_DASHBOARD_KEYS}
        for fut in as_completed(futures):
            k = futures[fut]
            try:
                results[k] = fut.result(timeout=15)
            except Exception as exc:
                results[k] = {"error": str(exc)}
    return jsonify(results)


@app.route("/notify", methods=["POST"])
def notify():
    data = request.json or {}
    msg  = data.get("message", "").strip()
    if not msg:
        return jsonify({"status": "error", "message": "No message"}), 400

    sent = 0
    for chat_id in NOTIFY_CHAT_IDS:
        try:
            _updater.bot.send_message(chat_id=chat_id, text=msg, parse_mode="Markdown")
            sent += 1
        except Exception as exc:
            log.error("Notify error for %s: %s", chat_id, exc)
    return jsonify({"status": "ok", "sent": sent})


@app.route("/set_webhook", methods=["GET", "POST"])
def set_webhook():
    url    = f"{RAILWAY_URL}/webhook"
    result = _updater.bot.set_webhook(url=url)
    return jsonify({"status": "ok", "webhook": url, "result": result})


# ─────────────────────────────────────────────────────────────────────────────
# BOT SETUP
# ─────────────────────────────────────────────────────────────────────────────
def build_dispatcher(dp):
    dp.add_handler(CommandHandler("start", cmd_start))
    dp.add_handler(CommandHandler("home",  cmd_start))
    dp.add_handler(CommandHandler("help",  cmd_help))

    # Callback handlers — most specific patterns first
    dp.add_handler(CallbackQueryHandler(cb_cancel,   pattern=r"^cancel$"))
    dp.add_handler(CallbackQueryHandler(cb_home,     pattern=r"^h:"))
    dp.add_handler(CallbackQueryHandler(cb_expense,  pattern=r"^exp:"))
    dp.add_handler(CallbackQueryHandler(cb_budget,   pattern=r"^bgt:"))
    dp.add_handler(CallbackQueryHandler(cb_grocery,  pattern=r"^gro:"))
    dp.add_handler(CallbackQueryHandler(cb_shopping, pattern=r"^shop:"))
    dp.add_handler(CallbackQueryHandler(cb_fridge,   pattern=r"^fridge:"))
    dp.add_handler(CallbackQueryHandler(cb_calendar, pattern=r"^cal:"))
    dp.add_handler(CallbackQueryHandler(cb_todo,     pattern=r"^todo:"))
    dp.add_handler(CallbackQueryHandler(cb_fertility,pattern=r"^fert:"))
    dp.add_handler(CallbackQueryHandler(cb_birthday, pattern=r"^bd:"))
    dp.add_handler(CallbackQueryHandler(cb_memory,   pattern=r"^mem:"))
    dp.add_handler(CallbackQueryHandler(cb_meal,     pattern=r"^meal:"))

    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_text))


# ─────────────────────────────────────────────────────────────────────────────
# BOT THREAD WITH WATCHDOG RESTART
# ─────────────────────────────────────────────────────────────────────────────
_updater: Updater = None   # noqa: set by run_bot before Flask needs it


def run_bot():
    global _updater
    while True:
        try:
            log.info("Starting bot…")
            _updater = Updater(TOKEN, use_context=True, workers=8)
            build_dispatcher(_updater.dispatcher)
            _updater.start_polling(
                poll_interval=0.5,
                timeout=10,
                drop_pending_updates=True,
                allowed_updates=["message", "callback_query"],
            )
            log.info("Bot polling started.")
            _updater.idle()
        except Exception:
            log.error("Bot crashed:\n%s", traceback.format_exc())
            time.sleep(5)
            log.info("Restarting bot…")


def start_bot_thread():
    t = threading.Thread(target=run_bot, daemon=True, name="BotWatchdog")
    t.start()
    return t


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    start_bot_thread()
    time.sleep(2)                            # let updater initialise
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
