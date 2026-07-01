#!/bin/sh
set -eu

dc() {
  docker compose -f compose.stg.yml "$@"
}

mkdir -p data/legacy data/inventory

dc up -d --remove-orphans
dc ps

dc exec -T be node dist/scripts/exportProcurementGoogleSheet.js --output-dir=/app/data/legacy
dc exec -T be test -f /app/data/legacy/HETDeliveryReturnRecords---clinicDb.csv
dc exec -T be test -f /app/data/legacy/HETDeliveryReturnRecords---deliverCollect.csv
dc exec -T be test -f /app/data/legacy/HETDeliveryReturnRecords---HETLot-TODEL.csv
dc exec -T be node dist/scripts/importProcurementLegacy.js --source-dir=/app/data/legacy

dc exec -T be node dist/scripts/exportInventoryGoogleSheet.js --output-dir=/app/data/inventory
dc exec -T be test -f /app/data/inventory/ventasInventory---item.csv
dc exec -T be test -f /app/data/inventory/ventasInventory---checkInOut.csv
dc exec -T be test -f /app/data/inventory/ventasInventory---itemRack.csv
dc exec -T be node dist/scripts/importInventoryLegacy.js --source-dir=/app/data/inventory
dc exec -T be node dist/scripts/syncHetInventory.js

for _ in $(seq 1 30); do
  wget -qO- https://stg-workorder.ventas.bio/api/health && exit 0
  sleep 2
done

exit 1
