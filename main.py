import os
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
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    t = Thread(target=run)
    t.start()

# 2. Your Telegram Bot Logic
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Family Bot is online! Send me a message to log it.")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    user = update.message.from_user.first_name
    # This is where you'll eventually add your Google Sheets logic
    await update.message.reply_text(f"Received from {user}: {text}")

if __name__ == "__main__":
    # Start the web server
    keep_alive()
    
    # Get token from Environment Variables (Security Best Practice)
    TOKEN = os.environ.get('TELEGRAM_TOKEN')
    
    application = Application.builder().token(TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    print("Bot is starting...")
    application.run_polling()