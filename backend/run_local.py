#!/usr/bin/env python3
"""
Local development runner for LobsterTrack backend.
Creates tables and starts the server.
"""
import subprocess
import sys


def main():
    print("=" * 50)
    print("LobsterTrack Backend - Local Development")
    print("=" * 50)
    print()
    print("Starting uvicorn server...")
    print("API docs available at: http://localhost:8000/docs")
    print("Health check at: http://localhost:8000/api/health")
    print()

    subprocess.run([
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000"
    ])


if __name__ == "__main__":
    main()
