import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

/**
 * Read-only batch-record assembly for a finished-goods LOT. Everything here is
 * reconstructed from the immutable production tables (work orders, serials,
 * equipment, sterilisation, signatures, genealogy) — no writes. A released run
 * mints a FINISHED_GOOD InventoryLot (workOrderService.recordWorkOrderRelease);
 * this walks back from that lot to the full phase-by-phase record.
 */

const staffRef = { select: { id: true, name: true, email: true } } as const;

const batchRecordWoInclude = {
  phase: { select: { id: true, phaseName: true, phaseShort: true, sortOrder: true, isGate: true } },
  manufacturer: { select: { id: true, manuNumber: true, manuName: true } },
  startSignBy: staffRef,
  endSignBy: staffRef,
  releaseDecisionBy: staffRef,
  woSerials: {
    select: {
      id: true,
      serialNumber: true,
      bomRef: {
        select: {
          id: true,
          description: true,
          quantity: true,
          uom: true,
          hasSerial: true,
          inventorySku: { select: { id: true, sku: true, description: true } },
        },
      },
    },
  },
  phaseEquips: { select: { phaseEquip: { select: { id: true, equipId: true, name: true, description: true } } } },
  sterilises: {
    select: {
      id: true,
      direction: true,
      result: true,
      betReading: true,
      quantity: true,
      signOn: true,
      signaturePath: true,
      createdAt: true,
      signBy: staffRef,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies PrismaTypes.WorkOrderInclude;

type BatchRecordWorkOrder = Prisma.WorkOrderGetPayload<{ include: typeof batchRecordWoInclude }>;
type StaffRef = { id: string; name: string | null; email: string } | null;

function signerName(staff: StaffRef): string | null {
  return staff?.name || staff?.email || staff?.id || null;
}

function notFound(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, { code: 'P2025', clientVersion: 'unknown' });
}

/**
 * Assemble the full batch record for a finished-goods lot number. Resolves the
 * releasing work order via the lot, walks the run chain backward through
 * `previousWoId`, then supplements with any peer work orders sharing the run's
 * HET so no phase is missed. Ordered first phase -> release.
 */
export async function getBatchRecord(lotNumber: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);

  const lot = await prisma.inventoryLot.findFirst({
    where: { tenantId: scopedTenantId, lotNumber, inventoryType: 'FINISHED_GOOD', deleted: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!lot) throw notFound('Finished-goods lot not found');
  if (!lot.workOrderId) {
    throw new Error('cannot assemble batch record: lot is not linked to a work order');
  }

  // Walk the run chain backward via previousWoId (loop, not recursion). `seen`
  // guards against a malformed cycle.
  const workOrders = new Map<string, BatchRecordWorkOrder>();
  const seen = new Set<string>();
  let cursor: string | null = lot.workOrderId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const workOrder: BatchRecordWorkOrder | null = await prisma.workOrder.findFirst({
      where: { id: cursor, tenantId: scopedTenantId },
      include: batchRecordWoInclude,
    });
    if (!workOrder) break;
    workOrders.set(workOrder.id, workOrder);
    cursor = workOrder.previousWoId;
  }

  const releasingWo = workOrders.get(lot.workOrderId) ?? null;
  const runHetId = lot.hetId ?? releasingWo?.hetId ?? null;

  // Supplement with any peer work orders on the same HET not already in the
  // previousWoId chain (e.g. legacy runs not fully linked).
  if (runHetId) {
    const peers = await prisma.workOrder.findMany({
      where: { tenantId: scopedTenantId, hetId: runHetId, deleted: false },
      include: batchRecordWoInclude,
    });
    for (const peer of peers) if (!workOrders.has(peer.id)) workOrders.set(peer.id, peer);
  }

  const orderedWos = [...workOrders.values()].sort(
    (a, b) => (a.phaseOrder ?? 0) - (b.phaseOrder ?? 0) || a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const manufacturer = orderedWos.map((workOrder) => workOrder.manufacturer).find(Boolean) ?? null;

  const hetOrigin = runHetId
    ? await prisma.het.findFirst({
        where: { id: runHetId, tenantId: scopedTenantId },
        select: { id: true, hetNumber: true, clinicName: true, HCICode: true, clinicId: true },
      })
    : null;

  const genealogy = await prisma.inventoryGenealogy.findMany({
    where: { tenantId: scopedTenantId, childInventoryLotId: lot.id, deleted: false },
    include: { parentInventoryLot: { select: { id: true, lotNumber: true, inventoryType: true, hetId: true } } },
  });

  return {
    lot: {
      id: lot.id,
      lotNumber: lot.lotNumber,
      inventoryType: lot.inventoryType,
      status: lot.status,
      quantityInitial: lot.quantityInitial,
      quantityCurrent: lot.quantityCurrent,
      uom: lot.uom,
      createdAt: lot.createdAt,
    },
    manufacturer: manufacturer ? { manuNumber: manufacturer.manuNumber, manuName: manufacturer.manuName } : null,
    release: releasingWo
      ? {
          status: releasingWo.releaseStatus,
          decisionAt: releasingWo.releaseDecisionAt,
          decidedBy: signerName(releasingWo.releaseDecisionBy),
          remarks: releasingWo.releaseRemarks,
        }
      : null,
    hetOrigin: hetOrigin
      ? { hetId: hetOrigin.id, hetNumber: hetOrigin.hetNumber, clinicName: hetOrigin.clinicName, HCICode: hetOrigin.HCICode }
      : null,
    genealogyParents: genealogy.map((edge) => ({
      id: edge.parentInventoryLot.id,
      lotNumber: edge.parentInventoryLot.lotNumber,
      inventoryType: edge.parentInventoryLot.inventoryType,
      hetId: edge.parentInventoryLot.hetId,
      relationshipType: edge.relationshipType,
    })),
    phases: orderedWos.map((workOrder) => ({
      workOrderId: workOrder.id,
      woNumber: workOrder.woNumber,
      phase: workOrder.phase
        ? {
            id: workOrder.phase.id,
            phaseName: workOrder.phase.phaseName,
            phaseShort: workOrder.phase.phaseShort,
            sortOrder: workOrder.phase.sortOrder,
            isGate: workOrder.phase.isGate,
          }
        : null,
      prodStart: workOrder.prodStart,
      prodEnd: workOrder.prodEnd,
      prodDuration: workOrder.prodDuration,
      outputQuantity: workOrder.outputQuantity,
      photoDataUrl: workOrder.imagePath,
      startSignature: workOrder.startSignPath
        ? { dataUrl: workOrder.startSignPath, signer: signerName(workOrder.startSignBy), at: workOrder.prodStart }
        : null,
      endSignature: workOrder.endSignPath
        ? { dataUrl: workOrder.endSignPath, signer: signerName(workOrder.endSignBy), at: workOrder.prodEnd }
        : null,
      serials: workOrder.woSerials.map((serial) => ({
        id: serial.id,
        serialNumber: serial.serialNumber,
        bomLine: serial.bomRef
          ? {
              id: serial.bomRef.id,
              description: serial.bomRef.description,
              quantity: serial.bomRef.quantity,
              uom: serial.bomRef.uom,
              inventorySku: serial.bomRef.inventorySku,
            }
          : null,
      })),
      equipment: workOrder.phaseEquips.map((binding) => ({
        phaseEquipId: binding.phaseEquip.id,
        equipId: binding.phaseEquip.equipId,
        name: binding.phaseEquip.name,
      })),
      sterilisations: workOrder.sterilises.map((sterilise) => ({
        id: sterilise.id,
        direction: sterilise.direction,
        result: sterilise.result,
        betReading: sterilise.betReading,
        signOn: sterilise.signOn,
        signer: signerName(sterilise.signBy),
        signatureDataUrl: sterilise.signaturePath,
      })),
    })),
  };
}

export type BatchRecord = Awaited<ReturnType<typeof getBatchRecord>>;

/**
 * Lean finished-goods list for the LOT page: lot number, product (workflow
 * name), released date, quantity, HET/clinic origin, status.
 */
export async function listFinishedGoodsLots(tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const lots = await prisma.inventoryLot.findMany({
    where: { tenantId: scopedTenantId, inventoryType: 'FINISHED_GOOD', deleted: false },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      workOrder: {
        select: {
          id: true,
          releaseStatus: true,
          releaseDecisionAt: true,
          workflow: { select: { name: true } },
          het: { select: { hetNumber: true, clinicName: true } },
        },
      },
      het: { select: { hetNumber: true, clinicName: true } },
    },
  });

  return lots.map((lot) => {
    const het = lot.workOrder?.het ?? lot.het ?? null;
    return {
      id: lot.id,
      lotNumber: lot.lotNumber,
      status: lot.status,
      quantity: lot.quantityCurrent ?? lot.quantityInitial,
      uom: lot.uom,
      product: lot.workOrder?.workflow?.name ?? null,
      releaseStatus: lot.workOrder?.releaseStatus ?? null,
      releasedAt: lot.workOrder?.releaseDecisionAt ?? null,
      workOrderId: lot.workOrderId,
      hetNumber: het?.hetNumber ?? null,
      clinicName: het?.clinicName ?? null,
      createdAt: lot.createdAt,
    };
  });
}

// --- PDF rendering -------------------------------------------------------

function decodeImage(dataUrl: string | null): Buffer | null {
  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/is.exec(dataUrl ?? '');
  if (!match) return null;
  // pdfkit embeds PNG and JPEG only; skip webp rather than crash the stream.
  if (match[1].toLowerCase() === 'webp') return null;
  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
}

function fmtDate(value: Date | null): string {
  return value ? new Date(value).toISOString().replace('T', ' ').slice(0, 19) : '—';
}

function fmtDecimal(value: Prisma.Decimal | null): string {
  return value == null ? '—' : value.toString();
}

/**
 * Render an assembled batch record into a pdfkit document. The caller owns the
 * document lifecycle (pipe to the reply, then `doc.end()`).
 */
export function renderBatchRecordPdf(doc: PDFKit.PDFDocument, record: BatchRecord) {
  const label = (text: string, value: string) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text(`${text}: `, { continued: true });
    doc.font('Helvetica').fillColor('#000').text(value || '—');
  };

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#000').text('Batch Record');
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#e5330e').text(record.lot.lotNumber ?? record.lot.id);
  doc.fillColor('#000').moveDown(0.5);

  label('Product', record.manufacturer?.manuName ?? record.release?.status ?? '—');
  label('Manufacturing number', record.manufacturer?.manuNumber ?? '—');
  label('Disposition', record.release?.status ?? '—');
  label('Released', fmtDate(record.release?.decisionAt ?? null));
  label('Released by', record.release?.decidedBy ?? '—');
  label('Quantity', fmtDecimal(record.lot.quantityInitial));
  label('Lot status', record.lot.status);

  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).text('HET origin');
  label('HET', record.hetOrigin?.hetNumber ?? '—');
  label('Clinic', record.hetOrigin?.clinicName ?? '—');
  label('HCI code', record.hetOrigin?.HCICode ?? '—');
  if (record.genealogyParents.length) {
    label(
      'Genealogy parents',
      record.genealogyParents.map((parent) => `${parent.lotNumber ?? parent.id} (${parent.relationshipType})`).join(', '),
    );
  }

  for (const phase of record.phases) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text(
      `${phase.phase?.sortOrder != null ? `${phase.phase.sortOrder}. ` : ''}${phase.phase?.phaseName ?? phase.phase?.phaseShort ?? phase.workOrderId}${phase.phase?.isGate ? '  [GATE]' : ''}`,
    );
    doc.moveTo(doc.x, doc.y).lineTo(555, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.3);

    label('Work order', phase.woNumber ?? phase.workOrderId);
    label('Started', fmtDate(phase.prodStart));
    label('Finished', fmtDate(phase.prodEnd));
    label('Duration (min)', fmtDecimal(phase.prodDuration));
    label('Output qty', fmtDecimal(phase.outputQuantity));

    if (phase.serials.length) {
      label(
        'Serials',
        phase.serials
          .map((serial) => `${serial.bomLine?.description ?? serial.bomLine?.id ?? 'line'}: ${serial.serialNumber ?? '—'}`)
          .join('; '),
      );
    }
    if (phase.equipment.length) {
      label('Equipment', phase.equipment.map((equip) => equip.name ?? equip.equipId ?? equip.phaseEquipId).join(', '));
    }
    for (const sterilise of phase.sterilisations) {
      label(
        'Sterilisation',
        `${sterilise.direction ?? '—'} · result ${sterilise.result == null ? 'pending' : sterilise.result ? 'PASS' : 'FAIL'} · BET ${fmtDecimal(sterilise.betReading)} · ${sterilise.signer ?? '—'} ${fmtDate(sterilise.signOn)}`,
      );
    }

    const photo = decodeImage(phase.photoDataUrl);
    if (photo) {
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9).text('Photo evidence');
      try {
        doc.image(photo, { fit: [200, 150] });
      } catch {
        doc.font('Helvetica').fontSize(8).fillColor('#999').text('(photo could not be rendered)').fillColor('#000');
      }
    }

    for (const [key, signature] of [
      ['Start signature', phase.startSignature],
      ['End signature', phase.endSignature],
    ] as const) {
      if (!signature) continue;
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(9).fillColor('#000').text(`${key} — ${signature.signer ?? '—'} · ${fmtDate(signature.at)}`);
      const image = decodeImage(signature.dataUrl);
      if (image) {
        try {
          doc.image(image, { fit: [180, 80] });
        } catch {
          doc.font('Helvetica').fontSize(8).fillColor('#999').text('(signature could not be rendered)').fillColor('#000');
        }
      }
    }
  }

  doc.moveDown(1);
  doc.font('Helvetica').fontSize(7).fillColor('#999').text(`Generated ${new Date().toISOString()} · immutable batch record`, { align: 'right' });
}
