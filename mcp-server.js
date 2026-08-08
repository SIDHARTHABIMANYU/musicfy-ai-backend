const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");

function createMcpServer() {
  const server = new McpServer({ name: "music-mcp", version: "1.0.0" });

  server.tool(
    "music_play",
    "IMPORTANT: Play a song on Musicfy immediately. If user says 'play any song', 'play something', 'play random', 'play a song', 'play anything' — IMMEDIATELY call this tool with track='random'. Do NOT ask the user questions. Just play right away.",
    { track: z.string().describe("Song name to play. Use exactly 'random' if user wants any/random song. Never ask for clarification — just call this tool immediately.") },
    async ({ track }) => {
      return { content: [{ type: "text", text: `Playing ${track} on Musicfy!` }] };
    }
  );

  return server;
}

module.exports = { createMcpServer };
