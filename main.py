import os
import requests
import base64
from flask import Flask
from threading import Thread
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# ... (Keep Flask and Start function as they were) ...

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.message.from_user.first_name
    caption = update.message.caption if update.message.caption else "New Photo"
    
    # PICKING A SMALLER PHOTO: 
    # Index [0] is the smallest thumbnail, [-1] is the original. 
    # Let's try [1] or [0] to see if it's a size issue.
    photo_file = await update.message.photo[1].get_file() 
    image_bytes = await photo_file.download_as_bytearray()
    
    encoded_image = base64.b64encode(image_bytes).decode('utf-8')
    
    script_url = os.environ.get('GOOGLE_SCRIPT_URL')
    payload = {
        "user": user,
        "category": "Media",
        "note": caption,
        "fileData": encoded_image,
        "fileName": f"{user}_{update.message.date.strftime('%Y%m%d_%H%M')}.jpg",
        "mimeType": "image/jpeg"
    }
    
    try:
        requests.post(script_url, json=payload, timeout=30)
        await update.message.reply_text(f"Logged to Drive, {user}! 📁")
    except Exception as e:
        await update.message.reply_text("The file might be too large to upload. ⚠️")

# ... (Keep the rest of your main script) ...
