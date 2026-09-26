export interface BuildMarkdownInput {
  allFiles: string[];
  includedFiles: string[];
  fileContents: Record<string, string>;
  includeStructure: boolean;
  includeDiffFormat: boolean;
  includePromptTail: boolean;
}

// Instruction block appended after the project structure when the
// "Diff format" checkbox is on. Kept as a line array so the inline code
// spans and the 3-/4-backtick fences are reproduced verbatim without
// escaping headaches.
const DIFF_FORMAT_SECTION = [
  "## Output format",
  "",
  "Provide all file modifications as Search/Replace blocks inside a single 4-backtick code block.",
  "",
  "### Formatting Rules",
  "",
  "1. **File Headers:** Every set of edits must begin with the exact relative file path on its own line (e.g., `path/to/file.ext`).",
  "2. **Exact Matching:** The `SEARCH` block must contain an *exact, verbatim* copy of existing code, including identical whitespace, indentation, and surrounding context lines to uniquely identify the match.",
  "3. **Uniqueness:** Provide sufficient surrounding unchanged lines in the `SEARCH` block to ensure it matches exactly **one** location in the target file.",
  "4. **New Files & Deletions:**",
  "   - To create a new file, use an empty `SEARCH` block.",
  "   - To delete a file or a code block, use an empty `REPLACE` block.",
  "5. **No Placeholders:** Do not use ellipses (`...`), comments like `# rest of code unchanged`, or omitted lines inside `SEARCH` or `REPLACE` blocks.",
  "6. **Sequential Edits:** If editing multiple parts of the same file, list the `SEARCH/REPLACE` blocks in top-to-bottom order as they appear in the file.",
  "",
  "### Example",
  "",
  "````",
  "src/models/user.py",
  "<<<<<<< SEARCH",
  "class User:",
  "    def __init__(self, name):",
  "        self.name = name",
  "",
  "    def to_dict(self):",
  '        return {"name": self.name}',
  "=======",
  "class User:",
  "    def __init__(self, name, email):",
  "        self.name = name",
  "        self.email = email",
  "",
  "    def to_dict(self):",
  "        return {",
  '            "name": self.name,',
  '            "email": self.email,',
  "        }",
  ">>>>>>> REPLACE",
  "",
  "src/controllers/user_controller.py",
  "<<<<<<< SEARCH",
  "from src.models.user import User",
  "=======",
  "from src.models.user import User",
  "from src.utils.validator import validate_email",
  ">>>>>>> REPLACE",
  "<<<<<<< SEARCH",
  "def create_user(name):",
  "    return User(name)",
  "=======",
  "def create_user(name, email):",
  "    validate_email(email)",
  "    return User(name, email)",
  ">>>>>>> REPLACE",
  "",
  "src/utils/validator.py",
  "<<<<<<< SEARCH",
  "=======",
  "def validate_email(email):",
  '    if "@" not in email:',
  '        raise ValueError("Invalid email address")',
  ">>>>>>> REPLACE",
  "````",
].join("\n");

/**
 * Produces the same overall shape as the original CLI's output:
 *   # Project structure   (optional, full non-ignored tree)
 *   ## Output format      (optional, Search/Replace instructions)
 *   # <path>               (one section per included file)
 *   # Prompt                (optional tail)
 */
export function buildMarkdown(input: BuildMarkdownInput): string {
  const parts: string[] = [];

  if (input.includeStructure) {
    parts.push(
      `# Project structure\n\n\`\`\`\n${input.allFiles.join("\n")}\n\`\`\``,
    );
  }

  if (input.includeDiffFormat) {
    parts.push(DIFF_FORMAT_SECTION);
  }

  for (const file of input.includedFiles) {
    const content = input.fileContents[file] ?? "";
    parts.push(`# ${file}\n\n\`\`\`\n${content}\n\`\`\``);
  }

  if (input.includePromptTail) {
    parts.push("# Prompt\n");
  }

  return parts.join("\n\n").trimEnd() + "\n";
}
