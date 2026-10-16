# ReptClip for VS Code

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=effessdev.reptclip-for-vscode)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-Registry-purple)](https://open-vsx.org/extension/effessdev/reptclip-for-vscode)

Paste your project as clean Markdown context into a free Chatbot, and apply the generated diffs in one click!

<img width="1286" alt="2026-10-16 20-42-47" src="https://github.com/user-attachments/assets/dd139a07-493f-473a-94e7-743ca41f29ad" />

## Workflow

1. Specify the files you want to include in the context and press "Enter" to **copy it into your clipboard**
2. Paste it into a free chatbot along with your prompt, and **let it generate the diffs**
3. Copy the code block containing the diffs, and **click "Apply Diffs"**

The extension will automatically read the diffs from your clipboard and update the files accordingly!

**Chatbot suddenly needs a file you forgot to include?** Don't start over: have it print the paths it wants as a code block (the built-in "Output format" instructions teach it to do exactly that), copy the block, and hit **More Files** — those files land on your clipboard in the same shape Generate produces, nothing else re-pasted.

## How to use

1. Install the extension
2. Open the bottom panel using `` Ctrl + ` ``
3. Open the **ReptClip** tab in the panel (Click `...` if you can't see it)

**All settings are remembered per project**, so you don't have to re-enter them every time, and won't be mixed up with other projects.

## Context

The generated context has the following sections (**each one can be toggled ON or OFF using checkboxes**):

- **Project structure:** lists the relative paths to all files in the project that have not been ignored using `.gitignore`.
- **Output format:** contains the instructions regarding how to generate the output.
- **Prompt:** An empty `# Prompt\n\n` section to type in your prompt.

The included files are placed between the "Output format" section and the "Prompt" section. You can include files to the context by either entering the relative paths of them or a matching glob pattern in the **Files to include** textarea, separated by spaces. Mid-conversation additions are handled by the **More Files** button (see [Adding files to context](#adding-files-to-context)).

Example generated context (only `AGENTS.md` is included):

`````markdown
# Project structure

```
.gitattributes
.gitignore
AGENTS.md
CONTRIBUTING.md
LICENSE
README.md
pipxclip-config.toml
pyproject.toml
src/pipxclip/__init__.py
src/pipxclip/cli.py
src/pipxclip/config.py
tests/test_cli.py
tests/test_config.py
```

# Output format

You have access to a tool that allows you to read and edit the files in my project.

## How to read files

Generate a code block containing the relative paths to the files, separated by newline characters.

Example:

```
README.md
src/main.py
```

After generating the code block, generate the following text:

```
Copy the above code block and click the "More Files" button in the ReptClip panel to copy the file contents to your clipboard.
```

## How to edit files

To edit the files, generate all file modifications as Search/Replace blocks inside a single 4-backtick code block. Then, generate the following text:

```
Copy the above code block and click "Apply Diffs" in the ReptClip panel to apply these changes.
```

### Formatting Rules

1. **File Headers:** Every set of edits must begin with the exact relative file path on its own line (e.g., `path/to/file.ext`), even if there is only a single file in the project.
2. **Exact Matching:** The `SEARCH` block must contain an *exact, verbatim* copy of existing code, including identical whitespace, indentation, and surrounding context lines to uniquely identify the match. Otherwise, the tool will not apply the diff.
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
<<<<<<< SEARCH
def legacy_create_user(name):
    return User(name)

>>>>>>> REPLACE

src/utils/validator.py
<<<<<<< SEARCH
=======
def validate_email(email):
    if "@" not in email:
        raise ValueError("Invalid email address")
>>>>>>> REPLACE

config/legacy.json
<<<<<<< SEARCH
{
    "deprecated": true
}
=======
>>>>>>> REPLACE
````

# AGENTS.md

```
Do not make mistakes.
```

# Prompt

<- Cursor lands here. You can quickly start typing.
`````

**Enter inside any input runs Generate**, so you never have to reach for the button; while the suggestion dropdown is open, Enter/Tab *accepts* the highlighted file instead, and `Shift + Enter` always inserts a newline.

You can uncheck "Copy to clipboard" to turn it off.

### Safety measures for context

- **Only files not excluded by `.gitignore` are ever considered**, using layered, per-directory `.gitignore` parsing (via the `ignore` package) rather than shelling out to git. This isn't just a filter on one feature's candidate list, it's enforced at the single chokepoint every embedded file read passes through, so no feature and no hand-written path list can bypass it.

- **Oversized and binary files are skipped automatically**, replaced by a descriptive placeholder in the output (limit: 1 MB; binaries detected via NUL-byte sniffing), they still appear in the project structure listing.

- **There is no second implementation for "More Files" to worry about.** Its file list comes from the clipboard instead of the pattern textareas, but the path check, the reads, and the formatting all go through the exact same pipeline as Generate. Same `.gitignore` enforcement, same size/binary guards, same Markdown builder, same toggles honored. Byte-for-byte consistent output shape, one code path to trust.

## Applying diffs

When you click the "Apply diffs" button, the diffs are read from your clipboard and applied to the files.

If you have turned on the "Output format" section, the AI will generate the diffs in a single code block. You can copy those diffs, and click "Apply diffs" to apply them.

### Safety measures for applying diffs

- **Applying a diff is all-or-nothing**: if any SEARCH block fails to validate (no match, not unique, edits a deleted file, etc.), the entire diff isn't applied, and you get an error message stating the reason.

- **SEARCH blocks support fuzzy matching**, trying an exact match first and only then falling back to tolerant matching: line-ending differences (CRLF/LF), trailing whitespace, shifted indentation, and tabs-vs-spaces. **A unique match is still required at every level**. The number of fuzzy SEARCH blocks (did not match the file byte-for-byte) will be displayed.

- **The last applied diff won't be silently re-applied**, clicking "Apply Diffs" hashes the parsed SEARCH/REPLACE blocks (so surrounding code fences, line-ending differences, and stray whitespace don't matter) and compares the hash against the last applied diff. That hash is stored persistently per project (only the most recent one is remembered), so the check still holds after restarting VS Code. When it matches, a confirmation dialog asks before re-applying, which you can accept to bypass the guard.

**Applied files are saved automatically**, and each file's regular undo (`Ctrl + Z`) still works.

## Adding files to context

### Up front: the pattern textareas

Pick the files before generating, with two textareas:

- **Files to include:** Specify which files to include in the context, separated by spaces. You can use the relative paths, or glob patterns to match files.
- **Files to exclude:** Specify which files you want to exclude from the included files. Particuluarly useful when you want to include a lot of files using a glob pattern, but exclude a specific file from them.

You will get **suggestions** and **syntax highlighting** as you type the files. A relative path or a glob pattern in "Files to include" will turn **green** if they match at least one file, and turn **yellow** if they math no files. For "Files to exclude", green means it matches **at least one included file**.

The order in which you entered the relative paths or glob patterns is preserved. In case of redundant items, **the item that comes last gets order preference**, so if you set files to include as `**/*.py main.py`, `main.py` comes after all other `.py` files. `**/*.py src/**/*.py` puts `.py` files in `src` last.

#### Example

Include `AGENTS.md`, all Python files, but exclude `src/secret.py` and all Python files in `tests`, and put `src/main.py` last:

- **Files to include:** `AGENTS.md **/*.py src/main.py`
- **Files to exclude:** `src/secret.py src/**/*.py`

### Mid-conversation: the "More Files" button

Paste-ready lists of paths don't come only from you. The "Output format" section explicitly instructs the chatbot to emit one when it needs more context. Copy that list, click **More Files**, and the button does the rest: it reads the clipboard, embeds those files, and (depending on your settings) puts the result back on the clipboard and/or writes it to the "Output file".

Here's what actually happens, in order:

1. **Parsing is line-by-line and forgiving where it should be, strict where it must be.** Each line is trimmed and treated as one relative path. Empty lines (including runs of consecutive newlines) are skipped the way Python's `str.split()` skips empty pieces, and duplicates collapse to their first occurrence. The order you pasted is the order they're embedded in.
2. **Pre-flight validation, all-or-nothing.** Before a single file is read, every path clears the embedding guard and is `fs.stat`-ed against the workspace root. Anything unacceptable fails the check: not found, a directory rather than a file, ignored by `.gitignore`, inside `.git`, absolute, or resolving outside the project root. Nothing is copied, nothing is written, no half-baked context reaches your clipboard; instead the panel names each offender and why, e.g. `Cannot embed: src/secret.env (ignored by .gitignore), old.py (not found)`. You fix the list and click again.
3. **Only then does it build.** The surviving paths are read through the shared pipeline (1 MB limit, binary detection, descriptive placeholders) and formatted by the same Markdown builder used by Generate, honoring the Project structure / Output format / Prompt tail checkboxes.

## Other notable features

- Write the context to a file specified by specifying the relative or absolute path in the "Output file" text box. Leaving it empty will not write output to the file.
