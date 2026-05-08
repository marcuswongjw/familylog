import os
import requests
from flask import Flask
from threading import Thread
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# 1. Web server for Render
app = Flask('')
@app.route('/')
def home(): return "Family Bot is active!"
def run(): app.run(host='0.0.0.0', port=8080)
def keep_alive():
    t = Thread(target=run)
    t.start()

# 2. Function to send data to Google Sheets
def log_to_google(user, category, note):
    script_url = os.environ.get('GOOGLE_SCRIPT_URL')
    payload = {"user": user, "category": category, "note": note}
    try:
        requests.post(script_url, json=payload)
        return True
    except:
        return False

# 3. Handle Text Messages
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    text = update.message.text
    text_lower = text.lower()
    
    log_to_google(user, "Auto", text)
    
    # Custom feedback logic
    if any(word in text_lower for word in ["sailing", "regatta", "boat"]):
        reply = f"Fair winds, {user}! Sailing log updated. ⛵"
    elif any(word in text_lower for word in ["run", "swim", "pushup", "km"]):
        reply = f"Strong work, {user}! Fitness log updated. 💪"
    elif any(word in text_lower for word in ["violin", "piano", "music"]):
        reply = f"Sounds great! Music practice recorded. 🎹"
    else:
        reply = f"Got it, {user}! I've saved that to the records. ✅"
    
    await update.message.reply_text(reply)

# 4. Handle Photo Messages
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    # Get the highest resolution photo
    photo_file = await update.message.photo[-1].get_file()
    # Telegram provides a temporary link to the file
    photo_url = photo_file.file_path 
    
    # Get the caption if there is one
    caption = update.message.caption if update.message.caption else "Photo Log"
    
    # Log the URL to the Google Sheet
    log_to_google(user, "Media", f"{caption} (Link: {photo_url})")
    
    await update.message.reply_text(f"Beautiful! I've saved that photo to the family archive, {user}. 📸")

if __name__ == "__main__":
    keep_alive()
    TOKEN = os.environ.get('TELEGRAM_TOKEN')
    
    if TOKEN:
        application = Application.builder().token(TOKEN).build()
        application.add_handler(CommandHandler("start", start))
        
        # Handler for text
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
        
        # Handler for photos
        application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
        
        print("Bot is starting...")
        application.run_polling()
