-- CreateTable
CREATE TABLE "TaskOAuthGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "domainIds" JSONB NOT NULL,
    "operations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TaskOAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOAuthCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantId" TEXT,
    "csrfHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consentedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "TaskOAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOAuthAccessToken" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TaskOAuthAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOAuthRateBucket" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskOAuthRateBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskOAuthGrant_userId_createdAt_idx" ON "TaskOAuthGrant"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOAuthCode_codeHash_key" ON "TaskOAuthCode"("codeHash");

-- CreateIndex
CREATE INDEX "TaskOAuthCode_userId_expiresAt_idx" ON "TaskOAuthCode"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOAuthAccessToken_tokenHash_key" ON "TaskOAuthAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TaskOAuthAccessToken_grantId_idx" ON "TaskOAuthAccessToken"("grantId");

-- AddForeignKey
ALTER TABLE "TaskOAuthGrant" ADD CONSTRAINT "TaskOAuthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOAuthCode" ADD CONSTRAINT "TaskOAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOAuthCode" ADD CONSTRAINT "TaskOAuthCode_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "TaskOAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOAuthAccessToken" ADD CONSTRAINT "TaskOAuthAccessToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "TaskOAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
