# Video Finder Bot

A sales tool that helps you find the right founder-channel YouTube video to send a
prospect after a discovery call. Imports a channel's videos into Supabase with
AI-generated summaries and tags, then uses Claude to pick the top 3 videos for
any given prospect notes.

## Tech

- Next.js 14 (App Router) — frontend + API routes
- Supabase — Postgres database
- Vercel — hosting
- YouTube Data API v3
- Anthropic Claude API

## Tabs

1. **Find Videos** — paste prospect notes, get top 3 matches with reasons
2. **Library** — searchable list of every video in the database
3. **Import** — pull a YouTube channel into the library with AI summaries
4. **Add Manually** — drop in a single video by URL

## Database

Already created in Supabase:

```sql
create table videos (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  url text unique not null,
  summary text,
  tags text[] default '{}',
  thumbnail text,
  created_at timestamp with time zone default now()
);
```

Make sure RLS either is **disabled** for this table, or has a policy that allows
the anon key to `select`, `insert`, and `update` rows. Quickest path during
prototyping is `alter table videos disable row level security;`.

## Environment variables

Copy `.env.example` to `.env.local` for local dev, and set the same four values
in Vercel project settings:

| Name | Where to get it |
| --- | --- |
| `YOUTUBE_API_KEY` | Google Cloud Console → APIs & Services → Credentials. Enable "YouTube Data API v3". |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API → anon/public key |

## Local dev

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, "Add New… → Project" and import the GitHub repo.
3. Framework preset: **Next.js**. Leave Root Directory blank.
4. Add the four environment variables above (Production, Preview, Development).
5. Deploy.

## Design notes

- All YouTube and Anthropic calls happen in `app/api/*` routes — never the
  browser — so the keys stay server-side and we don't hit CORS.
- The import endpoint streams progress as newline-delimited JSON so the UI can
  render a real progress bar even on long imports. AI summaries are batched in
  groups of 15 to stay within token limits.
- All inserts use `upsert(..., { onConflict: 'url' })` so re-importing the same
  channel won't create duplicates.
- The find endpoint sends the entire library (id, title, summary, tags) to
  Claude and asks for a strict JSON response with the 3 best matches plus a
  short reason explaining the fit.
