#!/usr/bin/env python3
"""
Launcher script to start both summarization and transcription services
"""
import subprocess
import sys
import os
import signal
import time
from typing import List

def start_service(command: List[str], name: str) -> subprocess.Popen:
    """Start a service and return the process"""
    print(f"🚀 Starting {name} service...")
    try:
        process = subprocess.Popen(
            command,
            # Don't pipe stdout/stderr so output is visible in terminal
            text=True
        )
        # Give it a moment to start
        time.sleep(1)
        if process.poll() is None:
            print(f"✅ {name} service started (PID: {process.pid})")
            return process
        else:
            print(f"❌ {name} service failed to start (exit code: {process.returncode})")
            return None
    except Exception as e:
        print(f"❌ Failed to start {name} service: {e}")
        return None

def monitor_processes(processes: List[subprocess.Popen], names: List[str]):
    """Monitor running processes and handle shutdown"""
    def signal_handler(signum, frame):
        print("\n🛑 Received shutdown signal, stopping services...")
        for process, name in zip(processes, names):
            if process and process.poll() is None:
                print(f"Stopping {name} service...")
                process.terminate()

        # Wait for processes to terminate
        for process, name in zip(processes, names):
            if process:
                try:
                    process.wait(timeout=10)
                    print(f"✅ {name} service stopped")
                except subprocess.TimeoutExpired:
                    print(f"⚠️  {name} service didn't stop gracefully, forcing...")
                    process.kill()

        print("👋 All services stopped. Goodbye!")
        sys.exit(0)

    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    print("🎯 Both services are running! Press Ctrl+C to stop.")
    print("📊 Service URLs:")
    print("   • Transcription: http://localhost:8000")
    print("   • Summarization: http://localhost:8001")
    print("   • Health checks: http://localhost:8000/health, http://localhost:8001/health")

    # Monitor processes (services output directly to terminal)
    print("\n" + "=" * 60)
    print("📋 SERVICE LOGS WILL APPEAR BELOW")
    print("Press Ctrl+C to stop all services")
    print("=" * 60 + "\n")

    while True:
        all_running = True
        for i, (process, name) in enumerate(zip(processes, names)):
            if process.poll() is not None:
                print(f"\n⚠️  {name} service exited with code {process.returncode}")
                all_running = False

        if not all_running:
            print("❌ One or more services crashed, stopping...")
            signal_handler(signal.SIGTERM, None)
            break

        time.sleep(2)  # Check less frequently since we're not reading pipes

def main():
    """Main launcher function"""
    print("🚀 LATIOS Backend Services Launcher")
    print("=" * 50)

    # Check if we're in the right directory
    if not os.path.exists("services/latios_summary.py"):
        print("❌ Error: Please run this script from the python/ directory")
        print("   cd python && python start_services.py")
        sys.exit(1)

    # Commands to start services
    transcribe_cmd = [
        sys.executable, "-m", "uvicorn",
        "services.latios_transcribe:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--reload"  # Enable auto-reload for development
    ]

    summary_cmd = [
        sys.executable, "-m", "uvicorn",
        "services.latios_summary:app",
        "--host", "0.0.0.0",
        "--port", "8001",
        "--reload"  # Enable auto-reload for development
    ]

    # Start services
    processes = []
    names = ["Transcription", "Summarization"]

    # Start transcription service first (port 8000)
    transcribe_process = start_service(transcribe_cmd, "Transcription")
    if transcribe_process:
        processes.append(transcribe_process)
    else:
        print("❌ Failed to start transcription service, aborting...")
        sys.exit(1)

    # Give it a moment to start up
    time.sleep(2)

    # Start summarization service (port 8001)
    summary_process = start_service(summary_cmd, "Summarization")
    if summary_process:
        processes.append(summary_process)
    else:
        print("❌ Failed to start summarization service")
        # Still continue if summarization fails, as transcription might be working

    if len(processes) == 0:
        print("❌ No services started successfully")
        sys.exit(1)

    # Monitor and handle shutdown
    monitor_processes(processes, names)

if __name__ == "__main__":
    main()
