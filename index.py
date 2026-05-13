import os
import json
import requests
import base64
import asyncio
from flask import Flask, request
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    ApplicationBuilder,
    MessageHandler,
    filters,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes
)

# --- CONFIGURATION ---
TOKEN = os.environ.get('TELEGRAM_TOKEN')
GOOGLE_SCRIPT_URL = os.environ.get('GOOGLE_SCRIPT_URL')
SHEET_URL = "https://docs.google.com/spreadsheets/d/17TywVuHWmldWATzmarvkMYdInnatgX-jb46ipuCt0_I"

EXPENSE_GROUPS = {
    "👶 Children": ["Children - Books", "Children - Enrichment", "Children - School", "Children - Toys", "Mikaela - Sailing"],
    "👕 Clothing": ["Clothing - Accessories", "Clothing - Clothes", "Clothing - Shoes"],
    "🍽 Eating Out": ["Eating Out - Beverages", "Eating Out - Breakfast", "Eating Out - Dinner", "Eating Out - Lunch", "Eating Out - Snacks"],
    "📚 Education": ["Education - Books", "Education - Courses & Enrichment", "Education - Subscription"],
    "🎭 Entertainment": ["Entertainment - Experiences", "Entertainment - Massage", "Entertainment - Subscriptions", "Entertainment - Objects (toys, etc)"],
    "🎁 Gifts/Giving": ["Gifts & Treats - CNY", "Gifts & Treats - Family", "Gifts & Treats - Friends", "Gifts & Treats - Wedding", "Giving - Church", "Giving - Charity", "Giving - Parents"],
    "🏥 Health": ["Health & Fitness - Dental + Medical", "Health & Fitness - Events + Subscription", "Health & Fitness - Equipment + Supplements"],
    "🏠 Household": ["Household - Appliances", "Household - Groceries", "Household - Helper", "Household - Household Misc", "Household - Renovation", "Household - Utilities (electric, gas, water)", "Household - Internet", "Utilities - Mobile"],
    "🐾 Pets": ["Pets - Pet Food", "Pets - Grooming", "Pets - Pet Misc"],
    "🚗 Transport": ["Transportation - Bus/MRT", "Transportation - Taxi/Grab", "Transportation - Auto: Service", "Transportation - Auto: Loan", "Transportation - Auto: Gas"],
    "📈 Finance/Tax": ["Business", "Electronics", "Endowment", "Insurance", "Investing", "Taxes - Income Tax", "Taxes - Property Tax"],
    "🌍 Others": ["Holiday", "Misc", "Missions"]
}

ACCOUNT_TYPES = ["👤 Personal", "👨‍👩‍👧‍👦 Family"]
FERTILITY_SYMPTOMS = ["🤢 Nausea", "💧 Spotting", "😴 Fatigue", "🤕 Cramps", "😤 Mood swings", "🌡 Hot flashes", "💊 Medication taken", "✅ None"]

app = Flask(__name__)

# --- HELPERS ---
def build_group_keyboard():
    keyboard = []
    group_keys = list(EXPENSE_GROUPS.keys())
    for i in range(0, len(group_keys), 2):
        row = [InlineKeyboardButton(group_keys[i], callback_data=f"exp_group:{group_keys[i]}")]
        if i + 1 < len(group_keys):
            row.append(InlineKeyboardButton(group_keys[i + 1], callback_data=f"exp_group:{group_keys[i + 1]}"))
        keyboard.append(row)
    return keyboard

# --- HANDLERS ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("📝 log activity", callback_data='log_activity'),
         InlineKeyboardButton("🛒 grocery list", callback_data='view_groceries')],
        [InlineKeyboardButton("🍎 check fridge", callback_data='check_fridge'),
         InlineKeyboardButton("🍽 log eating fruit", callback_data='eat_fruit')],
        [InlineKeyboardButton("📅 family calendar", callback_data='view_calendar'),
         InlineKeyboardButton("💰 expenses", callback_data='view_expenses')],
        [InlineKeyboardButton("✅ to-do list", callback_data
