<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Generate question plans and adaptive follow-ups through the pure local question bank; resolve the LLM lazily only for assessment/reporting so starting an interview never requires AI credentials or JSON model output.
- Persist integrity reviews separately from competency scores and security observations as ownership-validated, append-only server writes; uncertain browser signals must never become automatic cheating verdicts.
- Allow one local understanding probe per primary answer (including the last); never recursively probe follow-ups, so the automatic interview remains finite.
