-- CreateTable
CREATE TABLE "AssignmentFile" (
    "assignmentId" UUID NOT NULL,
    "fileAssetId" UUID NOT NULL,

    CONSTRAINT "AssignmentFile_pkey" PRIMARY KEY ("assignmentId","fileAssetId")
);

-- AddForeignKey
ALTER TABLE "AssignmentFile" ADD CONSTRAINT "AssignmentFile_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentFile" ADD CONSTRAINT "AssignmentFile_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
