-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimit_windowEnd_idx" ON "RateLimit"("windowEnd");
