export interface BuildMarkdownInput {
  allFiles: string[];
  includedFiles: string[];
  fileContents: Record<string, string>;
  includeStructure: boolean;
  includePromptTail: boolean;
}

/**
 * Produces the same overall shape as the original CLI's output:
 *   # Project structure   (optional, full non-ignored tree)
 *   # <path>               (one section per included file)
 *   # Prompt                (optional tail)
 */
export function buildMarkdown(input: BuildMarkdownInput): string {
  const parts: string[] = [];

  if (input.includeStructure) {
    parts.push(`# Project structure\n\n\`\`\`\n${input.allFiles.join('\n')}\n\`\`\``);
  }

  for (const file of input.includedFiles) {
    const content = input.fileContents[file] ?? '';
    parts.push(`# ${file}\n\n\`\`\`\n${content}\n\`\`\``);
  }

  if (input.includePromptTail) {
    parts.push('# Prompt\n');
  }

  return parts.join('\n\n').trimEnd() + '\n';
}
