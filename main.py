import os
import requests
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ApplicationBuilder, MessageHandler, filters, CommandHandler, CallbackQueryHandler, ContextTypes

# --- 1. CONFIGURATION ---
# it is best practice to keep these in Render Environment Variables
TOKEN = os.environ.get('TELEGRAM_TOKEN')
GOOGLE_SCRIPT_URL = os.environ.get('GOOGLE_SCRIPT_URL')
# replace this with your actual Google Sheet link for the button
SHEET_URL = "https://docs.google.com/spreadsheets/d/your-id-here"

# --- 2. HOME SCREEN (START) ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [
            InlineKeyboardButton("📝 log activity", callback_data='log_activity'),
            InlineKeyboardButton("🛒 grocery list", callback_data='view_groceries')
        ],
        [
            InlineKeyboardButton("📸 add grocery photo", callback_data='add_grocery'),
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
    elif query.data == 'add_grocery':
        await query.edit_message_text(text="send me a photo with the caption: \n+Item | Price | Stock")

# --- 4. PHOTO HANDLER ---
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    caption = update.message.caption or ""
    
    # get the medium-large photo (index 2)
    photo_file = await update.message.photo[2].get_file()
    image_bytes = await photo_file.download_as_bytearray()
    
    import base64
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
    text = update.message.text
    
    payload = {"user": user, "note": text}
    
    try:
        response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
        await update.message.reply_text(response.text)
    except Exception as e:
        await update.message.reply_text("logged, but couldn't get confirmation.")

# --- 6. MAIN APPLICATION ---
def main():
    if not TOKEN or not GOOGLE_SCRIPT_URL:
        print("error: TELEGRAM_TOKEN or GOOGLE_SCRIPT_URL not found in environment.")
        return

    application = ApplicationBuilder().token(TOKEN).build()

    # CRITICAL: add CommandHandler and CallbackQueryHandler BEFORE MessageHandlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(button_handler))
    
    # handle photos
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    
    # handle regular text (ignoring commands)
    application.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))

    print("bot is live and waiting for messages...")
    application.run_polling()

if __name__ == "__main__":
    main()
