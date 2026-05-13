from flask import Flask
from threading import Thread
import os
import requests
import base64
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, CommandHandler, CallbackQueryHandler, ContextTypes

# --- 1. CONFIGURATION ---
TOKEN = os.environ.get('TELEGRAM_TOKEN')
GOOGLE_SCRIPT_URL = os.environ.get('GOOGLE_SCRIPT_URL')
SHEET_URL = "https://docs.google.com/spreadsheets/d/17TywVuHWmldWATzmarvkMYdInnatgX-jb46ipuCt0_I"

# Grouped Expense Categories
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

ACCOUNT_TYPES = ["👤 Personal", "👨‍👩‍👧‍👦 Family"]

FERTILITY_SYMPTOMS = ["🤢 Nausea", "💧 Spotting", "😴 Fatigue", "🤕 Cramps", "😤 Mood swings", "🌡 Hot flashes", "💊 Medication taken", "✅ None"]


# --- HELPER: build group picker keyboard ---
def build_group_keyboard():
    keyboard = []
    group_keys = list(EXPENSE_GROUPS.keys())
    for i in range(0, len(group_keys), 2):
        row = [InlineKeyboardButton(group_keys[i], callback_data=f"exp_group:{group_keys[i]}")]
        if i + 1 < len(group_keys):
            row.append(InlineKeyboardButton(group_keys[i + 1], callback_data=f"exp_group:{group_keys[i + 1]}"))
        keyboard.append(row)
    return keyboard


# --- 2. HOME SCREEN (START) ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [
            InlineKeyboardButton("📝 log activity", callback_data='log_activity'),
            InlineKeyboardButton("🛒 grocery list", callback_data='view_groceries')
        ],
        [
            InlineKeyboardButton("🍎 check fridge", callback_data='check_fridge'),
            InlineKeyboardButton("🍽 log eating fruit", callback_data='eat_fruit')
        ],
        [
            InlineKeyboardButton("📅 family calendar", callback_data='view_calendar'),
            InlineKeyboardButton("💰 expenses", callback_data='view_expenses')
        ],
        [
            InlineKeyboardButton("✅ to-do list", callback_data='view_todos'),
            InlineKeyboardButton("🌸 fertility", callback_data='view_fertility')
        ],
        [
            InlineKeyboardButton("📊 view dashboard", url=SHEET_URL),
        ],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    text = "welcome to the m.generations dashboard! 🏠\nwhat would you like to do today?"
    if update.message:
        await update.message.reply_text(text, reply_markup=reply_markup)
    else:
        await update.callback_query.edit_message_text(text, reply_markup=reply_markup)


