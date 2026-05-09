import os
import requests
import base64
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, CommandHandler, CallbackQueryHandler, ContextTypes

# --- 1. CONFIGURATION ---
TOKEN = os.environ.get('TELEGRAM_TOKEN')
GOOGLE_SCRIPT_URL = os.environ.get('GOOGLE_SCRIPT_URL')
# using your provided sheet id
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
            InlineKeyboardButton("📊 view dashboard", url=SHEET_URL)
        ],
    ]
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "welcome to the m.generations dashboard! 🏠\nwhat would you like to do today?",
        reply_markup=reply_markup
    )

# --- 3. BUTTON CLICK HANDLER ---
async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == 'log_activity':
        await query.edit_message_text(text="simply type your activity (e.g., 'run 5km') and I'll log it!")
    
    elif query.data == 'view_groceries':
        await query.edit_message_text(text="to see the list, type 'what to buy'.")
    
    elif query.data == 'check_fridge':
        payload = {"user": query.from_user.first_name, "note": "check fridge"}
        response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
        await query.edit_message_text(text=response.text)
            
    elif query.data == 'eat_fruit':
        # This fetches the "Apples,Oranges" string you just tested
        payload = {"user": query.from_user.first_name, "note": "get_fruit_list"}
        try:
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            
            # This turns your string "Apples,Oranges" into a list ['Apples', 'Oranges']
            fruits = response.text.split(",")
            
            # This creates the actual clickable buttons
            keyboard = []
            for fruit in fruits:
                if fruit.strip():
                    keyboard.append([InlineKeyboardButton(fruit, callback_data=f"select_fruit:{fruit}")])
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            # This replaces the instructions with the button menu
            await query.edit_message_text(text="What did you eat? 🍎", reply_markup=reply_markup)
            
        except Exception as e:
            await query.edit_message_text(text="Error connecting to the fridge data. Please try again.")

# --- 4. PHOTO HANDLER ---
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    caption = update.message.caption or ""
    
    # get the medium-large photo (index 2)
    photo_file = await update.message.photo[2].get_file()
    image_bytes = await photo_file.download_as_bytearray()
    
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')

    payload = {
        "user": user,
        "note": caption,
        "fileData": image_base64,
        "fileName": f"{user}_{photo_file.file_id}.jpg"
    }

    try:
        response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=15)
        await update.message.reply_text(response.text)
    except Exception as e:
        await update.message.reply_text(f"photo upload failed: {str(e)}")

# --- 5. TEXT HANDLER ---
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    text = update.message.text.strip()
    
    # Check if we are waiting for a quantity for a fruit
    if 'selected_fruit' in context.user_data:
        fruit = context.user_data.pop('selected_fruit') # Get and remove from memory
        if text.isdigit():
            # Automatically format the command for the Google Script
            payload = {"user": user, "note": f"-fruits {fruit} {text}"}
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload)
            await update.message.reply_text(response.text)
        else:
            await update.message.reply_text("please send a valid number.")
        return

    # Regular logging (original logic)
    payload = {"user": user, "note": text}
    
    try:
        response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
        await update.message.reply_text(response.text)
    except Exception as e:
        await update.message.reply_text("logged, but couldn't get confirmation.")

# --- 6. MAIN APPLICATION ---
def main():
    if not TOKEN or not GOOGLE_SCRIPT_URL:
        print("error: TELEGRAM_TOKEN or GOOGLE_SCRIPT_URL missing.")
        return

    application = ApplicationBuilder().token(TOKEN).build()

    # handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(button_handler))
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    application.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))

    print("bot is live and waiting for messages...")
    application.run_polling()

if __name__ == "__main__":
    main()
