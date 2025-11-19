# LATIOS: Latios Agentic Trends & Insights Output System

## Quick Start

### 1. Setup Supabase 

#### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Create a "New Project". Free tier works fine.

#### Initialize Database Tables

1. In your Supabase dashboard, navigate to **SQL Editor** (left sidebar). Click "New Query"
3. Copy the entire contents from [`supabase-init.sql`](./supabase-init.sql) in this repository, paste it into the SQL Editor, and click **Run**

#### Set Up Environment Variables

1. In your Supabase dashboard, go to **Settings**
2. Get your Project URL: go to **General** tab. Copy the **Project ID** (e.g., `abcdefghijk`). Your URL is: `https://abcdefghijk.supabase.co`
3. Get your API Key: go to **API Keys** tab. Copy the **anon/public** key
4. Rename `.env.local.example` to `.env.local` in the root directory. Update the values in `.env.local`: replace `your-project-ref` with your Project ID. Replace `your-anon-key-here` with your anon/public key

### 2. Populate Initial Podcasts (Optional)

There's a list of popular podcasts in `top_podcasts.csv`. Run the following to make them show up in your homepage.

```bash
npm install
npm run init:podcasts
```

### 3. Start the backend services

In .env.local, paste your Deepgram and Anthropic (or OpenAI) keys, and set the providers. Or alternatively, you can run models locally (see section below).


Then starts the transcription and summarization services:
```bash
cd python
pip install -r requirements.txt
python start_services.py
```


### 4. Start the webpage

```bash
npm install
npm run dev
```

The app will be running at `http://localhost:3000`


## Run AI models locally on your machine

If you have a Mac with Apple Silicon, you can run LLM inference entirely on your local machine without requiring API keys. This way you have zero cost. 

#### Setup Ollama

1. **[Download](https://ollama.ai/download) and install Ollama**

2. **Start Ollama**: After starting Ollama, you can verify it's running by visiting `http://localhost:11434` in your browser

3. **Download a Model**: Pull a model you want to use. For example, `gemma3:12b`:
   ```bash
   ollama pull gemma3:12b
   ```

4. **Configure (Optional)**: You can customize the model and base URL via environment variables:
   ```bash
   # In your .env.local or environment
   OLLAMA_MODEL=gemma3:12b  # Default model to use
   OLLAMA_BASE_URL=http://localhost:11434/v1  # Default Ollama API URL
   ```

#### Change config

Set the `.env.local` to local models:

```bash
LLM_PROVIDER=ollama
TRANSCRIPTION_PROVIDER=whisper
```

Local whisper doesn't need additional setup. After you set the above config, the model will be automatically downloaded and run.  
