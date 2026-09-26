<!-- https://docs.graph8.com/developers/cli-examples/ -->
# CLI Examples

Six worked workflows you can run today. Each example assumes you’ve already authenticated (`g8 login` or `export G8_API_KEY=...`). See CLI overview for the full command reference. 

`` 

## 1. Prospect and save to list 
Find VPs of Engineering at SaaS companies, save the top 50 to a campaign list. 
Terminal window
```

# 1. Create the target list

LIST_ID=$(g8 create-list --title "Q3 VP Engineering — SaaS SMB" | jq -r '.id')

# 2. Search + save in one shot (credits charged per contact saved)

g8 build-list --title "Q3 VP Engineering — SaaS SMB" \

--filters '[

{"field":"seniority_level","operator":"any_of","value":["VP"]},

{"field":"job_title","operator":"contains","value":["Engineering"]},

{"field":"company_industry","operator":"contains","value":["SaaS"]},

{"field":"company_employee_count","operator":"between","value":[50,500]}

]' \

--max-results 50
```

## 2. Sequence enrollment 
Add a saved list of contacts to a sequence, then track engagement. 
Terminal window
```

# 1. List sequences and grab the one you want

SEQ_ID=$(g8 sequences --limit 50 | jq -r '.[] | select(.name=="Q3 VP Engineering Outbound") | .id')

# 2. Get contact IDs from the list

CONTACT_IDS=$(g8 search-contacts --list-id 637 --limit 100 | jq -r '[.[].id] | join(",")')

# 3. Enroll (real sends — verify first)

g8 add-to-sequence --sequence-id "$SEQ_ID" --contact-ids "$CONTACT_IDS" --list-id 637

# 4. Check engagement 24 hours later

g8 sequence-analytics --sequence-id "$SEQ_ID"
```

## 3. Quote-to-cash 
Create and send a quote with a signing link + payment link. 
Terminal window
```

# 1. Discover the product catalog

g8 list-quotable-products | jq -r '.[] | "\(.id)\t\(.name)\t$\(.unit_price)/\(.currency)"'

# 2. Create the quote

QUOTE_ID=$(g8 create-quote \

--contact-id 5028106 \

--line-items '[

{"product_id":"prod_platform","quantity":1,"unit_price":499,"recurring":true},

{"name":"Onboarding (one-time)","quantity":1,"unit_price":2500}

]' \

--currency USD \

--expires-at 2026-07-15T00:00:00Z \

--notes "Includes 90-day money-back guarantee." | jq -r '.id')

# 3. Send it

g8 send-quote --quote-id "$QUOTE_ID" --recipient-email [email protected]

# 4. Track signature status

g8 get-quote --quote-id "$QUOTE_ID" | jq '.status'
```

## 4. Reply triage and AI draft 
Pull unread inbox threads, generate AI drafts, send replies. 
Terminal window
```

# 1. List unread email threads

g8 inbox-list --channel email --status unread --limit 20 | jq -c '.[]' > /tmp/unread.jsonl

# 2. For each, generate an AI draft (costs credits per draft)

while read -r thread; do

REPLY_ID=$(echo "$thread" | jq -r '.id')

DRAFT=$(g8 inbox-draft --reply-id "$REPLY_ID" --channel email | jq -r '.body')

# Print for human review (uncomment send to actually deliver)

echo "=== Thread $REPLY_ID ==="

echo "$DRAFT"

echo

# g8 inbox-send --reply-id "$REPLY_ID" --channel email --body "$DRAFT"

done < /tmp/unread.jsonl
```

## 5. Build + execute a workflow 
Author a stage-checklist pipeline, attach it to a workflow, run it. 
Terminal window
```

# 1. Get an AI-suggested pipeline based on org context

g8 suggest-stage-pipeline | jq '.'

# 2. Promote the suggestion (replace ID with your real one)

g8 create-stage-pipeline-from-suggestion --suggestion-id sug_abc123 --name "PLG Path"

# 3. Author a workflow that triggers on a form submit

WF_ID=$(g8 workflow-create --name "Demo qualification" \

--config '{

"nodes": [

{"id":"n1","type":"form_trigger","config":{"form_id":"demo_request"}},

{"id":"n2","type":"slack_message","config":{"channel_id":"C0123","text":"New demo: {{n1.contact.work_email}}"}}

],

"connections":[{"from_node_id":"n1","to_node_id":"n2"}]

}' | jq -r '.id')

# 4. Validate

g8 workflow-validate --config "$(g8 workflow-get --workflow-id "$WF_ID" | jq -c '.config')"

# 5. Activate

g8 workflow-update --workflow-id "$WF_ID" --is-active true
```

## 6. Intent-driven outreach 
Find companies visiting a competitor URL, search for decision-makers, enroll them. 
Terminal window
```

# 1. Hot accounts visiting competitor pricing

g8 intent-url-companies --url "https://competitor.com/pricing" \

--date-from 2026-05-01 --limit 50 \

| jq -r '.[].domain' > /tmp/hot_domains.txt

# 2. For each hot domain, find VPs/Directors

> /tmp/new_contacts.txt

while read -r DOMAIN; do

g8 find-contacts \

--filters "[

{\"field\":\"company_domain\",\"operator\":\"any_of\",\"value\":[\"$DOMAIN\"]},

{\"field\":\"seniority_level\",\"operator\":\"any_of\",\"value\":[\"C-Suite\",\"VP\",\"Director\"]}

]" \

--limit 5 \

| jq -r '.[].id' >> /tmp/new_contacts.txt

done < /tmp/hot_domains.txt

# 3. Enroll in competitive displacement sequence (real sends)

IDS=$(paste -sd, /tmp/new_contacts.txt)

g8 add-to-sequence --sequence-id seq_competitive_displacement --contact-ids "$IDS" --list-id 0
```

## Patterns and idioms 

### Save command output for replay 
Terminal window
```

g8 search-contacts --job-title CTO --limit 200 > snapshot.json

jq -r '.[].work_email' snapshot.json | sort -u > emails.txt
```

### Bulk-create from CSV 
Terminal window
```

tail -n +2 leads.csv | while IFS=',' read -r email first last title; do

g8 create-contact --email "$email" --first-name "$first" --last-name "$last" --job-title "$title"

done
```

### Parallel-safe (respecting 50 rps) 
Terminal window
```

cat domains.txt | xargs -n 1 -P 3 -I {} \

bash -c 'sleep 0.6; g8 lookup-company --domain "{}"'
```

### Watch a long-running execution 
Terminal window
```

EXEC_ID=$(g8 workflow-execute --workflow-id wf_abc --trigger-payload '{}' | jq -r '.id')

while : ; do

STATUS=$(g8 workflow-get-execution --execution-id "$EXEC_ID" | jq -r '.status')

echo "$(date +%T) $STATUS"

[[ "$STATUS" == "completed" || "$STATUS" == "failed" || "$STATUS" == "stopped" ]] && break

sleep 5

done
```

## See also  
- CLI overview — full command reference 
- CLI FAQ — install, auth, scripting, output 
- SDK Examples — same workflows in TypeScript 
- MCP Examples — same workflows via an AI agent 
- Pricing — credit costs and plan comparison
