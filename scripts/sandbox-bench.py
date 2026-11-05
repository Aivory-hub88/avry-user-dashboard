#!/usr/bin/env python3
"""Benchmark per-execution cost of Python sandboxes, to run ON the VPS.

Measures how long one sandboxed `python` run takes (start -> exit) and how much
memory the host loses while several run at once, for each backend that is
actually installed. It never installs, pulls, or changes anything: a backend
that is missing, or fails its smoke test, is reported and skipped.

Backends: native (no sandbox, baseline), bwrap, nsjail, docker-runc,
docker-runsc (only if `runsc` is a registered Docker runtime).

Usage:
  python3 sandbox-bench.py                       # prerequisites + quick run
  python3 sandbox-bench.py --venv /opt/bench-venv --image python:3.12-slim
  python3 sandbox-bench.py --check-only          # print prerequisites, run nothing

Safety: refuses to start when MemAvailable < 2500 MB (override: --force),
caps concurrency at 8, 256 MB per container, 60 s per job.
"""
import argparse
import json
import os
import shutil
import statistics
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

JOB_TIMEOUT = 60
MIN_AVAILABLE_MB = 2500
MAX_CONCURRENCY = 8

WORKLOADS = {
    "pass": "pass",
    "numpy": "import numpy as np; a=np.random.rand(300,300); print(float((a@a).sum()))",
}


def mem_available_mb():
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except OSError:
        pass
    return -1


def sh(cmd, timeout=15):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return (r.stdout + r.stderr).strip()
    except Exception as e:  # missing binary, timeout, ...
        return f"<{type(e).__name__}: {e}>"


def read_first(path):
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:
        return "n/a"


def prerequisites(docker):
    print("== Prerequisites ==")
    print("kernel          :", sh(["uname", "-r"]))
    print("cpus            :", os.cpu_count())
    print("loadavg         :", read_first("/proc/loadavg"))
    print("MemAvailable MB :", mem_available_mb())
    print("cgroup          :", "v2" if os.path.exists("/sys/fs/cgroup/cgroup.controllers") else "v1/other")
    print("max_user_namespaces        :", read_first("/proc/sys/user/max_user_namespaces"))
    print("unprivileged_userns_clone  :", read_first("/proc/sys/kernel/unprivileged_userns_clone"))
    print("apparmor_restrict_userns   :", read_first("/proc/sys/kernel/apparmor_restrict_unprivileged_userns"))
    print("bwrap           :", sh(["bwrap", "--version"]) if shutil.which("bwrap") else "not installed")
    print("nsjail          :", sh(["nsjail", "--help"]).splitlines()[0] if shutil.which("nsjail") else "not installed")
    if shutil.which("docker"):
        info = sh(docker + ["info", "--format", "{{range $k, $v := .Runtimes}}{{$k}} {{end}}| default={{.DefaultRuntime}}"])
        print("docker runtimes :", info)
    else:
        print("docker          : not installed")
    print()


def docker_has_runsc(docker):
    return "runsc" in sh(docker + ["info", "--format", "{{range $k, $v := .Runtimes}}{{$k}} {{end}}"]).split()


def build_backends(args, docker):
    py = os.path.join(args.venv, "bin", "python") if args.venv else None
    usr_bind = ["/usr", "/usr"]
    base_ro = ["--ro-bind", *usr_bind, "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64",
               "--symlink", "usr/bin", "/bin"]

    def native(code, numpy):
        return [(py if numpy else "python3"), "-c", code]

    def bwrap(code, numpy):
        extra = ["--ro-bind", args.venv, args.venv] if numpy else []
        return (["bwrap", *base_ro, *extra, "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
                 "--unshare-all", "--die-with-parent", "--new-session"] + [(py if numpy else "python3"), "-c", code])

    def nsjail(code, numpy):
        extra = ["-R", args.venv] if numpy else []
        return (["nsjail", "-Mo", "-q", "--time_limit", str(JOB_TIMEOUT), "-R", "/usr", "-R", "/lib", "-R", "/lib64",
                 "-R", "/bin", "-T", "/tmp", *extra, "--"] + [(py if numpy else "python3"), "-c", code])

    def dock(runtime, image):
        def f(code, numpy):
            cmd = docker + ["run", "--rm", "--network", "none", "--memory", "256m", "--cpus", "1",
                            "--pids-limit", "128", "--read-only", "--pull", "never"]
            if runtime:
                cmd += ["--runtime", runtime]
            return cmd + [image, "python", "-c", code]
        return f

    backends = {"native": native}
    if shutil.which("bwrap"):
        backends["bwrap"] = bwrap
    if shutil.which("nsjail"):
        backends["nsjail"] = nsjail
    if shutil.which("docker"):
        backends["docker-runc"] = dock(None, args.image)
        if docker_has_runsc(docker):
            backends["docker-runsc"] = dock("runsc", args.image_numpy or args.image)
    return backends


