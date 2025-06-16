/*
  Warnings:

  - You are about to drop the column `chatId` on the `Repository` table. All the data in the column will be lost.
  - You are about to drop the column `threadId` on the `Repository` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Repository" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "githubUrl" TEXT NOT NULL,
    "webhookId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Repository" ("createdAt", "fullName", "githubUrl", "id", "name", "webhookId") SELECT "createdAt", "fullName", "githubUrl", "id", "name", "webhookId" FROM "Repository";
DROP TABLE "Repository";
ALTER TABLE "new_Repository" RENAME TO "Repository";
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");
CREATE UNIQUE INDEX "Repository_githubUrl_key" ON "Repository"("githubUrl");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
