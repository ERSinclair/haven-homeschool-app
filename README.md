# Haven - Fresh Start

**Location-based app for homeschooling families to connect and build their community.**

## 🎯 Clean Start Benefits

- ✅ **Sydney region database** (fast for Australian users)
- ✅ **Schema matches app code** (no migration artifacts)
- ✅ **Clean codebase** (no debugging remnants)
- ✅ **Proper type definitions** 
- ✅ **Working signup/login flow**

## 🛠️ Tech Stack

- **Frontend:** Next.js 16 + React 19 + Tailwind CSS
- **Database:** Supabase (PostgreSQL) - Sydney region
- **Maps:** Mapbox GL JS
- **Deployment:** Vercel
- **Repository:** GitHub with auto-deployment

## 🚀 Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Update `.env.local` with your Supabase project details:
- Create new Supabase project in Sydney region
- Copy project URL and anon key
- Update NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

### 3. Database Setup
Run `database/haven_clean_schema.sql` in Supabase SQL Editor

### 4. Development
```bash
npm run dev
```

### 5. Deployment  
```bash
git push  # Auto-deploys via GitHub → Vercel
```

## 📂 Project Structure

- **`src/app/`** - Next.js app pages (signup, login, discover, etc.)
- **`src/lib/`** - Utilities (Supabase client, auth, etc.)
- **`src/components/`** - Reusable React components
- **`database/`** - Clean database schema
- **`public/`** - Static assets

## 🎯 Features

- 📝 **Clean signup flow** - No schema mismatches
- 🗺️ **Family discovery** with location-based matching  
- 💬 **Direct messaging** between families
- 📅 **Community events** with RSVP
- 🏡 **Privacy-first** design (suburb-level sharing)
- 📱 **PWA ready** for mobile installation

---

**Fresh start = Clean code = Happy users!** 🇦🇺