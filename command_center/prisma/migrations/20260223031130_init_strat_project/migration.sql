-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountSize" REAL,
    "maxRiskPerTradePercent" REAL NOT NULL DEFAULT 2,
    "preferredDteMin" INTEGER NOT NULL DEFAULT 30,
    "preferredDteMax" INTEGER NOT NULL DEFAULT 60,
    "definedRiskOnly" BOOLEAN NOT NULL DEFAULT true,
    "earningsBufferDays" INTEGER NOT NULL DEFAULT 7,
    "concentrationLimit" INTEGER NOT NULL DEFAULT 4,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchlistTicker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "sector" TEXT,
    "manualIvrBucket" TEXT,
    "nextEarningsDate" DATETIME,
    "lastManualRefreshAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WatchlistTicker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceBar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" REAL NOT NULL,
    "adjClose" REAL,
    "provider" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FetchState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "lastFetchedAt" DATETIME NOT NULL,
    "rangeStart" DATETIME,
    "rangeEnd" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "WatchlistTicker_userId_idx" ON "WatchlistTicker"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistTicker_userId_symbol_key" ON "WatchlistTicker"("userId", "symbol");

-- CreateIndex
CREATE INDEX "PriceBar_symbol_timeframe_date_idx" ON "PriceBar"("symbol", "timeframe", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PriceBar_symbol_timeframe_date_key" ON "PriceBar"("symbol", "timeframe", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FetchState_symbol_provider_key" ON "FetchState"("symbol", "provider");
