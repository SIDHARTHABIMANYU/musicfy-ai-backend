# Musicfy AI Platform

An AI-integrated music platform that runs local LLM inference, exposes real-time AI control over playback via MCP, and automates concert ticket booking directly from a song play.

## Problem

Users had to leave the music platform entirely to look up and book concert tickets for the artists they were listening to. There was also no way for an external AI assistant (like Claude) to control playback on the platform in real time.

## Solution

Built a full AI music platform on AWS EC2 that:
- Runs a local LLM (Qwen 2.5:3b via Ollama) on EC2 instead of depending on external LLM APIs
- Exposes dual MCP (Model Context Protocol) transport layers — SSE for Claude Desktop, Streamable HTTP for claude.ai — enabling real-time bidirectional AI control of the platform
- Automates concert ticket booking through a cross-platform agent-to-agent pipeline: a song play triggers an artist lookup, surfaces a concert card, and books a ticket without leaving the app
- Logs every user intent and referral event to DynamoDB for cross-platform analytics

## Architecture

```
Website (AWS Amplify)
        |
        v
  Node.js Backend (AWS EC2, PM2)
        |
        +--> Ollama (Qwen 2.5:3b) — local LLM inference
        |
        +--> MCP Server (SSE + Streamable HTTP) <--> Claude Desktop / claude.ai
        |
        +--> Agent-to-Agent Booking Pipeline <--> Festora (concert booking)
        |
        +--> DynamoDB — intent + referral analytics
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, PM2 process management |
| AI / Inference | Ollama (Qwen 2.5:3b), MCP (Model Context Protocol) |
| Cloud | AWS EC2 (c6i.2xlarge), AWS Amplify |
| Database | DynamoDB |
| AI Clients | Claude Desktop (SSE transport), claude.ai (Streamable HTTP transport) |

## Key Features

- **Local LLM inference** — Qwen 2.5:3b deployed via Ollama, cutting dependency on external LLM APIs, exposed through a PM2-managed proxy with API-key authentication
- **Dual MCP transports** — enables Claude Desktop and claude.ai to control music playback on the platform in real time
- **Agent-to-agent booking** — cross-platform pipeline (Musicfy → Festora) that turns a song play into a booked concert ticket automatically
- **Cross-platform analytics** — DynamoDB logging of user intent and referral flows across both platforms

## Setup

```bash
git clone <repo-url>
cd musicfy-ai-backend
npm install
cp .env.example .env   # fill in your API keys (never commit .env)
pm2 start server.js --name musicfy-backend
```

## Environment Variables

Requires API keys/config for the internal proxy authentication and AWS access — see `.env.example`. None of these are committed to this repository.

## Note

This backend exposes dual MCP (Model Context Protocol) server transports, allowing Claude Desktop and claude.ai to control playback on the platform directly.

## Status

Built and deployed as part of an AI Engineering internship at Spinacle Technologies.
