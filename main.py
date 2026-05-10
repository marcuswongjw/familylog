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
            InlineKeyboardButton("📊 view dashboard", url=SHEET_URL),
            InlineKeyboardButton("🗑️ clear groceries", callback_data='clear_groceries')
        ],
    ]
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    # We check if it's a message or a callback to send/edit appropriately
    text = "welcome to the m.generations dashboard! 🏠\nwhat would you like to do today?"
    if update.message:
        await update.message.reply_text(text, reply_markup=reply_markup)
    else:
        await update.callback_query.edit_message_text(text, reply_markup=reply_markup)

# --- 3. BUTTON CLICK HANDLER ---
async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
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
        item_name = query.data.split(":")[1]
        payload = {"user": query.from_user.first_name, "note": f"bought {item_name}"}
        try:
            requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            await query.answer(f"marked {item_name} as bought!")
            # Refresh the home screen after checking off
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
        fruit_name = query.data.split(":")[1]
        context.user_data['selected_fruit'] = fruit_name
        await query.edit_message_text(text=f"how many {fruit_name}s did you have? (type the number)")

    elif query.data == 'clear_groceries':
        payload = {"user": query.from_user.first_name, "note": "clear grocery list"}
        response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
        await query.edit_message_text(text=response.text)

# --- 4. PHOTO & TEXT HANDLERS ---
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    photo_file = await update.message.photo[2].get_file()
    image_bytes = await photo_file.download_as_bytearray()
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')

    payload = {
        "user": user,
        "note": update.message.caption or "",
        "fileData": image_base64,
        "fileName": f"{user}_{photo_file.file_id}.jpg"
    }
    response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
    await update.message.reply_text(response.text)

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    text = update.message.text.strip()
    
    if 'selected_fruit' in context.user_data:
        fruit = context.user_data.pop('selected_fruit')
        if text.isdigit():
            payload = {"user": user, "note": f"-fruits {fruit} {text}"}
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
            await update.message.reply_text(response.text)
        else:
            await update.message.reply_text("please send a valid number.")
        return

    payload = {"user": user, "note": text}
    response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
    await update.message.reply_text(response.text)

# --- 5. RENDER KEEP-ALIVE ---
app = Flask('')
@app.route('/')
def home(): return "I am alive!"

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
