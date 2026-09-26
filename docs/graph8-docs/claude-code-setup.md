<!-- https://docs.graph8.com/developers/claude-code-setup/ -->
# Claude Code Setup

Claude Code is Anthropic’s CLI agent for coding tasks. Connect it to graph8’s MCP server and your terminal agent can scan repos, install tracking, prospect contacts, and run campaigns - all from prompts. 
Claude Code 

## Prerequisites  
- Claude Code installed (docs) 
- A graph8 account with a personal API key (stdio) or any active session (OAuth)  

## Hosted MCP (remote OAuth) 
Add graph8 to `~/.claude/mcp.json`: 

```

{

"mcpServers": {

"graph8": {

"url": "https://be.graph8.com/mcp/"

}

}

}
```

- Save the file. 
- Run `claude mcp list` and confirm `graph8` is listed. 
- Start a session: `claude`. 
- Ask anything that uses graph8 tools - the CLI opens a browser tab on first call for OAuth. Sign in and return to the terminal.  

## Self-hosted MCP (stdio) 
For headless setups or CI: 

```

{

"mcpServers": {

"graph8": {

"command": "uvx",

"args": ["g8-mcp-server"],

"env": {

"G8_API_KEY": "g8_...",

"G8_MCP_MODE": "dev"

}

}

}

}
```

Pick `G8_MCP_MODE` based on what you are doing:  
- `dev` - codebase work: repo scan, tracking install, progressive forms (17 tools) 
- `gtm` - campaign work: sequences, inbox, audience syncs (23 tools) 
- `all` - everything (35 tools)  
See Modes. 

## Example prompts 
Tie these to graph8 skills (planned) so you can invoke a full flow with one prompt:  
- Prospecting and lists: “Find 50 VP Engineering at Series B SaaS in the US. Show me the top 10 by signal score and ask before saving.” 
- Running a campaign: “Create a 5-step email sequence targeting trial users. Use g8_create_sequence then g8_get_sequence_preview before launching.” 
- Installing tracking: “Connect this Next.js repo to graph8, scan it, and install the tracking snippet. Then add a progressive email-capture form to the pricing page.” 
- AI inbox replies: “Check my graph8 inbox for replies in the last 24 hours. Generate AI draft replies for the warm ones. Ask me to approve each draft before sending.”  

## Slash-command shortcuts 
Claude Code supports slash commands defined in `.claude/commands/`. A `/prospect` command for a SaaS team could look like: 

```

---

name: prospect

description: Find and save SaaS prospects via graph8 MCP.

---

Use the graph8 MCP server to find prospects matching: $ARGUMENTS.

1. Use g8_find_contacts to preview matches.

2. Show me the top 10 by signal score.

3. On my confirmation, save them with g8_build_contact_list.

4. Report the new list ID.
```

Then run `/prospect VP Engineering, Series B SaaS, US` from any session. 

## Worked example: full GTM bootstrap 
Use the built-in graph8 prompt template: 

```

Use the graph8 gtm_setup prompt template with repo_url=https://github.com/acme/app.
```

This runs the canonical sequence: connect repo -> scan -> install -> launch. See End-to-end examples. 

## Related  
- MCP Server overview 
- MCP Tool Reference 
- MCP FAQ 
- VS Code setup
