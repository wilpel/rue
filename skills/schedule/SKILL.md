# schedule

Create, list, and manage scheduled jobs. Jobs run tasks on a timer — either a recurring interval or a one-shot delay.

## Usage

```bash
# Create a recurring job
node --import tsx/esm skills/schedule/run.ts create --name "weekly report" --schedule "every 1h" --task "Generate a summary of today's work"

# Create a one-shot delayed job
node --import tsx/esm skills/schedule/run.ts create --name "reminder" --schedule "in 30m" --task "Remind user about the deploy"

# List all jobs
node --import tsx/esm skills/schedule/run.ts list

# Remove a job
node --import tsx/esm skills/schedule/run.ts remove --id <job_id>

# Pause/resume a job
node --import tsx/esm skills/schedule/run.ts toggle --id <job_id> --active false
node --import tsx/esm skills/schedule/run.ts toggle --id <job_id> --active true
```

## Schedule formats

- `every Nm` / `every Nh` — recurring interval (minutes or hours)
- `in Nm` / `in Nh` — one-shot delay
- Cron expressions (e.g. `0 9 * * 1` for Mondays at 9am) — planned

## How it works

Jobs are stored in `~/.rue/schedules/jobs.sqlite`. The daemon checks for due jobs every 30 seconds. When a job is due, a push message is created in the message store, which the agent sees and acts on.

## When to use

When the user asks to schedule something, set a reminder, create a recurring task, or do something "every X minutes/hours".
