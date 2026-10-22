# WinFix AI — Neko Client

**Local Windows System Diagnostic Assistant** — running directly on your device.

> **Diagnose first. Repair second. Verify third.**

WinFix AI is an expert Windows system engineer that solves problems with **correct diagnosis + minimal modification + verified result**.

![Status](https://img.shields.io/badge/mode-DIAGNOSTIC-0078D4)
![Privilege](https://img.shields.io/badge/privilege-Administrator-60CDFF)
![Local](https://img.shields.io/badge/runtime-local%20only-0F7B0F)

Made with care — powered by [Arena AI](https://arena.ai/)

---

## How it works

```
DIAGNOSE → PLAN → AUTHORIZE → EXECUTE → VERIFY
```

1. **Understand** the symptom (user report + evidence)
2. **Gather** system information via deterministic tools (`sc query`, `Get-Service`, `sfc /scannow`, Event Viewer, etc.)
3. **Inspect** evidence — prefer tool output over assumptions
4. **Determine** one primary root cause (not a speculative list)
5. **Produce** a structured repair plan
6. **Execute** only with explicit authorization for dangerous ops
7. **Verify** — re-query component, compare expected vs actual; report *Repair verified* only when confirmed

### Core Principle

> Every modification must have a specific reason connected to the diagnosed problem.

No random:
- Registry edits
- Driver reinstalls
- Boot configuration changes
- Service toggles
- Defender / UAC / Firewall disabling (unless directly implicated)

### Repair Plan Format

Each plan contains:

- **Problem** — what is wrong
- **Root Cause** — why it is happening (one primary)
- **Target** — exact component (service, registry key, driver)
- **Operation** — precise commands
- **Required privilege** — Administrator / TrustedInstaller
- **Expected result** — state after repair
- **Verification** — how to confirm
- **Rollback** — how to undo

---

## Quick Start

Open `index.html` locally — no build step required. Or run:

```bash
python -m http.server 3000 --bind 0.0.0.0
# then open http://localhost:3000
```

### Quick Diagnostics

- Windows Update fails (0x80070002, wuauserv disabled)
- No internet / Wi-Fi (DNS + Winsock corruption)
- No audio output (Audiosrv dependency, Code 10)
- Slow boot / hidden boot failures (Fast Startup + bcdedit)
- 100% disk / slow PC (CompatTelRunner + SysMain)
- BSOD DPC_WATCHDOG_VIOLATION (rtwlane6.sys)

Each scenario demonstrates evidence-based flow with tool output, root cause, authorized plan, and verification.

---

## Security

- Dangerous operations (registry, drivers, BCD, firewall) require **explicit authorization**
- TrustedInstaller ops are gated, explained, and logged
- Never hides modifications — full transparency
- Rollback strategy included where applicable

## Operating Mode

- **Default:** DIAGNOSTIC — no modification without authorized tool
- When tools available: Diagnose → Plan → Authorize → Execute → Verify

---

## License

Local-first • No cloud upload • Evidence over intuition
