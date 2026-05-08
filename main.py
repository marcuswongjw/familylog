import os
import requests
import base64
from flask import Flask
from threading import Thread
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# 1. Flask setup for Render health checks
app = Flask('')

@app.route('/')
def home():
    return "Bot is alive"

def run():
    # Render requires the app to listen on 0.0.0.0
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

def keep_alive():
    t = Thread(target=run)
    t.daemon = True # Ensures the thread closes when the main script does
    t.start()

# 2. Utility for Google Sheets
def log_to_google(user, category, note, file_data=None, file_name=None):
    script_url = os.environ.get('GOOGLE_SCRIPT_URL')
    if not script_url:
        return False
    
    payload = {
        "user": user, 
        "category": category, 
        "note": note
    }
    
    if file_data:
        payload.update({
            "fileData": file_data,
            "fileName": file_name,
            "mimeType": "image/jpeg"
        })

    try:
        requests.post(script_url, json=payload, timeout=30)
        return True
    except Exception as e:
        print(f"Logging error: {e}")
        return False

# 3. Handlers
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Family Bot is online! Send a message or photo.")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    text = update.message.text
    log_to_google(user, "Auto", text)
    await update.message.reply_text(f"Logged for you, {user}! ✅")

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    caption = update.message.caption if update.message.caption else "Photo Log"
    
    await update.message.reply_text("Processing photo... ⏳")
    
    try:
        # Get a smaller version of the photo to avoid memory crashes (Index 1)
        photo_file = await update.message.photo[1].get_file()
        image_bytes = await photo_file.download_as_bytearray()
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        
        file_name = f"{user}_{update.message.date.strftime('%Y%m%d_%H%M')}.jpg"
        log_to_google(user, "Media", caption, encoded_image, file_name)
        
        await update.message.reply_text(f"Photo saved to Drive, {user}! 📁")
    except Exception as e:
        await update.message.reply_text("Failed to upload photo. It might be too large. ⚠️")

if __name__ == "__main__":
    # Start web server first
    keep_alive()
    
    TOKEN = os.environ.get('TELEGRAM_TOKEN')
    if not TOKEN:
        print("No Token found!")
    else:
        application = Application.builder().token(TOKEN).build()
        application.add_handler(CommandHandler("start", start))
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
        application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
        
        print("Bot is starting...")
        application.run_polling()
