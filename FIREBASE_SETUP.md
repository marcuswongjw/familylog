# Firebase Setup Guide for Wong Family App

This guide will help you set up Firebase Authentication to securely handle PIN verification for your family app.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard (you can disable Google Analytics if you want)
4. Once created, click the web icon (`</>`) to add a web app
5. Register your app with a nickname (e.g., "Wong Family App")
6. **Copy the firebaseConfig object** - you'll need this in the next step

## Step 2: Update Your index.html

Open `index.html` and find the `firebaseConfig` object (around line 1267). Replace the placeholder values with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD-YOUR-ACTUAL-API-KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

## Step 3: Enable Email/Password Authentication

1. In Firebase Console, go to **Build** → **Authentication**
2. Click "Get started"
3. Click on the **Sign-in method** tab
4. Select **Email/Password**
5. Toggle **Enable** and click Save

## Step 4: Create User Accounts

For each family member, you need to create an account where:
- **Email**: Use the email you added to the MEMBERS array in index.html
- **Password**: Exactly a **6-digit numeric PIN** (same policy for kids and parents), e.g. `181109`

### How to create users:

**Option A: Using Firebase Console (Easiest)**
1. Go to **Build** → **Authentication** → **Users** tab
2. Click "Add user"
3. Enter the email (e.g., `marcuswongjw@gmail.com`)
4. Enter the password (their **6-digit PIN**, e.g. `181109`)
5. Click "Add user"
6. Repeat for each family member

**Option B: Using a Script**
If you prefer, you can create a temporary HTML page to add users programmatically.

## Step 5: Update Member Emails

In `index.html`, update the `MEMBERS` array (around line 1280) with the actual emails you used when creating the Firebase users:

```javascript
const MEMBERS = [
  { name:'Marcus',  emoji:'👨', email:'marcus@example.com' },
  { name:'Eleanor', emoji:'👩', email:'eleanor@example.com' },
  { name:'Mikaela', emoji:'👧', email:'mikaela@example.com' },
  { name:'Meaghan', emoji:'👧', email:'meaghan@example.com' },
];
```

## Step 6: Test It

1. Open `index.html` in a browser
2. Select a family member
3. Enter their PIN
4. If configured correctly, you should be logged in!

## Security Notes

✅ **What's secure now:**
- Passwords are verified by Firebase (not embedded in the page source)
- Google Apps Script maps the verified email → member name server-side (client cannot spoof identity)
- Us / fertility / bucket list data is withheld for non-parent accounts on the server
- Expense approval email links are HMAC-signed and expire after 7 days; amount/date come from the pending sheet
- Chat push notifications exclude the sender by email (`senderEmail` on each chat doc)

⚠️ **Important considerations:**
- The emails in the MEMBERS array are public (this is okay)
- Family policy: **6-digit numeric PINs** for everyone (kids same as parents). The login screen enforces this format.
- Firebase Authentication provides rate-limiting against brute force
- In Apps Script **Project Settings → Script properties**, set:
  - `APPROVAL_SECRET` — long random string used to sign expense approval links
  - Optional: `ADULT_EMAILS`, `ALLOWED_EMAILS` (comma-separated)
- After changing `Code.js`, re-paste into Apps Script and **Deploy → Manage deployments → Edit → New version**
- Deploy backend: `firebase deploy --only functions,firestore:rules,storage`
- Firestore + Storage rules allow only the four family emails; chat delete = own messages only; new images go under `chat/{email}/` and `memories/{email}/`

## Troubleshooting

**Error: "Firebase not defined"**
- Make sure the Firebase SDK scripts are loaded before your custom code
- Check that you copied the correct firebaseConfig from Firebase Console

**Error: "Invalid email or password"**
- Verify the email in MEMBERS matches exactly what you created in Firebase
- Ensure the password is exactly the 4-digit PIN (no spaces)

**Error: "Network error"**
- Check your internet connection
- Verify your Firebase project is active

## Next Steps

Once this is working, you can:
1. Add Firestore database to store your app data securely
2. Set up Firebase Hosting to deploy your app
3. Add Cloud Functions for more complex logic
4. Enable multi-factor authentication for extra security
