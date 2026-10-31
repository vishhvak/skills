---
name: tailscale
description: Reach and operate the user's machines over their Tailscale network. Use when connecting or copying files to any tailnet device, running commands on one remotely, exposing or reaching a service on one, setting up SSH to a new device, or when an SSH/scp command against one fails oddly.
---

# Tailscale

## Host notes live outside this skill

Device names, IPs, login users and per-host quirks are private, so they are not in this skill.
Read `${XDG_CONFIG_HOME:-~/.config}/tailscale-skill/hosts.md` first, then the matching
`hosts/<host>.md` beside it before non-trivial work on that host; do not load them all.

If `hosts.md` is missing, build it from `tailscale status`: one row per device with host, tailnet
IP, OS, and the login user SSH accepts. Record what you learn about a host there (which user the
policy allows, services and ports, quirks), never in this skill.

## Check reachability first

Most "broken" hosts are asleep:

```bash
tailscale status | grep <host>          # "offline, last seen ..." means stop here
tailscale ping -c 2 <host>              # pong means the network path works
```

## Two kinds of SSH

A host answers SSH in one of two ways, and the fix for each is different.

- **Tailscale SSH**: the host runs `tailscale set --ssh`; the tailnet policy decides which login
  users each person may use, with no keys or passwords. A refused user is the policy, not a
  typo; check `hosts.md` for the user it allows.
- **The OS's own sshd**: a key in the remote user's `~/.ssh/authorized_keys`.

Both answer on port 22 of the tailnet IP, so a refused port means neither is running there.
Probe before guessing (`SSH_HostKeys` in `tailscale status --json` is empty even for Tailscale
SSH hosts, so do not use it as the test):

```bash
timeout 8 bash -c 'echo > /dev/tcp/<tailnet-ip>/22' && echo open || echo closed
```

**A Mac running the App Store or standalone Tailscale app cannot be a Tailscale SSH server.**
To reach it, someone at that Mac turns on System Settings > General > Sharing > Remote Login
(limited to their account) and appends your public key to their `~/.ssh/authorized_keys`. Ask
them for their login name; it is on that same Sharing pane. Nothing can be done from the
client side until then.

## If `ssh` fails under tool use, call `/usr/bin/ssh`

An interactive shell may wrap `ssh` in a function or alias that does not exist in a tool's shell
(`ssh:1: command not found: ...`). Call the binary:

```bash
/usr/bin/ssh <host> 'uname -a'
/usr/bin/scp local.file <host>:'C:/Users/<user>/dest.file'    # scp wants forward slashes, even for Windows
```

Host aliases resolve via `~/.ssh/config`; the tailnet IP always works as a fallback.

## Reaching a service: forward the port, don't open one

Firewall rules on the remote are often per-binary-path and per-profile, so a service on a new
path is unreachable even though a similar one works. Bind the service to `127.0.0.1` on the
remote and tunnel instead:

```bash
/usr/bin/ssh -o ExitOnForwardFailure=yes -L 8099:127.0.0.1:8099 <host> '<start server>' &
```

`ExitOnForwardFailure` matters: without it a busy local port fails silently and you measure
whatever else is on it.

To publish a loopback service to the whole tailnet over HTTPS instead, run
`tailscale serve --bg --https=<port> http://127.0.0.1:<port>` on the host; `tailscale serve status`
lists what is already published.

## Remote processes die with the session

A process started over SSH is killed when that SSH session ends. Either keep the session
open in a background job for the life of the work, or install it as a service on the host
(Linux: a systemd user unit with linger; Windows: a scheduled task; macOS: a LaunchAgent).
Close what you open.
