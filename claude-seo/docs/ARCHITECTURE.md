# Architecture

## Overview

Claude SEO follows Anthropic's official Claude Code skill specification with a modular, multi-skill architecture.

## Directory Structure

```
~/.claude/
├── skills/
│   ├── seo/              # Main orchestrator skill
│   │   ├── SKILL.md          # Entry point with routing logic
│   │   └── references/       # On-demand reference files
│   │       ├── cwv-thresholds.md
│   │       ├── schema-types.md
│   │       ├── eeat-framework.md
│   │       └── quality-gates.md
│   │
│   ├── seo-audit/            # Full site audit
│   ├── seo-competitor-pages/ # Competitor comparison pages
│   ├── seo-content/          # E-E-A-T analysis
│   ├── seo-geo/              # AI search optimization
│   ├── seo-hreflang/         # Hreflang/i18n SEO
│   ├── seo-images/           # Image optimization
│   ├── seo-page/             # Single page analysis
│   ├── seo-plan/             # Strategic planning
│   │   └── assets/           # Industry templates
│   ├── seo-programmatic/     # Programmatic SEO
│   ├── seo-schema/           # Schema markup
│   ├── seo-sitemap/          # Sitemap analysis/generation
│   └── seo-technical/        # Technical SEO
│
└── agents/
    ├── seo-technical.md      # Technical SEO specialist
    ├── seo-content.md        # Content quality reviewer
    ├── seo-schema.md         # Schema markup expert
    ├── seo-sitemap.md        # Sitemap architect
    ├── seo-performance.md    # Performance analyzer
    └── seo-visual.md         # Visual analyzer
```

## Component Types

### Skills

Skills are markdown files with YAML frontmatter that define capabilities and instructions.

**SKILL.md Format:**
```yaml
---
name: skill-name
description: >
  When to use this skill. Include activation keywords
  and concrete use cases.
---

# Skill Title

Instructions and documentation...
```

### Subagents

Subagents are specialized workers that can be delegated tasks. They have their own context and tools.

**Agent Format:**
```yaml
---
name: agent-name
description: What this agent does.
tools: Read, Bash, Write, Glob, Grep
---

Instructions for the agent...
```

### Reference Files

Reference files contain static data loaded on-demand to avoid bloating the main skill.

## Orchestration Flow

### Full Audit (`/seo audit`)

```
User Request
    │
    ▼
┌─────────────────┐
│   seo       │  ← Main orchestrator
│   (SKILL.md)    │
└────────┬────────┘
         │
         │  Detects business type
         │  Spawns subagents in parallel
         │
    ┌────┴────┬────────┬────────┬────────┬────────┐
    ▼         ▼        ▼        ▼        ▼        ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│tech   │ │content│ │schema │ │sitemap│ │perf   │ │visual │
│agent  │ │agent  │ │agent  │ │agent  │ │agent  │ │agent  │
└───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘
    │         │        │        │        │        │
    └─────────┴────────┴────┬───┴────────┴────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Aggregate    │
                    │  Results      │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Generate     │
                    │  Report       │
                    └───────────────┘
```

### Individual Command

```
User Request (e.g., /seo page)
    │
    ▼
┌─────────────────┐
│   seo       │  ← Routes to sub-skill
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   seo-page      │  ← Sub-skill handles directly
│   (SKILL.md)    │
└─────────────────┘
```

## Design Principles

### 1. Progressive Disclosure

- Main SKILL.md is concise (<200 lines)
- Reference files loaded on-demand
- Detailed instructions in sub-skills

### 2. Parallel Processing

- Subagents run concurrently during audits
- Independent analyses don't block each other
- Results aggregated after all complete

### 3. Quality Gates

- Built-in thresholds prevent bad recommendations
- Location page limits (30 warning, 50 hard stop)
- Schema deprecation awareness
- FID → INP replacement enforced

### 4. Industry Awareness

- Templates for different business types
- Automatic detection from homepage signals
- Tailored recommendations per industry

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Skill | `seo-{name}/SKILL.md` | `seo-audit/SKILL.md` |
| Agent | `seo-{name}.md` | `seo-technical.md` |
| Reference | `{topic}.md` | `cwv-thresholds.md` |
| Script | `{action}_{target}.py` | `fetch_page.py` |
| Template | `{industry}.md` | `saas.md` |

## Extension Points

### Adding a New Sub-Skill

1. Create `skills/seo-newskill/SKILL.md`
2. Add YAML frontmatter with name and description
3. Write skill instructions
4. Update main `seo/SKILL.md` to route to new skill

### Adding a New Subagent

1. Create `agents/seo-newagent.md`
2. Add YAML frontmatter with name, description, tools
3. Write agent instructions
4. Reference from relevant skills

### Adding a New Reference File

1. Create file in appropriate `references/` directory
2. Reference in skill with load-on-demand instruction

## Extensions

Extensions are opt-in add-ons that integrate external data sources via MCP servers. They live in `extensions/<name>/` and include their own install/uninstall scripts.

```
extensions/
└── dataforseo/               # DataForSEO MCP integration
    ├── README.md                  # Extension documentation
    ├── install.sh                 # Unix installer
    ├── install.ps1                # Windows installer
    ├── uninstall.sh               # Unix uninstaller
    ├── uninstall.ps1              # Windows uninstaller
    ├── field-config.json          # API response field filtering
    ├── skills/
    │   └── seo-dataforseo/
    │       └── SKILL.md           # Sub-skill (22 commands)
    ├── agents/
    │   └── seo-dataforseo.md      # Subagent
    └── docs/
        └── DATAFORSEO-SETUP.md    # Account setup guide
```

### Available Extensions

| Extension | Package | What it Adds |
|-----------|---------|-------------|
| **DataForSEO** | `dataforseo-mcp-server` | 22 commands: live SERP, keywords, backlinks, on-page analysis, content analysis, business listings, AI visibility, LLM mentions |

### Extension Convention

Each extension follows this pattern:
1. Self-contained in `extensions/<name>/`
2. Own `install.sh` and `install.ps1` that copy files and configure MCP
3. Own `uninstall.sh` and `uninstall.ps1` that cleanly reverse installation
4. Installs skill to `~/.claude/skills/seo-<name>/`
5. Installs agent to `~/.claude/agents/seo-<name>.md`
6. Merges MCP config into `~/.claude/settings.json` (non-destructive)
