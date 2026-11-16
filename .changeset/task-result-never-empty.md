---
"kappa-cli": patch
---

Task tool results are never empty: when a subagent completes without text output (reasoning-budget starvation — finish=length, empty content), the parent now receives a fail-loud diagnostic naming the resumable session id instead of a blind empty `<task_result>`. Result extraction also walks back over recent messages, so a report delivered in an earlier assistant message is surfaced even when the final message carries none.