def run_one(cmd):
    t0 = time.perf_counter()
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=JOB_TIMEOUT)
        ok, err = r.returncode == 0, (r.stderr or r.stdout).strip()[-300:]
    except subprocess.TimeoutExpired:
        ok, err = False, "timeout"
    return time.perf_counter() - t0, ok, err


def pct(vals, p):
    s = sorted(vals)
    return s[min(len(s) - 1, int(round(p / 100 * (len(s) - 1))))]


def summarize(vals):
    return {"n": len(vals), "min_ms": round(min(vals) * 1000), "p50_ms": round(pct(vals, 50) * 1000),
            "p95_ms": round(pct(vals, 95) * 1000), "max_ms": round(max(vals) * 1000)}


def run_concurrent(builder, code, numpy, conc, rounds):
    lat, fails = [], 0
    low = [mem_available_mb()]
    stop = threading.Event()

    def sampler():
        while not stop.is_set():
            low.append(mem_available_mb())
            time.sleep(0.05)

    th = threading.Thread(target=sampler, daemon=True)
    th.start()
    start_mem = mem_available_mb()
    t_wall = time.perf_counter()
    for _ in range(rounds):
        with ThreadPoolExecutor(max_workers=conc) as ex:
            for dt, ok, _ in ex.map(lambda _: run_one(builder(code, numpy)), range(conc)):
                lat.append(dt)
                fails += 0 if ok else 1
    wall = time.perf_counter() - t_wall
    stop.set()
    th.join()
    return {"conc": conc, **summarize(lat), "fails": fails, "wall_s": round(wall, 1),
            "throughput_per_s": round(conc * rounds / wall, 2),
            "mem_drop_mb": start_mem - min(low)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--venv", help="existing venv that already has numpy (enables the numpy workload)")
    ap.add_argument("--image", default="python:3.12-slim", help="local Docker image with python (never pulled: --pull never)")
    ap.add_argument("--image-numpy", help="local Docker image that has numpy (used for runsc + numpy)")
    ap.add_argument("--sudo-docker", action="store_true", help="prefix docker with sudo")
    ap.add_argument("--seq", type=int, default=15, help="sequential runs per backend/workload")
    ap.add_argument("--conc", default="4,8", help="comma list of concurrency levels (max 8)")
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--out", default="sandbox-bench.json")
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    docker = (["sudo"] if args.sudo_docker else []) + ["docker"]
    prerequisites(docker)
    if args.check_only:
        return

    if mem_available_mb() < MIN_AVAILABLE_MB and not args.force:
        sys.exit(f"MemAvailable {mem_available_mb()} MB < {MIN_AVAILABLE_MB} MB; refusing (use --force).")
    levels = [min(int(x), MAX_CONCURRENCY) for x in args.conc.split(",") if x.strip()]

    backends = build_backends(args, docker)
    results = {}
    for name, builder in backends.items():
        for wl, code in WORKLOADS.items():
            numpy = wl == "numpy"
            if numpy and not args.venv and not name.startswith("docker"):
                continue
            if numpy and name.startswith("docker") and not args.image_numpy:
                continue
            key = f"{name}/{wl}"
            dt, ok, err = run_one(builder(code, numpy))  # smoke test (also warms caches)
            if not ok:
                print(f"[skip] {key}: smoke test failed: {err}")
                results[key] = {"skipped": err}
                continue
            seq = [run_one(builder(code, numpy))[0] for _ in range(args.seq)]
            entry = {"sequential": summarize(seq), "concurrent": []}
            for c in levels:
                entry["concurrent"].append(run_concurrent(builder, code, numpy, c, args.rounds))
            results[key] = entry
            s = entry["sequential"]
            print(f"[ok]   {key:<22} seq p50={s['p50_ms']}ms p95={s['p95_ms']}ms")
            for c in entry["concurrent"]:
                print(f"         x{c['conc']}: p50={c['p50_ms']}ms p95={c['p95_ms']}ms "
                      f"fails={c['fails']} {c['throughput_per_s']}/s memdrop={c['mem_drop_mb']}MB")

    with open(args.out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results: {args.out}")


if __name__ == "__main__":
    main()
