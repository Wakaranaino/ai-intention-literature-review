import { readFile } from "node:fs/promises";
import path from "node:path";

import YAML from "yaml";

export type TagRules = Record<string, string[]>;

export async function loadTagRules(filePath?: string): Promise<TagRules> {
  const resolvedPath = filePath ?? path.join(process.cwd(), "tag_rules.yaml");
  const contents = await readFile(resolvedPath, "utf8");
  const parsed = YAML.parse(contents) as TagRules;
  return Object.fromEntries(
    Object.entries(parsed).map(([tagName, keywords]) => [
      tagName.trim(),
      (keywords ?? []).map((keyword) => keyword.trim()).filter(Boolean),
    ]),
  );
}

export function getMatchedTagNames(
  paper: { title: string; abstract: string },
  tagRules: TagRules,
): string[] {
  const haystack = `${paper.title}\n${paper.abstract}`.toLowerCase();

  return Object.entries(tagRules)
    .filter(([, keywords]) =>
      keywords.some((keyword) => haystack.includes(keyword.toLowerCase())),
    )
    .map(([tagName]) => tagName)
    .sort((left, right) => left.localeCompare(right));
}
