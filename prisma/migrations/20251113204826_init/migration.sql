/*
  Warnings:

  - You are about to drop the `Environment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Product` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Record` table. If the table is not empty, all the data it contains will be lost.
  - The primary key for the `Company` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `email` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `id_company` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `Company` table. All the data in the column will be lost.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id_enviroment` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `id_user` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `points` on the `User` table. All the data in the column will be lost.
  - Added the required column `id` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rolId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Environment_id_company_key";

-- DropIndex
DROP INDEX "Product_barcode_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Environment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Product";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Record";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Rol" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Client" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_userId_key" ON "Company"("userId");
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rolId" INTEGER NOT NULL,
    CONSTRAINT "User_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("email", "password", "username") SELECT "email", "password", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Rol_name_key" ON "Rol"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_key" ON "Client"("userId");
