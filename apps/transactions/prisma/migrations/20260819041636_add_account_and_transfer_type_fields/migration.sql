/*
  Warnings:

  - Added the required column `accountExternalIdCredit` to the `transactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountExternalIdDebit` to the `transactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `transferTypeId` to the `transactions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "accountExternalIdCredit" TEXT NOT NULL,
ADD COLUMN     "accountExternalIdDebit" TEXT NOT NULL,
ADD COLUMN     "transferTypeId" INTEGER NOT NULL;
