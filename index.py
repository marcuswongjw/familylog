import os
import asyncio
import threading
import requests
import base64
import time
import re
import json as _json
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date as _date, datetime as _dt, timedelta
from flask import Flask, request, jsonify, send_file
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    ApplicationBuilder,
    MessageHandler,
    filters,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes
)

# --- CONFIGURATION ---
TOKEN             = os.environ.get('TELEGRAM_TOKEN')
GOOGLE_SCRIPT_URL = os.environ.get('GOOGLE_SCRIPT_URL')
SHEET_URL         = "https://docs.google.com/spreadsheets/d/17TywVuHWmldWATzmarvkMYdInnatgX-jb46ipuCt0_I"
RAILWAY_URL       = "https://familylog-production.up.railway.app"

NOTIFY_CHAT_IDS = [
    486455062,   # Eleanor
    # 987654321, # Marcus — uncomment and add ID when ready
]

FAMILY_MEMBERS = ["Mikaela", "Meaghan", "Eleanor", "Marcus", "Everyone"]

EXPENSE_GROUPS = {
    "👶 Children": ["Children - Books", "Children - Enrichment", "Children - School", "Children - Toys", "Mikaela - Sailing"],
    "👕 Clothing": ["Clothing - Accessories", "Clothing - Clothes", "Clothing - Shoes"],
    "🍽 Eating Out": ["Eating Out - Beverages", "Eating Out - Breakfast", "Eating Out - Dinner", "Eating Out - Lunch", "Eating Out - Snacks"],
    "📚 Education": ["Education - Books", "Education - Courses & Enrichment", "Education - Subscription"],
    "🎭 Entertainment": ["Entertainment - Experiences", "Entertainment - Subscriptions", "Entertainment - Objects (toys, etc)"],
    "🎁 Gifts/Giving": ["Gifts & Treats - CNY", "Gifts & Treats - Family", "Gifts & Treats - Friends", "Gifts & Treats - Wedding", "Giving - Church", "Giving - Charity", "Giving - Parents"],
    "🏥 Health": ["Health & Fitness - Dental + Medical", "Health & Fitness - Events + Subscription", "Health & Fitness - Equipment + Supplements"],
    "🏠 Household": ["Household - Appliances", "Household - Groceries", "Household - Helper", "Household - Household Misc", "Household - Renovation", "Household - Utilities (electric, gas, water)", "Household - Internet"],
    "🐾 Pets": ["Pets - Pet Food", "Pets - Grooming", "Pets - Pet Misc"],
    "💆 Self Care": ["Self Care - Massage", "Self Care - Personal Care", "Self Care - Mobile"],
    "✈️ Travel": ["Travel - Hotels", "Travel - Transport", "Travel - Expenses"],
    "🚗 Transport": ["Transportation - Bus/MRT", "Transportation - Taxi/Grab", "Transportation - Auto: Service", "Transportation - Auto: Loan", "Transportation - Auto: Gas"],
    "📈 Finance": ["Endowment", "Insurance", "Investing", "Taxes - Income Tax", "Taxes - Property Tax"],
    "🌍 Others": ["Electronics", "Misc", "Missions"]
}

ACCOUNT_TYPES      = ["Personal Account", "Family"]
BIRTHDAY_TYPES     = ["Birthday", "Wedding Anniversary"]
FERTILITY_SYMPTOMS = ["🤢 Nausea", "💧 Spotting", "😴 Fatigue", "🤕 Cramps", "😤 Mood swings", "🌡 Hot flashes", "💊 Medication taken", "✅ None"]
BUDGET_ACCOUNT     = "Family"
MEMORY_TYPES       = ["🏆 Milestone", "💬 Quote", "💛 Moment"]
MEAL_TYPES         = ["Breakfast", "Lunch", "Dinner"]


# --- HELPERS ---
def build_group_keyboard():
    keyboard   = []
    group_keys = list(EXPENSE_GROUPS.keys())
    for i in range(0, len(group_keys), 2):
        row = [InlineKeyboardButton(group_keys[i], callback_data=f"exp_group:{group_keys[i]}")]
        if i + 1 < len(group_keys):
            row.append(InlineKeyboardButton(group_keys[i + 1], callback_data=f"exp_group:{group_keys[i + 1]}"))
        keyboard.append(row)
    return keyboard

def build_budget_group_keyboard():
    keyboard   = []
    group_keys = list(EXPENSE_GROUPS.keys())
    for i in range(0, len(group_keys), 2):
        # Use index for group too to be safe
        row = [InlineKeyboardButton(group_keys[i], callback_data=f"budget_group:{i}")]
        if i + 1 < len(group_keys):
            row.append(InlineKeyboardButton(group_keys[i + 1], callback_data=f"budget_group:{i+1}"))
        keyboard.append(row)
    return keyboard

def home_keyboard():
    return InlineKeyboardMarkup([[InlineKeyboardButton("🏠 home", callback_data='home')]])

async def send_to_all(text, parse_mode='Markdown'):
    for chat_id in NOTIFY_CHAT_IDS:
        try:
            await application.bot.send_message(chat_id=chat_id, text=text, parse_mode=parse_mode)
        except Exception as e:
            print(f"Failed to send to {chat_id}: {e}")


# --- TIME RANGE PARSER ---
_TIME_PART = r'(\d{1,2})(?:[:\.](\d{2}))?\s*(am|pm)'
_RANGE_RE  = re.compile(rf'^{_TIME_PART}\s*(?:to|-)\s*{_TIME_PART}$', re.IGNORECASE)

def parse_time_range(raw: str):
    raw = raw.strip()
    m = _RANGE_RE.match(raw)
    if not m:
        return raw, ''
    h1, m1, mer1, h2, m2, mer2 = m.groups()
    start = _normalise_time(h1, m1 or '00', mer1)
    end   = _normalise_time(h2, m2 or '00', mer2)
    return start, end

def _normalise_time(h, m, meridiem):
    return f"{int(h)}:{m.zfill(2)}{meridiem.lower()}"


# --- SHOPPING MODE HELPER ---
async def _render_shopping_list(query, context):
    items   = context.user_data.get('shop_items', [])
    checked = context.user_data.get('shop_checked', [])
    keyboard = []
    for item in items:
        is_checked = item in checked
        label      = f"✅ {item}" if is_checked else f"⬜ {item}"
        keyboard.append([InlineKeyboardButton(label, callback_data=f"shop_toggle:{item}")])
    keyboard.append([
        InlineKeyboardButton(f"🛒 done ({len(checked)} checked)", callback_data='shop_confirm'),
        InlineKeyboardButton("❌ cancel", callback_data='shop_cancel')
    ])
    await query.edit_message_text(
        "🛒 *Shopping Mode*\n\ntap items to check them off, then tap Done.",
        parse_mode='Markdown',
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


# --- MEAL PLANNER HELPER ---
async def _meal_next_day_or_finish(query, context, user):
    days_queue = context.user_data.get('meal_days_queue', [])
    if not days_queue:
        plan  = context.user_data.get('meal_plan', [])
        total = sum(len(d.get('meals', [])) for d in plan)
        context.user_data.clear()
        await query.edit_message_text(
            f"✅ *Meal plan saved!*\n\n🍽 {total} meal{'s' if total != 1 else ''} planned across {len(plan)} day{'s' if len(plan) != 1 else ''}.\n\n_view it anytime from the Meal Planner menu._",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("📅 view meal plan", callback_data='meals_view')],
                [InlineKeyboardButton("🏠 home",           callback_data='home')]
            ])
        )
        return
    next_date, next_label = days_queue.pop(0)
    context.user_data['meal_days_queue']        = days_queue
    context.user_data['meal_current_day']       = next_date
    context.user_data['meal_current_day_label'] = next_label
    context.user_data['meal_day_types']         = []
    keyboard = []
    for mt in MEAL_TYPES:
        keyboard.append([InlineKeyboardButton(f"⬜ {mt}", callback_data=f"meal_toggle_type:{mt}")])
    keyboard.append([InlineKeyboardButton("➡️ confirm (0 selected)", callback_data='meal_confirm_types')])
    keyboard.append([InlineKeyboardButton("❌ cancel", callback_data='view_meals')])
    await query.edit_message_text(
        f"📅 *{next_label}*\n\nwhich meals are you planning for this day?",
        parse_mode='Markdown',
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


# --- HOME ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🛒 grocery list",     callback_data='view_groceries'),
         InlineKeyboardButton("🛍 shopping mode",    callback_data='shopping_mode')],
        [InlineKeyboardButton("🍎 check fridge",     callback_data='check_fridge'),
         InlineKeyboardButton("🍽 log eating fruit", callback_data='eat_fruit')],
        [InlineKeyboardButton("📅 family calendar",  callback_data='view_calendar'),
         InlineKeyboardButton("💰 expenses",         callback_data='view_expenses')],
        [InlineKeyboardButton("✅ to-do list",        callback_data='view_todos'),
         InlineKeyboardButton("🌸 fertility",        callback_data='view_fertility')],
        [InlineKeyboardButton("🎂 birthdays",        callback_data='view_birthdays'),
         InlineKeyboardButton("📊 budgets",          callback_data='view_budgets')],
        [InlineKeyboardButton("💛 memories",         callback_data='view_memories'),
         InlineKeyboardButton("🍽 meal planner",     callback_data='view_meals')],
        [InlineKeyboardButton("📊 view dashboard",   url=f"{RAILWAY_URL}/dashboard")]
    ]
    text = "welcome to the *Wong Family* dashboard! 🏠\nwhat would you like to do today?"
    if update.message:
        await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
    else:
        await update.callback_query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')


