# n8n-nodes-bouncelens

An [n8n](https://n8n.io/) community node that checks email addresses before you send to them or save them. It finds:

- **Typos** in the domain: `jane@gmial.com` → did you mean `jane@gmail.com`?
- **Disposable / throwaway** domains (mailinator.com, 10minutemail and ~9,000 more)
- **Dead domains**: the domain doesn't exist, has no mail server, or says it accepts no email (null MX)
- **Bad format**, **role addresses** (info@, sales@), **free providers**, and **duplicates** (Gmail dot and +tag variants count as the same inbox)
- The **mail provider** behind the domain (Google, Microsoft, Proofpoint, …)

**No API key, no account, no credits.** The check runs inside your n8n instance. The only network calls are DNS lookups over HTTPS (Cloudflare 1.1.1.1), and only the domain name is sent, never the full address. It uses the same checks as the free checker at **[bouncelens.com](https://bouncelens.com/)**.

> It never connects to the recipient's mail server, so it can't confirm that a mailbox exists. The best result is `unconfirmed` (format and domain OK).

[Installation](#installation) · [Usage](#usage) · [Result](#result) · [Compatibility](#compatibility) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is `n8n-nodes-bouncelens`.

## Usage

Add the **BounceLens Email Check** node after any node that outputs items with an email address.

| Setting | Default | What it does |
|---------|---------|--------------|
| Email | `{{ $json.email }}` | The address to check. One per item. |
| Put Result in Field | `emailCheck` | Field added to each item with the result. All other fields are kept. |

Then route on the result with an **If** or **Switch** node, for example:

- `{{ $json.emailCheck.status }}` equals `unconfirmed` → continue (add to CRM, send welcome email)
- `{{ $json.emailCheck.did_you_mean }}` is not empty → ask the person to confirm the corrected address
- `{{ $json.emailCheck.flags.disposable }}` is true → reject the sign-up

All items of one run are checked together: each domain is looked up once, and duplicates are flagged across the whole run. The node can also be used as a tool by an AI Agent node.

## Result

Real output for a mistyped Outlook address:

```json
{
  "input": "jane@outlok.com",
  "email": "jane@outlok.com",
  "status": "risky",
  "reasons": ["No MX record; mail would go to the website server", "Looks like a typo of outlook.com"],
  "flags": { "disposable": false, "role": false, "free": false, "duplicate": false, "gateway": false },
  "did_you_mean": "jane@outlook.com",
  "provider": null,
  "mx": null
}
```

| status | Meaning |
|--------|---------|
| `invalid` | Will bounce: bad format, domain doesn't exist, no mail server, or null MX |
| `risky` | Disposable domain, likely typo, no MX record (mail would go to the web server), or the DNS lookup failed |
| `unconfirmed` | Format and domain OK. The mailbox itself isn't checked |

An empty or missing email is not an error: it comes back as `invalid`.

## Compatibility

Built with `@n8n/node-cli` against n8n 2.x. No runtime dependencies. Your n8n instance must be able to reach `https://cloudflare-dns.com`.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [BounceLens](https://bouncelens.com/): the same checks for a whole list or CSV, in the browser
- Questions: hello@bouncelens.com

## License

[MIT](LICENSE.md)
