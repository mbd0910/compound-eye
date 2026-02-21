import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

function parseGitHubRepo(url: string): string | null {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/
  );
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/
  );
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;

  return null;
}

async function getOriginUrl(repoPath: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    return output.trim() || null;
  } catch {
    return null;
  }
}

async function findGitRoots(rootPath: string): Promise<string[]> {
  const roots: string[] = [];
  const queue: string[] = [resolve(rootPath)];

  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const hasGit = entries.some((e) => e.name === ".git");
    if (hasGit) {
      roots.push(dir);
      continue;
    }

    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        !entry.name.startsWith(".")
      ) {
        queue.push(join(dir, entry.name));
      }
    }
  }

  return roots;
}

export async function scanForGitRepos(rootPath: string): Promise<string[]> {
  const expanded = rootPath.startsWith("~")
    ? rootPath.replace("~", process.env.HOME || "")
    : rootPath;

  const gitRoots = await findGitRoots(expanded);

  const candidates: string[] = [];
  for (const root of gitRoots) {
    const url = await getOriginUrl(root);
    if (!url) continue;
    const repo = parseGitHubRepo(url);
    if (repo) candidates.push(repo);
  }

  return [...new Set(candidates)].sort();
}
