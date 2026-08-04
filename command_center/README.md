# Rykas Inc. Website

Premium marketing site for a brand-facing Amazon launch, management, and channel-control partner, built inside the existing `command_center` Next.js app while preserving the authenticated internal execution dashboard at `/dashboard`.

## Information Architecture

Public marketing routes:

- `/`
- `/assessment`
- `/amazon-launch`
- `/channel-control`
- `/services`
- `/about`
- `/contact`

Legacy redirects:

- `/strategy` -> `/amazon-launch`
- `/results` -> `/channel-control`

Preserved internal app routes:

- `/dashboard`
- `/daily-brief`
- `/weekly-review`
- `/tasks`
- `/projects`
- `/settings`

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Prisma
- shadcn-style UI primitives in `components/ui`

## Key Features

- premium responsive marketing site with sticky header and desktop CTA
- light/dark theme toggle with premium dark mode
- animated homepage channel transformation visual
- dedicated Amazon Channel Assessment intake path
- strategy call and assessment forms that persist leads via Prisma `ContactLead`
- SEO metadata plus `robots.txt` and `sitemap.xml`
- CMS-like content config for easy copy editing
- existing internal command-center app preserved behind auth

## Local Development

Run these commands from the `command_center` folder.

1. Install dependencies

```bash
npm install
```

2. Copy environment variables if needed

```bash
cp .env.example .env
```

3. Sync Prisma schema

```bash
npm run prisma:db:push
npm run prisma:generate
```

4. Start the app

```bash
npm run dev
```

5. Optional checks

```bash
npm run lint
npm run build
```

## Where To Edit Content

Primary copy and route-driven content:

- `content/site-content.ts`

Public page files:

- `app/page.tsx`
- `app/assessment/page.tsx`
- `app/amazon-launch/page.tsx`
- `app/channel-control/page.tsx`
- `app/services/page.tsx`
- `app/about/page.tsx`
- `app/contact/page.tsx`

Shared marketing components:

- `components/marketing/site-header.tsx`
- `components/marketing/site-footer.tsx`
- `components/marketing/channel-transformation-visual.tsx`
- `components/marketing/assessment-form.tsx`
- `components/marketing/contact-form.tsx`
- `components/marketing/lead-magnet-form.tsx`
- `components/marketing/testimonial-grid.tsx`

Theme and global styling:

- `app/globals.css`
- `app/layout.tsx`

Lead persistence:

- `prisma/schema.prisma`
- `prisma/schema.postgres.prisma`

## Brand Setup Checklist

Before production launch, update:

- brand name, contact info, and `siteUrl` in `content/site-content.ts`
- strategy call scheduler embed placeholder on `app/contact/page.tsx`
- illustrative testimonials with approved real proof
- any placeholder email address used for contact links

## Deployment

This repo already supports Netlify, Vercel, and Railway. The deploy base directory remains `command_center`.

### Vercel

- Base directory: `command_center`
- Build command: `npm run vercel:build`
- Output: Next.js default

### Netlify

- Base directory: `command_center`
- Build command: `npm run netlify:build`
- Scheduled functions already live under `netlify/functions`

### Railway

- Web predeploy: `npm run railway:web:predeploy`
- Web start: `npm run railway:web:start`
- Optional cron start: `npm run railway:cron:start`

## Notes

- The public site now owns `/`, while the internal action sheet moved to `/dashboard`.
- Login redirects authenticated users to `/dashboard`.
- The public marketing shell is intentionally kept separate from the authenticated app shell.
- Public messaging is written for brands, manufacturers, and ecommerce operators seeking Amazon help, not for marketplace education.
