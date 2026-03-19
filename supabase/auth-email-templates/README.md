# Supabase Auth Email Templates

Haven-branded HTML templates to paste into the Supabase dashboard.

## How to apply

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Authentication → Email Templates
3. For each template below, paste the HTML and set the sender name/email

## Templates

| File | Supabase template name | Sender |
|------|----------------------|--------|
| `confirmation.html` | Confirm signup | Haven &lt;cane@familyhaven.app&gt; |
| `password-reset.html` | Reset password | Haven &lt;cane@familyhaven.app&gt; |
| `magic-link.html` | Magic link | Haven &lt;cane@familyhaven.app&gt; |

## Sender settings

In Supabase → Authentication → Email Templates, set:
- **Sender name:** Haven
- **Sender email:** cane@familyhaven.app

Note: Supabase uses `{{ .ConfirmationURL }}` as the template variable for the action link.
All templates use this variable — do not change it.
