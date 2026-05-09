import os
import requests
import base64
from flask import Flask
from threading import Thread
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

# 1. the home screen function
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [
            InlineKeyboardButton("📝 log activity", callback_data='log_activity'),
            InlineKeyboardButton("🛒 grocery list", callback_data='view_groceries')
        ],
        [
            InlineKeyboardButton("📸 add grocery photo", callback_data='add_grocery'),
            InlineKeyboardButton("📊 view dashboard", url="YOUR_GOOGLE_SHEET_URL")
        ],
    ]
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "welcome to the m.generations dashboard! 🏠\nwhat would you like to do today?",
        reply_markup=reply_markup
    )

# 2. handling the button clicks
async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == 'log_activity':
        await query.edit_message_text(text="simply type your activity (e.g., 'run 5km') and I'll log it!")
    elif query.data == 'view_groceries':
        # this will trigger your 'what to buy' logic in the google script
        await query.edit_message_text(text="to see the list, type 'what to buy'.")
    elif query.data == 'add_grocery':
        await query.edit_message_text(text="send me a photo with the caption: \n+Item | Price | Stock")
        
# 1. Flask setup for Render health checks
app = Flask('')

@app.route('/')
def home():
    return "Family Bot is active and running!"

def run():
    # Render provides a PORT environment variable automatically
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

def keep_alive():
    t = Thread(target=run)
    t.daemon = True 
    t.start()

# 2. Function to send data to Google Apps Script
def log_to_google(user, category, note, file_data=None, file_name=None):
    script_url = os.environ.get('GOOGLE_SCRIPT_URL')
    if not script_url:
        print("Error: GOOGLE_SCRIPT_URL not found in environment variables.")
        return False
    
    payload = {
        "user": user, 
        "category": category, 
        "note": note
    }
    
    # If there is image data, add it to the payload
    if file_data:
        payload.update({
            "fileData": file_data,
            "fileName": file_name,
            "mimeType": "image/jpeg"
        })

    try:
        # Increase timeout to 30s to allow for image processing
        response = requests.post(script_url, json=payload, timeout=30)
        return response.status_code == 200
    except Exception as e:
        print(f"Logging error: {e}")
        return False

# 3. Bot Command Handlers
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Family Bot is online! Send a message (e.g., 'Run 5km') or a photo to log it.")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    text = update.message.text
    
    # Send as "Auto" so the Google Script can use its keyword logic
    log_to_google(user, "Auto", text)
    await update.message.reply_text(f"Logged for you, {user}! ✅")

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    caption = update.message.caption if update.message.caption else "Photo Log"
    
    await update.message.reply_text("Uploading photo to Google Drive... ⏳")
    
    try:
        # Get a medium/large version, about 800x800 px [2] to avoid memory limits on free tiers
        photo_file = await update.message.photo[2].get_file()
        image_bytes = await photo_file.download_as_bytearray()
        
        # Convert image to Base64 string
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        file_name = f"{user}_{update.message.date.strftime('%Y%m%d_%H%M')}.jpg"
        
        # Send to Google
        success = log_to_google(user, "Media", caption, encoded_image, file_name)
        
        if success:
            await update.message.reply_text(f"Photo saved to Google Drive, {user}! 📁")
        else:
            await update.message.reply_text("The sheet received the log, but couldn't save the image file. ⚠️")
            
    except Exception as e:
        print(f"Photo error: {e}")
        await update.message.reply_text("Failed to process photo. It might be too large or technical. ⚠️")

# 4. Main Entry Point
if __name__ == "__main__":
    # Start the Flask server in the background
    keep_alive()
    
    TOKEN = os.environ.get('TELEGRAM_TOKEN')
    
    if not TOKEN:
        print("CRITICAL ERROR: TELEGRAM_TOKEN environment variable is missing.")
    else:
        # Build the Telegram Application
        application = Application.builder().token(TOKEN).build()
        
        # Register handlers
        application.add_handler(CommandHandler("start", start))
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
        application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
        
        print("Bot started. Polling for messages...")
        application.run_polling()
