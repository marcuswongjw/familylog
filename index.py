import os
import json
import requests
import base64
import asyncio
from flask import Flask, request
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
TOKEN = os.environ.get('TELEGRAM_TOKEN')
GOOGLE_SCRIPT_URL = os.environ.get('GOOGLE_SCRIPT_URL')
SHEET_URL = "https://docs.google.com/spreadsheets/d/17TywVuHWmldWATzmarvkMYdInnatgX-jb46ipuCt0_I"

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

app = Flask(__name__)

# --- HELPERS ---
def build_group_keyboard():
    keyboard = []
    group_keys = list(EXPENSE_GROUPS.keys())
    for i in range(0, len(group_keys), 2):
        row = [InlineKeyboardButton(group_keys[i], callback_data=f"exp_group:{group_keys[i]}")]
        if i + 1 < len(group_keys):
            row.append(InlineKeyboardButton(group_keys[i + 1], callback_data=f"exp_group:{group_keys[i + 1]}"))
        keyboard.append(row)
    return keyboard

# --- HANDLERS ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("📝 log activity", callback_data='log_activity'),
         InlineKeyboardButton("🛒 grocery list", callback_data='view_groceries')],
        [InlineKeyboardButton("🍎 check fridge", callback_data='check_fridge'),
         InlineKeyboardButton("🍽 log eating fruit", callback_data='eat_fruit')],
        [InlineKeyboardButton("📅 family calendar", callback_data='view_calendar'),
         InlineKeyboardButton("💰 expenses", callback_data='view_expenses')],
        [InlineKeyboardButton("✅ to-do list", callback_data='view_todos'),
         InlineKeyboardButton("🌸 fertility", callback_data='view_fertility')],
        [InlineKeyboardButton("📊 view dashboard", url=SHEET_URL)]
    ]

    text = "welcome to the m.generations dashboard! 🏠\nwhat would you like to do today?"

    if update.message:
        await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(keyboard))
    else:
        await update.callback_query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard))

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user = query.from_user.first_name
    await query.answer()

    if query.data == 'home':
        context.user_data.clear()
        await start(update, context)
        return

    if query.data == 'view_expenses':
        payload = {"user": user, "note": "get_expenses"}
        response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
        keyboard = [
            [InlineKeyboardButton("➕ add expense", callback_data='add_expense')],
            [InlineKeyboardButton("🏠 home", callback_data='home')]
        ]
        await query.edit_message_text(text=response.text or "no expenses", reply_markup=InlineKeyboardMarkup(keyboard))

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    text = update.message.text.strip()
    payload = {"user": user, "note": text}
    response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
    await update.message.reply_text(response.text)

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    photo_file = await update.message.photo[-1].get_file()
    image_bytes = await photo_file.download_as_bytearray()
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    payload = {
        "user": user,
        "note": update.message.caption or "",
        "fileData": image_base64,
        "fileName": f"{user}.jpg"
    }
    requests.post(GOOGLE_SCRIPT_URL, json=payload)
    await update.message.reply_text("photo logged! 📸")

# --- BUILD APPLICATION ---
application = ApplicationBuilder().token(TOKEN).build()
application.initialize()  # REQUIRED FOR WEBHOOK MODE

application.add_handler(CommandHandler("start", start))
application.add_handler(CallbackQueryHandler(button_handler))
application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
application.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))

# --- SAFE UPDATE PROCESSOR ---
async def process_update_safe(data):
    try:
        update = Update.de_json(data, application.bot)

        if not update:
            print("ERROR: Update.de_json returned None")
            return "ignored", 200

        await application.process_update(update)
        return "ok", 200

    except Exception as e:
        print("PROCESS_UPDATE ERROR:", e)
        return "ok", 200

# --- WEBHOOK ROUTES ---
@app.route('/', methods=['GET'])
def healthcheck():
    return "ok", 200

@app.route('/', methods=['POST'])
def webhook():
    try:
        data = request.get_json(silent=True)
        print("RAW UPDATE:", data)

        if not data:
            print("ERROR: Empty or invalid JSON from Telegram")
            return "ignored", 200

        return asyncio.run(process_update_safe(data))

    except Exception as e:
        print("WEBHOOK ERROR:", e)
        return "error", 200

# --- RUN FLASK (RAILWAY) ---
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8080))
    )
