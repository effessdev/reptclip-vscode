# ReptClip for VS Code

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=effessdev.reptclip-for-vscode)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-Registry-purple)](https://open-vsx.org/extension/effessdev/reptclip-for-vscode)

Paste your project as clean Markdown context into a free Chatbot, and apply the generated diffs in one click!

<img width="1447" alt="image" src="https://github.com/user-attachments/assets/5ff87216-785f-48a5-851c-4d24e8369ad4" />

> **Note:** If you are looking for the original ReptClip (the CLI version), here is the link: [ReptClip](https://github.com/effessdev/reptclip)

## Workflow

1. Specify the files you want to include in the context and press "Enter" to copy it into your clipboard
2. Paste it into a free chatbot along with your prompt, and let it generate the diffs
3. Copy the code block containing the diffs, and click "Apply Diffs"

The extension will automatically read the diffs from your clipboard and update the files accordingly!

## How to use

1. Install the extension
2. Open the bottom panel using `` Ctrl + ` ``
3. Open the **ReptClip** tab in the panel (Click `...` if you can't see it)

## Other features

- Get suggestions as you type
- Syntax highlighting
- Glob patterns for specifying files
- Project structure
- Revert a diff by clicking "Restore"
- Automatically respects `.gitignore` files

Suggestions look like this:

<img width="1441" alt="image" src="https://github.com/user-attachments/assets/e1f4b96c-de03-421d-8f12-b89308176951" />

## Supported configurations

1. **Files to include**: patterns/paths separated by spaces (e.g. `AGENTS.md src/**/*.py`). Quotes are only needed if a pattern contains a space. Order is preserved.
2. **Files to exclude**: same syntax; applied after include patterns.
3. Checkboxes:
   1. **Clipboard**: copies the generated Markdown straight to your clipboard.
   2. **Project structure**: includes a `# Project structure` section listing every file in the project that isn't excluded by `.gitignore`.
   3. **Prompt tail**: appends `# Prompt\n\n` to the end of the output, so your cursor has somewhere to land when you paste into a chat.
   4. **Diff format**: adds instructions regarding how to generate the diffs.
4. **Output file** text box (leave empty to skip writing a file; accepts relative or absolute paths).

## Edge cases

- Files to include `**/*.py main.py`: All Python files are included, but `main.py` comes last.
- Files to include `**/*.py src/**/*.py`: All Python files are included, but the Python files in `src` come last.
- Files to include `**/*.py`, files to exclude `secret.py`: All Python files are included, except `secret.py`.

## Example context

The generated context looks like this:

`````
# Project structure

```
.gitattributes
.gitignore
AGENTS.md
CONTRIBUTING.md
LICENSE
README.md
assets/preview.webp
pyproject.toml
reptclip-config.toml
src/reptclip/__init__.py
src/reptclip/cli.py
src/reptclip/cli_parser.py
src/reptclip/clipboard.py
src/reptclip/config.py
src/reptclip/file_reader.py
src/reptclip/filters.py
src/reptclip/git_files.py
src/reptclip/markdown_builder.py
tests/test_cli.py
tests/test_config.py
tests/test_file_reader.py
tests/test_filters.py
tests/test_git_files.py
tests/test_markdown_builder.py
```

## Output format

Provide all file modifications as Search/Replace blocks inside a single 4-backtick code block.

### Formatting Rules

1. **File Headers:** Every set of edits must begin with the exact relative file path on its own line (e.g., `path/to/file.ext`), even if there is only a single file in the project.
2. **Exact Matching:** The `SEARCH` block must contain an *exact, verbatim* copy of existing code, including identical whitespace, indentation, and surrounding context lines to uniquely identify the match.
3. **Uniqueness:** Provide sufficient surrounding unchanged lines in the `SEARCH` block to ensure it matches exactly **one** location in the target file.
4. **New Files & Deletions:**
   - To create a new file, use an empty `SEARCH` block.
   - To delete a file or a code block, use an empty `REPLACE` block.
5. **No Placeholders:** Do not use ellipses (`...`), comments like `# rest of code unchanged`, or omitted lines inside `SEARCH` or `REPLACE` blocks.
6. **Sequential Edits:** If editing multiple parts of the same file, list the `SEARCH/REPLACE` blocks in top-to-bottom order as they appear in the file.

### Example

````
src/models/user.py
<<<<<<< SEARCH
class User:
    def __init__(self, name):
        self.name = name

    def to_dict(self):
        return {"name": self.name}
=======
class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email

    def to_dict(self):
        return {
            "name": self.name,
            "email": self.email,
        }
>>>>>>> REPLACE

src/controllers/user_controller.py
<<<<<<< SEARCH
from src.models.user import User
=======
from src.models.user import User
from src.utils.validator import validate_email
>>>>>>> REPLACE
<<<<<<< SEARCH
def create_user(name):
    return User(name)
=======
def create_user(name, email):
    validate_email(email)
    return User(name, email)
>>>>>>> REPLACE

src/utils/validator.py
<<<<<<< SEARCH
=======
def validate_email(email):
    if "@" not in email:
        raise ValueError("Invalid email address")
>>>>>>> REPLACE
````

# AGENTS.md

```
Do not make mistakes.
```

# Prompt

<- Cursor lands here; you can quickly start typing
`````

## Note

Only files not excluded by `.gitignore` are ever considered, using layered, per-directory `.gitignore` parsing (via the `ignore` package) rather than shelling out to git.

**Include/exclude patterns and checkbox settings are remembered per project**, so you don't have to re-enter them every time you open the panel.

---

Thanks for reading! If you found this useful, please consider dropping a ⭐. It really helps **A LOT!**