# --- 3. BUTTON CLICK HANDLER ---
async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    # ------------------------------------------------------------------ EXISTING
    if query.data == 'log_activity':
        await query.edit_message_text(text="simply type your activity (e.g., 'run 5km') and I'll log it!")

    elif query.data == 'view_groceries':
        payload = {"user": query.from_user.first_name, "note": "get_checklist"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            items = response.text.split(",") if response.text else []
            if not items or items[0] == "":
                await query.edit_message_text(text="nothing to buy right now! 🛒")
                return
            keyboard = [[InlineKeyboardButton(f"✅ {i}", callback_data=f"check_item:{i}")] for i in items if i.strip()]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text(text="tap an item to mark it as bought:", reply_markup=reply_markup)
        except:
            await query.edit_message_text(text="couldn't fetch the checklist.")

    elif query.data.startswith('check_item:'):
        item_name = query.data.split(":", 1)[1]
        payload = {"user": query.from_user.first_name, "note": f"bought {item_name}"}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.answer(f"marked {item_name} as bought!")
            await start(update, context)
        except:
            await query.answer("failed to update sheet.")

    elif query.data == 'check_fridge':
        payload = {"user": query.from_user.first_name, "note": "check fridge"}
        response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
        await query.edit_message_text(text=response.text)

    elif query.data == 'eat_fruit':
        payload = {"user": query.from_user.first_name, "note": "get_fruit_list"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            fruits = response.text.split(",") if response.text else []
            keyboard = [[InlineKeyboardButton(f, callback_data=f"select_fruit:{f}")] for f in fruits if f.strip()]
            if not keyboard:
                await query.edit_message_text(text="the fridge is empty of fruit! 🧊")
            else:
                reply_markup = InlineKeyboardMarkup(keyboard)
                await query.edit_message_text(text="what did you eat? 🍎", reply_markup=reply_markup)
        except:
            await query.edit_message_text(text="error connecting to fridge data.")

    elif query.data.startswith('select_fruit:'):
        fruit_name = query.data.split(":", 1)[1]
        context.user_data['selected_fruit'] = fruit_name
        await query.edit_message_text(text=f"how many {fruit_name}s did you have? (type the number)")

    # ------------------------------------------------------------------ CALENDAR
    elif query.data == 'view_calendar':
        payload = {"user": query.from_user.first_name, "note": "get_events"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("➕ add event", callback_data='add_event')],
                [InlineKeyboardButton("🏠 home", callback_data='home')]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            display = text if text and text != "no_events" else "no upcoming events! add one below 📅"
            await query.edit_message_text(text=display, reply_markup=reply_markup)
        except:
            await query.edit_message_text(text="couldn't load calendar. try again.")

    elif query.data == 'add_event':
        context.user_data['awaiting'] = 'event_title'
        await query.edit_message_text(
            text="📅 *add a new event*\n\nwhat's the event called?\n(e.g. 'dentist appointment')",
            parse_mode='Markdown'
        )

    # ------------------------------------------------------------------ EXPENSES
    elif query.data == 'view_expenses':
        payload = {"user": query.from_user.first_name, "note": "get_expenses"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("➕ add expense", callback_data='add_expense')],
                [InlineKeyboardButton("🏠 home", callback_data='home')]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            display = text if text and text != "no_expenses" else "no expenses logged yet! add one below 💰"
            await query.edit_message_text(text=display, reply_markup=reply_markup)
        except:
            await query.edit_message_text(text="couldn't load expenses. try again.")

    elif query.data == 'add_expense':
        context.user_data['awaiting'] = 'expense_amount'
        await query.edit_message_text(
            text="💰 *add an expense*\nhow much did you spend? (e.g. 24.50)",
            parse_mode='Markdown'
        )

    elif query.data == 'show_groups':
        keyboard = build_group_keyboard()
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text(text="select a category group:", reply_markup=reply_markup)

    elif query.data.startswith('exp_group:'):
        group_name = query.data.split(":", 1)[1]
        categories = EXPENSE_GROUPS.get(group_name, [])
        keyboard = [[InlineKeyboardButton(cat, callback_data=f"expense_cat:{cat}")] for cat in categories]
        keyboard.append([InlineKeyboardButton("⬅️ back", callback_data="show_groups")])
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text(
            text=f"📂 *{group_name}*\npick a specific category:",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )

    elif query.data.startswith('expense_cat:'):
        category = query.data.split(":", 1)[1]
        context.user_data['expense_category'] = category
        keyboard = [[InlineKeyboardButton(acc, callback_data=f"exp_acc:{acc}")] for acc in ACCOUNT_TYPES]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text(
            text=f"category: *{category}*\n\nwhich account?",
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )

    elif query.data.startswith('exp_acc:'):
        account = query.data.split(":", 1)[1]
        context.user_data['expense_account'] = account
        context.user_data['awaiting'] = 'expense_description'
        await query.edit_message_text(
            text=f"account: *{account}*\n\nshort description? (e.g. 'starbucks')",
            parse_mode='Markdown'
        )

    # ------------------------------------------------------------------ TO-DO LIST
    elif query.data == 'view_todos':
        payload = {"user": query.from_user.first_name, "note": "get_todos"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("➕ add shared task", callback_data='add_todo_shared'),
                 InlineKeyboardButton("➕ add my task", callback_data='add_todo_personal')],
                [InlineKeyboardButton("✅ complete a task", callback_data='complete_todo')],
                [InlineKeyboardButton("🏠 home", callback_data='home')]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            display = text if text and text != "no_todos" else "no tasks yet! add one below ✅"
            await query.edit_message_text(text=display, reply_markup=reply_markup)
        except:
            await query.edit_message_text(text="couldn't load to-do list. try again.")

    elif query.data == 'add_todo_shared':
        context.user_data['awaiting'] = 'todo_task'
        context.user_data['todo_type'] = 'Shared'
        await query.edit_message_text(text="✅ *add a shared task*\n\nwhat needs to be done?", parse_mode='Markdown')

    elif query.data == 'add_todo_personal':
        context.user_data['awaiting'] = 'todo_task'
        context.user_data['todo_type'] = 'Personal'
        await query.edit_message_text(text="✅ *add a personal task*\n\nwhat do you need to do?", parse_mode='Markdown')

    elif query.data == 'complete_todo':
        payload = {"user": query.from_user.first_name, "note": "get_todo_list"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            raw = response.text.strip()
            if not raw or raw == "no_todos":
                await query.edit_message_text(text="no open tasks to complete! 🎉")
                return
            # Format: "id|task|owner" comma separated
            items = [i.strip() for i in raw.split("||") if i.strip()]
            keyboard = []
            for item in items:
                parts = item.split("|")
                if len(parts) >= 3:
                    tid, task, owner = parts[0], parts[1], parts[2]
                    label = f"✅ {task} ({owner})"
                    keyboard.append([InlineKeyboardButton(label, callback_data=f"done_todo:{tid}")])
            keyboard.append([InlineKeyboardButton("⬅️ back", callback_data="view_todos")])
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text(text="tap a task to mark it done:", reply_markup=reply_markup)
        except:
            await query.edit_message_text(text="couldn't load tasks.")

    elif query.data.startswith('done_todo:'):
        tid = query.data.split(":", 1)[1]
        payload = {"user": query.from_user.first_name, "note": "complete_todo", "todo_id": tid}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.answer("task marked done! 🎉")
            await start(update, context)
        except:
            await query.answer("couldn't update task.")

    # ------------------------------------------------------------------ FERTILITY
    elif query.data == 'view_fertility':
        payload = {"user": query.from_user.first_name, "note": "get_fertility"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            text = response.text.strip()
            keyboard = [
                [InlineKeyboardButton("🩸 log period start", callback_data='log_period_start'),
                 InlineKeyboardButton("⏹ log period end", callback_data='log_period_end')],
                [InlineKeyboardButton("🥚 log ovulation", callback_data='log_ovulation'),
                 InlineKeyboardButton("🌡 log symptoms", callback_data='log_symptoms')],
                [InlineKeyboardButton("🏠 home", callback_data='home')]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            display = text if text and text != "no_fertility" else "no fertility data yet. start logging below 🌸"
            await query.edit_message_text(text=display, reply_markup=reply_markup)
        except:
            await query.edit_message_text(text="couldn't load fertility data. try again.")

    elif query.data == 'log_period_start':
        context.user_data['awaiting'] = 'fertility_date'
        context.user_data['fertility_type'] = 'Period Start'
        await query.edit_message_text(
            text="🩸 *log period start*\n\nwhat date did your period start?\n(e.g. '13 May' or '13/05/2026')",
            parse_mode='Markdown'
        )

    elif query.data == 'log_period_end':
        context.user_data['awaiting'] = 'fertility_date'
        context.user_data['fertility_type'] = 'Period End'
        await query.edit_message_text(
            text="⏹ *log period end*\n\nwhat date did your period end?\n(e.g. '13 May' or '13/05/2026')",
            parse_mode='Markdown'
        )

    elif query.data == 'log_ovulation':
        context.user_data['awaiting'] = 'fertility_date'
        context.user_data['fertility_type'] = 'Ovulation'
        await query.edit_message_text(
            text="🥚 *log ovulation*\n\nwhat date did you notice ovulation signs?\n(e.g. '13 May' or '13/05/2026')",
            parse_mode='Markdown'
        )

    elif query.data == 'log_symptoms':
        keyboard = [
            [InlineKeyboardButton(s, callback_data=f"fertility_symptom:{s}")] for s in FERTILITY_SYMPTOMS
        ]
        keyboard.append([InlineKeyboardButton("⬅️ back", callback_data="view_fertility")])
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text(text="🌡 *what are you experiencing today?*", reply_markup=reply_markup, parse_mode='Markdown')

    elif query.data.startswith('fertility_symptom:'):
        symptom = query.data.split(":", 1)[1]
        payload = {
            "user": query.from_user.first_name,
            "note": "add_fertility",
            "fertility_type": "Symptom",
            "fertility_date": "",
            "fertility_notes": symptom
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.edit_message_text(
                text=f"✅ symptom logged: *{symptom}*",
                parse_mode='Markdown'
            )
        except:
            await query.edit_message_text(text="couldn't save symptom.")

    # ------------------------------------------------------------------ HOME
    elif query.data == 'home':
        context.user_data.clear()
        await start(update, context)


# --- 4. MULTI-STEP TEXT FLOW ---
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    text = update.message.text.strip()
    awaiting = context.user_data.get('awaiting')

    # ------------------------------------------------------------------ FRUIT
    if 'selected_fruit' in context.user_data:
        fruit = context.user_data.pop('selected_fruit')
        if text.isdigit():
            payload = {"user": user, "note": f"-fruits {fruit} {text}"}
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
            await update.message.reply_text(response.text)
        else:
            await update.message.reply_text("please send a valid number.")
        return

    # ------------------------------------------------------------------ CALENDAR FLOW
    if awaiting == 'event_title':
        context.user_data['event_title'] = text
        context.user_data['awaiting'] = 'event_date'
        await update.message.reply_text("📆 what date is the event?\n(e.g. '15 Jun' or '15/06/2025')")
        return

    if awaiting == 'event_date':
        context.user_data['event_date'] = text
        context.user_data['awaiting'] = 'event_time'
        await update.message.reply_text("🕐 what time? (e.g. '3pm' or '15:00')\ntype 'skip' if no specific time")
        return

    if awaiting == 'event_time':
        context.user_data['event_time'] = text if text.lower() != 'skip' else ''
        context.user_data['awaiting'] = 'event_notes'
        await update.message.reply_text("📝 any notes?\ntype 'skip' to leave blank")
        return

    if awaiting == 'event_notes':
        notes = text if text.lower() != 'skip' else ''
        title = context.user_data.pop('event_title', '')
        date = context.user_data.pop('event_date', '')
        time = context.user_data.pop('event_time', '')
        context.user_data.pop('awaiting', None)
        payload = {
            "user": user, "note": "add_event",
            "event_title": title, "event_date": date,
            "event_time": time, "event_notes": notes
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await update.message.reply_text(
                f"✅ event added!\n\n📅 *{title}*\n📆 {date} {time}\n📝 {notes or '—'}".strip(),
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the event. please try again.")
        return

    # ------------------------------------------------------------------ EXPENSE FLOW
    if awaiting == 'expense_amount':
        try:
            amount = float(text.replace('$', '').replace(',', ''))
            context.user_data['expense_amount'] = amount
            context.user_data.pop('awaiting', None)
            keyboard = build_group_keyboard()
            reply_markup = InlineKeyboardMarkup(keyboard)
            await update.message.reply_text("select a category group:", reply_markup=reply_markup)
        except ValueError:
            await update.message.reply_text("please enter a valid amount (e.g. '24.50')")
        return

    if awaiting == 'expense_description':
        amount = context.user_data.pop('expense_amount', 0)
        category = context.user_data.pop('expense_category', 'Other')
        account = context.user_data.pop('expense_account', 'Family')
        context.user_data.pop('awaiting', None)
        payload = {
            "user": user, "note": "add_expense",
            "expense_amount": amount, "expense_category": category,
            "expense_account": account, "expense_description": text,
            "expense_paid_by": user
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await update.message.reply_text(
                f"✅ expense logged!\n\n💰 *${amount:.2f}*\n🏷 {category}\n🏦 {account}\n📝 {text}\n👤 paid by {user}",
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the expense. please try again.")
        return

    # ------------------------------------------------------------------ TO-DO FLOW
    if awaiting == 'todo_task':
        todo_type = context.user_data.pop('todo_type', 'Shared')
        context.user_data['todo_task'] = text
        context.user_data['awaiting'] = 'todo_due'
        await update.message.reply_text(
            f"📋 task: *{text}*\n\nany due date? (e.g. '20 May')\ntype 'skip' for no due date",
            parse_mode='Markdown'
        )
        context.user_data['todo_type'] = todo_type
        return

    if awaiting == 'todo_due':
        due = text if text.lower() != 'skip' else ''
        task = context.user_data.pop('todo_task', '')
        todo_type = context.user_data.pop('todo_type', 'Shared')
        context.user_data.pop('awaiting', None)
        payload = {
            "user": user, "note": "add_todo",
            "todo_task": task, "todo_type": todo_type,
            "todo_due": due, "todo_owner": user
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            due_text = f"\n📅 due: {due}" if due else ""
            await update.message.reply_text(
                f"✅ task added!\n\n📋 *{task}*\n👤 {todo_type} · added by {user}{due_text}",
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save the task. please try again.")
        return

    # ------------------------------------------------------------------ FERTILITY FLOW
    if awaiting == 'fertility_date':
        fertility_type = context.user_data.pop('fertility_type', '')
        context.user_data.pop('awaiting', None)
        payload = {
            "user": user, "note": "add_fertility",
            "fertility_type": fertility_type,
            "fertility_date": text,
            "fertility_notes": ""
        }
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            emoji = "🩸" if "Period" in fertility_type else "🥚"
            await update.message.reply_text(
                f"✅ logged!\n\n{emoji} *{fertility_type}*\n📆 {text}",
                parse_mode='Markdown'
            )
        except:
            await update.message.reply_text("couldn't save. please try again.")
        return

    # ------------------------------------------------------------------ DEFAULT
    payload = {"user": user, "note": text}
    response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
    await update.message.reply_text(response.text)


# --- 5. PHOTO HANDLER ---
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    photo_file = await update.message.photo[2].get_file()
    image_bytes = await photo_file.download_as_bytearray()
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    payload = {
        "user": user, "note": update.message.caption or "",
        "fileData": image_base64, "fileName": f"{user}_{photo_file.file_id}.jpg"
    }
    response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
    await update.message.reply_text(response.text)




def run():
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)

def main():
    if not TOKEN: return
    application = ApplicationBuilder().token(TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(button_handler))
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    application.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))
    Thread(target=run).start()
    application.run_polling()

if __name__ == "__main__":
    main()
