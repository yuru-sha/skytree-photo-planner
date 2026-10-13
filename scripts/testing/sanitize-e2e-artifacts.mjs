import { Buffer } from "node:buffer";
import process from "node:process";
import { URL } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const artifactRoots = ["playwright-report", "test-results"];
const databasePassword = (() => {
  try {
    return decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").password);
  } catch {
    return "";
  }
})();
const secrets = [
  process.env.E2E_ADMIN_PASSWORD,
  process.env.E2E_PASSWORD_ADMIN_PASSWORD,
  process.env.E2E_PASSWORD_ADMIN_PASSWORD && `${process.env.E2E_PASSWORD_ADMIN_PASSWORD}-changed`,
  process.env.JWT_SECRET,
  process.env.REFRESH_SECRET,
  process.env.DATABASE_URL,
  databasePassword,
].filter((value) => typeof value === "string" && value.length > 0);
const sensitiveKeys = /^(?:authorization|cookie|cookies|set-cookie|x-csrf-token|password|refresh.?token|access.?token|token|secret|postdata|body)$/i;
const sensitiveHeader = /^(?:authorization|cookie|set-cookie|x-csrf-token)$/i;

function redactValue(value, key = "") {
  if (sensitiveKeys.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    let redacted = value;
    for (const secret of secrets) redacted = redacted.replaceAll(secret, "[REDACTED]");
    return redacted;
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    const result = {};
    const headerName = typeof value.name === "string" ? value.name : "";
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = childKey === "value" && sensitiveHeader.test(headerName)
        ? "[REDACTED]"
        : redactValue(childValue, childKey);
    }
    return result;
  }
  return value;
}

function redactText(text) {
  let redacted = text;
  for (const secret of secrets) redacted = redacted.replaceAll(secret, "[REDACTED]");
  return redacted;
}

async function scrubHtmlReport(html) {
  const embeddedArchive = /(<template id="playwrightReportBase64">data:application\/zip;base64,)([^<]+)(<\/template>)/g;
  let sanitizedHtml = html;
  for (const match of html.matchAll(embeddedArchive)) {
    const [, prefix, encoded, suffix] = match;
    const temporary = await mkdtemp(join(tmpdir(), "e2e-report-redact-"));
    try {
      const archivePath = join(temporary, "report.zip");
      await writeFile(archivePath, Buffer.from(encoded, "base64"));
      await scrubArchive(archivePath);
      const sanitizedArchive = await readFile(archivePath);
      sanitizedHtml = sanitizedHtml.replace(match[0], `${prefix}${sanitizedArchive.toString("base64")}${suffix}`);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  return redactText(sanitizedHtml);
}

async function scrubFile(path) {
  if (path.endsWith(".zip")) {
    await scrubArchive(path);
    return;
  }
  const content = await readFile(path);
  if (content.includes(0)) return;
  const text = content.toString("utf8");
  const sanitized = path.endsWith(".html")
    ? await scrubHtmlReport(text)
    : text.split(/(?<=\n)/).map((line) => {
      try {
        return `${JSON.stringify(redactValue(JSON.parse(line)))}${line.endsWith("\n") ? "\n" : ""}`;
      } catch {
        return redactText(line);
      }
    }).join("");
  if (sanitized !== text) await writeFile(path, sanitized);
}

async function scrubDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scrubDirectory(path);
    else if (entry.isFile()) await scrubFile(path);
  }
}

async function scrubArchive(path) {
  const temporary = await mkdtemp(join(tmpdir(), "e2e-redact-"));
  const rebuilt = `${path}.redacted`;
  try {
    execFileSync("unzip", ["-qq", resolve(path), "-d", temporary]);
    await scrubDirectory(temporary);
    execFileSync("zip", ["-q", "-r", resolve(rebuilt), "."], { cwd: temporary });
    await rename(rebuilt, path);
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(rebuilt, { force: true });
  }
}

for (const root of artifactRoots) {
  try {
    await scrubDirectory(root);
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
