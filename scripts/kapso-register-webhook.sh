#!/usr/bin/env bash
# Subscribe Kapso to the dashboard's inbound WhatsApp webhook for the Aivory-owned number.
# Run on a machine where the secrets are in the environment; nothing is printed except the result.
#
#   export KAPSO_API_KEY=...            # from Kapso: Integrations -> API keys
#   export KAPSO_PHONE_NUMBER_ID=...    # shown next to the number in Kapso
#   export KAPSO_WEBHOOK_SECRET=...     # must equal the dashboard's KAPSO_WEBHOOK_SECRET
#   scripts/kapso-register-webhook.sh https://app.example.com/dashboard
set -euo pipefail
: "${KAPSO_API_KEY:?}" "${KAPSO_PHONE_NUMBER_ID:?}" "${KAPSO_WEBHOOK_SECRET:?}"
base="${1:?usage: $0 <public dashboard base url, e.g. https://host/dashboard>}"
url="${base%/}/api/whatsapp/webhook"
body=$(printf '{"whatsapp_webhook":{"url":"%s","events":["whatsapp.message.received"],"secret_key":"%s"}}' "$url" "$KAPSO_WEBHOOK_SECRET")
code=$(curl -sS -o /tmp/kapso-register.out -w '%{http_code}' -X POST \
  "https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/${KAPSO_PHONE_NUMBER_ID}/webhooks" \
  -H "X-API-Key: ${KAPSO_API_KEY}" -H 'Content-Type: application/json' -d "$body")
echo "Kapso answered HTTP ${code} for ${url}"
[ "${code:0:1}" = "2" ] || { cat /tmp/kapso-register.out; echo; exit 1; }
rm -f /tmp/kapso-register.out
