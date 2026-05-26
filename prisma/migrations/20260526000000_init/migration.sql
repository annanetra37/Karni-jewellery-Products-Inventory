-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SALES', 'ADMIN');

-- CreateEnum
CREATE TYPE "SellingPointType" AS ENUM ('PHYSICAL', 'ONLINE', 'CONSIGNMENT');

-- CreateEnum
CREATE TYPE "VariantStatus" AS ENUM ('ACTIVE', 'OUT_OF_STOCK', 'ARCHIVED', 'COMING_SOON');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('SALE', 'CHECKIN', 'RETURN', 'ADJUSTMENT', 'TRANSFER', 'SAMPLE_GIFT', 'DAMAGE_LOSS');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('ONLINE', 'SALES_POINT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'READY', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_ORDER', 'LOW_STOCK', 'KACCA_MISMATCH', 'INVITE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALES',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inviteToken" TEXT,
    "inviteAcceptedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Design" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameHy" TEXT,
    "category" TEXT,
    "collection" TEXT,
    "subcollection" TEXT,
    "motif" TEXT,
    "culturalMeaningEn" TEXT,
    "culturalMeaningHy" TEXT,
    "metal" TEXT,
    "plating" TEXT,
    "enamelType" TEXT,
    "basePriceAmd" DECIMAL(12,2),
    "status" TEXT,
    "primaryImageUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "designName" TEXT NOT NULL,
    "category" TEXT,
    "collection" TEXT,
    "subcollection" TEXT,
    "size" TEXT,
    "color" TEXT,
    "priceAmd" DECIMAL(12,2) NOT NULL,
    "priceUsd" DECIMAL(12,2),
    "priceEur" DECIMAL(12,2),
    "priceRub" DECIMAL(12,2),
    "costAmd" DECIMAL(12,2),
    "barcode" TEXT,
    "imageUrl" TEXT,
    "weightG" DECIMAL(10,3),
    "reorderPoint" INTEGER NOT NULL DEFAULT 2,
    "status" "VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "onWebsite" BOOLEAN NOT NULL DEFAULT false,
    "onEtsy" BOOLEAN NOT NULL DEFAULT false,
    "onIg" BOOLEAN NOT NULL DEFAULT false,
    "inStockists" BOOLEAN NOT NULL DEFAULT false,
    "searchBlob" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellingPoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SellingPointType" NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sellingPointId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sellingPointId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "qtyDelta" INTEGER NOT NULL,
    "unitPriceAmd" DECIMAL(12,2),
    "performedById" TEXT NOT NULL,
    "saleId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isLoyalty" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "sellingPointId" TEXT NOT NULL,
    "customerId" TEXT,
    "soldById" TEXT NOT NULL,
    "subtotalAmd" DECIMAL(12,2) NOT NULL,
    "totalAmd" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AMD',
    "paymentMethod" "PaymentMethod" DEFAULT 'CASH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLineItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceAmd" DECIMAL(12,2) NOT NULL,
    "lineTotalAmd" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SaleLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "address" TEXT,
    "note" TEXT,
    "deadline" TIMESTAMP(3),
    "channel" "OrderChannel" NOT NULL,
    "sellingPointId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDrawerSession" (
    "id" TEXT NOT NULL,
    "sellingPointId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openingCountAmd" DECIMAL(12,2) NOT NULL,
    "openingById" TEXT NOT NULL,
    "openingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closingCountAmd" DECIMAL(12,2),
    "closingById" TEXT,
    "closingAt" TIMESTAMP(3),
    "expectedClosingAmd" DECIMAL(12,2),
    "discrepancyAmd" DECIMAL(12,2),
    "priorClosingAmd" DECIMAL(12,2),
    "handoverMismatch" BOOLEAN NOT NULL DEFAULT false,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,

    CONSTRAINT "CashDrawerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "relatedId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "ratePerAmd" DECIMAL(18,8) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "Design_designId_key" ON "Design"("designId");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_sku_key" ON "Variant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_barcode_key" ON "Variant"("barcode");

-- CreateIndex
CREATE INDEX "Variant_category_idx" ON "Variant"("category");

-- CreateIndex
CREATE INDEX "Variant_collection_idx" ON "Variant"("collection");

-- CreateIndex
CREATE INDEX "Variant_color_idx" ON "Variant"("color");

-- CreateIndex
CREATE INDEX "Variant_status_idx" ON "Variant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SellingPoint_name_key" ON "SellingPoint"("name");

-- CreateIndex
CREATE INDEX "InventoryItem_sellingPointId_idx" ON "InventoryItem"("sellingPointId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_variantId_sellingPointId_key" ON "InventoryItem"("variantId", "sellingPointId");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_idx" ON "StockMovement"("variantId");

-- CreateIndex
CREATE INDEX "StockMovement_sellingPointId_createdAt_idx" ON "StockMovement"("sellingPointId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_type_createdAt_idx" ON "StockMovement"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_saleNumber_key" ON "Sale"("saleNumber");

-- CreateIndex
CREATE INDEX "Sale_sellingPointId_createdAt_idx" ON "Sale"("sellingPointId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_soldById_createdAt_idx" ON "Sale"("soldById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "CashDrawerSession_sellingPointId_status_idx" ON "CashDrawerSession"("sellingPointId", "status");

-- CreateIndex
CREATE INDEX "CashDrawerSession_userId_openingAt_idx" ON "CashDrawerSession"("userId", "openingAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_currency_key" ON "FxRate"("currency");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_sellingPointId_fkey" FOREIGN KEY ("sellingPointId") REFERENCES "SellingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sellingPointId_fkey" FOREIGN KEY ("sellingPointId") REFERENCES "SellingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sellingPointId_fkey" FOREIGN KEY ("sellingPointId") REFERENCES "SellingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLineItem" ADD CONSTRAINT "SaleLineItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLineItem" ADD CONSTRAINT "SaleLineItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellingPointId_fkey" FOREIGN KEY ("sellingPointId") REFERENCES "SellingPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_sellingPointId_fkey" FOREIGN KEY ("sellingPointId") REFERENCES "SellingPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_openingById_fkey" FOREIGN KEY ("openingById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_closingById_fkey" FOREIGN KEY ("closingById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

