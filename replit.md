# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **WhatsApp**: Baileys (multi-device, QR scan)
- **AI**: Google Gemini 1.5 Flash + Groq llama-3.3-70b-versatile

## Artifacts

### نور Dashboard (`artifacts/nour-dashboard`)
WhatsApp AI Agent control panel for the Yazaki Image Table Reader project.
- React + Vite frontend
- Preview path: `/`
- Pages: Dashboard, Contacts, Messages, Broadcast, WhatsApp, Settings

### API Server (`artifacts/api-server`)
Express backend with WhatsApp Baileys integration and AI chat capabilities.
- Routes: `/api/whatsapp`, `/api/contacts`, `/api/messages`, `/api/settings`, `/api/stats`
- WhatsApp session stored in `.whatsapp-session/`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## DB Schema

- `contacts` — WhatsApp contacts who messaged the agent
- `messages` — All inbound/outbound messages with AI model tracking
- `settings` — Key-value store for app configuration

## Features

- WhatsApp connection via QR code scan (Baileys)
- AI auto-replies using Gemini or Groq
- Contact management with block/unblock
- Full message history per contact
- Broadcast messages to all contacts
- Dashboard stats and 7-day activity chart
- Settings: owner info, project info, AI keys, agent personality

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
