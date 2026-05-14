import os
import asyncio
import threading
import requests
import base64
import time
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
    486455062,   # wife
    # 987654321, # husband — uncomment and add ID when ready
]

KIDS = ["Mikaela", "Meaghan"]

EXPENSE_GROUPS = {
    "👶 Children": ["Children - Books", "Children - Enrichment", "Children - School", "Children - Toys", "Mikaela - Sailing"],
    "👕 Clothing": ["Clothing - Accessories", "Clothing - Clothes", "Clothing - Shoes"],
    "🍽 Eating Out": ["Eating Out - Beverages", "Eating Out - Breakfast", "Eating Out - Dinner", "Eating Out - Lunch", "Eating Out - Snacks"],
    "📚 Education": ["Education - Books", "Education - Courses & Enrichment", "Education - Subscription"],
    "🎭 Entertainment": ["Entertainment - Experiences", "Entertainment - Massage", "Entertainment - Subscriptions", "Entertainment - Objects (toys, etc)"],
    "🎁 Gifts/Giving": ["Gifts & Treats - CNY", "Gifts & Treats - Family", "Gifts & Treats - Friends", "Gifts & Treats - Wedding", "Giving - Church", "Giving - Charity", "Giving - Parents"],
    "🏥 Health": ["Health & Fitness - Dental + Medical", "Health & Fitness - Events + Subscription", "Health & Fitness - Equipment + Supplements"],
    "🏠 Household": ["Household - Appliances", "Household - Groceries", "Household - Helper", "Household - Household Misc", "Household - Renovation", "Household - Utilities (electric, gas, water)", "Household - Internet", "Utilities - Mobile"],
    "🐾 Pets": ["Pets - Pet Food", "Pets - Grooming", "Pets - Pet Misc"],
    "🚗 Transport": ["Transportation - Bus/MRT", "Transportation - Taxi/Grab", "Transportation - Auto: Service", "Transportation - Auto: Loan", "Transportation - Auto: Gas"],
    "📈 Finance/Tax": ["Business", "Electronics", "Endowment", "Insurance", "Investing", "Taxes - Income Tax", "Taxes - Property Tax"],
    "🌍 Others": ["Holiday", "Misc", "Missions"]
}

ACCOUNT_TYPES      = ["👤 Personal", "👨‍👩‍👧‍👦 Family"]
FERTILITY_SYMPTOMS = ["🤢 Nausea", "💧 Spotting", "😴 Fatigue", "🤕 Cramps", "😤 Mood swings", "🌡 Hot flashes", "💊 Medication taken", "✅ None"]

KIDS_ENTRY_TYPES = ["📚 Homework", "📅 School Event", "🎓 Tuition", "📝 Test/Exam", "🏆 Results", "📌 Other"]
RESULT_SUBJECTS  = ["English", "Math", "Science", "Chinese", "Humanities", "Art", "PE", "Other"]


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

def home_keyboard():
    return InlineKeyboardMarkup([[InlineKeyboardButton("🏠 home", callback_data='home')]])

async def send_to_all(text, parse_mode='Markdown'):
    for chat_id in NOTIFY_CHAT_IDS:
        try:
            await application.bot.send_message(chat_id=chat_id, text=text, parse_mode=parse_mode)
        except Exception as e:
            print(f"Failed to send to {chat_id}: {e}")


