# system-info

Check system information on macOS and Linux — CPU, memory, disk, uptime, and network.

## Commands

### cpu — CPU model, core count, load averages

```bash
node --import tsx/esm skills/system-info/run.ts cpu
```

### memory — Total, used, and free RAM

```bash
node --import tsx/esm skills/system-info/run.ts memory
```

### disk — Disk space usage

```bash
node --import tsx/esm skills/system-info/run.ts disk
```

### uptime — System uptime

```bash
node --import tsx/esm skills/system-info/run.ts uptime
```

### network — Network interfaces with IP addresses

```bash
node --import tsx/esm skills/system-info/run.ts network
```

### all — Full system summary

```bash
node --import tsx/esm skills/system-info/run.ts all
```

## When to use

- User asks about system resources, available memory, disk space, etc.
- Diagnosing performance issues or checking system health
- Gathering environment details for bug reports or setup verification

## Requirements

- Works on macOS and Linux (uses Node.js built-in `os` and `child_process` modules)
- No external dependencies