# --- HELP COMMAND ---
async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = (
        "🏠 *Wong Family Bot — Commands & Buttons*\n\n"
        "*🏠 Main Menu*\n"
        "Type /start — open the main menu\n"
        "Type /help — show this help message\n\n"
        "*🛒 Grocery List*\n"
        "• *Grocery list* button — view items to buy\n"
        "• Tap any item to mark it as bought\n"
        "• Type `+item name` — add an item (e.g. `+milk`)\n"
        "• Type `buy item name` — same as above\n\n"
        "*🛍 Shopping Mode*\n"
        "• *Shopping mode* button — see full grocery list with checkboxes\n"
        "• Tap items to check them off, then tap Done to mark all as bought\n\n"
        "*🍎 Fridge & Fruit*\n"
        "• *Check fridge* button — see current fruit stock\n"
        "• *Log eating fruit* button — deduct from stock\n"
        "• Type `+fruits name qty` — add fruit stock (e.g. `+fruits apple 6`)\n\n"
        "*📅 Family Calendar*\n"
        "• *Family calendar* button — view next 14 days\n"
        "• *Add event* — title → date → time (or range e.g. `10.30am to 11.15am`) → notes\n"
        "• *Delete event* — pick from list with confirmation\n\n"
        "*💰 Expenses*\n"
        "• *Expenses* button — view this month's summary\n"
        "• *Add expense* — amount → category → account → description → date\n"
        "• *Delete expense* — pick from recent entries with confirmation\n\n"
        "*✅ To-Do List*\n"
        "• *To-do list* button — view all open tasks grouped by person\n"
        "• *Add task* — task name → assign to family member → due date\n"
        "• *Complete a task* — mark done\n"
        "• *Delete a task* — remove with confirmation\n\n"
        "*🌸 Fertility Tracker*\n"
        "• *Fertility* button — view cycle summary\n"
        "• *Log period start / end* — enter date\n"
        "• *Log ovulation* — enter date\n"
        "• *Log symptoms* — pick from list\n\n"
        "*🎂 Birthdays & Anniversaries*\n"
        "• *Birthdays* button — view upcoming in next 60 days\n"
        "• *Add birthday/anniversary* — name → type → date (MM-DD) → year → notes\n"
        "• Reminders sent automatically at 7 days, 1 day, and on the day\n\n"
        "*📊 Budget Alerts*\n"
        "• *Budgets* button — view all category budgets and current spend\n"
        "• *Set / update a budget* — pick category → enter monthly limit\n"
        "• Alerts sent automatically at 80% and 100% of budget\n"
        "• Checks run every time an expense is added, and daily at 8am\n\n"
        "*💛 Family Memories*\n"
        "• *Memories* button — view recent or browse by person\n"
        "• *Log a memory* — type (Milestone / Quote / Moment) → person → write it → date\n"
        "• *Recent memories* — shows last 5 entries\n"
        "• *Browse by person* — shows last 10 entries for that person\n\n"
        "*🍽 Meal Planner*\n"
        "• *Meal planner* button — view plan or add new meals\n"
        "• *View meal plan* — enter how many days ahead to show\n"
        "• *Plan a meal* — pick days → select meals (Breakfast/Lunch/Dinner) → dish name → ingredients\n"
        "• Missing ingredients can be added to the grocery list in one tap\n\n"
        "*📊 Dashboard*\n"
        "• *View dashboard* button — opens the family web dashboard\n\n"
        "_Tip: tap 🏠 home at any time to return to the main menu._"
    )
    if update.message:
        await update.message.reply_text(text, parse_mode='Markdown')
    else:
        await update.callback_query.edit_message_text(text, parse_mode='Markdown', reply_markup=home_keyboard())