# --- HOME ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("📝 log activity",     callback_data='log_activity'),
         InlineKeyboardButton("🛒 grocery list",     callback_data='view_groceries')],
        [InlineKeyboardButton("🍎 check fridge",     callback_data='check_fridge'),
         InlineKeyboardButton("🍽 log eating fruit", callback_data='eat_fruit')],
        [InlineKeyboardButton("📅 family calendar",  callback_data='view_calendar'),
         InlineKeyboardButton("💰 expenses",         callback_data='view_expenses')],
        [InlineKeyboardButton("✅ to-do list",        callback_data='view_todos'),
         InlineKeyboardButton("🌸 fertility",        callback_data='view_fertility')],
        [InlineKeyboardButton("👧 kids tracker",     callback_data='view_kids')],
        [InlineKeyboardButton("📊 view dashboard",   url=f"{RAILWAY_URL}/dashboard")]
    ]
    text = "welcome to the *Wong Family* dashboard! 🏠\nwhat would you like to do today?"
    if update.message:
        await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
    else:
        await update.callback_query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')


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

    # ------------------------------------------------------------------ ACTIVITY
    if query.data == 'log_activity':
        context.user_data['awaiting'] = 'activity'
        await query.edit_message_text("simply type your activity (e.g., 'run 5km') and I'll log it!")
        return

    # ------------------------------------------------------------------ CALENDAR
    if query.data == 'view_calendar':
        payload = {"user": user, "note": "get_events"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text     = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("➕ add event", callback_data='add_event')],
                [InlineKeyboardButton("🏠 home",      callback_data='home')]
            ]
            display = text if text and text != "no_events" else "no upcoming events! add one below 📅"
            await query.edit_message_text(display, reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("couldn't load calendar.", reply_markup=home_keyboard())
        return

    if query.data == 'add_event':
        context.user_data['awaiting'] = 'event_title'
        await query.edit_message_text(
            "📅 *add a new event*\n\nwhat's the event called?\n(e.g. 'dentist appointment')",
            parse_mode='Markdown'
        )
        return

    # ------------------------------------------------------------------ EXPENSES
    if query.data == 'view_expenses':
        payload = {"user": user, "note": "get_expenses"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text     = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("➕ add expense", callback_data='add_expense')],
                [InlineKeyboardButton("🏠 home",        callback_data='home')]
            ]
            display = text if text and text != "no_expenses" else "no expenses logged yet!"
            await query.edit_message_text(display, reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("couldn't load expenses.", reply_markup=home_keyboard())
        return

    if query.data == 'add_expense':
        context.user_data['awaiting'] = 'expense_amount'
        await query.edit_message_text("💰 *add an expense*\nhow much did you spend? (e.g. 24.50)", parse_mode='Markdown')
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

    # ------------------------------------------------------------------ TO-DO
    if query.data == 'view_todos':
        payload = {"user": user, "note": "get_todos"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text     = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("➕ add shared task",  callback_data='add_todo_shared'),
                 InlineKeyboardButton("➕ add my task",      callback_data='add_todo_personal')],
                [InlineKeyboardButton("✅ complete a task",  callback_data='complete_todo')],
                [InlineKeyboardButton("🏠 home",             callback_data='home')]
            ]
            display = text if text and text != "no_todos" else "no tasks yet! add one below ✅"
            await query.edit_message_text(display, reply_markup=InlineKeyboardMarkup(keyboard))
        except:
            await query.edit_message_text("couldn't load to-do list.", reply_markup=home_keyboard())
        return

    if query.data == 'add_todo_shared':
        context.user_data['awaiting']  = 'todo_task'
        context.user_data['todo_type'] = 'Shared'
        await query.edit_message_text("✅ *add a shared task*\n\nwhat needs to be done?", parse_mode='Markdown')
        return

    if query.data == 'add_todo_personal':
        context.user_data['awaiting']  = 'todo_task'
        context.user_data['todo_type'] = 'Personal'
        await query.edit_message_text("✅ *add a personal task*\n\nwhat do you need to do?", parse_mode='Markdown')
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
                    tid, task, owner = parts[0], parts[1], parts[2]
                    keyboard.append([InlineKeyboardButton(f"✅ {task} ({owner})", callback_data=f"done_todo:{tid}")])
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

    # ------------------------------------------------------------------ KIDS TRACKER
    if query.data == 'view_kids':
        keyboard = [
            [InlineKeyboardButton(f"👧 {KIDS[0]}", callback_data=f"kid_menu:{KIDS[0]}"),
             InlineKeyboardButton(f"👧 {KIDS[1]}", callback_data=f"kid_menu:{KIDS[1]}")],
            [InlineKeyboardButton("🏠 home", callback_data='home')]
        ]
        await query.edit_message_text("👧 *kids tracker*\n\nwhich child?", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return

    if query.data.startswith('kid_menu:'):
        kid  = query.data.split(":", 1)[1]
        payload = {"user": user, "note": "get_kid_summary", "kid_name": kid}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            summary  = response.text.strip() or f"no entries yet for {kid}."
        except:
            summary = f"couldn't load {kid}'s data."
        keyboard = [
            [InlineKeyboardButton("➕ add entry",      callback_data=f"kid_add:{kid}"),
             InlineKeyboardButton("📋 view all",       callback_data=f"kid_view:{kid}")],
            [InlineKeyboardButton("⬅️ back",           callback_data="view_kids")]
        ]
        await query.edit_message_text(
            f"👧 *{kid}*\n\n{summary}",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        return

    if query.data.startswith('kid_add:'):
        kid = query.data.split(":", 1)[1]
        context.user_data['kid_name'] = kid
        keyboard = [[InlineKeyboardButton(t, callback_data=f"kid_type:{t}")] for t in KIDS_ENTRY_TYPES]
        keyboard.append([InlineKeyboardButton("⬅️ back", callback_data=f"kid_menu:{kid}")])
        await query.edit_message_text(
            f"➕ *add entry for {kid}*\n\nwhat type?",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )
        return

    if query.data.startswith('kid_type:'):
        entry_type = query.data.split(":", 1)[1]
        kid        = context.user_data.get('kid_name', '')
        context.user_data['kid_entry_type'] = entry_type

        if entry_type == "🏆 Results":
            # Pick subject first
            keyboard = [[InlineKeyboardButton(s, callback_data=f"kid_subject:{s}")] for s in RESULT_SUBJECTS]
            keyboard.append([InlineKeyboardButton("⬅️ back", callback_data=f"kid_add:{kid}")])
            await query.edit_message_text(f"📝 *{kid} — Results*\n\nwhich subject?", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        else:
            context.user_data['awaiting'] = 'kid_title'
            await query.edit_message_text(
                f"*{kid} — {entry_type}*\n\nwhat's the title or description?\n(e.g. 'Math homework chapter 5')",
                parse_mode='Markdown'
            )
        return

    if query.data.startswith('kid_subject:'):
        subject = query.data.split(":", 1)[1]
        context.user_data['kid_subject'] = subject
        context.user_data['awaiting']    = 'kid_result_score'
        kid = context.user_data.get('kid_name', '')
        await query.edit_message_text(
            f"*{kid} — {subject}*\n\nwhat was the score?\n(e.g. '85/100' or 'A')",
            parse_mode='Markdown'
        )
        return

    if query.data.startswith('kid_view:'):
        kid     = query.data.split(":", 1)[1]
        payload = {"user": user, "note": "get_kid_full", "kid_name": kid}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text     = response.text.strip() or f"no entries yet for {kid}."
        except:
            text = "couldn't load entries."
        keyboard = [[InlineKeyboardButton("⬅️ back", callback_data=f"kid_menu:{kid}")]]
        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')
        return

    # FALLBACK
    await query.edit_message_text(f"'{query.data}' is not set up yet.", reply_markup=home_keyboard())


# --- MESSAGE HANDLER ---
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user     = update.message.from_user.first_name
    text     = update.message.text.strip()
    awaiting = context.user_data.get('awaiting')

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

    if awaiting == 'activity':
        context.user_data.pop('awaiting', None)
        payload  = {"user": user, "note": text}
        response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
        await update.message.reply_text(response.text)
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
        await update.message.reply_text("🕐 what time? (e.g. '3pm')\ntype 'skip' for all-day")
        return

    if awaiting == 'event_time':
        context.user_data['event_time'] = text if text.lower() != 'skip' else ''
        context.user_data['awaiting']   = 'event_notes'
        await update.message.reply_text("📝 any notes?\ntype 'skip' to leave blank")
        return

    if awaiting == 'event_notes':
        notes = text if text.lower() != 'skip' else ''
        title = context.user_data.pop('event_title', '')
        date  = context.user_data.pop('event_date', '')
        time  = context.user_data.pop('event_time', '')
        context.user_data.pop('awaiting', None)
        payload = {"user": user, "note": "add_event", "event_title": title, "event_date": date, "event_time": time, "event_notes": notes}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await update.message.reply_text(f"✅ event added!\n\n📅 *{title}*\n📆 {date} {time}\n📝 {notes or '—'}".strip(), parse_mode='Markdown')
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
        amount   = context.user_data.pop('expense_amount', 0)
        category = context.user_data.pop('expense_category', 'Other')
        account  = context.user_data.pop('expense_account', 'Family')
        context.user_data.pop('awaiting', None)
        payload  = {"user": user, "note": "add_expense", "expense_amount": amount, "expense_category": category, "expense_account": account, "expense_description": text, "expense_paid_by": user}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await update.message.reply_text(f"✅ expense logged!\n\n💰 *${amount:.2f}*\n🏷 {category}\n🏦 {account}\n📝 {text}\n👤 paid by {user}", parse_mode='Markdown')
        except:
            await update.message.reply_text("couldn't save the expense.")
        return

    # TO-DO FLOW
    if awaiting == 'todo_task':
        context.user_data['todo_task'] = text
        context.user_data['awaiting']  = 'todo_due'
        await update.message.reply_text(f"📋 task: *{text}*\n\nany due date? (e.g. '20 May')\ntype 'skip' for none", parse_mode='Markdown')
        return

    if awaiting == 'todo_due':
        due       = text if text.lower() != 'skip' else ''
        task      = context.user_data.pop('todo_task', '')
        todo_type = context.user_data.pop('todo_type', 'Shared')
        context.user_data.pop('awaiting', None)
        payload   = {"user": user, "note": "add_todo", "todo_task": task, "todo_type": todo_type, "todo_due": due, "todo_owner": user}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            due_text = f"\n📅 due: {due}" if due else ""
            await update.message.reply_text(f"✅ task added!\n\n📋 *{task}*\n👤 {todo_type} · added by {user}{due_text}", parse_mode='Markdown')
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

    # KIDS FLOW
    if awaiting == 'kid_title':
        kid        = context.user_data.get('kid_name', '')
        entry_type = context.user_data.get('kid_entry_type', '')
        context.user_data['kid_title'] = text
        context.user_data['awaiting']  = 'kid_date'
        await update.message.reply_text(f"📆 what date?\n(e.g. '15 Jun')\ntype 'skip' if not applicable")
        return

    if awaiting == 'kid_date':
        context.user_data['kid_date'] = text if text.lower() != 'skip' else ''
        context.user_data['awaiting'] = 'kid_notes'
        await update.message.reply_text("📝 any notes?\ntype 'skip' to leave blank")
        return

    if awaiting == 'kid_notes':
        kid        = context.user_data.pop('kid_name', '')
        entry_type = context.user_data.pop('kid_entry_type', '')
        title      = context.user_data.pop('kid_title', '')
        date       = context.user_data.pop('kid_date', '')
        notes      = text if text.lower() != 'skip' else ''
        context.user_data.pop('awaiting', None)
        payload = {
            "user": user, "note": "add_kid_entry",
            "kid_name": kid, "entry_type": entry_type,
            "entry_title": title, "entry_date": date,
            "entry_notes": notes, "entry_score": ""
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await update.message.reply_text(
                f"✅ logged for *{kid}*!\n\n{entry_type}\n📋 {title}\n📆 {date or '—'}\n📝 {notes or '—'}",
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the entry.")
        return

    if awaiting == 'kid_result_score':
        kid     = context.user_data.get('kid_name', '')
        subject = context.user_data.pop('kid_subject', '')
        context.user_data['kid_score']  = text
        context.user_data['kid_title']  = subject
        context.user_data['awaiting']   = 'kid_result_notes'
        await update.message.reply_text(f"📝 any notes for {subject}?\ntype 'skip' to leave blank")
        return

    if awaiting == 'kid_result_notes':
        kid     = context.user_data.pop('kid_name', '')
        subject = context.user_data.pop('kid_title', '')
        score   = context.user_data.pop('kid_score', '')
        notes   = text if text.lower() != 'skip' else ''
        context.user_data.pop('awaiting', None)
        context.user_data.pop('kid_entry_type', None)
        payload = {
            "user": user, "note": "add_kid_entry",
            "kid_name": kid, "entry_type": "🏆 Results",
            "entry_title": subject, "entry_date": "",
            "entry_notes": notes, "entry_score": score
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await update.message.reply_text(
                f"✅ result logged for *{kid}*!\n\n📚 {subject}\n🏆 Score: *{score}*\n📝 {notes or '—'}",
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the result.")
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
    elif notify_type == "fertile_soon":
        await send_to_all(f"🌸 *Fertile Window in 3 Days*\n\n🗓 *{data.get('fertile_start')} – {data.get('fertile_end')}*\n\nPlan accordingly 💕")
    elif notify_type == "fertile_tomorrow":
        await send_to_all(f"🌸 *Fertile Window Starts Tomorrow!*\n\n🗓 *{data.get('fertile_start')} – {data.get('fertile_end')}*\n\nYou've got this! 💕")
    elif notify_type == "period_due":
        await send_to_all(f"🩸 *Period Due Soon*\n\nEstimated next period: *{data.get('next_period')}*\nMake sure you're prepared! 🌺")


# --- BUILD APPLICATION ---
application = ApplicationBuilder().token(TOKEN).build()
application.add_handler(CommandHandler("start", start))
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

bot_thread = threading.Thread(target=start_bot_loop, daemon=True)
bot_thread.start()

watchdog_thread = threading.Thread(target=watchdog, daemon=True)
watchdog_thread.start()

time.sleep(2)

# --- FLASK ---
app = Flask(__name__)

# Serve the dashboard HTML
@app.route('/dashboard', methods=['GET'])
def dashboard():
    return send_file('templates/dashboard.html')

# API endpoint — fetches all data from Apps Script and returns JSON
@app.route('/dashboard-data', methods=['GET'])
def dashboard_data():
    try:
        # ---- EXPENSES ----
        exp_res = requests.post(GOOGLE_SCRIPT_URL, json={"user": "dashboard", "note": "get_expenses"}, timeout=15)
        exp_raw = exp_res.text.strip()

        expenses = {"month_total": 0, "entry_count": 0, "by_category": {}, "by_person": {}, "recent": []}
        if exp_raw and exp_raw != "no_expenses":
            lines = exp_raw.split('\n')
            in_category = False; in_person = False; in_recent = False
            for line in lines:
                line = line.strip()
                if 'total:' in line.lower():
                    try:
                        expenses['month_total'] = float(line.replace('*','').split('$')[1].strip())
                    except: pass
                if '*by category:*' in line: in_category=True; in_person=False; in_recent=False; continue
                if '*by person:*'   in line: in_person=True; in_category=False; in_recent=False; continue
                if '*recent entries:*' in line: in_recent=True; in_category=False; in_person=False; continue
                if in_category and line.startswith('  '):
                    parts = line.strip().rsplit('$', 1)
                    if len(parts) == 2:
                        try: expenses['by_category'][parts[0].strip()] = float(parts[1].strip())
                        except: pass
                if in_person and line.startswith('  '):
                    parts = line.strip().split(':')
                    if len(parts) == 2:
                        try: expenses['by_person'][parts[0].strip()] = float(parts[1].replace('$','').strip())
                        except: pass
                if in_recent and line.startswith('  '):
                    # Try splitting on Unicode middle dot · (U+00B7)
                    parts = [p.strip() for p in line.strip().split('\u00b7')]
                    if len(parts) < 3:
                        # Fallback: try regular dot-space
                        parts = [p.strip() for p in line.strip().split(' · ')]
                    if len(parts) >= 3:
                        try:
                            expenses['recent'].append({
                                "date":     parts[0],
                                "amount":   parts[1].replace('$','').strip(),
                                "category": parts[2],
                                "desc":     parts[3] if len(parts) > 3 else '—',
                                "paid_by":  parts[4] if len(parts) > 4 else '—'
                            })
                            expenses['entry_count'] += 1
                        except: pass        
    


        # ---- CALENDAR ----
        cal_res = requests.post(GOOGLE_SCRIPT_URL, json={"user": "dashboard", "note": "get_events"}, timeout=15)
        cal_raw = cal_res.text.strip()
        events  = []
        if cal_raw and cal_raw != "no_events":
            blocks = cal_raw.split('\n\n')
            for block in blocks:
                lines = block.strip().split('\n')
                if len(lines) >= 2:
                    title    = lines[0].replace('📅','').replace('*','').strip()
                    detail   = lines[1].strip() if len(lines) > 1 else ''
                    parts    = detail.split('·')
                    date_str = parts[0].strip() if len(parts) > 0 else '—'
                    time_str = parts[1].strip() if len(parts) > 1 else '—'
                    if title and '📅' not in title and 'upcoming' not in title.lower():
                        events.append({"title": title, "date": date_str, "time": time_str})

        # ---- TO-DO ----
        todo_res = requests.post(GOOGLE_SCRIPT_URL, json={"user": "dashboard", "note": "get_todos"}, timeout=15)
        todo_raw = todo_res.text.strip()
        todos    = []
        if todo_raw and todo_raw != "no_todos":
            for line in todo_raw.split('\n'):
                line = line.strip()
                if line.startswith('•'):
                    # format: • task · due dd MMM (owner)
                    content = line[1:].strip()
                    owner   = ''
                    if '(' in content and content.endswith(')'):
                        owner   = content[content.rfind('(')+1:-1]
                        content = content[:content.rfind('(')].strip()
                    due = ''
                    if '· due' in content:
                        parts   = content.split('· due')
                        content = parts[0].strip()
                        due     = parts[1].strip() if len(parts) > 1 else ''
                    # determine type from section
                    todos.append({"task": content, "type": "Shared", "due": due, "owner": owner, "status": "Open"})

        # ---- GROCERY ----
        groc_res = requests.post(GOOGLE_SCRIPT_URL, json={"user": "dashboard", "note": "get_checklist"}, timeout=15)
        groc_raw = groc_res.text.strip()
        groceries = []
        if groc_raw:
            for item in groc_raw.split(','):
                item = item.strip()
                if item:
                    groceries.append({"name": item, "added_by": "—"})

        # ---- FERTILITY ----
        fert_res = requests.post(GOOGLE_SCRIPT_URL, json={"user": "dashboard", "note": "get_fertility"}, timeout=15)
        fert_raw = fert_res.text.strip()
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

        # ---- KIDS ----
        kids = {}
        for kid in ['Mikaela', 'Meaghan']:
            kid_res = requests.post(GOOGLE_SCRIPT_URL, json={"user": "dashboard", "note": "get_kid_full", "kid_name": kid}, timeout=15)
            kid_raw = kid_res.text.strip()
            entries = []
            if kid_raw and 'no entries' not in kid_raw.lower():
                for line in kid_raw.split('\n'):
                    line = line.strip()
                    if line.startswith('•'):
                        content = line[1:].strip()
                        # format: type · title · score (date)
                        date_part = ''
                        if '(' in content and content.endswith(')'):
                            date_part = content[content.rfind('(')+1:-1]
                            content   = content[:content.rfind('(')].strip()
                        parts = [p.strip() for p in content.split('·')]
                        entries.append({
                            "type":  parts[0] if len(parts) > 0 else '—',
                            "title": parts[1] if len(parts) > 1 else '—',
                            "score": parts[2] if len(parts) > 2 else '',
                            "date":  date_part
                        })
            kids[kid] = entries

        return jsonify({
            "expenses":  expenses,
            "events":    events,
            "todos":     todos,
            "groceries": groceries,
            "fertility": fertility,
            "kids":      kids
        })

    except Exception as e:
        print(f"DASHBOARD ERROR: {e}")
        return jsonify({"error": str(e)}), 500
        
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
