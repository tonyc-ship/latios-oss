# LATIOS: Latios Agentic Trends & Insights Orchestration System

## Quick Start

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in your project details:
   - Name: Choose any name
   - Database Password: Set a strong password (save this!)
   - Region: Choose closest to you
   - Pricing Plan: Free tier works fine
4. Wait for the project to be created (~2 minutes)

### 2. Initialize Database Tables

1. In your Supabase dashboard, navigate to **SQL Editor** (left sidebar)
2. Click "New Query"
3. Open the file [`supabase-init.sql`](./supabase-init.sql) from this repository
4. Copy the entire contents
5. Paste it into the SQL Editor
6. Click **Run** (or press Cmd/Ctrl + Enter)

You should see a success message. This creates three tables:
- `tbl_transcript` - Stores podcast episode transcriptions
- `tbl_summarize` - Stores episode summaries
- `tbl_user_summarize_ref` - Tracks user interactions

### 3. Set Up Environment Variables

1. In your Supabase dashboard, go to **Settings**
2. Get your Project URL:
   - Go to **General** tab
   - Copy the **Project ID** (e.g., `abcdefghijk`)
   - Your URL is: `https://abcdefghijk.supabase.co`
3. Get your API Key:
   - Go to **API Keys** tab
   - Copy the **anon/public** key
4. Rename `.env.local.example` to `.env.local` in the root directory
5. Update the values in `.env.local`:
   - Replace `your-project-ref` with your Project ID
   - Replace `your-anon-key-here` with your anon/public key

### 4. Install Dependencies and Run

```bash
npm install
npm run dev
```

The app will be running at `http://localhost:3000`