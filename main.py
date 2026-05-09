elif query.data == 'eat_fruit':
        try:
            payload = {"user": query.from_user.first_name, "note": "get_fruit_list"}
            response = requests.post(GOOGLE_SCRIPT_URL, json=payload, timeout=10)
            
            if response.status_code != 200 or not response.text.strip():
                await query.edit_message_text(text="couldn't fetch the fruit list. check your Google Sheet! 🗄")
                return

            fruits = response.text.split(",")
            
            keyboard = []
            for fruit in fruits:
                if fruit.strip(): # Ensure no empty buttons
                    keyboard.append([InlineKeyboardButton(fruit, callback_data=f"select_fruit:{fruit}")])
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            await query.edit_message_text(text="what did you eat? 🍎", reply_markup=reply_markup)
        except Exception as e:
            await query.edit_message_text(text="error connecting to dashboard. please try again.")
