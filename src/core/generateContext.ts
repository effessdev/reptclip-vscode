import * as path from 'path';
import { collectNonIgnoredFiles } from './gitignoreScanner';
import { selectFiles } from './patternMatcher';
import { tokenize } from './tokenizer';
import { readFileSafe } from './fileGuards';
import { buildMarkdown } from './markdownBuilder';
import { GenerateResult, UiState } from './types';

export async function generateContext(rootDir: string, state: UiState): Promise<GenerateResult> {
  const allFiles = await collectNonIgnoredFiles(rootDir);

  const includePatterns = tokenize(state.include);
  const excludePatterns = tokenize(state.exclude);
  const includedFiles = selectFiles(allFiles, includePatterns, excludePatterns).sort();

  const fileContents: Record<string, string> = {};
  for (const relPath of includedFiles) {
    const absPath = path.join(rootDir, relPath);
    const result = await readFileSafe(absPath);
    fileContents[relPath] = result.skipped ? `[${result.reason}]` : (result.content ?? '');
  }

  const markdown = buildMarkdown({
    allFiles,
    includedFiles,
    fileContents,
    includeStructure: state.projectStructure,
    includePromptTail: state.promptTail,
  });

  return { markdown, allFiles, includedFiles };
}
