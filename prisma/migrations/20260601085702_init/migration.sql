-- CreateTable
CREATE TABLE "Prospect" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyName" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "sector" TEXT,
    "status" TEXT NOT NULL DEFAULT 'New',
    "notes" TEXT,
    "scrapedData" TEXT,
    "generatedSubject" TEXT,
    "generatedBody" TEXT,
    "sentAt" DATETIME,
    "followUpDate" DATETIME,
    "repliedAt" DATETIME,
    "bookedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Settings_key_key" ON "Settings"("key");
