#!/usr/bin/env bash
# Provision the x402 endpoint VM on Oracle Cloud Always-Free.
# Resolve every OCID live from the API; never hand-copy them from output.
# Use --raw-output (bare values) so the label warning cannot corrupt parsing.
set -euo pipefail
export SUPPRESS_LABEL_WARNING=True

TEN=$(grep '^tenancy' ~/.oci/config | cut -d= -f2 | tr -d ' ')
AD=$(oci iam availability-domain list --query 'data[0].name' --raw-output | grep -E '^jKmJ' | head -1)
echo "tenancy : ${TEN:0:20}..."
echo "AD      : $AD"

# Read JSON from a file: the CLI's label warning goes to stdout and corrupts a pipe.
oci network subnet list --compartment-id "$TEN" --all \
  --query 'data[?"lifecycle-state"==`AVAILABLE`].{id:id,n:"display-name"}' \
  --output json > /tmp/subnets.json 2>/dev/null
SUBNET=$(python3 -c "
import json
d = json.load(open('/tmp/subnets.json'))
for s in d:
    if 'public' in s['n'].lower():
        print(s['id']); break
else:
    print(d[0]['id'])
")
echo "subnet  : ${SUBNET:0:24}..."

# x86_64 Ubuntu 24.04. Match on display-name: the image object has no
# "operating-system-version" field, so filter the name prefix instead.
oci compute image list --compartment-id "$TEN" \
  --operating-system "Canonical Ubuntu" --all \
  --query "data[?starts_with(\"display-name\",'Canonical-Ubuntu-24.04-')].[id, \"display-name\"]" \
  --output json > /tmp/images.json 2>/dev/null
IMG=$(python3 -c "
import json
for i in json.load(open('/tmp/images.json')):
    if 'aarch64' not in i[1] and 'Minimal' not in i[1]:
        print(i[0]); break
")
echo "image   : ${IMG:0:24}..."

PUBKEY=$(cat ~/.ssh/oci-vm-id_ed25519.pub)

cat > /tmp/x402-userdata.yaml <<YAML
#cloud-config
locale: en_US.UTF-8
keyboard:
  layout: us
timezone: Asia/Kolkata
package_update: true
packages:
  - curl
  - nginx
YAML

echo "--- launching x402-endpoint ---"
oci compute instance launch \
  --compartment-id "$TEN" \
  --availability-domain "$AD" \
  --shape VM.Standard.E2.1.Micro \
  --subnet-id "$SUBNET" \
  --image-id "$IMG" \
  --display-name x402-endpoint \
  --assign-public-ip true \
  --metadata "{\"ssh_authorized_keys\":\"$PUBKEY\"}" \
  --user-data-file /tmp/x402-userdata.yaml \
  --wait-for-state RUNNING \
  --query 'data.id' \
  --raw-output

echo "--- launched ---"