# --- BUTTON HANDLER ---
async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user  = query.from_user.first_name
    await query.answer()

    if query.data == 'home':
        context.user_data.clear()
        await start(update, context)
        return

    # ------------------------------------------------------------------ GROCERY
    if query.data == 'view_groceries':
        payload = {"user": user, "note": "get_checklist"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            items    = [i.strip() for i in response.text.split(",") if i.strip()]
            if not items:
                await query.edit_message_text("nothing to buy right now! 🛒", reply_markup=home_keyboard())
                return
            keyboard = [[InlineKeyboardButton(f"✅ {i}", callback_data=f"check_item:{i}")] for i in items]
            keyboard.append([InlineKeyboardButton("🏠 home", callback_data='home')])
            await query.edit_message_text("tap an item to mark it as bought:", reply_markup=InlineKeyboardMarkup(keyboard))
        except Exception as ex:
            await query.edit_message_text(f"couldn't fetch the checklist. ({ex})", reply_markup=home_keyboard())
        return

    if query.data.startswith('check_item:'):
        item_name = query.data.split(":", 1)[1]
        payload   = {"user": user, "note": f"bought {item_name}"}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.answer(f"marked {item_name} as bought!")
            await start(update, context)
        except:
            await query.answer("failed to update.")
        return

    # ------------------------------------------------------------------ SHOPPING MODE
    if query.data == 'shopping_mode':
        payload = {"user": user, "note": "get_checklist"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            items    = [i.strip() for i in response.text.split(",") if i.strip()]
            if not items:
                await query.edit_message_text(
                    "🛒 *Shopping Mode*\n\nthe grocery list is empty! nothing to buy.",
                    parse_mode='Markdown',
                    reply_markup=home_keyboard()
                )
                return
            context.user_data['shop_items']   = items
            context.user_data['shop_checked'] = []
            await _render_shopping_list(query, context)
        except Exception as ex:
            await query.edit_message_text(f"couldn't load grocery list. ({ex})", reply_markup=home_keyboard())
        return

    if query.data.startswith('shop_toggle:'):
        item    = query.data.split(":", 1)[1]
        checked = context.user_data.get('shop_checked', [])
        if item in checked:
            checked.remove(item)
        else:
            checked.append(item)
        context.user_data['shop_checked'] = checked
        await _render_shopping_list(query, context)
        return

    if query.data == 'shop_confirm':
        items   = context.user_data.get('shop_items', [])
        checked = context.user_data.get('shop_checked', [])
        if not checked:
            await query.answer("you haven't checked anything off yet!", show_alert=True)
            return
        for item in checked:
            requests.post(GOOGLE_SCRIPT_URL, json={"user": user, "note": f"bought {item}"}, timeout=10)
        context.user_data.pop('shop_items',   None)
        context.user_data.pop('shop_checked', None)
        remaining = [i for i in items if i not in checked]
        msg = f"✅ marked *{len(checked)}* item{'s' if len(checked) != 1 else ''} as bought!"
        if remaining:
            msg += f"\n\n🛒 *{len(remaining)}* item{'s' if len(remaining) != 1 else ''} still on the list."
        await query.edit_message_text(msg, parse_mode='Markdown', reply_markup=home_keyboard())
        return

    if query.data == 'shop_cancel':
        context.user_data.pop('shop_items',   None)
        context.user_data.pop('shop_checked', None)
        await start(update, context)
        return

    # ------------------------------------------------------------------ FRIDGE
    if query.data == 'check_fridge':
        payload = {"user": user, "note": "check fridge"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.edit_message_text(response.text or "fridge is empty ❄️", reply_markup=home_keyboard())
        except:
            await query.edit_message_text("couldn't connect to fridge data.", reply_markup=home_keyboard())
        return

    # ------------------------------------------------------------------ FRUIT
    if query.data == 'eat_fruit':
        payload = {"user": user, "note": "get_fruit_list"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            fruits   = [f.strip() for f in response.text.split(",") if f.strip()]
            if not fruits:
                await query.edit_message_text("the fridge is empty of fruit! 🧊", reply_markup=home_keyboard())
                return
            keyboard = [[InlineKeyboardButton(f, callback_data=f"select_fruit:{f}")] for f in fruits]
            keyboard.append([InlineKeyboardButton("🏠 home", callback_data='home')])
            await query.edit_message_text("what did you eat? 🍎", reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("error connecting to fridge data.", reply_markup=home_keyboard())
        return

    if query.data.startswith('select_fruit:'):
        fruit_name = query.data.split(":", 1)[1]
        context.user_data['selected_fruit'] = fruit_name
        context.user_data['awaiting']       = 'fruit_qty'
        await query.edit_message_text(f"how many {fruit_name}s did you have? (type the number)")
        return

    # ------------------------------------------------------------------ CALENDAR
    if query.data == 'view_calendar':
        payload = {"user": user, "note": "get_events"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text     = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("➕ add event",    callback_data='add_event')],
                [InlineKeyboardButton("🗑 delete event", callback_data='delete_event')],
                [InlineKeyboardButton("🏠 home",          callback_data='home')]
            ]
            display = text if text and text != "no_events" else "no upcoming events! add one below 📅"
            await query.edit_message_text(display, reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("couldn't load calendar.", reply_markup=home_keyboard())
        return

    if query.data == 'add_event':
        context.user_data['awaiting'] = 'event_title'
        await query.edit_message_text(
            "📅 *add a new event*\n\nwhat's the event called?\n(e.g. 'dentist appointment')\n\n💡 include a family member's name to auto-tag them\n(e.g. 'Mikaela swimming', 'Meaghan violin')",
            parse_mode='Markdown'
        )
        return

    if query.data == 'delete_event':
        payload = {"user": user, "note": "get_event_list"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            raw      = response.text.strip()
            if not raw or raw == "no_events":
                await query.edit_message_text("no upcoming events to delete! 📅", reply_markup=home_keyboard())
                return
            items    = [i.strip() for i in raw.split("||") if i.strip()]
            keyboard = []
            for item in items:
                parts = item.split("|")
                if len(parts) >= 2:
                    eid, title = parts[0], parts[1]
                    date_str   = parts[2] if len(parts) > 2 else ''
                    label      = f"🗑 {title}" + (f" ({date_str})" if date_str else "")
                    keyboard.append([InlineKeyboardButton(label, callback_data=f"confirm_del_event:{eid}")])
            keyboard.append([InlineKeyboardButton("⬅️ back", callback_data="view_calendar")])
            await query.edit_message_text("which event do you want to delete?", reply_markup=InlineKeyboardMarkup(keyboard))
        except Exception as ex:
            await query.edit_message_text(f"couldn't load events. ({ex})", reply_markup=home_keyboard())
        return

    if query.data.startswith('confirm_del_event:'):
        eid = query.data.split(":", 1)[1]
        keyboard = [
            [InlineKeyboardButton("✅ yes, delete it", callback_data=f"do_del_event:{eid}"),
             InlineKeyboardButton("❌ cancel",          callback_data="view_calendar")]
        ]
        await query.edit_message_text("are you sure you want to delete this event?", reply_markup=InlineKeyboardMarkup(keyboard))
        return

    if query.data.startswith('do_del_event:'):
        eid     = query.data.split(":", 1)[1]
        payload = {"user": user, "note": "delete_event", "event_id": eid}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.edit_message_text("✅ event deleted!", reply_markup=home_keyboard())
        except:
            await query.edit_message_text("couldn't delete event.", reply_markup=home_keyboard())
        return


    # ------------------------------------------------------------------ TO-DO
    if query.data == 'view_todos':
        payload = {"user": user, "note": "get_todos"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text     = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("➕ add task",        callback_data='add_todo')],
                [InlineKeyboardButton("✅ complete a task",  callback_data='complete_todo'),
                 InlineKeyboardButton("🗑 delete a task",   callback_data='delete_todo')],
                [InlineKeyboardButton("🏠 home",             callback_data='home')]
            ]
            display = text if text and text != "no_todos" else "no tasks yet! add one below ✅"
            await query.edit_message_text(display, reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("couldn't load to-do list.", reply_markup=home_keyboard())
        return

    if query.data == 'add_todo':
        context.user_data['awaiting'] = 'todo_task'
        await query.edit_message_text("✅ *add a task*\n\nwhat needs to be done?", parse_mode='Markdown')
        return

    if query.data.startswith('todo_assign:'):
        member = query.data.split(":", 1)[1]
        context.user_data['todo_assignee'] = member
        context.user_data['awaiting']      = 'todo_due'
        await query.edit_message_text(
            f"assigned to: *{member}*\n\nany due date? (e.g. '20 May')\ntype 'skip' for none",
            parse_mode='Markdown'
        )
        return

    if query.data == 'complete_todo':
        payload = {"user": user, "note": "get_todo_list"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            raw      = response.text.strip()
            if not raw or raw == "no_todos":
                await query.edit_message_text("no open tasks to complete! 🎉", reply_markup=home_keyboard())
                return
            items    = [i.strip() for i in raw.split("||") if i.strip()]
            keyboard = []
            for item in items:
                parts = item.split("|")
                if len(parts) >= 3:
                    tid, task, assignee = parts[0], parts[1], parts[2]
                    keyboard.append([InlineKeyboardButton(f"✅ {task} ({assignee})", callback_data=f"done_todo:{tid}")])
            keyboard.append([InlineKeyboardButton("⬅️ back", callback_data="view_todos")])
            await query.edit_message_text("tap a task to mark it done:", reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("couldn't load tasks.", reply_markup=home_keyboard())
        return

    if query.data.startswith('done_todo:'):
        tid     = query.data.split(":", 1)[1]
        payload = {"user": user, "note": "complete_todo", "todo_id": tid}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.answer("task marked done! 🎉")
            await start(update, context)
        except:
            await query.answer("couldn't update task.")
        return

    if query.data == 'delete_todo':
        payload = {"user": user, "note": "get_todo_list"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            raw      = response.text.strip()
            if not raw or raw == "no_todos":
                await query.edit_message_text("no open tasks to delete!", reply_markup=home_keyboard())
                return
            items    = [i.strip() for i in raw.split("||") if i.strip()]
            keyboard = []
            for item in items:
                parts = item.split("|")
                if len(parts) >= 3:
                    tid, task, assignee = parts[0], parts[1], parts[2]
                    keyboard.append([InlineKeyboardButton(f"🗑 {task} ({assignee})", callback_data=f"confirm_del_todo:{tid}")])
            keyboard.append([InlineKeyboardButton("⬅️ back", callback_data="view_todos")])
            await query.edit_message_text("which task do you want to delete?", reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("couldn't load tasks.", reply_markup=home_keyboard())
        return

    if query.data.startswith('confirm_del_todo:'):
        tid = query.data.split(":", 1)[1]
        keyboard = [
            [InlineKeyboardButton("✅ yes, delete it", callback_data=f"do_del_todo:{tid}"),
             InlineKeyboardButton("❌ cancel",          callback_data="view_todos")]
        ]
        await query.edit_message_text("are you sure you want to delete this task?", reply_markup=InlineKeyboardMarkup(keyboard))
        return

    if query.data.startswith('do_del_todo:'):
        tid     = query.data.split(":", 1)[1]
        payload = {"user": user, "note": "delete_todo", "todo_id": tid}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.edit_message_text("✅ task deleted!", reply_markup=home_keyboard())
        except:
            await query.edit_message_text("couldn't delete task.", reply_markup=home_keyboard())
        return
        
    # ------------------------------------------------------------------ EXPENSES
    if query.data == 'view_expenses':
        payload = {"user": user, "note": "get_expenses"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text     = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("➕ add expense",    callback_data='add_expense')],
                [InlineKeyboardButton("🗑 delete expense", callback_data='delete_expense')],
                [InlineKeyboardButton("🏠 home",            callback_data='home')]
            ]
            display = text if text and text != "no_expenses" else "no expenses logged yet!"
            await query.edit_message_text(display, reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("couldn't load expenses.", reply_markup=home_keyboard())
        return

    if query.data == 'add_expense':
        context.user_data['awaiting'] = 'expense_amount'
        await query.edit_message_text("💰 *add an expense*\n\nhow much did you spend? (e.g. 24.50)", parse_mode='Markdown')
        return

    if query.data == 'delete_expense':
        payload = {"user": user, "note": "get_expense_list"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            raw      = response.text.strip()
            if not raw or raw == "no_expenses":
                await query.edit_message_text("no recent expenses to delete!", reply_markup=home_keyboard())
                return
            items    = [i.strip() for i in raw.split("||") if i.strip()]
            keyboard = []
            for item in items:
                parts = item.split("|")
                if len(parts) >= 3:
                    rid, label_text = parts[0], " · ".join(parts[1:])
                    keyboard.append([InlineKeyboardButton(f"🗑 {label_text}", callback_data=f"confirm_del_exp:{rid}")])
            keyboard.append([InlineKeyboardButton("⬅️ back", callback_data="view_expenses")])
            await query.edit_message_text("which expense do you want to delete?", reply_markup=InlineKeyboardMarkup(keyboard))
        except Exception as ex:
            await query.edit_message_text(f"couldn't load expenses. ({ex})", reply_markup=home_keyboard())
        return

    if query.data.startswith('confirm_del_exp:'):
        rid = query.data.split(":", 1)[1]
        keyboard = [
            [InlineKeyboardButton("✅ yes, delete it", callback_data=f"do_del_exp:{rid}"),
             InlineKeyboardButton("❌ cancel",          callback_data="view_expenses")]
        ]
        await query.edit_message_text("are you sure you want to delete this expense?", reply_markup=InlineKeyboardMarkup(keyboard))
        return

    if query.data.startswith('do_del_exp:'):
        rid     = query.data.split(":", 1)[1]
        payload = {"user": user, "note": "delete_expense", "row_id": rid}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.edit_message_text("✅ expense deleted!", reply_markup=home_keyboard())
        except:
            await query.edit_message_text("couldn't delete expense.", reply_markup=home_keyboard())
        return

    if query.data == 'show_groups':
        await query.edit_message_text("select a category group:", reply_markup=InlineKeyboardMarkup(build_group_keyboard()))
        return

    if query.data.startswith('exp_group:'):
        group_name = query.data.split(":", 1)[1]
        categories = EXPENSE_GROUPS.get(group_name, [])
        keyboard   = [[InlineKeyboardButton(cat, callback_data=f"expense_cat:{cat}")] for cat in categories]
        keyboard.append([InlineKeyboardButton("⬅️ back", callback_data="show_groups")])
        await query.edit_message_text(f"📂 *{group_name}*\npick a category:", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return

    if query.data.startswith('expense_cat:'):
        category = query.data.split(":", 1)[1]
        context.user_data['expense_category'] = category
        keyboard  = [[InlineKeyboardButton(acc, callback_data=f"exp_acc:{acc}")] for acc in ACCOUNT_TYPES]
        await query.edit_message_text(f"category: *{category}*\n\nwhich account?", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return

    if query.data.startswith('exp_acc:'):
        account = query.data.split(":", 1)[1]
        context.user_data['expense_account'] = account
        context.user_data['awaiting']        = 'expense_description'
        await query.edit_message_text(f"account: *{account}*\n\nshort description? (e.g. 'starbucks')", parse_mode='Markdown')
        return

        # ------------------------------------------------------------------ BUDGETS
    if query.data == 'view_budgets':
        payload = {"user": user, "note": "get_budgets"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            budgets  = []
            try:
                budgets = _json.loads(response.text)
            except:
                pass

            keyboard = [
                [InlineKeyboardButton("➕ set / update a budget", callback_data='set_budget_start')],
                [InlineKeyboardButton("🏠 home", callback_data='home')]
            ]

            if not budgets:
                await query.edit_message_text(
                    "📊 *Budget Tracker*\n\nno budgets set yet!\ntap below to add your first one.",
                    parse_mode='Markdown',
                    reply_markup=InlineKeyboardMarkup(keyboard)
                )
                return

            lines = ["📊 *Budget Tracker — Family Account*\n"]
            for b in sorted(budgets, key=lambda x: x['group']):
                group  = b['group']
                limit  = b['budget']
                spent  = b.get('spent', 0)
                pct    = int(spent / limit * 100) if limit > 0 else 0
                bar    = '█' * min(int(pct / 10), 10) + '░' * max(0, 10 - int(pct / 10))
                emoji  = '🚨' if spent > limit else '⚠️' if pct >= 80 else '✅'
                lines.append(f"{emoji} *{group}*\n   {bar} {pct}%\n   ${spent:.2f} / ${limit:.2f}")

            await query.edit_message_text(
                "\n\n".join(lines),
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
        except Exception as ex:
            await query.edit_message_text(f"couldn't load budgets. ({ex})", reply_markup=home_keyboard())
        return

    if query.data == 'set_budget_start':
        context.user_data.clear()
        # Show group picker using index-based callback to stay under 64-byte limit
        group_keys = list(EXPENSE_GROUPS.keys())
        keyboard   = []
        for i in range(0, len(group_keys), 2):
            row = [InlineKeyboardButton(group_keys[i], callback_data=f"budget_grp:{i}")]
            if i + 1 < len(group_keys):
                row.append(InlineKeyboardButton(group_keys[i + 1], callback_data=f"budget_grp:{i+1}"))
            keyboard.append(row)
        keyboard.append([InlineKeyboardButton("❌ cancel", callback_data='home')])
        await query.edit_message_text(
            "📊 *set a group budget*\n\nwhich category group?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return

    if query.data.startswith('budget_grp:'):
        try:
            idx        = int(query.data.split(":", 1)[1])
            group_name = list(EXPENSE_GROUPS.keys())[idx]
        except (ValueError, IndexError):
            await query.answer("something went wrong.", show_alert=True)
            return
        context.user_data['budget_group'] = group_name
        context.user_data['awaiting']     = 'budget_amount'
        # Show categories in this group for reference
        cats     = EXPENSE_GROUPS[group_name]
        cat_list = "\n".join([f"  · {c}" for c in cats])
        await query.edit_message_text(
            f"📂 *{group_name}*\n\n"
            f"_covers:_\n{cat_list}\n\n"
            f"what's the monthly budget for this group?\n(e.g. `500` for $500/month)",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ cancel", callback_data='home')]])
        )
        return
        

    # ------------------------------------------------------------------ FERTILITY
    if query.data == 'view_fertility':
        payload = {"user": user, "note": "get_fertility"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text     = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("🩸 log period start", callback_data='log_period_start'),
                 InlineKeyboardButton("⏹ log period end",   callback_data='log_period_end')],
                [InlineKeyboardButton("🥚 log ovulation",   callback_data='log_ovulation'),
                 InlineKeyboardButton("🌡 log symptoms",    callback_data='log_symptoms')],
                [InlineKeyboardButton("🏠 home",            callback_data='home')]
            ]
            display = text if text and text != "no_fertility" else "no fertility data yet. start logging below 🌸"
            await query.edit_message_text(display, reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("couldn't load fertility data.", reply_markup=home_keyboard())
        return

    if query.data == 'log_period_start':
        context.user_data['awaiting']       = 'fertility_date'
        context.user_data['fertility_type'] = 'Period Start'
        await query.edit_message_text("🩸 *log period start*\n\nwhat date?\n(e.g. '13 May' or '13/05/2026')", parse_mode='Markdown')
        return

    if query.data == 'log_period_end':
        context.user_data['awaiting']       = 'fertility_date'
        context.user_data['fertility_type'] = 'Period End'
        await query.edit_message_text("⏹ *log period end*\n\nwhat date?\n(e.g. '13 May' or '13/05/2026')", parse_mode='Markdown')
        return

    if query.data == 'log_ovulation':
        context.user_data['awaiting']       = 'fertility_date'
        context.user_data['fertility_type'] = 'Ovulation'
        await query.edit_message_text("🥚 *log ovulation*\n\nwhat date?\n(e.g. '13 May' or '13/05/2026')", parse_mode='Markdown')
        return

    if query.data == 'log_symptoms':
        keyboard = [[InlineKeyboardButton(s, callback_data=f"fertility_symptom:{s}")] for s in FERTILITY_SYMPTOMS]
        keyboard.append([InlineKeyboardButton("⬅️ back", callback_data="view_fertility")])
        await query.edit_message_text("🌡 *what are you experiencing today?*", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return

    if query.data.startswith('fertility_symptom:'):
        symptom = query.data.split(":", 1)[1]
        payload = {"user": user, "note": "add_fertility", "fertility_type": "Symptom", "fertility_date": "", "fertility_notes": symptom}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.edit_message_text(f"✅ symptom logged: *{symptom}*", parse_mode='Markdown', reply_markup=home_keyboard())
        except:
            await query.edit_message_text("couldn't save symptom.", reply_markup=home_keyboard())
        return

    # ------------------------------------------------------------------ BIRTHDAYS
    if query.data == 'view_birthdays':
        payload = {"user": user, "note": "get_birthdays"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            entries  = []
            try:
                entries = _json.loads(response.text)
            except:
                pass
            if not entries:
                await query.edit_message_text(
                    "no birthdays or anniversaries saved yet! 🎂\ntap *Add* to add one.",
                    parse_mode='Markdown',
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton("➕ add birthday/anniversary", callback_data='add_birthday')],
                        [InlineKeyboardButton("🏠 home", callback_data='home')]
                    ])
                )
                return
            today = _date.today()
            def days_away(e):
                try:
                    m, d = e['date'].split('-')
                    ev = _date(today.year, int(m), int(d))
                    if ev < today:
                        ev = _date(today.year + 1, int(m), int(d))
                    return (ev - today).days
                except:
                    return 999
            entries.sort(key=days_away)
            lines = ["🎂 *Birthdays & Anniversaries*\n"]
            for e in entries:
                diff = days_away(e)
                if diff == 0:   when = "Today! 🥳"
                elif diff == 1: when = "Tomorrow!"
                else:           when = f"In {diff} days"
                emoji = "🎂" if e.get('type') == 'Birthday' else "💍"
                try:
                    m, d = e['date'].split('-')
                    month_names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
                    date_label  = f"{month_names[int(m)-1]} {int(d)}"
                except:
                    date_label = e.get('date', '')
                age_str = ""
                if e.get('year'):
                    try:
                        ev_year = today.year if days_away(e) < 365 else today.year + 1
                        if e.get('type') == 'Birthday':
                            age_str = f" · turning {ev_year - int(e['year'])}"
                        else:
                            age_str = f" · {ev_year - int(e['year'])} years"
                    except:
                        pass
                line = f"{emoji} *{e['name']}* — {e['type']}\n   {when} · {date_label}{age_str}"
                if e.get('notes'):
                    line += f"\n   _{e['notes']}_"
                lines.append(line)
            await query.edit_message_text(
                "\n\n".join(lines),
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("➕ add birthday/anniversary", callback_data='add_birthday')],
                    [InlineKeyboardButton("🏠 home", callback_data='home')]
                ])
            )
        except Exception as ex:
            await query.edit_message_text(f"couldn't load birthdays. ({ex})", reply_markup=home_keyboard())
        return

    if query.data == 'add_birthday':
        context.user_data.clear()
        context.user_data['awaiting'] = 'bday_name'
        await query.edit_message_text(
            "🎂 *add birthday / anniversary*\n\nwhat's the person's name?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ cancel", callback_data='home')]])
        )
        return

    if query.data.startswith('bday_type:'):
        btype = query.data.split(":", 1)[1]
        context.user_data['bday_type'] = btype
        context.user_data['awaiting']  = 'bday_date'
        await query.edit_message_text(
            f"type: *{btype}*\n\n📅 what's the date?\nsend as *MM-DD* (e.g. `05-23` for 23 May)",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ cancel", callback_data='home')]])
        )
        return


    

    # ------------------------------------------------------------------ MEMORIES
    if query.data == 'view_memories':
        keyboard = [
            [InlineKeyboardButton("🕐 recent memories",  callback_data='memories_recent')],
            [InlineKeyboardButton("👤 browse by person", callback_data='memories_by_person')],
            [InlineKeyboardButton("➕ log a memory",     callback_data='add_memory')],
            [InlineKeyboardButton("🏠 home",              callback_data='home')]
        ]
        await query.edit_message_text(
            "💛 *Family Memories*\n\nwhat would you like to do?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return

    if query.data == 'memories_recent':
        payload = {"user": user, "note": "get_memories_recent"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            entries  = _json.loads(response.text)
            if not entries:
                await query.edit_message_text(
                    "💛 *Family Memories*\n\nno memories logged yet!\ntap below to add your first one. 🌟",
                    parse_mode='Markdown',
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton("➕ log a memory", callback_data='add_memory')],
                        [InlineKeyboardButton("⬅️ back",         callback_data='view_memories')]
                    ])
                )
                return
            lines = ["💛 *Recent Family Memories*\n"]
            for e in entries:
                emoji = "🏆" if "Milestone" in e['type'] else "💬" if "Quote" in e['type'] else "💛"
                lines.append(
                    f"{emoji} *{e['type'].split(' ',1)[-1]}* — {e['person']}\n"
                    f"   _{e['memory']}_\n"
                    f"   📅 {e['date']} · logged by {e['loggedBy']}"
                )
            await query.edit_message_text(
                "\n\n".join(lines),
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("➕ log a memory", callback_data='add_memory')],
                    [InlineKeyboardButton("⬅️ back",         callback_data='view_memories')],
                    [InlineKeyboardButton("🏠 home",          callback_data='home')]
                ])
            )
        except Exception as ex:
            await query.edit_message_text(f"couldn't load memories. ({ex})", reply_markup=home_keyboard())
        return

    if query.data == 'memories_by_person':
        keyboard = [[InlineKeyboardButton(m, callback_data=f"memories_person:{m}")] for m in FAMILY_MEMBERS]
        keyboard.append([InlineKeyboardButton("⬅️ back", callback_data='view_memories')])
        await query.edit_message_text("👤 *whose memories?*", parse_mode='Markdown', reply_markup=InlineKeyboardMarkup(keyboard))
        return

    if query.data.startswith('memories_person:'):
        person  = query.data.split(":", 1)[1]
        payload = {"user": user, "note": "get_memories_by_person", "person": person}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            entries  = _json.loads(response.text)
            if not entries:
                await query.edit_message_text(
                    f"💛 *{person}'s Memories*\n\nno memories logged for {person} yet!",
                    parse_mode='Markdown',
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton("➕ log a memory", callback_data='add_memory')],
                        [InlineKeyboardButton("⬅️ back",         callback_data='memories_by_person')]
                    ])
                )
                return
            lines = [f"💛 *{person}'s Memories*\n"]
            for e in entries:
                emoji = "🏆" if "Milestone" in e['type'] else "💬" if "Quote" in e['type'] else "💛"
                lines.append(
                    f"{emoji} *{e['type'].split(' ',1)[-1]}*\n"
                    f"   _{e['memory']}_\n"
                    f"   📅 {e['date']} · logged by {e['loggedBy']}"
                )
            await query.edit_message_text(
                "\n\n".join(lines),
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("➕ log a memory", callback_data='add_memory')],
                    [InlineKeyboardButton("⬅️ back",         callback_data='memories_by_person')],
                    [InlineKeyboardButton("🏠 home",          callback_data='home')]
                ])
            )
        except Exception as ex:
            await query.edit_message_text(f"couldn't load memories. ({ex})", reply_markup=home_keyboard())
        return

    if query.data == 'add_memory':
        context.user_data.clear()
        context.user_data['awaiting'] = 'memory_type'
        keyboard = [[InlineKeyboardButton(t, callback_data=f"memory_type:{t}")] for t in MEMORY_TYPES]
        keyboard.append([InlineKeyboardButton("❌ cancel", callback_data='view_memories')])
        await query.edit_message_text(
            "💛 *log a memory*\n\nwhat kind of memory is this?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return

    if query.data.startswith('memory_type:'):
        mtype = query.data.split(":", 1)[1]
        context.user_data['memory_type'] = mtype
        context.user_data.pop('awaiting', None)
        keyboard = [[InlineKeyboardButton(m, callback_data=f"memory_person:{m}")] for m in FAMILY_MEMBERS]
        keyboard.append([InlineKeyboardButton("❌ cancel", callback_data='view_memories')])
        await query.edit_message_text(
            f"type: *{mtype}*\n\nwho is this memory about?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return

    if query.data.startswith('memory_person:'):
        person = query.data.split(":", 1)[1]
        context.user_data['memory_person'] = person
        context.user_data['awaiting']      = 'memory_text'
        await query.edit_message_text(
            f"about: *{person}*\n\n✏️ write the memory:\n_(e.g. 'Mikaela said her first full sentence today!')_",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ cancel", callback_data='view_memories')]])
        )
        return

    # ------------------------------------------------------------------ MEAL PLANNER
    if query.data == 'view_meals':
        keyboard = [
            [InlineKeyboardButton("📅 view meal plan", callback_data='meals_view')],
            [InlineKeyboardButton("➕ plan a meal",    callback_data='meals_add_start')],
            [InlineKeyboardButton("🏠 home",           callback_data='home')]
        ]
        await query.edit_message_text(
            "🍽 *Meal Planner*\n\nwhat would you like to do?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return

    if query.data == 'meals_view':
        context.user_data['awaiting'] = 'meals_view_days'
        await query.edit_message_text(
            "🍽 *View Meal Plan*\n\nhow many days ahead? (e.g. `3`, `7`, `14`)",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ cancel", callback_data='view_meals')]])
        )
        return

    if query.data == 'meals_add_start':
        context.user_data.clear()
        context.user_data['meal_plan'] = []
        context.user_data['awaiting']  = 'meal_days_count'
        await query.edit_message_text(
            "🍽 *Plan Meals*\n\nhow many days would you like to plan for? (e.g. `3`, `7`)",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ cancel", callback_data='view_meals')]])
        )
        return

    if query.data.startswith('meal_toggle_type:'):
        mtype    = query.data.split(":", 1)[1]
        selected = context.user_data.get('meal_day_types', [])
        if mtype in selected:
            selected.remove(mtype)
        else:
            selected.append(mtype)
        context.user_data['meal_day_types'] = selected
        day_label = context.user_data.get('meal_current_day_label', '')
        keyboard  = []
        for mt in MEAL_TYPES:
            checked = "✅" if mt in selected else "⬜"
            keyboard.append([InlineKeyboardButton(f"{checked} {mt}", callback_data=f"meal_toggle_type:{mt}")])
        keyboard.append([InlineKeyboardButton(
            f"➡️ confirm ({len(selected)} selected)" if selected else "➡️ confirm",
            callback_data='meal_confirm_types'
        )])
        keyboard.append([InlineKeyboardButton("❌ cancel", callback_data='view_meals')])
        await query.edit_message_text(
            f"📅 *{day_label}*\n\nwhich meals are you planning?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return

    if query.data == 'meal_confirm_types':
        selected = context.user_data.get('meal_day_types', [])
        if not selected:
            await query.answer("please select at least one meal!", show_alert=True)
            return
        context.user_data['meal_types_queue'] = [m for m in MEAL_TYPES if m in selected]
        context.user_data['meal_types_done']  = []
        context.user_data.pop('meal_day_types', None)
        context.user_data['awaiting'] = 'meal_dish_name'
        next_meal = context.user_data['meal_types_queue'][0]
        day_label = context.user_data.get('meal_current_day_label', '')
        await query.edit_message_text(
            f"📅 *{day_label} — {next_meal}*\n\nwhat's the dish?\n_(e.g. 'chicken rice', 'pasta')_\ntype `skip` to leave blank.",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ cancel", callback_data='view_meals')]])
        )
        return

    if query.data == 'meal_ingredients_yes':
        missing = context.user_data.pop('meal_missing_ingredients', [])
        if missing:
            requests.post(GOOGLE_SCRIPT_URL, json={
                "user":        user,
                "note":        "add_meal_ingredients",
                "ingredients": ",".join(missing)
            }, timeout=10)
        context.user_data.pop('meal_pending_check', None)
        await _meal_next_day_or_finish(query, context, user)
        return

    if query.data == 'meal_ingredients_no':
        context.user_data.pop('meal_missing_ingredients', None)
        context.user_data.pop('meal_pending_check', None)
        await _meal_next_day_or_finish(query, context, user)
        return

    # FALLBACK
    await query.edit_message_text(f"'{query.data}' is not set up yet.", reply_markup=home_keyboard())


# --- MESSAGE HANDLER ---
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user     = update.message.from_user.first_name
    text     = update.message.text.strip()
    awaiting = context.user_data.get('awaiting')

    # FRUIT
    if awaiting == 'fruit_qty':
        fruit = context.user_data.pop('selected_fruit', '')
        context.user_data.pop('awaiting', None)
        if text.isdigit():
            payload  = {"user": user, "note": f"-fruits {fruit} {text}"}
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await update.message.reply_text(response.text)
        else:
            await update.message.reply_text("please send a valid number.")
        return

    # CALENDAR FLOW
    if awaiting == 'event_title':
        context.user_data['event_title'] = text
        context.user_data['awaiting']    = 'event_date'
        await update.message.reply_text("📆 what date?\n(e.g. '15 Jun' or '15/06/2026')")
        return

    if awaiting == 'event_date':
        context.user_data['event_date'] = text
        context.user_data['awaiting']   = 'event_time'
        await update.message.reply_text(
            "🕐 what time?\n"
            "• Single time: '3pm' or '14:30'\n"
            "• Time range: '10.30am to 11.15am' or '2pm-3.30pm'\n"
            "• Type 'skip' for all-day"
        )
        return

    if awaiting == 'event_time':
        raw_time = text if text.lower() != 'skip' else ''
        if raw_time:
            start_time, end_time = parse_time_range(raw_time)
        else:
            start_time, end_time = '', ''
        context.user_data['event_time']     = start_time
        context.user_data['event_end_time'] = end_time
        context.user_data['awaiting']       = 'event_notes'
        await update.message.reply_text("📝 any notes?\ntype 'skip' to leave blank")
        return

    if awaiting == 'event_notes':
        notes    = text if text.lower() != 'skip' else ''
        title    = context.user_data.pop('event_title', '')
        date     = context.user_data.pop('event_date', '')
        time_str = context.user_data.pop('event_time', '')
        end_time = context.user_data.pop('event_end_time', '')
        context.user_data.pop('awaiting', None)
        payload = {
            "user": user, "note": "add_event",
            "event_title": title, "event_date": date,
            "event_time": time_str, "event_end_time": end_time,
            "event_notes": notes
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            time_display = time_str
            if end_time:
                time_display = f"{time_str} – {end_time}"
            elif not time_str:
                time_display = "all day"
            await update.message.reply_text(
                f"✅ event added!\n\n📅 *{title}*\n📆 {date} {time_display}\n📝 {notes or '—'}".strip(),
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the event.")
        return

    # EXPENSE FLOW
    if awaiting == 'expense_amount':
        try:
            amount = float(text.replace('$', '').replace(',', ''))
            context.user_data['expense_amount'] = amount
            context.user_data.pop('awaiting', None)
            await update.message.reply_text("select a category group:", reply_markup=InlineKeyboardMarkup(build_group_keyboard()))
        except ValueError:
            await update.message.reply_text("please enter a valid amount (e.g. '24.50')")
        return

    if awaiting == 'expense_description':
        context.user_data['expense_description'] = text
        context.user_data['awaiting']            = 'expense_date'
        await update.message.reply_text("📅 what date was this expense?\n(e.g. '14 May')\ntype 'today' for today's date")
        return

    if awaiting == 'expense_date':
        expense_date = text if text.lower() != 'today' else ''
        amount       = context.user_data.pop('expense_amount', 0)
        category     = context.user_data.pop('expense_category', 'Other')
        account      = context.user_data.pop('expense_account', 'Family')
        description  = context.user_data.pop('expense_description', '')
        context.user_data.pop('awaiting', None)
        payload = {
            "user": user, "note": "add_expense",
            "expense_amount": amount, "expense_category": category,
            "expense_account": account, "expense_description": description,
            "expense_date": expense_date
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            date_display = expense_date if expense_date else "today"
            await update.message.reply_text(
                f"✅ expense logged!\n\n💰 *${amount:.2f}*\n🏷 {category}\n🏦 {account}\n📝 {description}\n📅 {date_display}",
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the expense.")
        return

    # TO-DO FLOW
    if awaiting == 'todo_task':
        context.user_data['todo_task'] = text
        context.user_data.pop('awaiting', None)
        keyboard = [[InlineKeyboardButton(m, callback_data=f"todo_assign:{m}")] for m in FAMILY_MEMBERS]
        await update.message.reply_text(
            f"📋 task: *{text}*\n\nwho is this for?",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        return

    if awaiting == 'todo_due':
        due      = text if text.lower() != 'skip' else ''
        task     = context.user_data.pop('todo_task', '')
        assignee = context.user_data.pop('todo_assignee', 'Everyone')
        context.user_data.pop('awaiting', None)
        payload  = {
            "user": user, "note": "add_todo",
            "todo_task": task, "todo_assignee": assignee,
            "todo_due": due, "todo_added_by": user
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            due_text = f"\n📅 due: {due}" if due else ""
            await update.message.reply_text(
                f"✅ task added!\n\n📋 *{task}*\n👤 assigned to: {assignee}{due_text}",
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the task.")
        return

    # FERTILITY FLOW
    if awaiting == 'fertility_date':
        fertility_type = context.user_data.pop('fertility_type', '')
        context.user_data.pop('awaiting', None)
        payload = {"user": user, "note": "add_fertility", "fertility_type": fertility_type, "fertility_date": text, "fertility_notes": ""}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            emoji = "🩸" if "Period" in fertility_type else "🥚"
            await update.message.reply_text(f"✅ logged!\n\n{emoji} *{fertility_type}*\n📆 {text}", parse_mode='Markdown')
        except:
            await update.message.reply_text("couldn't save. please try again.")
        return

    # BIRTHDAY FLOW
    if awaiting == 'bday_name':
        context.user_data['bday_name'] = text.strip()
        context.user_data.pop('awaiting', None)
        keyboard = [[InlineKeyboardButton(t, callback_data=f"bday_type:{t}")] for t in BIRTHDAY_TYPES]
        keyboard.append([InlineKeyboardButton("❌ cancel", callback_data='home')])
        await update.message.reply_text(
            f"name: *{text.strip()}*\n\nwhat type?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return

    if awaiting == 'bday_date':
        raw = text.strip()
        if not re.match(r'^\d{2}-\d{2}$', raw):
            await update.message.reply_text("please use MM-DD format, e.g. `05-23`.", parse_mode='Markdown')
            return
        try:
            m_part, d_part = raw.split('-')
            _dt(2000, int(m_part), int(d_part))
        except ValueError:
            await update.message.reply_text("that doesn't look like a valid date. try again (MM-DD).")
            return
        context.user_data['bday_date'] = raw
        context.user_data['awaiting']  = 'bday_year'
        await update.message.reply_text(
            "what year were they born / married?\nthis lets me calculate age or years together.\nsend the year (e.g. `1990`) or type `skip`.",
            parse_mode='Markdown'
        )
        return

    if awaiting == 'bday_year':
        if text.strip().lower() == 'skip':
            context.user_data['bday_year'] = ''
        else:
            try:
                yr = int(text.strip())
                if yr < 1900 or yr > _date.today().year:
                    raise ValueError
                context.user_data['bday_year'] = str(yr)
            except ValueError:
                await update.message.reply_text("please enter a valid year (e.g. `1990`) or type `skip`.", parse_mode='Markdown')
                return
        context.user_data['awaiting'] = 'bday_notes'
        await update.message.reply_text("any notes? (e.g. gift ideas, favourite cake)\ntype `skip` to leave blank.", parse_mode='Markdown')
        return

    if awaiting == 'bday_notes':
        notes   = '' if text.strip().lower() == 'skip' else text.strip()
        name    = context.user_data.pop('bday_name', '')
        btype   = context.user_data.pop('bday_type', 'Birthday')
        bdate   = context.user_data.pop('bday_date', '')
        byear   = context.user_data.pop('bday_year', '')
        context.user_data.pop('awaiting', None)
        payload = {
            "user": user, "note": "add_birthday",
            "name": name, "type": btype, "date": bdate,
            "year": byear, "notes": notes, "addedBy": user
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            month_names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
            m_p, d_p    = bdate.split('-')
            date_pretty = f"{month_names[int(m_p)-1]} {int(d_p)}"
            year_part   = f" ({byear})" if byear else ""
            await update.message.reply_text(
                f"✅ saved!\n\n"
                f"{'🎂' if btype == 'Birthday' else '💍'} *{name}* — {btype}\n"
                f"📅 {date_pretty}{year_part}"
                + (f"\n📝 {notes}" if notes else ""),
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save. please try again.")
        return

    # BUDGET FLOW
    # BUDGET FLOW
    if awaiting == 'budget_amount':
        try:
            amount = float(text.replace('$', '').replace(',', ''))
            if amount <= 0:
                raise ValueError
        except ValueError:
            await update.message.reply_text("please enter a valid amount (e.g. `500`).", parse_mode='Markdown')
            return
        group = context.user_data.pop('budget_group', '')
        context.user_data.pop('awaiting', None)
        payload = {
            "user":   user,
            "note":   "set_budget",
            "group":  group,
            "budget": amount
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            cats     = EXPENSE_GROUPS.get(group, [])
            cat_list = "\n".join([f"  · {c}" for c in cats])
            await update.message.reply_text(
                f"✅ budget set!\n\n📊 *{group}*\n💰 ${amount:.2f} / month\n\n"
                f"_covers:_\n{cat_list}\n\n"
                f"you'll be notified at 80% and 100%.",
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the budget. please try again.")
        return

    # MEMORY FLOW
    if awaiting == 'memory_text':
        context.user_data['memory_text'] = text.strip()
        context.user_data['awaiting']    = 'memory_date'
        await update.message.reply_text(
            "📅 when did this happen?\n(e.g. `14 May` or `14/05/2026`)\ntype `today` for today.",
            parse_mode='Markdown'
        )
        return

    if awaiting == 'memory_date':
        memory_date   = '' if text.strip().lower() == 'today' else text.strip()
        memory_text   = context.user_data.pop('memory_text',  '')
        memory_type   = context.user_data.pop('memory_type',  '💛 Moment')
        memory_person = context.user_data.pop('memory_person','Everyone')
        context.user_data.pop('awaiting', None)
        payload = {
            "user":          user,
            "note":          "add_memory",
            "memory_type":   memory_type,
            "memory_person": memory_person,
            "memory_text":   memory_text,
            "memory_date":   memory_date
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            emoji        = "🏆" if "Milestone" in memory_type else "💬" if "Quote" in memory_type else "💛"
            date_display = memory_date if memory_date else "today"
            await update.message.reply_text(
                f"✅ memory saved!\n\n"
                f"{emoji} *{memory_type.split(' ',1)[-1]}* — {memory_person}\n"
                f"_{memory_text}_\n"
                f"📅 {date_display}",
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the memory. please try again.")
        return

    # MEAL PLANNER — view days
    if awaiting == 'meals_view_days':
        try:
            days = int(text.strip())
            if days < 1 or days > 30:
                raise ValueError
        except ValueError:
            await update.message.reply_text("please enter a number between 1 and 30.")
            return
        context.user_data.pop('awaiting', None)
        payload  = {"user": user, "note": "get_meal_plan", "days": days}
        response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
        try:
            entries = _json.loads(response.text)
        except:
            entries = []
        if not entries:
            await update.message.reply_text(
                f"🍽 *Meal Plan — next {days} day{'s' if days != 1 else ''}*\n\nnothing planned yet!",
                parse_mode='Markdown'
            )
            return
        grouped = OrderedDict()
        for e in entries:
            grouped.setdefault(e['date'], []).append(e)
        meal_emojis = {"Breakfast": "🌅", "Lunch": "☀️", "Dinner": "🌙"}
        lines = [f"🍽 *Meal Plan — next {days} day{'s' if days != 1 else ''}*\n"]
        for date_label, meals in grouped.items():
            lines.append(f"📅 *{date_label}*")
            for m in meals:
                emoji = meal_emojis.get(m['meal'], "🍽")
                dish  = m['dish'] if m['dish'] else "—"
                lines.append(f"  {emoji} {m['meal']}: {dish}")
            lines.append("")
        await update.message.reply_text("\n".join(lines).strip(), parse_mode='Markdown')
        return

    # MEAL PLANNER — how many days to plan
    if awaiting == 'meal_days_count':
        try:
            days = int(text.strip())
            if days < 1 or days > 14:
                raise ValueError
        except ValueError:
            await update.message.reply_text("please enter a number between 1 and 14.")
            return
        context.user_data.pop('awaiting', None)
        from datetime import timezone, timedelta
        SGT   = timezone(timedelta(hours=8))
        today = _dt.now(SGT).date()          # ← SGT-aware today
        days_queue = []
        for i in range(days):
            d     = today + timedelta(days=i)
            label = d.strftime("%-d %b") + (" (Today)" if i == 0 else f" ({d.strftime('%A')})")
            days_queue.append((d.strftime("%-d %b %Y"), label))
        days_queue = []
        for i in range(days):
            d     = today + timedelta(days=i)
            label = d.strftime("%-d %b") + (" (Today)" if i == 0 else f" ({d.strftime('%A')})")
            days_queue.append((d.strftime("%-d %b %Y"), label))
        context.user_data['meal_days_queue']        = days_queue[1:]
        first_date, first_label                     = days_queue[0]
        context.user_data['meal_current_day']       = first_date
        context.user_data['meal_current_day_label'] = first_label
        context.user_data['meal_day_types']         = []
        context.user_data['meal_plan']              = []
        keyboard = []
        for mt in MEAL_TYPES:
            keyboard.append([InlineKeyboardButton(f"⬜ {mt}", callback_data=f"meal_toggle_type:{mt}")])
        keyboard.append([InlineKeyboardButton("➡️ confirm (0 selected)", callback_data='meal_confirm_types')])
        keyboard.append([InlineKeyboardButton("❌ cancel", callback_data='view_meals')])
        await update.message.reply_text(
            f"📅 *{first_label}*\n\nwhich meals are you planning for this day?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return

    # MEAL PLANNER — dish name
    if awaiting == 'meal_dish_name':
        dish         = '' if text.strip().lower() == 'skip' else text.strip()
        queue        = context.user_data.get('meal_types_queue', [])
        done         = context.user_data.get('meal_types_done', [])
        day_label    = context.user_data.get('meal_current_day_label', '')
        current_meal = queue.pop(0)
        done.append({'meal': current_meal, 'dish': dish})
        context.user_data['meal_types_queue'] = queue
        context.user_data['meal_types_done']  = done
        if queue:
            next_meal = queue[0]
            await update.message.reply_text(
                f"📅 *{day_label} — {next_meal}*\n\nwhat's the dish?\ntype `skip` to leave blank.",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ cancel", callback_data='view_meals')]])
            )
            return
        context.user_data['awaiting'] = 'meal_ingredients'
        all_dishes = ", ".join([d['dish'] for d in done if d['dish']]) or "—"
        await update.message.reply_text(
            f"📅 *{day_label}* — meals set!\n\n"
            f"dishes: _{all_dishes}_\n\n"
            f"any ingredients to note?\n_(e.g. `chicken, broccoli, garlic`)_\ntype `skip` to leave blank.",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("❌ cancel", callback_data='view_meals')]])
        )
        return

    # MEAL PLANNER — ingredients
    if awaiting == 'meal_ingredients':
        ingredients = '' if text.strip().lower() == 'skip' else text.strip()
        done        = context.user_data.get('meal_types_done', [])
        day_date    = context.user_data.get('meal_current_day', '')
        day_label   = context.user_data.get('meal_current_day_label', '')
        for entry in done:
            requests.post(GOOGLE_SCRIPT_URL, json={
                "user":             user,
                "note":             "add_meal",
                "meal_date":        day_date,
                "meal_type":        entry['meal'],
                "meal_dish":        entry['dish'],
                "meal_ingredients": ingredients
            }, timeout=10)
        plan = context.user_data.get('meal_plan', [])
        plan.append({'date': day_date, 'label': day_label, 'meals': done, 'ingredients': ingredients})
        context.user_data['meal_plan']       = plan
        context.user_data['meal_types_done'] = []
        context.user_data.pop('awaiting', None)
        if ingredients:
            check_resp = requests.post(GOOGLE_SCRIPT_URL, json={
                "user":        user,
                "note":        "check_meal_ingredients",
                "ingredients": ingredients
            }, timeout=10)
            try:
                missing = _json.loads(check_resp.text)
            except:
                missing = []
            if missing:
                context.user_data['meal_missing_ingredients'] = missing
                missing_str = "\n".join([f"  • {m}" for m in missing])
                await update.message.reply_text(
                    f"🛒 *Missing from grocery list:*\n\n{missing_str}\n\nadd these to the grocery list?",
                    parse_mode='Markdown',
                    reply_markup=InlineKeyboardMarkup([
                        [InlineKeyboardButton("✅ yes, add them", callback_data='meal_ingredients_yes'),
                         InlineKeyboardButton("❌ no thanks",     callback_data='meal_ingredients_no')]
                    ])
                )
                return
        days_queue = context.user_data.get('meal_days_queue', [])
        if not days_queue:
            plan  = context.user_data.get('meal_plan', [])
            total = sum(len(d.get('meals', [])) for d in plan)
            context.user_data.clear()
            await update.message.reply_text(
                f"✅ *Meal plan saved!*\n\n🍽 {total} meal{'s' if total != 1 else ''} planned across {len(plan)} day{'s' if len(plan) != 1 else ''}.",
                parse_mode='Markdown',
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("📅 view meal plan", callback_data='meals_view')],
                    [InlineKeyboardButton("🏠 home",           callback_data='home')]
                ])
            )
            return
        next_date, next_label = days_queue.pop(0)
        context.user_data['meal_days_queue']        = days_queue
        context.user_data['meal_current_day']       = next_date
        context.user_data['meal_current_day_label'] = next_label
        context.user_data['meal_day_types']         = []
        keyboard = []
        for mt in MEAL_TYPES:
            keyboard.append([InlineKeyboardButton(f"⬜ {mt}", callback_data=f"meal_toggle_type:{mt}")])
        keyboard.append([InlineKeyboardButton("➡️ confirm (0 selected)", callback_data='meal_confirm_types')])
        keyboard.append([InlineKeyboardButton("❌ cancel", callback_data='view_meals')])
        await update.message.reply_text(
            f"📅 *{next_label}*\n\nwhich meals are you planning for this day?",
            parse_mode='Markdown',
            reply_markup=InlineKeyboardMarkup(keyboard)
        )
        return

    # DEFAULT
    payload  = {"user": user, "note": text}
    response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
    await update.message.reply_text(response.text)


# --- PHOTO HANDLER ---
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user        = update.message.from_user.first_name
    photo_file  = await update.message.photo[-1].get_file()
    image_bytes = await photo_file.download_as_bytearray()
    payload     = {
        "user": user, "note": update.message.caption or "",
        "fileData": base64.b64encode(image_bytes).decode('utf-8'),
        "fileName": f"{user}_{photo_file.file_id}.jpg"
    }
    response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=15)
    await update.message.reply_text(response.text)


# --- NOTIFICATION HANDLER ---
async def handle_notify(notify_type: str, data: dict):
    if notify_type == "morning_digest":
        await send_to_all(data.get("message", ""))
    elif notify_type == "expense_summary":
        await send_to_all(f"💰 *Wong Family — Monthly Expense Summary*\n\n{data.get('message', '')}")
    elif notify_type == "expense_report":
        await send_to_all(f"📊 *Wong Family — Last Month's Full Report*\n\n{data.get('message', '')}")
    elif notify_type == "birthday_reminder":
        await send_to_all(data.get("message", ""))
    elif notify_type == "budget_alert":
        await send_to_all(data.get("message", ""))
    elif notify_type == "fertile_soon":
        await send_to_all(f"🌸 *Fertile Window in 3 Days*\n\n🗓 *{data.get('fertile_start')} – {data.get('fertile_end')}*\n\nPlan accordingly 💕")
    elif notify_type == "fertile_tomorrow":
        await send_to_all(f"🌸 *Fertile Window Starts Tomorrow!*\n\n🗓 *{data.get('fertile_start')} – {data.get('fertile_end')}*\n\nYou've got this! 💕")
    elif notify_type == "period_due":
        await send_to_all(f"🩸 *Period Due Soon*\n\nEstimated next period: *{data.get('next_period')}*\nMake sure you're prepared! 🌺")


# --- BUILD APPLICATION ---
application = ApplicationBuilder().token(TOKEN).build()
application.add_handler(CommandHandler("start", start))
application.add_handler(CommandHandler("help", help_command))
application.add_handler(CallbackQueryHandler(button_handler))
application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
application.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))

loop = asyncio.new_event_loop()

async def start_bot():
    await application.initialize()
    await application.start()
    await application.bot.set_webhook(f"{RAILWAY_URL}/")
    print("✅ Wong Family bot initialized + webhook registered")

def start_bot_loop():
    asyncio.set_event_loop(loop)
    loop.run_until_complete(start_bot())
    loop.run_forever()

def watchdog():
    while True:
        time.sleep(60)
        if not bot_thread.is_alive():
            print("⚠️ Bot thread died — restarting")
            new_thread = threading.Thread(target=start_bot_loop, daemon=True)
            new_thread.start()

bot_thread      = threading.Thread(target=start_bot_loop, daemon=True)
bot_thread.start()
watchdog_thread = threading.Thread(target=watchdog, daemon=True)
watchdog_thread.start()
time.sleep(2)


# --- FLASK ---
app = Flask(__name__)

@app.route('/dashboard', methods=['GET'])
def dashboard():
    return send_file('templates/dashboard.html')


def _gas_post(payload, timeout=15):
    return requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=timeout)


@app.route('/dashboard-data', methods=['GET'])
def dashboard_data():
    tasks = {
        "expenses":    {"user": "dashboard", "note": "get_expenses_raw"},
        "events":      {"user": "dashboard", "note": "get_events"},
        "todos":       {"user": "dashboard", "note": "get_todos_by_person"},
        "groceries":   {"user": "dashboard", "note": "get_checklist"},
        "fertility":   {"user": "dashboard", "note": "get_fertility"},
        "kid_Mikaela": {"user": "dashboard", "note": "get_kid_calendar", "kid_name": "Mikaela"},
        "kid_Meaghan": {"user": "dashboard", "note": "get_kid_calendar", "kid_name": "Meaghan"},
        "kid_Eleanor": {"user": "dashboard", "note": "get_kid_calendar", "kid_name": "Eleanor"},
        "birthdays":   {"user": "dashboard", "note": "get_birthdays_dashboard"},
        "budgets":     {"user": "dashboard", "note": "get_budgets"},
        "memories":    {"user": "dashboard", "note": "get_memories_dashboard"},
        "meals":       {"user": "dashboard", "note": "get_meal_plan_dashboard"},
    }

    results = {}
    with ThreadPoolExecutor(max_workers=12) as executor:
        future_to_key = {executor.submit(_gas_post, payload): key for key, payload in tasks.items()}
        for future in as_completed(future_to_key):
            key = future_to_key[future]
            try:
                results[key] = future.result()
            except Exception as exc:
                print(f"GAS fetch failed [{key}]: {exc}")
                results[key] = None

    def safe_text(key):
        r = results.get(key)
        return r.text.strip() if r and r.ok else ''

    try:
        # EXPENSES
        exp_text = safe_text("expenses")
        try:
            rows = _json.loads(exp_text) if exp_text else []
        except:
            rows = []
        expenses = {"month_total": 0, "entry_count": len(rows), "by_category": {}, "by_person": {}, "recent": rows}
        for r in rows:
            expenses['month_total'] += r.get('amount', 0)
            cat    = r.get('category', 'Other')
            person = r.get('account', 'unknown')
            expenses['by_category'][cat]  = expenses['by_category'].get(cat, 0)  + r.get('amount', 0)
            expenses['by_person'][person] = expenses['by_person'].get(person, 0) + r.get('amount', 0)

        # CALENDAR
        cal_raw = safe_text("events")
        events  = []
        if cal_raw and cal_raw != "no_events":
            blocks = cal_raw.split('\n\n')
            for block in blocks:
                lines = block.strip().split('\n')
                if len(lines) >= 2:
                    title    = lines[0].replace('📅','').replace('*','').strip()
                    detail   = lines[1].strip()
                    parts    = detail.split('·')
                    date_str = parts[0].strip() if len(parts) > 0 else '—'
                    time_str = parts[1].strip() if len(parts) > 1 else '—'
                    combined = ' '.join(lines).lower()
                    tags = [m for m in FAMILY_MEMBERS if m != 'Everyone' and m.lower() in combined]
                    if title and 'upcoming' not in title.lower():
                        events.append({"title": title, "date": date_str, "time": time_str, "tags": tags})

        # TO-DO
        todo_raw = safe_text("todos")
        todos_by_person = {}
        if todo_raw and todo_raw != "no_todos":
            try:
                todos_by_person = _json.loads(todo_raw)
            except:
                todos_by_person = {}

        # GROCERY
        groc_raw  = safe_text("groceries")
        groceries = []
        if groc_raw:
            for item in groc_raw.split(','):
                item = item.strip()
                if item:
                    groceries.append({"name": item})

        # FERTILITY
        fert_raw  = safe_text("fertility")
        fertility = {}
        if fert_raw and fert_raw != "no_fertility":
            for line in fert_raw.split('\n'):
                line = line.strip().replace('*','')
                if 'last period start:' in line.lower():
                    fertility['last_period_start'] = line.split(':',1)[1].strip()
                elif 'next period' in line.lower():
                    fertility['next_period'] = line.split(':',1)[1].strip()
                elif 'fertile window' in line.lower():
                    fertility['fertile_window'] = line.split(':',1)[1].strip()
                elif 'last ovulation' in line.lower():
                    fertility['last_ovulation'] = line.split(':',1)[1].strip()
                elif 'duration' in line.lower():
                    fertility['duration'] = line.split(':',1)[1].strip().replace(' days','').strip()

        # KIDS CALENDAR
        kids_calendar = {}
        for kid in ['Mikaela', 'Meaghan', 'Eleanor']:
            kid_raw    = safe_text(f"kid_{kid}")
            kid_events = []
            if kid_raw and kid_raw != "no_kid_events":
                for block in kid_raw.split('\n\n'):
                    block_lines = block.strip().split('\n')
                    if len(block_lines) >= 2:
                        t        = block_lines[0].replace('📅','').replace('*','').strip()
                        detail   = block_lines[1].strip()
                        bparts   = detail.split('·')
                        date_str = bparts[0].strip() if len(bparts) > 0 else '—'
                        time_str = bparts[1].strip() if len(bparts) > 1 else '—'
                        if t and 'upcoming' not in t.lower():
                            kid_events.append({"title": t, "date": date_str, "time": time_str})
            kids_calendar[kid] = kid_events

        # BIRTHDAYS
        bd_raw    = safe_text("birthdays")
        birthdays = []
        if bd_raw:
            try:
                birthdays = _json.loads(bd_raw)
            except:
                birthdays = []

        # BUDGETS
        bdg_raw = safe_text("budgets")
        budgets = []
        if bdg_raw:
            try:
                budgets = _json.loads(bdg_raw)
            except:
                budgets = []

        # MEMORIES
        mem_raw  = safe_text("memories")
        memories = []
        if mem_raw:
            try:
                memories = _json.loads(mem_raw)
            except:
                memories = []

        # MEAL PLAN
        meals_raw = safe_text("meals")
        meals     = []
        if meals_raw:
            try:
                meals = _json.loads(meals_raw)
            except:
                meals = []

        return _json.dumps({
            "expenses":        expenses,
            "events":          events,
            "todos_by_person": todos_by_person,
            "groceries":       groceries,
            "fertility":       fertility,
            "kids_calendar":   kids_calendar,
            "birthdays":       birthdays,
            "budgets":         budgets,
            "memories":        memories,
            "meals":           meals,
        }), 200, {'Content-Type': 'application/json'}

    except Exception as e:
        print(f"DASHBOARD ERROR: {e}")
        return _json.dumps({"error": str(e)}), 500, {'Content-Type': 'application/json'}


@app.route('/', methods=['GET'])
def healthcheck():
    return "ok", 200

@app.route('/', methods=['POST'])
def webhook():
    try:
        data = request.get_json(silent=True)
        if not data:
            return "ignored", 200
        future = asyncio.run_coroutine_threadsafe(
            application.process_update(Update.de_json(data, application.bot)), loop
        )
        future.result(timeout=30)
        return "ok", 200
    except Exception as e:
        print(f"WEBHOOK ERROR: {e}")
        return "ok", 200

@app.route('/notify', methods=['POST'])
def notify():
    try:
        data        = request.get_json(silent=True)
        notify_type = data.get("type", "")
        future      = asyncio.run_coroutine_threadsafe(handle_notify(notify_type, data), loop)
        future.result(timeout=30)
        return "ok", 200
    except Exception as e:
        print(f"NOTIFY ERROR: {e}")
        return "error", 200

@app.route('/set_webhook', methods=['GET'])
def set_webhook():
    url      = f"https://api.telegram.org/bot{TOKEN}/setWebhook"
    response = requests.post(url, json={"url": f"{RAILWAY_URL}/"})
    return response.json()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
