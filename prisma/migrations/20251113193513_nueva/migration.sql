-- CreateTable
CREATE TABLE "User" (
    "id_user" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "id_enviroment" INTEGER,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "User_id_enviroment_fkey" FOREIGN KEY ("id_enviroment") REFERENCES "Environment" ("id_environment") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Company" (
    "id_company" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Environment" (
    "id_environment" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "id_company" INTEGER NOT NULL,
    "enviroment_name" TEXT NOT NULL,
    CONSTRAINT "Environment_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "Company" ("id_company") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id_product" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "id_environment" INTEGER NOT NULL,
    "product_name" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    CONSTRAINT "Product_id_environment_fkey" FOREIGN KEY ("id_environment") REFERENCES "Environment" ("id_environment") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Record" (
    "id_record" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "id_user" INTEGER NOT NULL,
    "id_product" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Record_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "User" ("id_user") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Record_id_product_fkey" FOREIGN KEY ("id_product") REFERENCES "Product" ("id_product") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_email_key" ON "Company"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_id_company_key" ON "Environment"("id_company");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");
