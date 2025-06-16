import { PrismaClient } from "@prisma/client";

export async function processCommits(
  prisma: PrismaClient,
  commits: any[],
  branch: string,
  repositoryId: number,
  authorId: number
) {
  const commitPromises = commits.map(commit =>
    prisma.commit.create({
      data: {
        sha: commit.id,
        message: commit.message,
        url: commit.url,
        branch,
        additions: commit.added?.length || 0,
        deletions: commit.removed?.length || 0,
        filesChanged:
          (commit.added?.length || 0) +
          (commit.removed?.length || 0) +
          (commit.modified?.length || 0),
        committedAt: new Date(commit.timestamp),
        authorId,
        repositoryId,
      },
    })
  );

  await Promise.all(commitPromises);
}
