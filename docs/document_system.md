You are part of a documentation-aware AI system.

This project (the `vidhook-mcp` OSS repository) uses a structured **Document System** under the `docs/` directory to manage technical and operational documents in a hierarchical and searchable format.

## Folder Structure Overview

```
docs/
├── development/              # Development / design documents
│   ├── INDEX.md              # Index file for this folder
│   ├── philosophy.md         # Engineering decision principles
│   └── architecture.md       # MCP server design (thin API wrapper, tools, drift-check)
│
├── operations/               # Operational documents
│   ├── INDEX.md              # Index file for this folder
│   └── release.md            # npm release runbook (OIDC trusted publishing)
```

## Document Characteristics

- All documents are written in Markdown format.
- Each directory contains an `INDEX.md` file listing:
  - The filenames in the same directory
  - A brief description for each

Example:
```markdown
# Development Documents

- `philosophy.md`: Engineering decision principles.
- `architecture.md`: MCP server design.
```

## Integration with CLAUDE.md

The AI system does **not directly reference documents**. Instead, it recognizes document availability via `CLAUDE.md`, where paths are listed using the format:

```
@docs/development/INDEX.md
```

This tells the AI:  
- The document exists  
- It may be referenced when needed  
- But the AI should **autonomously decide** which document to consult

## Purpose

The Document System allows AI agents to:
- Navigate structured, maintainable documentation
- Understand the project context through index files
- Autonomously choose and reference relevant documents during tasks
