CREATE TABLE "CollectionMeta" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "imageUrl" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionMeta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollectionMeta_name_key" ON "CollectionMeta"("name");

CREATE TABLE "CategoryMeta" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "imageUrl" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CategoryMeta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoryMeta_name_key" ON "CategoryMeta"("name");
