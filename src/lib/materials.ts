export const METAL_TYPES = [
  '925 Silver',
  '925 Silver Gold-Plated',
  'Gold 14k',
  'Gold 18k',
  'White Gold',
  'Rose Gold',
  'Platinum',
  'Brass',
  'Stainless Steel',
  'Other',
];

export const FILLING_MATERIALS = [
  'Hot / Vitreous enamel',
  'Cold enamel',
  'Resin',
  'Gemstone',
  'Pearl',
  'None',
  'Other',
];

export const PLATING_TYPES = [
  '24k Gold Plate',
  '18k Gold Plate',
  'Rose Gold Plate',
  'Rhodium',
  'Silver Plate',
  'None',
  'Other',
];

export function sumCost(parts: {
  metalCostAmd?: number | null;
  fillingCostAmd?: number | null;
  platingCostAmd?: number | null;
  laborCostAmd?: number | null;
}): number {
  return (
    (parts.metalCostAmd || 0) +
    (parts.fillingCostAmd || 0) +
    (parts.platingCostAmd || 0) +
    (parts.laborCostAmd || 0)
  );
}
