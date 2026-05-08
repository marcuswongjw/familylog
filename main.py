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
    text = update.message.text
    user = update.message.from_user.first_name
    
    # Use the URL you provided
    # Best practice: Add this to Render Environment Variables as GOOGLE_SCRIPT_URL
    script_url = os.environ.get('GOOGLE_SCRIPT_URL', 'https://script.google.com/macros/s/AKfycbwQzpqQRRnK_PJRIbKWvPRhFVrQbfLEORciIRijBSwiz7WkX-7Ik2vTrZzE9VZ7Nehr/exec')
    
    # Data to send to your Google Sheet
    payload = {
        "user": user,
        "category": "General",
        "note": text
    }

    try:
        # Send the POST request to Google Apps Script
        response = requests.post(script_url, json=payload)
        
        if response.status_code == 200:
            await update.message.reply_text(f"Done! I've logged that for you, {user}.")
        else:
            await update.message.reply_text(f"I received the message, but Google Sheets returned an error ({response.status_code}).")
            
    except Exception as e:
        await update.message.reply_text(f"An error occurred while connecting to Google Sheets: {e}")

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
