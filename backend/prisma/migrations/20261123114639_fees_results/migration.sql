-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE');

-- CreateTable
CREATE TABLE "FeeStructure" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "semesterId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFee" (
    "id" UUID NOT NULL,
    "structureId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeePayment" (
    "id" UUID NOT NULL,
    "studentFeeId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "receiptNo" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" UUID NOT NULL,

    CONSTRAINT "FeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultPublication" (
    "semesterId" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" UUID NOT NULL,

    CONSTRAINT "ResultPublication_pkey" PRIMARY KEY ("semesterId")
);

-- CreateIndex
CREATE INDEX "StudentFee_studentId_idx" ON "StudentFee"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFee_structureId_studentId_key" ON "StudentFee"("structureId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePayment_receiptNo_key" ON "FeePayment"("receiptNo");

-- CreateIndex
CREATE INDEX "FeePayment_studentFeeId_idx" ON "FeePayment"("studentFeeId");

-- CreateIndex
CREATE INDEX "FeePayment_paidAt_idx" ON "FeePayment"("paidAt");

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFee" ADD CONSTRAINT "StudentFee_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultPublication" ADD CONSTRAINT "ResultPublication_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultPublication" ADD CONSTRAINT "ResultPublication_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
