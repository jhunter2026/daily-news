# Daily News — Starter

This is the smallest possible working version of the idea: one page that
pulls real headlines from a live news feed and displays them. No login,
no database, no scoring engine yet — just proving the core pipeline works.

## What's in here
- `app/page.js` — the homepage. Pulls headlines from an RSS feed and lists them.
- `app/layout.js` — the page wrapper (title, basic styling setup).
- `package.json` — tells Vercel what to install (Next.js + a feed-reading tool).

## How to get this live (no coding required)

### Step 1: Put this code on GitHub
1. Go to github.com and sign in.
2. Click the "+" in the top right → "New repository."
3. Name it `daily-news`. Public or Private, your choice.
4. Don't check any of the extra boxes (README, .gitignore, license) — leave it empty.
5. Click "Create repository."
6. On the next screen, find the link for uploading an existing file, then drag
   in all the files from this folder.
7. Important: `layout.js` and `page.js` need to end up inside a folder called
   `app`. If GitHub doesn't preserve the folder automatically when you drag
   them in, rename each one to `app/layout.js` and `app/page.js` in the
   upload screen — that will create the folder for you.
8. Scroll down and click the green "Commit changes" button.

### Step 2: Deploy it on Vercel
1. Go to vercel.com and sign in.
2. Click "Add New" → "Project."
3. Select your `daily-news` repo from the list.
4. Vercel will auto-detect it's a Next.js app — don't change any settings.
5. Click "Deploy."
6. Wait 1-2 minutes. Vercel gives you a live URL (something like
   `daily-news.vercel.app`) — open it, and you should see real headlines
   pulled from NPR's feed.

### Step 3: Make it yours
Once it's live, try swapping the feed URL in `app/page.js` (the `FEED_URL`
line) for a local news source instead of NPR. Any site with an RSS feed
works — look for `/rss` or `/feed` on a news site, or search
"[site name] RSS feed."

Come back once this is deployed and we'll add the next piece: a real
database so headlines get saved instead of just fetched live every time.
