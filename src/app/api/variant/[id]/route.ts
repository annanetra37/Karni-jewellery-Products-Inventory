import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const v = await prisma.variant.findUnique({
    where: { id },
    select: {
      id: true, sku: true, designName: true, color: true, size: true,
      priceAmd: true, imageUrl: true,
      metalType: true, metalCostAmd: true,
      fillingMaterial: true, fillingCostAmd: true,
      platingType: true, platingCostAmd: true,
      laborCostAmd: true,
    },
  });
  if (!v) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const num = (d: unknown) => (d == null ? null : Number(d.toString()));
  return NextResponse.json({
    id: v.id, sku: v.sku, designName: v.designName, color: v.color, size: v.size,
    priceAmd: num(v.priceAmd), imageUrl: v.imageUrl,
    metalType: v.metalType, metalCostAmd: num(v.metalCostAmd),
    fillingMaterial: v.fillingMaterial, fillingCostAmd: num(v.fillingCostAmd),
    platingType: v.platingType, platingCostAmd: num(v.platingCostAmd),
    laborCostAmd: num(v.laborCostAmd),
  });
}
