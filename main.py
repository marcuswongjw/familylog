import os
import requests
from flask import Flask
from threading import Thread
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# 1. Web server for Render health checks
app = Flask('')
@app.route('/')
def home(): return "Family Bot is active!"
def run(): app.run(host='0.0.0.0', port=8080)
def keep_alive():
    t = Thread(target=run)
    t.start()

# 2. Utility function for Google Sheets
def log_to_google(user, category, note):
    script_url = os.environ.get('GOOGLE_SCRIPT_URL')
    if not script_url:
        return False
    payload = {"user": user, "category": category, "note": note}
    try:
        requests.post(script_url, json=payload, timeout=10)
        return True
    except:
        return False

# 3. Command Handlers
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Family Bot is online! Send me a message or a photo to log it.")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    text = update.message.text
    text_lower = text.lower()
    
    log_to_google(user, "Auto", text)
    
    if any(word in text_lower for word in ["sailing", "regatta", "boat"]):
        reply = f"Fair winds, {user}! Sailing log updated. ⛵"
    elif any(word in text_lower for word in ["run", "swim", "pushup", "km"]):
        reply = f"Strong work, {user}! Fitness log updated. 💪"
    elif any(word in text_lower for word in ["violin", "piano", "music"]):
        reply = f"Sounds great! Music practice recorded. 🎹"
    else:
        reply = f"Got it, {user}! I've saved that to the records. ✅"
    
    await update.message.reply_text(reply)

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    caption = update.message.caption if update.message.caption else "Photo Log"
    
    # We log that a photo was received. 
    # Note: Accessing direct file paths requires an extra API call which can be slow.
    log_to_google(user, "Media", f"[Photo] {caption}")
    
    await update.message.reply_text(f"Beautiful! I've logged that photo for you, {user}. 📸")

if __name__ == "__main__":
    keep_alive()
    TOKEN = os.environ.get('TELEGRAM_TOKEN')
    
    if TOKEN:
        application = Application.builder().token(TOKEN).build()
        
        # Add all handlers
        application.add_handler(CommandHandler("start", start))
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
        application.add_handler(MessageHandler(filters.PHOTO, handle_photo))
        
        print("Bot is starting...")
        application.run_polling()
