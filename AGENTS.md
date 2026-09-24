# AGENTS.md

## Overview

Next.js 16 (App Router) MVP for a school-festival "lie detector" site (Korean UI). Every page is a `"use client"` component.

## Key facts

- **Firestore is the source of truth when configured; `localStorage` is otherwise.** `lib/firestore.ts` wraps Firestore (collections `questions` / `records`, doc id = item id). `lib/storage.ts` is the write-through facade: it always updates the browser cache (keys `lie-detector-questions`, `lie-detector-records`) and, when Firebase is enabled, also fires the matching Firestore mutation. `lib/hooks.ts` (`useLiveRecords` / `useLiveQuestions`) hydrates from cache and subscribes via `onSnapshot` for real-time multi-device sync.
- **Firebase is opt-in and lazy.** It initializes only on the browser and only when `NEXT_PUBLIC_FIREBASE_*` env vars are set (see `.env.example` → `.env.local`). Without config the app runs localStorage-only; never treat Firebase as always available. `getDb()`/`getApp()` return `null` when disabled — guard before touching Firestore.
- **No backend API routes.** All persistence goes through `lib/storage.ts` / `lib/firestore.ts`.
- **Data is loaded in `useEffect` (via hooks), never during render**, matching the `typeof window === "undefined"` guards in `lib/storage.ts`. Keep this hydration-safe pattern.
- **Dynamic params are promises in Next 16.** `app/result/[id]/page.tsx` resolves `params` inside `useEffect`.
- **Tailwind CSS v4**: no `tailwind.config` file; global styles come from `@import "tailwindcss"` in `app/globals.css`. Define CSS variables there; use utility classes in components.
- `@/*` path alias maps to the repo root (tsconfig).
- **UI copy is entirely Korean** — write new user-facing strings in Korean.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (Next also type-checks here; this is the verification step)
- `npm run start` — serve production build

There are no lint, typecheck, or test scripts configured.