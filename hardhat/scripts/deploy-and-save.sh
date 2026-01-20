#!/usr/bin/env sh
set -euo pipefail
ADDR_FILE=/workspace/hardhat/contract-address.txt
PACK_FILE=/workspace/hardhat/pack-address.txt
OUT=$(npx hardhat run scripts/deploy.ts --network localhost)
echo "$OUT"
ADDR=$(echo "$OUT" | awk '/Deployed TowerlordsCards:/ {print $NF}')
PACK=$(echo "$OUT" | awk '/Deployed TowerlordsPack:/ {print $NF}')
if [ -z "$ADDR" ]; then
  echo "Failed to parse contract address" >&2
  exit 1
fi
echo "$ADDR" > "$ADDR_FILE"
[ -n "$PACK" ] && echo "$PACK" > "$PACK_FILE"
echo "Saved card address to $ADDR_FILE"
[ -n "$PACK" ] && echo "Saved pack address to $PACK_FILE"
