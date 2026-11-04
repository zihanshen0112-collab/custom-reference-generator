"""跨平台启动器。

用法:
    python start.py

自动创建虚拟环境、安装依赖、启动服务并打开浏览器。
"""

import os
import platform
import subprocess
import threading
import time
import venv
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
VENV_DIR = os.path.join(ROOT, ".venv")
PORT = 8000


def _venv_python() -> str:
    if platform.system() == "Windows":
        return os.path.join(VENV_DIR, "Scripts", "python.exe")
    return os.path.join(VENV_DIR, "bin", "python")


def _ensure_venv() -> str:
    if not os.path.isdir(VENV_DIR):
        print("[setup] Creating virtual environment...")
        venv.create(VENV_DIR, with_pip=True)
    return _venv_python()


def _install_requirements(python: str) -> None:
    print("[setup] Installing requirements...")
    subprocess.run(
        [python, "-m", "pip", "install", "--quiet", "-r", "requirements.txt"],
        cwd=ROOT,
        check=True,
    )


def _open_browser_later() -> None:
    # 延迟打开浏览器，给服务一点启动时间
    def _open():
        time.sleep(2.5)
        webbrowser.open(f"http://localhost:{PORT}")
    threading.Thread(target=_open, daemon=True).start()


def main() -> None:
    python = _ensure_venv()
    _install_requirements(python)
    _open_browser_later()
    print(f"[serve] Starting at http://localhost:{PORT}")
    try:
        subprocess.run(
            [
                python, "-m", "uvicorn", "app.main:app",
                "--host", "127.0.0.1",
                "--port", str(PORT),
            ],
            cwd=ROOT,
            check=True,
        )
    except KeyboardInterrupt:
        print("\n[serve] Stopped.")


if __name__ == "__main__":
    main()