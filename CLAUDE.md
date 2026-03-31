# dashcli

Agent-native BI dashboards from CSV and JSON files. Powered by Bun, SQLite, and ECharts.

## Development

```bash
bun run dev              # run CLI in dev mode
bun run typecheck        # type-check without emitting
bun test                 # run test suite
bun run gen:schema       # regenerate JSON Schema from Zod spec
```

## Commands

- `dashcli suggest <file>` — generate a YAML dashboard spec from CSV/JSON
- `dashcli suggest <file> --charts-dir <dir>` — also write individual chart specs
- `dashcli serve <spec>` — live-reloading dashboard at localhost:3838
- `dashcli render <spec>` — render a single chart as PNG (default) or HTML (`--as html`)
- `dashcli render <spec> --chart <id>` — render one chart from a dashboard spec
- `dashcli export <spec>` — standalone HTML export
- `dashcli profile <file>` — column classification as JSON
- `dashcli read <spec>` — structured spec summary
- `dashcli diff <a> <b>` — compare two specs

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
