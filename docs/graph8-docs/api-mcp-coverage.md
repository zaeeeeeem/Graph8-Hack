<!-- https://docs.graph8.com/developers/api-mcp-coverage/ -->
# API and MCP coverage

The API and MCP expose overlapping surfaces. The presence of an API endpoint does not imply that a tool exists for that exact operation. 

## Choose an interface  
- Search the MCP tool reference for the action you need. 
- If no tool provides it, consult the API reference and check its authentication, scope and input requirements. 
- Confirm whether the operation is intended for your API principal. Public, app-token, administrative and session endpoints have different audiences. 
- Check the response and the destination record after a write. Do not retry a consequential action blindly after a timeout.  
In the audited contract, all 564 API operations have a direct call from a registered MCP tool. MCP server 0.64.0 includes 145 additional tools with input validation and progressive discovery. The final approval call relays a decision already authorized by the signed-in human in graph8. This is source coverage, not a guarantee that every operation is enabled in your organization. 

## Common reasons for a difference  
- A tool combines several API calls into a task. 
- A tool is discoverable but not initially visible in the client. 
- An API route serves authentication, infrastructure or an app-specific principal. 
- An API operation has not yet been wrapped as a tool.  
`g8_execute` invokes registered tools; it does not turn an arbitrary API route into a tool. 

## Related  
- Authentication 
- Key scopes 
- Errors 
- Idempotency  
Five internal operator reports require an existing internally minted operator API key. Ordinary organization keys and Owner/Admin roles do not grant access. See operator report setup. 
Nine app-object operations use a separate local app-token connection. See app-token connection setup. 
Public copilot and enrichment use a separate local write-key connection. See public-widget connection setup. 

## Trusted workflows in 0.63.0 
Three previously separate API operations now have direct tools with isolated authority. Human approval also has a read-only handoff to the authenticated review screen. 
| API operation | MCP workflow
| `POST /apps/{app_id}/deployments/{deployment_id}/status` | `g8_app_report_observed_build` derives progress from the actual Kubernetes build Job. The agent cannot supply status, a digest, or controller authority. 
See credential-provider and controller setup. Ordinary organization credentials and privileged roles cannot substitute for those connections. 

## Human-authorized decision relay in 0.64.0 
Use `g8_agent_submit_human_decision` with an `approval_id`. Without a stored authorization, it returns a link to the exact approval in graph8. Open the link, sign in, review the action and choose the decision to authorize. Then call the tool again within five minutes using your personal API key belonging to the same signed-in human. 
The tool cannot choose a decision or submit edited action details. The backend consumes the human authorization once, only if the action, owner and visibility still match. Expired or changed approvals require fresh human review. Organization API keys cannot submit this relay. A timeout requires checking the approval status before another attempt. 
The measured direct count is 564/564. A tool confirmation or elicitation response cannot substitute for human authorization. A recorded decision is distinct from downstream execution and its receipts. 
QA integration also adds app-record change history through `g8_app_object_record_changes`, using the existing app-token connection. The current registry has 599 tools; the existing feature IDs and categories remain unchanged.
