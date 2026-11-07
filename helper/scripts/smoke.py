"""Install smoke test for quire-helper, run by CI on Windows, macOS, and Linux.

Checks the hello handshake, origin rejection, `install` (binary copy, host
manifests, and Windows registry keys), and `uninstall`.
"""

import json
import os
import struct
import subprocess
import sys
from pathlib import Path

ORIGIN = "chrome-extension://hbddhigdogedopjjlihlkpehidopddac/"
HOST = "com.quire.helper"
MANIFEST = f"{HOST}.json"


def frame(message: dict) -> bytes:
    """Encode one native messaging frame."""
    payload = json.dumps(message).encode("utf-8")
    return struct.pack("<I", len(payload)) + payload


def unframe_all(data: bytes) -> list:
    """Decode every frame in a byte string."""
    messages = []
    while data:
        (length,) = struct.unpack("<I", data[:4])
        messages.append(json.loads(data[4 : 4 + length]))
        data = data[4 + length :]
    return messages


def handshake(binary: Path) -> None:
    """Run host mode with hello plus an unknown method and check both replies."""
    requests = frame({"id": 1, "method": "hello", "params": {"protocol": 1}}) + frame(
        {"id": 2, "method": "noSuchMethod"}
    )
    result = subprocess.run(
        [str(binary), ORIGIN], input=requests, capture_output=True, timeout=30, check=True
    )
    replies = unframe_all(result.stdout)
    assert len(replies) == 2, replies
    hello = replies[0]["result"]
    assert replies[0]["id"] == 1 and hello["protocol"] == 1, replies[0]
    assert hello["helperVersion"] and hello["os"] and hello["arch"], hello
    assert replies[1]["error"]["code"] == "UNKNOWN_METHOD", replies[1]
    print(f"handshake ok: {binary} -> {hello}")


def rejects_other_origins(binary: Path) -> None:
    """A different extension origin must exit with status 2."""
    result = subprocess.run(
        [str(binary), "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"],
        input=frame({"id": 1, "method": "hello", "params": {"protocol": 1}}),
        capture_output=True,
        timeout=30,
    )
    assert result.returncode == 2, result
    assert result.stdout == b"", result.stdout
    print("origin check ok")


def expected_layout() -> tuple:
    """Installed binary, manifest paths, and registry keys for this OS."""
    home = Path.home()
    if sys.platform == "win32":
        folder = Path(os.environ["LOCALAPPDATA"]) / "Quire" / "Helper"
        roots = [
            r"Google\Chrome",
            r"Microsoft\Edge",
            r"BraveSoftware\Brave-Browser",
            "Chromium",
        ]
        keys = [rf"Software\{root}\NativeMessagingHosts\{HOST}" for root in roots]
        return folder / "quire-helper.exe", [folder / MANIFEST], keys
    if sys.platform == "darwin":
        support = home / "Library" / "Application Support"
        browsers = ["Google/Chrome", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Chromium"]
        return (
            support / "Quire" / "Helper" / "quire-helper",
            [support / b / "NativeMessagingHosts" / MANIFEST for b in browsers],
            [],
        )
    data = Path(os.environ.get("XDG_DATA_HOME") or home / ".local" / "share")
    config = Path(os.environ.get("XDG_CONFIG_HOME") or home / ".config")
    browsers = ["google-chrome", "microsoft-edge", "BraveSoftware/Brave-Browser", "chromium"]
    return (
        data / "quire" / "helper" / "quire-helper",
        [config / b / "NativeMessagingHosts" / MANIFEST for b in browsers],
        [],
    )


def registry_value(key: str):
    """Default value of an HKCU key, or None when the key is missing."""
    import winreg

    try:
        return winreg.QueryValue(winreg.HKEY_CURRENT_USER, key)
    except FileNotFoundError:
        return None


def run_command(binary: Path, command: str) -> None:
    """Run an install or uninstall command and echo its output."""
    result = subprocess.run(
        [str(binary), command], capture_output=True, text=True, timeout=60
    )
    print(result.stdout, result.stderr, sep="")
    assert result.returncode == 0, f"{command} failed with {result.returncode}"


def main(binary: Path) -> None:
    """Run every smoke check against the given build output."""
    handshake(binary)
    rejects_other_origins(binary)

    installed, manifests, keys = expected_layout()
    run_command(binary, "install")
    assert installed.is_file(), installed
    handshake(installed)
    for path in manifests:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        assert manifest["name"] == HOST, manifest
        assert manifest["type"] == "stdio", manifest
        assert Path(manifest["path"]) == installed, manifest
        assert manifest["allowed_origins"] == [ORIGIN], manifest
    for key in keys:
        assert Path(registry_value(key)) == manifests[0], key
    print(f"install ok: {installed}, {len(manifests)} manifest(s), {len(keys)} registry key(s)")

    run_command(binary, "uninstall")
    assert not installed.exists(), installed
    for path in manifests:
        assert not path.exists(), path
    for key in keys:
        assert registry_value(key) is None, key
    print("uninstall ok")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
