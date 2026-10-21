#!/usr/bin/env python3
"""Small PTY bridge used by KaliCode's integrated terminal.

The Electron main process writes newline-delimited JSON commands to stdin and
receives base64 encoded terminal output on stdout. This keeps the terminal fully
interactive without requiring a native Node module.
"""

import base64
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios


def set_size(fd, cols, rows):
    try:
        packed = struct.pack("HHHH", max(1, rows), max(2, cols), 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)
    except OSError:
        pass


def main():
    if len(sys.argv) < 3:
        sys.stderr.write("usage: pty_bridge.py <cwd> <shell>\n")
        return 2

    cwd = sys.argv[1]
    shell = sys.argv[2]

    pid, master_fd = pty.fork()
    if pid == 0:
        try:
            os.chdir(cwd)
            env = os.environ.copy()
            env.setdefault("TERM", "xterm-256color")
            env.setdefault("COLORTERM", "truecolor")
            env.setdefault("LANG", "C.UTF-8")
            os.execvpe(shell, [shell], env)
        except Exception as error:  # pragma: no cover - child process
            os.write(2, f"Unable to start shell: {error}\r\n".encode("utf-8", "replace"))
            os._exit(127)

    set_size(master_fd, 120, 32)
    child_exited = False

    def cleanup():
        nonlocal child_exited
        if child_exited:
            return
        child_exited = True
        try:
            os.killpg(os.getpgid(pid), signal.SIGHUP)
        except OSError:
            pass
        try:
            os.kill(pid, signal.SIGHUP)
        except OSError:
            pass

    def handle_signal(_signum, _frame):
        cleanup()
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGHUP, handle_signal)

    try:
        while True:
            try:
                readable, _, _ = select.select([master_fd, 0], [], [], 0.25)
            except (OSError, ValueError):
                break

            if 0 in readable:
                line = sys.stdin.buffer.readline()
                if not line:
                    break
                try:
                    message = json.loads(line.decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    continue
                kind = message.get("type")
                if kind == "input":
                    try:
                        data = base64.b64decode(message.get("data", ""))
                        os.write(master_fd, data)
                    except (OSError, ValueError):
                        break
                elif kind == "resize":
                    set_size(
                        master_fd,
                        int(message.get("cols", 120)),
                        int(message.get("rows", 32)),
                    )
                elif kind == "kill":
                    cleanup()
                    break

            if master_fd in readable:
                try:
                    data = os.read(master_fd, 65536)
                except OSError:
                    break
                if not data:
                    break
                sys.stdout.buffer.write(base64.b64encode(data) + b"\n")
                sys.stdout.buffer.flush()
    finally:
        cleanup()
        try:
            os.close(master_fd)
        except OSError:
            pass
        try:
            os.waitpid(pid, os.WNOHANG)
        except OSError:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
