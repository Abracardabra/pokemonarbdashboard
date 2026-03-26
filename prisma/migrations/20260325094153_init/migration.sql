-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "set" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT,
    "rarity" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "imagesSmall" TEXT,
    "imagesLarge" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JapanOffer" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "priceJPY" INTEGER NOT NULL,
    "inStock" BOOLEAN NOT NULL,
    "url" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JapanOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsMarket" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "marketPrice" INTEGER,
    "sellerCount" INTEGER,
    "tcgPlayerUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsMarket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Card_setId_idx" ON "Card"("setId");

-- CreateIndex
CREATE INDEX "Card_number_idx" ON "Card"("number");

-- CreateIndex
CREATE INDEX "JapanOffer_source_idx" ON "JapanOffer"("source");

-- CreateIndex
CREATE INDEX "JapanOffer_cardId_idx" ON "JapanOffer"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "JapanOffer_cardId_source_quality_key" ON "JapanOffer"("cardId", "source", "quality");

-- CreateIndex
CREATE UNIQUE INDEX "UsMarket_cardId_key" ON "UsMarket"("cardId");

-- CreateIndex
CREATE INDEX "UsMarket_updatedAt_idx" ON "UsMarket"("updatedAt");

-- AddForeignKey
ALTER TABLE "JapanOffer" ADD CONSTRAINT "JapanOffer_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsMarket" ADD CONSTRAINT "UsMarket_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
