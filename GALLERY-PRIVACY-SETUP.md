# Gallery Privacy Setup Guide

The gallery privacy features require adding new columns to your Supabase database.

## Quick Setup

### 1. Open Supabase Dashboard
Go to https://supabase.com/dashboard and select your project: **ryvecaicjhzfsikfedkp**

### 2. Run the SQL
1. Click **SQL Editor** in the left sidebar
2. Click **New Query** 
3. Copy and paste the contents of `add-gallery-privacy-columns.sql`
4. Click **Run** to execute

### 3. Verify Setup
After running the SQL, you should see:
- ✅ `gallery_privacy` column added to profiles table (default: 'public')  
- ✅ `gallery_selected_users` column added to profiles table (default: empty array)
- ✅ Check constraint added to validate privacy values

### 4. Test the Feature
1. Restart your dev server: `npm run dev`
2. Go to your profile page
3. In the photo gallery section, click **Privacy**
4. You should now see privacy options:
   - 🌍 **Public** - Everyone can see photos
   - 👥 **Connections Only** - Only connections can see photos  
   - 👤 **Selected People** - Choose specific people
   - 🔒 **Private** - Only you can see photos

## Troubleshooting

**If you still see errors:**
1. Make sure the SQL ran without errors
2. Refresh your browser to clear cache
3. Check the browser console for any remaining database errors

**Current Status:** 
The app will work in "public mode" until the database columns are added. All galleries will be visible to everyone as a safe fallback.

## Features Once Setup

- **Privacy Controls**: Full control over who can see your photos
- **Access Enforcement**: Other users see "private gallery" message when denied
- **Smart Defaults**: New users default to public galleries
- **Connection Integration**: "Connections only" mode uses your existing Haven connections