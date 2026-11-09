# Agent rules

Keep codebase modules shallow, strictly typed, and independently testable so small AI agents can parse and edit context efficiently.

The "File inventory" section in `ARCHITECTURE.md` must always match the current repository structure. When you make changes, you should review it for updates.

The section must be kept in this exact format:

- Each folder section lists every file in that folder as a single bullet item.
- Under each file, add a nested list of that file's public functions or exported symbols.
- Place a short description immediately after each public function name.
- Use the description to state what the function does, not a vague summary.
