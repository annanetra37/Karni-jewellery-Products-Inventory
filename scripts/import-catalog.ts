/**
 * One-time catalog import from Karni_Master_Product_Database.xlsx.
 * Idempotent: upserts on designId / sku.
 *
 * Usage: npm run import:catalog  (or npx tsx scripts/import-catalog.ts)
 */
import ExcelJS from 'exceljs';
import { PrismaClient, SellingPointType, VariantStatus } from '@prisma/client';
import path from 'node:path';
import { hashPassword } from '../src/lib/auth';

const prisma = new PrismaClient();

const SHEET = path.resolve(process.cwd(), 'Karni_Master_Product_Database.xlsx');

function cell(row: ExcelJS.Row, col: number): string | null {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text).trim() || null;
  return String(v).trim() || null;
}
function num(row: ExcelJS.Row, col: number): number | null {
  const v = row.getCell(col).value;
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function importDesigns(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet('Designs');
  if (!ws) throw new Error('Designs sheet missing');
  // Header row is row 2 (1-indexed); data starts row 3.
  let count = 0;
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const designId = cell(row, 1);
    if (!designId) continue;
    const nameEn = cell(row, 2) || designId;
    await prisma.design.upsert({
      where: { designId },
      create: {
        designId,
        nameEn,
        nameHy: cell(row, 3),
        category: cell(row, 4),
        collection: cell(row, 5),
        subcollection: cell(row, 6),
        motif: cell(row, 8),
        culturalMeaningEn: cell(row, 9),
        culturalMeaningHy: cell(row, 10),
        metal: cell(row, 12),
        plating: cell(row, 13),
        enamelType: cell(row, 14),
        status: cell(row, 19),
        primaryImageUrl: cell(row, 22),
      },
      update: {
        nameEn,
        nameHy: cell(row, 3),
        category: cell(row, 4),
        collection: cell(row, 5),
        subcollection: cell(row, 6),
        motif: cell(row, 8),
        culturalMeaningEn: cell(row, 9),
        culturalMeaningHy: cell(row, 10),
        metal: cell(row, 12),
        plating: cell(row, 13),
        enamelType: cell(row, 14),
      },
    });
    count++;
  }
  console.log(`✓ Designs upserted: ${count}`);
}

async function importVariants(wb: ExcelJS.Workbook) {
  const ws = wb.getWorksheet('Variants');
  if (!ws) throw new Error('Variants sheet missing');
  let count = 0;
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const sku = cell(row, 1);
    const designId = cell(row, 2);
    if (!sku || !designId) continue;
    const design = await prisma.design.findUnique({ where: { designId } });
    if (!design) continue;
    const designName = cell(row, 3) || design.nameEn;
    const category = cell(row, 4) ?? design.category;
    const collection = cell(row, 5) ?? design.collection;
    const subcollection = cell(row, 6) ?? design.subcollection;
    const size = cell(row, 7);
    const color = cell(row, 8);
    const priceAmd = num(row, 9) ?? 0;
    const priceUsd = num(row, 10);
    const priceEur = num(row, 11);
    const priceRub = num(row, 12);
    const costAmd = num(row, 13);
    const weightG = num(row, 19);
    const barcode = cell(row, 20);

    const blobParts = [sku, designName, category, collection, subcollection, size, color, barcode]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());
    const searchBlob = blobParts.join(' ');

    await prisma.variant.upsert({
      where: { sku },
      create: {
        sku,
        designId: design.id,
        designName,
        category,
        collection,
        subcollection,
        size,
        color,
        priceAmd,
        priceUsd: priceUsd ?? undefined,
        priceEur: priceEur ?? undefined,
        priceRub: priceRub ?? undefined,
        costAmd: costAmd ?? undefined,
        weightG: weightG ?? undefined,
        barcode: barcode ?? undefined,
        status: VariantStatus.ACTIVE,
        searchBlob,
      },
      update: {
        designName,
        category,
        collection,
        subcollection,
        size,
        color,
        priceAmd,
        priceUsd: priceUsd ?? undefined,
        priceEur: priceEur ?? undefined,
        priceRub: priceRub ?? undefined,
        costAmd: costAmd ?? undefined,
        weightG: weightG ?? undefined,
        barcode: barcode ?? undefined,
        searchBlob,
      },
    });
    count++;
  }
  console.log(`✓ Variants upserted: ${count}`);
}

async function seedSellingPoints() {
  const points: Array<{ name: string; type: SellingPointType; address?: string }> = [
    { name: 'Megamall', type: 'PHYSICAL', address: 'Megamall Yerevan, 34 Tsitsernakaberd Hwy, Yerevan, Armenia' },
    { name: 'Website', type: 'ONLINE' },
    { name: 'Instagram DM', type: 'ONLINE' },
    { name: 'Etsy', type: 'ONLINE' },
    { name: 'Wholesale', type: 'ONLINE' },
    { name: 'Cafesjian Center', type: 'CONSIGNMENT', address: '10 Tamanyan St, Yerevan, Armenia' },
    { name: 'Made By Armenia', type: 'CONSIGNMENT', address: 'Yerevan, Armenia' },
    { name: 'Matenadaran', type: 'CONSIGNMENT', address: '53 Mesrop Mashtots Ave, Yerevan, Armenia' },
    { name: 'UMA', type: 'CONSIGNMENT', address: 'Yerevan, Armenia' },
    { name: 'Other', type: 'ONLINE' },
  ];
  for (const p of points) {
    await prisma.sellingPoint.upsert({
      where: { name: p.name },
      create: { name: p.name, type: p.type, address: p.address },
      update: { type: p.type, address: p.address },
    });
  }
  console.log(`✓ Selling points seeded: ${points.length}`);
}

async function seedFxRates() {
  const rates = [
    { currency: 'USD', ratePerAmd: 0.0026 },
    { currency: 'EUR', ratePerAmd: 0.0024 },
    { currency: 'RUB', ratePerAmd: 0.205 },
  ];
  for (const r of rates) {
    await prisma.fxRate.upsert({
      where: { currency: r.currency },
      create: r,
      update: { ratePerAmd: r.ratePerAmd },
    });
  }
  console.log(`✓ FX rates seeded`);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    console.warn('⚠ ADMIN_EMAIL not set — skipping admin seed.');
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ Admin already exists: ${email}`);
    return;
  }
  const pw = process.env.ADMIN_INITIAL_PASSWORD || 'karni-admin-2026';
  await prisma.user.create({
    data: {
      email,
      fullName: process.env.ADMIN_NAME || 'Owner',
      passwordHash: await hashPassword(pw),
      role: 'SUPER_ADMIN',
      isActive: true,
      inviteAcceptedAt: new Date(),
    },
  });
  console.log(`✓ Admin created: ${email}  (initial password: ${pw})`);
}

async function main() {
  console.log(`Reading ${SHEET}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SHEET);
  await seedSellingPoints();
  await seedFxRates();
  await importDesigns(wb);
  await importVariants(wb);
  await seedAdmin();
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
