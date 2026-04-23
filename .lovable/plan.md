

# Add Recipe Sharing for Facebook, TikTok, YouTube, Instagram

## Goal
Make it one tap for you to grab a clean recipe link + caption to drop into your Facebook posts, TikTok captions, YouTube descriptions, and Instagram bio/Stories.

## What Gets Built

### 1. "Share" button on every recipe page
Sits in the hero next to Print / Download PDF. Opens a popover with everything pre-formatted for your four platforms:

- **Facebook** — one-tap "Share to Facebook" button (opens FB share dialog with the recipe link + auto preview card pulled from the recipe photo, name, and hook).
- **Instagram** — Instagram doesn't allow direct link sharing from the web, so the popover gives you:
  - **Copy link** (paste into your Linktree / link-in-bio / Stories link sticker)
  - **Copy caption** (recipe name + hook + link, ready to paste into a Reel/post)
  - **QR code** (screenshot it and slap it on a Story or Reel end-card so viewers can scan)
- **TikTok** — same as Instagram (no direct web share). Use **Copy caption** for the post text and the **QR code** as a video overlay so viewers can scan from the screen.
- **YouTube** — **Copy link** + **Copy description block** (recipe name, ingredients summary, full link) ready to paste into the video description.

### 2. Pre-written caption template
The popover shows an editable, ready-to-copy block:
```
{Recipe Name} 🍴
{hook}

Full recipe → vpsfinest.com/recipes/{id}
#catering #ohio #recipe
```
One "Copy caption" button.

### 3. QR code generator
A small QR code of the recipe URL renders in the popover. Tap it to enlarge / screenshot. Drop it on TikTok/Reels/Shorts video overlays so on-screen viewers can scan straight to the recipe.

### 4. Native mobile share
On your phone, a "Share…" button uses iOS/Android's native share sheet — so you can send the link directly to the Instagram app, Messages, TikTok DMs, etc., without copy-paste.

### 5. Rich link previews (already working, will verify)
When you paste the recipe URL into Facebook or anywhere else, it auto-shows the recipe photo + name + hook as a preview card. The meta tags are already wired in `recipes_.$id.tsx` — will confirm the recipe image is the one used.

## Files

**Create:**
- `src/components/recipes/RecipeShareButton.tsx` — popover with Facebook button, copy-link, copy-caption, copy-YouTube-description, QR code, native share

**Modify:**
- `src/routes/recipes_.$id.tsx` — drop `<RecipeShareButton />` into the hero action row
- `package.json` — add `qrcode` + `@types/qrcode`

**No backend changes.** All client-side.

## Your Workflow After This Ships
1. Open the recipe → tap **Share**
2. **Facebook**: tap "Share to Facebook" → done
3. **Instagram/TikTok**: tap "Copy caption" → paste into the post; optionally screenshot the QR for the video overlay
4. **YouTube**: tap "Copy description" → paste into your video description

