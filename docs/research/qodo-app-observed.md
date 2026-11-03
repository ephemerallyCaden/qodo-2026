# app.qodo.ai: what the user's account shows (screenshots, 2026-11-03)

- **Trial:** 14 days left, so it expires around **Nov 17**, in the middle of the hackathon (Week 3). Setup is at 2 of 3. GitHub Cloud is connected (1 installation). Reviews are on.
- **Navigation:** Home · Repositories · Review standards (Beta) · PR Triage (Research preview) · Findings · Configurations · Integrations · Account management.
- **Review standards:** tabs for Rules, Pending rules and Skills, plus "Import rules and skills". 0 rules so far.
- **PR Triage:** List and State board views; Policies, Group, Filter, Save as default view. Columns: State, Priority, Blast radius, SLA, Time open, Next action.
- **Findings:** critical issues ranked across all PRs.
- **Configurations:** three scopes (Workspace, Git organization, Repository). Selected preset is **Recall**. Tabs: Finding types, Display, Workflow, Context, Remediation, Custom instructions, Agentic Toolbox.
- **Finding types:** each one is a specialized review agent. Disabled agents still collect context.
  - Bug (always on)
  - Rule violation
  - **Skill insight** (Research preview): flags issues defined by the skills you imported
  - Cross-repo conflict (Beta)
  - **Requirement gap** (Research preview): the spec agent reports requirements in the linked spec that the code doesn't meet
  - More types sit below the fold, not captured.
- **Integrations:**
  - Git: GitHub, GitLab, Bitbucket, Azure (SaaS or self-hosted)
  - Tasks: Jira Cloud and Data Center, GitHub Issues, Linear, Monday, Asana
  - Docs (Research preview): Confluence, Notion, Asana, Figma
