import os
import requests
from flask import Flask
from threading import Thread
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# 1. Create a tiny web server to keep Render happy
app = Flask('')

@app.route('/')
def home():
    return "Bot is running!"

def run():
    # Render uses port 8080 by default for its free tier web services
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    t = Thread(target=run)
    t.start()

# 2. Your Telegram Bot Logic
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Family Bot is online! Send me a message to log it to our Google Sheet.")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    text = update.message.text
    text_lower = text.lower()
    
    # 1. Send data to Google Sheets (using your existing environment variable)
    script_url = os.environ.get('GOOGLE_SCRIPT_URL')
    payload = {"user": user, "category": "Auto", "note": text}
    
    try:
        requests.post(script_url, json=payload)
        
        # 2. Customised Feedback Logic
        if any(word in text_lower for word in ["sailing", "regatta", "boat", "fleet"]):
            reply = f"Fair winds, {user}! I've logged that sailing update. ⛵"
        elif any(word in text_lower for word in ["run", "swim", "pushup", "km", "gym"]):
            reply = f"Strong work, {user}! Fitness log updated. 💪"
        elif any(word in text_lower for word in ["violin", "piano", "music", "theory"]):
            reply = f"Sounds great! Music practice recorded. 🎹"
        elif any(word in text_lower for word in ["won", "first", "achieved", "trophy", "milestone"]):
            reply = f"Amazing achievement, {user}! I've pinned that to our family milestones. 🌟"
        elif any(word in text_lower for word in ["school", "exam", "homework", "grades"]):
            reply = f"Academic log updated. Keep pushing, {user}! 📚"
        else:
            reply = f"Got it, {user}! I've saved that to the family records. ✅"

        await update.message.reply_text(reply)

    except Exception as e:
        await update.message.reply_text("I've received the message but had trouble reaching the Google Sheet. ⚠️")

if __name__ == "__main__":
    # Start the web server thread
    keep_alive()
    
    # Get your Telegram Token from Render Environment Variables
    TOKEN = os.environ.get('TELEGRAM_TOKEN')
    
    if not TOKEN:
        print("Error: TELEGRAM_TOKEN environment variable not found.")
    else:
        # Build the application
        application = Application.builder().token(TOKEN).build()
        
        # Add handlers
        application.add_handler(CommandHandler("start", start))
        application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
        
        print("Bot is starting...")
        # Start the bot
        application.run_polling()
